import { App } from '@slack/bolt';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import {
  getLastGroupSync,
  setLastGroupSync,
  updateChatName,
} from '../db.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

const CHANNEL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class SlackChannel implements Channel {
  name = 'slack';

  private app: App | null = null;
  private opts: SlackChannelOpts;
  private botToken: string;
  private appToken: string;
  private botUserId = '';
  private channelSyncTimerStarted = false;
  private userNameCache = new Map<string, string>();
  private typingReactions = new Map<string, { channel: string; timestamp: string }>();

  constructor(botToken: string, appToken: string, opts: SlackChannelOpts) {
    this.botToken = botToken;
    this.appToken = appToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.app = new App({
      token: this.botToken,
      appToken: this.appToken,
      socketMode: true,
    });

    // Resolve bot user ID
    const authResult = await this.app.client.auth.test();
    this.botUserId = authResult.user_id as string;
    logger.info({ botUserId: this.botUserId }, 'Slack bot authenticated');

    // Register message handler
    this.app.event('message', async ({ event }) => {
      await this.handleMessage(event);
    });

    await this.app.start();
    logger.info('Connected to Slack via Socket Mode');

    // Sync channel metadata on startup (respects 24h cache)
    this.syncChannelMetadata().catch((err) =>
      logger.error({ err }, 'Initial channel sync failed'),
    );

    // Set up daily sync timer (only once)
    if (!this.channelSyncTimerStarted) {
      this.channelSyncTimerStarted = true;
      setInterval(() => {
        this.syncChannelMetadata().catch((err) =>
          logger.error({ err }, 'Periodic channel sync failed'),
        );
      }, CHANNEL_SYNC_INTERVAL_MS);
    }
  }

  private async handleMessage(event: any): Promise<void> {
    // Skip bot messages
    if (event.bot_id) return;
    if (event.user === this.botUserId) return;

    // Skip subtypes other than file_share and thread_broadcast
    if (
      event.subtype &&
      event.subtype !== 'file_share' &&
      event.subtype !== 'thread_broadcast'
    ) {
      return;
    }

    const channelId = event.channel;
    const jid = `slack:${channelId}`;
    const timestamp = new Date(parseFloat(event.ts) * 1000).toISOString();

    // Determine if group (DMs have channel IDs starting with D)
    const isGroup = !channelId.startsWith('D');

    // Translate <@botUserId> mentions to @AssistantName for trigger matching
    let content = event.text || '';
    if (this.botUserId) {
      content = content.replace(
        new RegExp(`<@${this.botUserId}>`, 'g'),
        `@${ASSISTANT_NAME}`,
      );
    }

    // File attachments → placeholders
    if (event.files && Array.isArray(event.files)) {
      const filePlaceholders = event.files
        .map(
          (f: any) =>
            `[${f.filetype?.toUpperCase() || 'File'}: ${f.name || 'unnamed'}]`,
        )
        .join(' ');
      if (!content) {
        content = filePlaceholders;
      } else {
        content = `${content} ${filePlaceholders}`;
      }
    }

    // Get sender display name
    const senderName = await this.getUserDisplayName(event.user);
    const msgId = `${channelId}-${event.ts}`;

    // Always notify about chat metadata for discovery
    this.opts.onChatMetadata(jid, timestamp, undefined, 'slack', isGroup);

    // Only deliver full message for registered groups
    const group = this.opts.registeredGroups()[jid];
    if (!group) {
      logger.debug({ jid }, 'Message from unregistered Slack channel');
      return;
    }

    this.opts.onMessage(jid, {
      id: msgId,
      chat_jid: jid,
      sender: event.user,
      sender_name: senderName,
      content,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });

    // Track the latest message timestamp for typing reactions
    this.typingReactions.set(jid, { channel: channelId, timestamp: event.ts });

    logger.info({ jid, sender: senderName }, 'Slack message stored');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.app) {
      logger.warn('Slack app not initialized');
      return;
    }

    const channel = jid.replace(/^slack:/, '');

    try {
      const chunks = splitMessage(text, 4000);
      for (const chunk of chunks) {
        await this.app.client.chat.postMessage({ channel, text: chunk });
      }
      logger.info({ jid, length: text.length }, 'Slack message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Slack message');
    }
  }

  isConnected(): boolean {
    return this.app !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('slack:');
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
      logger.info('Slack app stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.app) return;
    const msg = this.typingReactions.get(jid);
    if (!msg) return;

    try {
      if (isTyping) {
        await this.app.client.reactions.add({
          channel: msg.channel,
          timestamp: msg.timestamp,
          name: 'rocket',
        });
      } else {
        await this.app.client.reactions.remove({
          channel: msg.channel,
          timestamp: msg.timestamp,
          name: 'rocket',
        });
      }
    } catch (err: any) {
      // Ignore already_reacted / no_reaction errors
      if (err?.data?.error !== 'already_reacted' && err?.data?.error !== 'no_reaction') {
        logger.debug({ jid, isTyping, err }, 'Failed to update typing reaction');
      }
    }
  }

  /**
   * Sync channel metadata from Slack.
   * Fetches all channels the bot is a member of and stores their names.
   * Called on startup, daily, and on-demand via IPC.
   */
  async syncChannelMetadata(force = false): Promise<void> {
    if (!force) {
      const lastSync = getLastGroupSync();
      if (lastSync) {
        const lastSyncTime = new Date(lastSync).getTime();
        if (Date.now() - lastSyncTime < CHANNEL_SYNC_INTERVAL_MS) {
          logger.debug({ lastSync }, 'Skipping channel sync - synced recently');
          return;
        }
      }
    }

    if (!this.app) return;

    try {
      logger.info('Syncing channel metadata from Slack...');
      let count = 0;
      let cursor: string | undefined;

      do {
        const result = await this.app.client.conversations.list({
          types: 'public_channel,private_channel',
          exclude_archived: true,
          limit: 200,
          cursor,
        });

        for (const channel of result.channels || []) {
          if (channel.id && (channel.name || channel.id)) {
            updateChatName(
              `slack:${channel.id}`,
              channel.name || channel.id,
            );
            count++;
          }
        }

        cursor = result.response_metadata?.next_cursor || undefined;
      } while (cursor);

      setLastGroupSync();
      logger.info({ count }, 'Channel metadata synced');
    } catch (err) {
      logger.error({ err }, 'Failed to sync channel metadata');
    }
  }

  private async getUserDisplayName(userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached) return cached;

    if (!this.app) return userId;

    try {
      const result = await this.app.client.users.info({ user: userId });
      const profile = result.user?.profile;
      const name =
        profile?.display_name ||
        profile?.real_name ||
        result.user?.name ||
        userId;
      this.userNameCache.set(userId, name);
      return name;
    } catch (err) {
      logger.debug({ userId, err }, 'Failed to fetch user display name');
      return userId;
    }
  }
}

/**
 * Split text at newline boundaries to stay under maxLen.
 * Falls back to hard split if no newline found.
 */
export function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Find last newline before maxLen
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx <= 0) {
      // No newline found, hard split
      splitIdx = maxLen;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).replace(/^\n/, '');
  }

  return chunks;
}
