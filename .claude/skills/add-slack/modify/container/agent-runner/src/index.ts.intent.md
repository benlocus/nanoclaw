# Intent: container/agent-runner/src/index.ts modifications

## What changed
1. Added `model` field to `ContainerInput` interface and passed it to the Claude Agent SDK `query()` call.
2. Added `SLACK_BOT_TOKEN` to the MCP server's `env` block so the `get_channel_history` tool can call the Slack API. The token is passed only to the MCP server process — NOT to `sdkEnv` — so the agent (Claude Code) never sees it directly.

## Key sections
- **ContainerInput interface**: Added optional `model?: string` field
- **query() options**: Added `...(containerInput.model ? { model: containerInput.model } : {})` to pass model when configured
- **mcpServers.nanoclaw.env**: Conditionally spreads `SLACK_BOT_TOKEN` from `containerInput.secrets` when present

## Invariants
- All existing agent-runner behavior unchanged
- Session management, IPC polling, hooks all untouched
- When `model` is not set, SDK uses its default (same as before)
- `SLACK_BOT_TOKEN` is confined to the MCP server process env; the agent can only access channel history through the MCP tool interface

## Must-keep
- The `MessageStream` class and IPC polling loop
- The `runQuery` function signature and return type
- All existing `query()` options (cwd, tools, env, hooks, etc.)
- Secret sanitization via `createSanitizeBashHook`
- Pre-compact hook for conversation archiving
