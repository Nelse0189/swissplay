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

### 4. Register slash commands (one-time)

If your commands aren't registered yet, run the registration script from the `discord-bot` folder (or use the Discord Developer Portal to add them manually).

### 5. Deploy

```bash
firebase deploy --only functions
```

## Important: Disable the Cloud Run bot

Once this is working, **stop the Cloud Run deployment** so you don't have two bots responding. You can delete the Cloud Run service or set `min-instances` to 0.

## Limitations vs. Cloud Run bot

- **Availability setting**: Users set availability via a **dropdown** with presets (e.g. "Weekdays 6-10pm", "Weekends anytime") when they run `/my-availability`. A "Custom" option opens a modal for free-text input. Works in DMs and servers.
- **Verification by username**: The Firestore trigger only sends DMs for **manager verification** (when we have the manager's Discord ID from the team). Username-based verification (invites) requires the gateway to search guild members; that flow is not supported in HTTP-only mode.

## Functions deployed

| Function | Type | Description |
|----------|------|-------------|
| `discordInteractions` | HTTP | Receives all Discord interactions (slash commands, buttons, select menus) |
| `onVerificationCreated` | Firestore | Sends verification DMs when new verification docs are created |
| `scrimReminders` | Scheduled | Sends 24h and 1h scrim reminders (runs every 5 min) |
