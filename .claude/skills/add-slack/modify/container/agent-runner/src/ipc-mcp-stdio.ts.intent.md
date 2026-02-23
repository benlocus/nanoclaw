# Intent: container/agent-runner/src/ipc-mcp-stdio.ts modifications

## What changed
Added `get_channel_history` MCP tool that fetches message history from the current Slack channel via the Slack API.

## Key sections
- **`resolveUserName()`**: Resolves Slack user IDs to display names with an in-memory cache for the session
- **`get_channel_history` tool**: Calls `conversations.history` Slack API, returns messages in chronological order formatted as `[timestamp] name: text`

## Parameters
- `limit` (optional, default 20, max 100) — number of messages to fetch
- `before` (optional) — ISO timestamp, fetch messages before this time
- `after` (optional) — ISO timestamp, fetch messages after this time

## Security
- `SLACK_BOT_TOKEN` is read from the MCP server's process env (set by the agent-runner, NOT by the SDK env)
- The agent (Claude Code) cannot access the token directly — only through this tool interface
- Graceful fallback: returns an error if no token is configured

## Invariants
- All existing MCP tools (send_message, schedule_task, list_tasks, pause/resume/cancel_task, register_group) unchanged
- IPC file writing, transport setup all untouched
- No new npm dependencies (uses native `fetch`)

## Must-keep
- All existing tools and their parameter schemas
- The `writeIpcFile` helper and IPC directory constants
- The stdio transport setup at the bottom of the file
