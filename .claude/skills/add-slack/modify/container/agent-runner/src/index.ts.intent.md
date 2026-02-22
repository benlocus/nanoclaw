# Intent: container/agent-runner/src/index.ts modifications

## What changed
Added `model` field to `ContainerInput` interface and passed it to the Claude Agent SDK `query()` call.

## Key sections
- **ContainerInput interface**: Added optional `model?: string` field
- **query() options**: Added `...(containerInput.model ? { model: containerInput.model } : {})` to pass model when configured

## Invariants
- All existing agent-runner behavior unchanged
- Session management, IPC polling, hooks, MCP servers all untouched
- When `model` is not set, SDK uses its default (same as before)

## Must-keep
- The `MessageStream` class and IPC polling loop
- The `runQuery` function signature and return type
- All existing `query()` options (cwd, tools, env, hooks, etc.)
- Secret sanitization via `createSanitizeBashHook`
- Pre-compact hook for conversation archiving
