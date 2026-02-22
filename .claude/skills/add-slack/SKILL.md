---
name: add-slack
description: Add Slack as a channel via @slack/bolt (Socket Mode). Can replace WhatsApp entirely or run alongside it.
---

# Add Slack Channel

This skill adds Slack support to NanoClaw using the skills engine for deterministic code changes, then walks through interactive setup.

## Phase 1: Pre-flight

### Check if already applied

Read `.nanoclaw/state.yaml`. If `slack` is in `applied_skills`, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

1. **Mode**: Replace WhatsApp or add alongside it?
   - Replace → will set `SLACK_ONLY=true`
   - Alongside → both channels active (default)

2. **Do they already have a Slack app?** If yes, collect the Bot Token and App Token. If no, we'll create one in Phase 3.

## Phase 2: Apply Code Changes

Run the skills engine to apply this skill's code package. The package files are in this directory alongside this SKILL.md.

### Initialize skills system (if needed)

If `.nanoclaw/` directory doesn't exist yet:

```bash
npx tsx scripts/apply-skill.ts --init
```

### Apply the skill

```bash
npx tsx scripts/apply-skill.ts .claude/skills/add-slack
```

This deterministically:
- Adds `src/channels/slack.ts` (SlackChannel class implementing Channel interface)
- Adds `src/channels/slack.test.ts` (unit tests)
- Three-way merges Slack support into `src/index.ts` (multi-channel support, SLACK_ONLY guard)
- Three-way merges Slack config into `src/config.ts` (SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_ONLY exports)
- Three-way merges updated routing tests into `src/routing.test.ts`
- Installs the `@slack/bolt` npm dependency
- Updates `.env.example` with `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`, and `SLACK_ONLY`
- Records the application in `.nanoclaw/state.yaml`

If the apply reports merge conflicts, read the intent files:
- `modify/src/index.ts.intent.md` — what changed and invariants for index.ts
- `modify/src/config.ts.intent.md` — what changed for config.ts

### Validate code changes

```bash
npm install
npm run build
npm test
```

All tests must pass (including the new slack tests) and build must be clean before proceeding.

## Phase 3: Slack App Setup

### Create Slack App (if needed)

If the user doesn't have a Slack app, guide them:

> I need you to create a Slack app:
>
> 1. Go to https://api.slack.com/apps and click **Create New App** > **From scratch**
> 2. Name it (e.g., "Andy Assistant") and select your workspace
>
> **Enable Socket Mode:**
> 3. Go to **Settings** > **Socket Mode** > **Enable Socket Mode**
> 4. Generate an App-Level Token with `connections:write` scope → save the `xapp-...` token
>
> **Add Bot Token Scopes (OAuth & Permissions):**
> 5. Go to **OAuth & Permissions** > **Scopes** > **Bot Token Scopes** and add:
>    - `channels:history`, `channels:read`, `groups:history`, `groups:read`
>    - `im:history`, `im:read`, `chat:write`, `users:read`
>
> **Subscribe to Events:**
> 6. Go to **Event Subscriptions** > **Enable Events**
> 7. Under **Subscribe to bot events**, add:
>    - `message.channels`, `message.groups`, `message.im`
>
> **Install to Workspace:**
> 8. Go to **Install App** > **Install to Workspace**
> 9. Copy the **Bot User OAuth Token** (`xoxb-...`)

Wait for the user to provide both tokens.

### Configure environment

Add to `.env`:

```bash
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
```

If they chose to replace WhatsApp:

```bash
SLACK_ONLY=true
```

Sync to container environment:

```bash
mkdir -p data/env && cp .env data/env/env
```

The container reads environment from `data/env/env`, not `.env` directly.

### Verify tokens

Run a quick verification:

```bash
node -e "
const token = require('fs').readFileSync('.env', 'utf8').match(/SLACK_BOT_TOKEN=(.+)/)?.[1];
fetch('https://slack.com/api/auth.test', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-www-form-urlencoded' }
}).then(r => r.json()).then(d => console.log(d.ok ? '✓ Token valid: ' + d.user : '✗ Invalid: ' + d.error));
"
```

## Phase 4: Channel Registration

### List available channels

Connect to Slack and list channels the bot is a member of:

> **Important:** Before registering, invite the bot to the desired channel:
> 1. Open the channel in Slack
> 2. Type `/invite @YourBotName`

Present channel names as options using AskUserQuestion.

### Register the channel

For a main channel (responds to all messages, uses the `main` folder):

```typescript
registerGroup("slack:<channelId>", {
  name: "<channel-name>",
  folder: "main",
  trigger: `@${ASSISTANT_NAME}`,
  added_at: new Date().toISOString(),
  requiresTrigger: false,
});
```

For additional channels (trigger-only):

```typescript
registerGroup("slack:<channelId>", {
  name: "<channel-name>",
  folder: "<folder-name>",
  trigger: `@${ASSISTANT_NAME}`,
  added_at: new Date().toISOString(),
  requiresTrigger: true,
});
```

## Phase 5: Full Setup

Reuse the channel-agnostic setup steps from `/setup`:

- Steps 1-4: environment check, install deps, container runtime, Claude auth
- **Skip step 5** (WhatsApp auth) — already handled in Phase 3
- Steps 7-9: mount allowlist, start service, verify
- Modified verify: check for `SLACK_BOT_TOKEN` in `.env` instead of WhatsApp auth dir

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 6: Verify

### Test the connection

Tell the user:

> Send a message in your registered Slack channel:
> - For main channel: Any message works
> - For non-main: `@Andy hello` or @mention the bot
>
> The bot should respond within a few seconds.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Troubleshooting

### Bot not responding

1. Check `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set in `.env` AND synced to `data/env/env`
2. Check channel is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'slack:%'"`
3. For non-main channels: message must include trigger pattern (`@Andy ...`)
4. Service is running: `launchctl list | grep nanoclaw`
5. Bot is invited to the channel: `/invite @BotName` in Slack

### Bot not seeing messages

- **Socket Mode** must be enabled in the Slack app settings
- **Event Subscriptions** must include `message.channels`, `message.groups`, `message.im`
- The app must have the required **Bot Token Scopes**

### Getting channel ID

If you need the channel ID manually:
- In Slack, right-click the channel name > **View channel details** > scroll to bottom for the Channel ID
- Or use the Slack API: `curl -s -H "Authorization: Bearer $SLACK_BOT_TOKEN" "https://slack.com/api/conversations.list" | jq '.channels[] | {id, name}'`
