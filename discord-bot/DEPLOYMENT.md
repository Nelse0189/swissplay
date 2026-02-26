# Cloud Run Deployment Guide

Quick reference for deploying the Solaris Discord Bot to Google Cloud Run.

## Prerequisites Checklist

- [ ] Google Cloud SDK installed (`gcloud --version`)
- [ ] Authenticated with Google Cloud (`gcloud auth login`)
- [ ] Project set to `solaris-cd166` (`gcloud config set project solaris-cd166`)
- [ ] `.env` file created with `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`
- [ ] (For Cloud Build) Billing enabled on Google Cloud project
- [ ] (For Local Build) Docker Desktop installed and running

## One-Command Deployment

**Option 1: Cloud Build (requires billing)**
```bash
cd discord-bot
./deploy-cloud-run.sh
```

**Option 2: Local Build (no billing needed, requires Docker)**
```bash
cd discord-bot
./deploy-cloud-run-local.sh
```

If you get `PERMISSION_DENIED` errors, use Option 2 (local build).

## What Happens During Deployment

1. ✅ Enables required Google Cloud APIs
2. 🐳 Builds Docker image using Cloud Build
3. 📦 Pushes image to Google Container Registry
4. 🚀 Deploys to Cloud Run with always-on configuration
5. 🔐 Sets environment variables from `.env` file

## Verify Deployment

```bash
# Check service status
gcloud run services describe solaris-discord-bot --region us-central1

# View logs
gcloud run services logs read solaris-discord-bot --region us-central1 --follow
```

## Update the Bot

After making code changes:

```bash
cd discord-bot
./deploy-cloud-run.sh
```

The script will rebuild and redeploy automatically.

## Troubleshooting

### Cloud Build Permission Errors

If you see `PERMISSION_DENIED` when using `deploy-cloud-run.sh`:

1. **Enable billing** in [Google Cloud Console](https://console.cloud.google.com/billing)
2. **Or use local build**: `./deploy-cloud-run-local.sh` (no billing needed)

### Bot not responding?
```bash
# Check logs for errors
gcloud run services logs read solaris-discord-bot --region us-central1 --limit 50
```

### Update environment variables:
```bash
gcloud run services update solaris-discord-bot \
  --region us-central1 \
  --set-env-vars "DISCORD_TOKEN=new_token"
```

### Restart the service:
```bash
gcloud run services update solaris-discord-bot \
  --region us-central1 \
  --no-traffic
gcloud run services update solaris-discord-bot \
  --region us-central1 \
  --to-latest
```

## Cost Monitoring

Check your Cloud Run usage:
```bash
# View service metrics
gcloud run services describe solaris-discord-bot --region us-central1 --format="value(status.url)"
```

Monitor costs in [Google Cloud Console](https://console.cloud.google.com/billing)

## Security Best Practices

1. **Use Secret Manager** for production (see `setup-secrets.sh`)
2. **Rotate tokens** regularly
3. **Monitor logs** for suspicious activity
4. **Set up alerts** in Google Cloud Console

## Next Steps

- Set up log-based alerts for errors
- Configure monitoring dashboards
- Set up automated backups (if needed)
- Consider using Secret Manager for production

