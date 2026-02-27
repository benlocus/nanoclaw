import fs from 'fs';
import path from 'path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

import { App } from '@slack/bolt';

import { ASSISTANT_NAME, TRIGGER_PATTERN, GROUPS_DIR } from '../config.js';
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
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Detect actual file type from magic bytes. Returns extension or null if unknown. */
function detectFileType(filePath: string): string | null {
  let buf: Buffer;
  try {
    const fd = fs.openSync(filePath, 'r');
    buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
  } catch {
    return null;
  }

  // PDF: %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return 'pdf';
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // GIF: GIF8
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  // ZIP/DOCX/XLSX: PK
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return 'zip';
  // HTML: starts with < (<!DOCTYPE or <html)
  const head = buf.toString('ascii', 0, 15).trimStart().toLowerCase();
  if (head.startsWith('<!doctype') || head.startsWith('<html')) return 'html';

  return null;
}

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
  private replyThreadTs = new Map<string, string>();

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

    // Fetch thread context for thread replies
    if (event.thread_ts && event.thread_ts !== event.ts) {
      const threadContext = await this.getThreadContext(channelId, event.thread_ts, event.ts);
      if (threadContext) {
        content = `${threadContext}\n\n${content}`;
      }
    }

    // Download file attachments to group uploads folder
    if (event.files && Array.isArray(event.files)) {
      const uploadsDir = path.join(GROUPS_DIR, group.folder, 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });

      const fileParts: string[] = [];
      for (const f of event.files) {
        const fileName = f.name || `file-${f.id || Date.now()}`;
        const fileType = f.filetype?.toUpperCase() || 'File';

        // Skip files that are too large
        if (f.size && f.size > MAX_FILE_SIZE) {
          fileParts.push(`[${fileType}: ${fileName} — too large (${formatFileSize(f.size)}), skipped]`);
          continue;
        }

        // Skip external files or files without download URL
        const downloadUrl = f.url_private_download || f.url_private;
        if (!downloadUrl) {
          fileParts.push(`[${fileType}: ${fileName}]`);
          continue;
        }

        // Unique filename: ts-fileId-originalName (safe characters only)
        const safeName = `${event.ts}-${f.id || 'x'}-${fileName}`.replace(/[^a-zA-Z0-9._-]/g, '_');
        const hostPath = path.join(uploadsDir, safeName);
        const containerPath = `/workspace/group/uploads/${safeName}`;

        const ok = await this.downloadFile(downloadUrl, hostPath);
        if (ok) {
          const sizeStr = f.size ? ` ${formatFileSize(f.size)}` : '';
          // Detect actual file type via magic bytes and rename if mismatched
          const actual = detectFileType(hostPath);
          const claimed = path.extname(safeName).slice(1).toLowerCase();
          if (actual && actual !== claimed) {
            const correctedName = safeName.replace(/\.[^.]+$/, `.${actual}`);
            const correctedHost = path.join(uploadsDir, correctedName);
            fs.renameSync(hostPath, correctedHost);
            const correctedContainer = `/workspace/group/uploads/${correctedName}`;
            fileParts.push(`[File: ${correctedContainer}] (WARNING: uploaded as ${fileType} but actual content is ${actual.toUpperCase()}, renamed. Original: ${fileName},${sizeStr})`);
          } else {
            fileParts.push(`[File: ${containerPath}] (${fileType}: ${fileName},${sizeStr})`);
          }
        } else {
          fileParts.push(`[${fileType}: ${fileName} — download failed]`);
        }
      }

      if (fileParts.length > 0) {
        const fileInfo = fileParts.join('\n');
        content = content ? `${content}\n${fileInfo}` : fileInfo;
      }
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

    // Track thread_ts so replies go back to the thread
    if (event.thread_ts) {
      this.replyThreadTs.set(jid, event.thread_ts);
    }

    // Track the latest message timestamp for typing reactions
    this.typingReactions.set(jid, { channel: channelId, timestamp: event.ts });

    logger.info({ jid, sender: senderName }, 'Slack message stored');
  }

  private async downloadFile(url: string, destPath: string): Promise<boolean> {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.botToken}` },
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok || !response.body) {
        logger.warn({ url: url.slice(0, 80), status: response.status }, 'File download HTTP error');
        return false;
      }

      await pipeline(
        Readable.fromWeb(response.body as ReadableStream),
        fs.createWriteStream(destPath),
      );
      return true;
    } catch (err) {
      try { fs.unlinkSync(destPath); } catch { /* partial file cleanup */ }
      logger.warn({ err }, 'File download failed');
      return false;
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.app) {
      logger.warn('Slack app not initialized');
      return;
    }

    const channel = jid.replace(/^slack:/, '');
    const threadTs = this.replyThreadTs.get(jid);

    try {
      const chunks = splitMessage(text, 4000);
      for (const chunk of chunks) {
        await this.app.client.chat.postMessage({
          channel,
          text: chunk,
          ...(threadTs && { thread_ts: threadTs }),
        });
      }
      // Clear after sending — next top-level message should go to channel
      this.replyThreadTs.delete(jid);
      logger.info({ jid, length: text.length, threadTs }, 'Slack message sent');
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

  private async getThreadContext(
    channelId: string,
    threadTs: string,
    currentTs: string,
  ): Promise<string | null> {
    if (!this.app) return null;

    try {
      const result = await this.app.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      const messages = result.messages;
      if (!messages || messages.length <= 1) return null;

      // Exclude the current message (it's delivered normally)
      const threadHistory = messages.filter(
        (m: any) => m.ts !== currentTs,
      );

      const parts: string[] = [];
      let totalLen = 0;
      const MAX_CONTEXT_LEN = 4000;

      for (const msg of threadHistory) {
        const name = (msg as any).bot_id
          ? ASSISTANT_NAME
          : await this.getUserDisplayName((msg as any).user || 'unknown');
        let text = (msg as any).text || '[no text]';
        if (text.length > 1500) text = text.slice(0, 1500) + '...';

        const line = `[${name}]: ${text}`;
        if (totalLen + line.length > MAX_CONTEXT_LEN) {
          parts.push('[... earlier messages truncated]');
          break;
        }
        parts.push(line);
        totalLen += line.length;
      }

      return parts.length > 0
        ? `[Thread context:]\n${parts.join('\n')}`
        : null;
    } catch (err) {
      logger.debug({ err, threadTs }, 'Failed to fetch thread context');
      return null;
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
