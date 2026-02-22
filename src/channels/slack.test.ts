import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// --- Mocks ---

// Mock config
vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  TRIGGER_PATTERN: /^@Andy\b/i,
}));

// Mock logger
vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock db
vi.mock('../db.js', () => ({
  getLastGroupSync: vi.fn(() => null),
  setLastGroupSync: vi.fn(),
  updateChatName: vi.fn(),
}));

// --- @slack/bolt mock ---

type Handler = (...args: any[]) => any;

const appRef = vi.hoisted(() => ({ current: null as any }));

vi.mock('@slack/bolt', () => ({
  App: class MockApp {
    token: string;
    appToken: string;
    socketMode: boolean;
    eventHandlers = new Map<string, Handler>();

    client = {
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: 'U_BOT_123' }),
      },
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
      conversations: {
        list: vi.fn().mockResolvedValue({ channels: [], response_metadata: {} }),
      },
      users: {
        info: vi.fn().mockResolvedValue({
          user: {
            name: 'testuser',
            profile: { display_name: 'Test User', real_name: 'Test Real' },
          },
        }),
      },
      reactions: {
        add: vi.fn().mockResolvedValue({ ok: true }),
        remove: vi.fn().mockResolvedValue({ ok: true }),
      },
    };

    constructor(opts: { token: string; appToken: string; socketMode: boolean }) {
      this.token = opts.token;
      this.appToken = opts.appToken;
      this.socketMode = opts.socketMode;
      appRef.current = this;
    }

    event(name: string, handler: Handler) {
      this.eventHandlers.set(name, handler);
    }

    async start() {}
    async stop() {}
  },
}));

import { SlackChannel, SlackChannelOpts, splitMessage } from './slack.js';
import { getLastGroupSync, updateChatName, setLastGroupSync } from '../db.js';

// --- Test helpers ---

function createTestOpts(
  overrides?: Partial<SlackChannelOpts>,
): SlackChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: vi.fn(() => ({
      'slack:C1234567890': {
        name: 'Test Channel',
        folder: 'test-channel',
        trigger: '@Andy',
        added_at: '2024-01-01T00:00:00.000Z',
      },
    })),
    ...overrides,
  };
}

function currentApp() {
  return appRef.current;
}

function createMessageEvent(overrides: {
  channel?: string;
  user?: string;
  text?: string;
  ts?: string;
  bot_id?: string;
  subtype?: string;
  files?: any[];
}) {
  return {
    channel: overrides.channel ?? 'C1234567890',
    user: overrides.user ?? 'U_USER_456',
    text: overrides.text ?? 'Hello',
    ts: overrides.ts ?? '1704067200.000100',
    bot_id: overrides.bot_id,
    subtype: overrides.subtype,
    files: overrides.files,
  };
}

async function triggerMessage(event: ReturnType<typeof createMessageEvent>) {
  const handler = currentApp().eventHandlers.get('message');
  if (handler) await handler({ event });
}

// --- Tests ---

