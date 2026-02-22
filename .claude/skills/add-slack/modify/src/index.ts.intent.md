# Intent: src/index.ts modifications

## What changed
Added Slack channel support alongside WhatsApp using the `Channel` interface.

## Key sections

### Imports (top of file)
- Added: `SlackChannel` from `./channels/slack.js`
- Added: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_ONLY` from `./config.js`

### Module-level state
- No new module-level variable needed
- Kept: `let whatsapp: WhatsAppChannel` — still needed for `syncGroupMetadata` reference

### main()
- WhatsApp creation wrapped in `if (!SLACK_ONLY)` guard
- Slack channel created conditionally with `if (SLACK_BOT_TOKEN)`
- Slack channel takes two tokens: `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`

### IPC syncGroupMetadata
- Unchanged — `whatsapp?.syncGroupMetadata(force) ?? Promise.resolve()` handles SLACK_ONLY case
- Slack's syncChannelMetadata runs on its own internal timer

## Invariants
- All existing message processing logic (triggers, cursors, idle timers) is preserved
- The `runAgent` function is completely unchanged
- State management (loadState/saveState) is unchanged
- Recovery logic is unchanged
- Container runtime check is unchanged (ensureContainerSystemRunning)

## Must-keep
- The `escapeXml` and `formatMessages` re-exports
- The `_setRegisteredGroups` test helper
- The `isDirectRun` guard at bottom
- All error handling and cursor rollback logic in processGroupMessages
- The outgoing queue flush and reconnection logic (in WhatsAppChannel, not here)
