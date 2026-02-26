# Solaris Discord Bot

Discord bot for managing team availability requests for scrims. Allows managers to send availability requests to players via DM.

## Features

- 📅 **Availability Requests**: Managers can request availability from all team players
- 🔗 **Discord Linking**: Link Discord accounts to team members
- 📊 **Player Management**: List all players and their Discord status
- ✅ **Button Responses**: Players respond with buttons (Available/Unavailable/Maybe)
- 🔔 **Notifications**: Managers receive notifications when players respond

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section
4. Click "Add Bot"
5. Copy the bot token (you'll need this for `.env`)
6. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT (required for reading messages)
   - SERVER MEMBERS INTENT (optional, for member lists)
7. Go to "OAuth2" > "URL Generator"
8. Select scopes: `bot` and `applications.commands`
9. Select bot permissions: `Send Messages`, `Read Message History`, `Direct Messages`
10. Copy the generated URL and open it to invite the bot to your server

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (`solaris-cd166`)
3. Go to Project Settings > Service Accounts
4. Click "Generate New Private Key"
5. Download the JSON file
6. Rename it to `serviceAccountKey.json`
7. Place it in the `discord-bot` directory

### 3. Install Dependencies

```bash
cd discord-bot
npm install
```

### 4. Configure Environment Variables

1. Copy `env.example` to `.env`:
```bash
cp env.example .env
```

2. Edit `.env` and fill in:
   - `DISCORD_TOKEN`: Your bot token from step 1
   - `DISCORD_CLIENT_ID`: Your application client ID (from Discord Developer Portal)
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID (default: `solaris-cd166`)
   - `DISCORD_GUILD_ID`: (Optional) Your Discord server ID

### 5. Run the Bot (Local Development)

```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

## Deployment to Google Cloud Run

Deploy the bot to Google Cloud Run for permanent, always-on hosting. Cloud Run automatically handles restarts, scaling, and integrates seamlessly with Firebase.

### Prerequisites

1. **Install Google Cloud SDK**:
   ```bash
   # macOS
   brew install google-cloud-sdk
   
   # Or download from: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate with Google Cloud**:
   ```bash
   gcloud auth login
   gcloud config set project solaris-cd166
   ```

3. **Enable billing** (Cloud Run requires a billing account, but has a generous free tier)

### Quick Deployment

1. **Set up your `.env` file** (if you haven't already):
   ```bash
   cp env.example .env
   # Edit .env with your Discord token and client ID
   ```

2. **Choose deployment method**:

   **Option A: Cloud Build (requires billing enabled)**
   ```bash
   cd discord-bot
   ./deploy-cloud-run.sh
   ```

   **Option B: Local Build (works without billing, requires Docker)**
   ```bash
   cd discord-bot
   ./deploy-cloud-run-local.sh
   ```
   
   If you get `PERMISSION_DENIED` errors with Cloud Build, use Option B (local build).

The script will:
- Enable required Google Cloud APIs
- Build and push a Docker image
- Deploy to Cloud Run with always-on configuration
- Set environment variables from your `.env` file

### Manual Deployment

If you prefer to deploy manually:

```bash
# Set your project
gcloud config set project solaris-cd166

# Enable APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable firestore.googleapis.com

# Build and deploy
gcloud builds submit --tag gcr.io/solaris-cd166/solaris-discord-bot
gcloud run deploy solaris-discord-bot \
  --image gcr.io/solaris-cd166/solaris-discord-bot \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars "FIREBASE_PROJECT_ID=solaris-cd166,DISCORD_TOKEN=your_token,DISCORD_CLIENT_ID=your_client_id" \
  --service-account solaris-cd166@appspot.gserviceaccount.com
```

### Using Secret Manager (Recommended for Production)

For better security, use Google Secret Manager instead of environment variables:

1. **Set up secrets**:
   ```bash
   ./setup-secrets.sh
   ```

2. **Update deployment** to use secrets:
   ```bash
   gcloud run deploy solaris-discord-bot \
     --image gcr.io/solaris-cd166/solaris-discord-bot \
     --platform managed \
     --region us-central1 \
     --set-secrets "DISCORD_TOKEN=DISCORD_TOKEN:latest,DISCORD_CLIENT_ID=DISCORD_CLIENT_ID:latest" \
     --set-env-vars "FIREBASE_PROJECT_ID=solaris-cd166"
   ```

### Cloud Run Configuration

- **Always-On**: `--min-instances 1` keeps the bot running 24/7
- **Memory**: 512Mi (sufficient for Discord bot)
- **CPU**: 1 vCPU
- **Timeout**: 3600 seconds (1 hour)
- **Auto-scaling**: Max 1 instance (prevents unnecessary scaling)

### Monitoring and Logs

```bash
# View logs
gcloud run services logs read solaris-discord-bot --region us-central1 --follow

# View service status
gcloud run services describe solaris-discord-bot --region us-central1

# Update environment variables
gcloud run services update solaris-discord-bot \
  --region us-central1 \
  --set-env-vars "DISCORD_TOKEN=new_token"
```

### Cost Estimate

With `--min-instances 1` (always-on):
- **Free Tier**: 2 million requests/month, 360,000 GB-seconds, 180,000 vCPU-seconds
- **Estimated Cost**: ~$0.10-0.30/month (very minimal)
- The bot uses minimal resources and stays well within free tier limits

### How Cloud Run Works with Firebase

Cloud Run automatically uses **Application Default Credentials (ADC)** when running on Google Cloud. The bot will:
1. Automatically authenticate with Firebase using the Cloud Run service account
2. Have access to Firestore (no service account key file needed)
3. Use the same Firebase project as your web app

No `serviceAccountKey.json` file is needed when running on Cloud Run!

## Commands

### Manager Commands (in Discord server)

- `!request-availability` or `!req [date] [time]` - Request availability from all players
  - Example: `!req 2024-01-15 19:00`
  
- `!link @player player@email.com` - Link a Discord user to a team member
  - Example: `!link @john john@example.com`
  
- `!list-players` or `!players` - List all players with their Discord status

- `!help` - Show help message

### Player Actions (via DM)

Players receive DMs with availability requests and can respond using buttons:
- ✅ **Available** - Player is available
- ❌ **Unavailable** - Player is not available
- ⏰ **Maybe** - Player might be available (can add details)

## How It Works

1. **Linking Accounts**: Managers use `!link` to connect Discord users to team members in Firebase
2. **Requesting Availability**: Managers use `!request-availability` to send DMs to all linked players
3. **Responding**: Players click buttons in the DM to respond
4. **Tracking**: Responses are stored in Firebase under `availabilityRequests` collection
5. **Notifications**: Managers receive DMs when players respond

## Firebase Collections

### `availabilityRequests`
Stores availability request data:
```javascript
{
  teamId: string,
  managerDiscordId: string,
  managerName: string,
  scrimDate: string | null,
  scrimTime: string | null,
  createdAt: Date,
  responses: {
    [discordId]: {
      playerName: string,
      playerUid: string,
      response: string,
      responseValue: boolean | null,
      respondedAt: Date,
      details?: string
    }
  },
  status: 'pending' | 'completed'
}
```

### `teams`
Team members can have a `discordId` field added:
```javascript
members: [
  {
    uid: string,
    name: string,
    roles: string[],
    discordId?: string,  // Added by !link command
    availability: string[]
  }
]
```

## Troubleshooting

### Cloud Build Permission Errors

If you get `PERMISSION_DENIED` when running `deploy-cloud-run.sh`:

1. **Enable billing** (Cloud Build requires billing):
   - Go to [Google Cloud Console Billing](https://console.cloud.google.com/billing)
   - Link a billing account to your project
   - Note: Free tier is generous, you likely won't be charged

2. **Or use local build instead**:
   ```bash
   ./deploy-cloud-run-local.sh
   ```
   This builds Docker locally and doesn't require Cloud Build.

### Bot not responding
- Check that the bot token is correct in `.env`
- Ensure the bot has proper permissions in your server
- Verify MESSAGE CONTENT INTENT is enabled
- Check Cloud Run logs: `gcloud run services logs read solaris-discord-bot --region us-central1`

### Firebase errors
- **Local development**: Ensure `serviceAccountKey.json` is in the `discord-bot` directory
- **Cloud Run**: Firebase uses Application Default Credentials automatically (no key file needed)
- Check that the service account has Firestore read/write permissions
- Verify the project ID matches your Firebase project

### DMs not working
- Ensure the bot can send DMs (check bot permissions)
- Players may need to allow DMs from server members
- Check that players have linked their Discord accounts with `!link`

## Security Notes

- Never commit `.env` or `serviceAccountKey.json` to version control
- Keep your bot token secret
- Regularly rotate service account keys
- Use environment variables for all sensitive data

## Future Enhancements

- Web dashboard integration to view availability responses
- Scheduled availability requests
- Availability calendar view
- Integration with scrim scheduling
- Role-based permissions
- Slash commands support