describe('SlackChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLastGroupSync).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Connection lifecycle ---

  describe('connection lifecycle', () => {
    it('resolves connect() and authenticates', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);

      await channel.connect();

      expect(channel.isConnected()).toBe(true);
      expect(currentApp().client.auth.test).toHaveBeenCalled();
    });

    it('registers message event handler on connect', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);

      await channel.connect();

      expect(currentApp().eventHandlers.has('message')).toBe(true);
    });

    it('disconnects cleanly', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);

      await channel.connect();
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });

    it('isConnected() returns false before connect', () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);

      expect(channel.isConnected()).toBe(false);
    });
  });

  // --- Message handling ---

  describe('message handling', () => {
    it('delivers message for registered channel', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ text: 'Hello everyone' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.any(String),
        undefined,
        'slack',
        true,
      );
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          id: 'C1234567890-1704067200.000100',
          chat_jid: 'slack:C1234567890',
          sender: 'U_USER_456',
          sender_name: 'Test User',
          content: 'Hello everyone',
          is_from_me: false,
          is_bot_message: false,
        }),
      );
    });

    it('only emits metadata for unregistered channels', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ channel: 'C9999999999', text: 'Unknown' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:C9999999999',
        expect.any(String),
        undefined,
        'slack',
        true,
      );
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('skips messages with bot_id', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ bot_id: 'B123', text: 'Bot msg' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).not.toHaveBeenCalled();
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('skips messages from bot user', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ user: 'U_BOT_123', text: 'Self msg' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).not.toHaveBeenCalled();
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('skips messages with unsupported subtypes', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ subtype: 'channel_join', text: 'joined' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).not.toHaveBeenCalled();
      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('allows file_share subtype', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        subtype: 'file_share',
        text: 'Check this',
        files: [{ name: 'doc.pdf', filetype: 'pdf' }],
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: 'Check this [PDF: doc.pdf]',
        }),
      );
    });

    it('allows thread_broadcast subtype', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        subtype: 'thread_broadcast',
        text: 'Thread reply',
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({ content: 'Thread reply' }),
      );
    });

    it('identifies DMs as non-group (channel starts with D)', async () => {
      const opts = createTestOpts({
        registeredGroups: vi.fn(() => ({
          'slack:D1234567890': {
            name: 'DM',
            folder: 'dm',
            trigger: '@Andy',
            added_at: '2024-01-01T00:00:00.000Z',
          },
        })),
      });
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ channel: 'D1234567890' });
      await triggerMessage(event);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'slack:D1234567890',
        expect.any(String),
        undefined,
        'slack',
        false, // isGroup = false for DMs
      );
    });

    it('converts message timestamp to ISO', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ ts: '1704067200.000000' });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      );
    });
  });

  // --- Mention translation ---

  describe('mention translation', () => {
    it('translates <@botUserId> to @AssistantName', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ text: '<@U_BOT_123> what time is it?' });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '@Andy what time is it?',
        }),
      );
    });

    it('translates multiple mentions in same message', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        text: '<@U_BOT_123> hey <@U_BOT_123>',
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '@Andy hey @Andy',
        }),
      );
    });

    it('does not translate mentions of other users', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ text: '<@U_OTHER_789> hello' });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '<@U_OTHER_789> hello',
        }),
      );
    });
  });

  // --- File attachments ---

  describe('file attachments', () => {
    it('adds file placeholders to content', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        text: 'Here is the file',
        files: [{ name: 'report.pdf', filetype: 'pdf' }],
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: 'Here is the file [PDF: report.pdf]',
        }),
      );
    });

    it('uses file placeholder as content when no text', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        subtype: 'file_share',
        text: '',
        files: [{ name: 'image.png', filetype: 'png' }],
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '[PNG: image.png]',
        }),
      );
    });

    it('handles multiple files', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        text: '',
        subtype: 'file_share',
        files: [
          { name: 'a.pdf', filetype: 'pdf' },
          { name: 'b.jpg', filetype: 'jpg' },
        ],
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '[PDF: a.pdf] [JPG: b.jpg]',
        }),
      );
    });

    it('handles files with missing name and filetype', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({
        text: '',
        subtype: 'file_share',
        files: [{}],
      });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({
          content: '[File: unnamed]',
        }),
      );
    });
  });

  // --- sendMessage ---

  describe('sendMessage', () => {
    it('sends message via Slack API', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      await channel.sendMessage('slack:C1234567890', 'Hello');

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C1234567890',
        text: 'Hello',
      });
    });

    it('strips slack: prefix from JID', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      await channel.sendMessage('slack:D9876543210', 'DM message');

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledWith({
        channel: 'D9876543210',
        text: 'DM message',
      });
    });

    it('splits messages exceeding 4000 characters', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const longText = 'x'.repeat(5000);
      await channel.sendMessage('slack:C1234567890', longText);

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledTimes(2);
    });

    it('sends exactly one message at 4000 characters', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const exactText = 'y'.repeat(4000);
      await channel.sendMessage('slack:C1234567890', exactText);

      expect(currentApp().client.chat.postMessage).toHaveBeenCalledTimes(1);
    });

    it('handles send failure gracefully', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      currentApp().client.chat.postMessage.mockRejectedValueOnce(
        new Error('Network error'),
      );

      await expect(
        channel.sendMessage('slack:C1234567890', 'Will fail'),
      ).resolves.toBeUndefined();
    });

    it('does nothing when app is not initialized', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);

      // Don't connect — app is null
      await channel.sendMessage('slack:C1234567890', 'No app');

      // No error, no API call
    });
  });

  // --- ownsJid ---

  describe('ownsJid', () => {
    it('owns slack: JIDs', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('slack:C1234567890')).toBe(true);
    });

    it('owns slack: DM JIDs', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('slack:D1234567890')).toBe(true);
    });

    it('does not own WhatsApp group JIDs', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('12345@g.us')).toBe(false);
    });

    it('does not own WhatsApp DM JIDs', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('12345@s.whatsapp.net')).toBe(false);
    });

    it('does not own Telegram JIDs', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('tg:12345')).toBe(false);
    });

    it('does not own unknown JID formats', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.ownsJid('random-string')).toBe(false);
    });
  });

  // --- setTyping ---

  describe('setTyping', () => {
    it('adds rocket reaction when typing starts', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      // Simulate a message to track the timestamp
      const app = currentApp();
      const handler = app.eventHandlers.get('message');
      await handler({
        event: {
          user: 'U_SENDER',
          channel: 'C1234567890',
          text: '@TestBot hello',
          ts: '1234567890.123456',
        },
      });

      await channel.setTyping('slack:C1234567890', true);
      expect(app.client.reactions.add).toHaveBeenCalledWith({
        channel: 'C1234567890',
        timestamp: '1234567890.123456',
        name: 'rocket',
      });
    });

    it('removes rocket reaction when typing stops', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const app = currentApp();
      const handler = app.eventHandlers.get('message');
      await handler({
        event: {
          user: 'U_SENDER',
          channel: 'C1234567890',
          text: '@TestBot hello',
          ts: '1234567890.123456',
        },
      });

      await channel.setTyping('slack:C1234567890', false);
      expect(app.client.reactions.remove).toHaveBeenCalledWith({
        channel: 'C1234567890',
        timestamp: '1234567890.123456',
        name: 'rocket',
      });
    });

    it('is a no-op when no message tracked for jid', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      // Should not throw when no message has been received
      await expect(
        channel.setTyping('slack:C1234567890', true),
      ).resolves.toBeUndefined();
      expect(currentApp().client.reactions.add).not.toHaveBeenCalled();
    });
  });

  // --- Channel metadata sync ---

  describe('syncChannelMetadata', () => {
    it('syncs channels on connect', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      // Set mock after connect creates the app, then force sync
      currentApp().client.conversations.list.mockResolvedValue({
        channels: [
          { id: 'C001', name: 'general' },
          { id: 'C002', name: 'random' },
        ],
        response_metadata: {},
      });

      await channel.syncChannelMetadata(true);

      expect(updateChatName).toHaveBeenCalledWith('slack:C001', 'general');
      expect(updateChatName).toHaveBeenCalledWith('slack:C002', 'random');
      expect(setLastGroupSync).toHaveBeenCalled();
    });

    it('skips sync when synced recently', async () => {
      vi.mocked(getLastGroupSync).mockReturnValue(
        new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      );

      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      await new Promise((r) => setTimeout(r, 50));

      expect(currentApp().client.conversations.list).not.toHaveBeenCalled();
    });

    it('forces sync regardless of cache', async () => {
      vi.mocked(getLastGroupSync).mockReturnValue(
        new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      );

      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      currentApp().client.conversations.list.mockResolvedValue({
        channels: [{ id: 'C001', name: 'forced' }],
        response_metadata: {},
      });

      await channel.syncChannelMetadata(true);

      expect(currentApp().client.conversations.list).toHaveBeenCalled();
      expect(updateChatName).toHaveBeenCalledWith('slack:C001', 'forced');
    });

    it('handles sync failure gracefully', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      currentApp().client.conversations.list.mockRejectedValue(
        new Error('Network timeout'),
      );

      await expect(channel.syncChannelMetadata(true)).resolves.toBeUndefined();
    });

    it('paginates through channels', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      // Clear call count from the auto-sync during connect()
      vi.mocked(currentApp().client.conversations.list).mockClear();

      currentApp().client.conversations.list
        .mockResolvedValueOnce({
          channels: [{ id: 'C001', name: 'page1' }],
          response_metadata: { next_cursor: 'cursor_abc' },
        })
        .mockResolvedValueOnce({
          channels: [{ id: 'C002', name: 'page2' }],
          response_metadata: {},
        });

      await channel.syncChannelMetadata(true);

      expect(currentApp().client.conversations.list).toHaveBeenCalledTimes(2);
      expect(updateChatName).toHaveBeenCalledWith('slack:C001', 'page1');
      expect(updateChatName).toHaveBeenCalledWith('slack:C002', 'page2');
    });
  });

  // --- User display name ---

  describe('user display name', () => {
    it('fetches and caches user display name', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      const event = createMessageEvent({ text: 'Hello' });
      await triggerMessage(event);

      expect(currentApp().client.users.info).toHaveBeenCalledWith({
        user: 'U_USER_456',
      });
      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({ sender_name: 'Test User' }),
      );

      // Second message from same user should use cache
      vi.mocked(currentApp().client.users.info).mockClear();
      await triggerMessage(event);
      expect(currentApp().client.users.info).not.toHaveBeenCalled();
    });

    it('falls back to user ID on API failure', async () => {
      const opts = createTestOpts();
      const channel = new SlackChannel('xoxb-test', 'xapp-test', opts);
      await channel.connect();

      currentApp().client.users.info.mockRejectedValueOnce(
        new Error('Rate limited'),
      );

      const event = createMessageEvent({ user: 'U_UNKNOWN', text: 'Hello' });
      await triggerMessage(event);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'slack:C1234567890',
        expect.objectContaining({ sender_name: 'U_UNKNOWN' }),
      );
    });
  });

  // --- Channel properties ---

  describe('channel properties', () => {
    it('has name "slack"', () => {
      const channel = new SlackChannel('xoxb-test', 'xapp-test', createTestOpts());
      expect(channel.name).toBe('slack');
    });
  });
});

// --- splitMessage ---

describe('splitMessage', () => {
  it('returns single chunk for short messages', () => {
    expect(splitMessage('hello', 4000)).toEqual(['hello']);
  });

  it('splits at newline boundary', () => {
    const text = 'line1\nline2\nline3';
    const chunks = splitMessage(text, 10);
    expect(chunks[0]).toBe('line1');
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('hard splits when no newline found', () => {
    const text = 'x'.repeat(100);
    const chunks = splitMessage(text, 40);
    expect(chunks[0]).toBe('x'.repeat(40));
    expect(chunks.length).toBe(3);
  });

  it('handles exactly maxLen', () => {
    const text = 'x'.repeat(4000);
    expect(splitMessage(text, 4000)).toEqual([text]);
  });

  it('handles empty string', () => {
    expect(splitMessage('', 4000)).toEqual(['']);
  });
});
