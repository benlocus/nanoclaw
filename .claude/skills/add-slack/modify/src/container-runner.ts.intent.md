# Intent: src/container-runner.ts modifications

## What changed
1. Added `MODEL` config import and `model` field to `ContainerInput` so the configured model is passed to the agent-runner inside the container.
2. Added `SLACK_BOT_TOKEN` to `readSecrets()` allowlist so the Slack token flows to the container via stdin alongside other secrets.

## Key sections
- **Imports**: Added `MODEL` to the config import list
- **ContainerInput interface**: Added optional `model?: string` field
- **readSecrets()**: Added `'SLACK_BOT_TOKEN'` to the array of allowed secret keys

## Invariants
- All existing container-runner behavior unchanged
- Volume mounts, output parsing all untouched
- `model` is optional — when absent, agent-runner uses SDK default
- `SLACK_BOT_TOKEN` flows through existing secrets pipeline (`.env` → `readSecrets()` → `ContainerInput.secrets` → stdin). Never written to disk inside the container.

## Must-keep
- The `readSecrets()` function and stdin-based secret passing
- All existing `ContainerInput` fields
- Output marker parsing logic
