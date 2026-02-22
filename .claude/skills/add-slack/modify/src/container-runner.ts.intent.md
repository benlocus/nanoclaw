# Intent: src/container-runner.ts modifications

## What changed
Added `MODEL` config import and `model` field to `ContainerInput` so the configured model is passed to the agent-runner inside the container.

## Key sections
- **Imports**: Added `MODEL` to the config import list
- **ContainerInput interface**: Added optional `model?: string` field

## Invariants
- All existing container-runner behavior unchanged
- Secrets handling, volume mounts, output parsing all untouched
- `model` is optional — when absent, agent-runner uses SDK default

## Must-keep
- The `readSecrets()` function and stdin-based secret passing
- All existing `ContainerInput` fields
- Output marker parsing logic
