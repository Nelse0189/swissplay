# Solaris Discord Bot - Firebase Functions

This runs the Discord bot **exclusively on Firebase Functions** using Discord's [Interactions Endpoint URL](https://discord.com/developers/docs/interactions/receiving-and-responding). No Cloud Run, no websocket, no billing for always-on instances.

## Setup

### 1. Install dependencies

```bash
cd functions
npm install
```

### 2. Configure Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → your application
2. **General Information** → copy your **Application Public Key**
3. **General Information** → set **Interactions Endpoint URL** to:
   ```
   https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/discordInteractions
   ```
   (Replace `YOUR_PROJECT_ID` with your Firebase project ID, e.g. `solaris-cd166`)

### 3. Set environment variables

```bash
firebase functions:config:set discord.public_key="YOUR_APPLICATION_PUBLIC_KEY"
firebase functions:config:set discord.token="YOUR_BOT_TOKEN"
```

Or set as environment variables in Firebase (e.g. via `.env` or `firebase functions:config:set`):
- `DISCORD_PUBLIC_KEY` - Application Public Key from Discord Developer Portal
- `DISCORD_TOKEN` - Your bot token

Or use Secret Manager (recommended for the token):

```bash
# Create secrets
echo -n "YOUR_BOT_TOKEN" | gcloud secrets create DISCORD_TOKEN --data-file=-
echo -n "YOUR_PUBLIC_KEY" | gcloud secrets create DISCORD_PUBLIC_KEY --data-file=-

# Grant access to the default service account
gcloud secrets add-iam-policy-binding DISCORD_TOKEN \
  --member="serviceAccount:YOUR_PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

Then update `index.js` to use `defineSecret` for the token.

### 4. Register slash commands (one-time or after changes)

When using Firebase Functions (no running Node instance), run the registration script whenever you add or change slash commands:

```bash
cd functions
npm install   # ensures devDependency dotenv for local registration
# Ensure .env has DISCORD_TOKEN, DISCORD_CLIENT_ID (and optional DISCORD_GUILD_ID)
npm run register-commands
```

- **DISCORD_TOKEN** – bot token from Discord Developer Portal  
- **DISCORD_CLIENT_ID** – application ID (same portal)  
- **DISCORD_GUILD_ID** (optional) – server ID for instant updates; without it, global updates can take up to 1 hour

### 5. Deploy

```bash
firebase deploy --only functions
```

## Notes

- **Availability**: `/my-availability` uses a dropdown with presets; "Custom" opens a modal for free text.
- **Verification**: Manager verification uses the manager's linked Discord ID. Username-based lookup uses guild member search when the bot has seen the server (via any interaction).

## Functions deployed

| Function | Type | Description |
|----------|------|-------------|
| `discordInteractions` | HTTP | Receives all Discord interactions (slash commands, buttons, select menus) |
| `onVerificationCreated` | Firestore | Sends verification DMs when new verification docs are created |
| `onScrimRequestUpdated` | Firestore | Creates calendar events when a scrim request is accepted |
| `onCalendarEventWritten` | Firestore | Syncs `calendarEvents` to Discord Scheduled Events |
| `scrimReminders` | Scheduled | 24h / 1h scrim poll reminders (every 5 min) |
| `scheduleCarryOverReminders` | Scheduled | Weekly manager DM for schedule carry-over |
| `dailyEventSummary` | Scheduled | Posts daily event summary to configured channel |
| `weeklyEventSummary` | Scheduled | Posts weekly event summary to configured channel |
| `calendarDmReminders` | Scheduled | Event reminder DMs to linked team members |
| `calendarChannelReminders` | Scheduled | Event reminders to team reminder channel |
| `autoStartDiscordEvents` | Scheduled | Auto start/end Discord scheduled events |
