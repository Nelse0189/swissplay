#!/bin/bash

# Cloud Run Deployment Script for Solaris Discord Bot
# Make sure you have gcloud CLI installed and authenticated

set -e

# Configuration
PROJECT_ID="solaris-cd166"
SERVICE_NAME="solaris-discord-bot"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Solaris Discord Bot to Cloud Run..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the project
echo "📋 Setting GCP project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable firestore.googleapis.com

# Build and push the Docker image
echo "🐳 Building Docker image..."
cd "$(dirname "$0")"
gcloud builds submit --tag ${IMAGE_NAME}

# Check if .env file exists and load variables
if [ -f .env ]; then
    echo "📝 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  .env file not found. You'll need to set environment variables manually."
fi

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
# --no-cpu-throttling is CRITICAL for websocket bots - prevents "application does not respond" on Discord
DEPLOY_CMD="gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --no-cpu-throttling \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --set-env-vars \"FIREBASE_PROJECT_ID=${PROJECT_ID}\""

# Add Discord token if available
if [ ! -z "$DISCORD_TOKEN" ]; then
    DEPLOY_CMD="${DEPLOY_CMD},DISCORD_TOKEN=${DISCORD_TOKEN}"
fi

# Add Discord client ID if available
if [ ! -z "$DISCORD_CLIENT_ID" ]; then
    DEPLOY_CMD="${DEPLOY_CMD},DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}"
fi

# Use Cloud Run default service account (no need to specify)
# Cloud Run automatically uses a service account with necessary permissions
# If you need a custom service account, uncomment and configure below:
# SERVICE_ACCOUNT="cloud-run-discord-bot@${PROJECT_ID}.iam.gserviceaccount.com"
# DEPLOY_CMD="${DEPLOY_CMD} --service-account ${SERVICE_ACCOUNT}"

eval $DEPLOY_CMD

echo ""
echo "✅ Deployment complete!"
echo ""
echo "⚠️  If you still see 'application does not respond' on Discord, ensure CPU throttling is off:"
echo "   gcloud run services update ${SERVICE_NAME} --region ${REGION} --no-cpu-throttling --quiet"
echo ""
echo "📝 Next steps:"
echo "1. Set up secrets in Secret Manager:"
echo "   gcloud secrets create DISCORD_TOKEN --data-file=-"
echo "   gcloud secrets create DISCORD_CLIENT_ID --data-file=-"
echo ""
echo "2. Grant Cloud Run access to secrets:"
echo "   gcloud secrets add-iam-policy-binding DISCORD_TOKEN --member=serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com --role=roles/secretmanager.secretAccessor"
echo "   gcloud secrets add-iam-policy-binding DISCORD_CLIENT_ID --member=serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com --role=roles/secretmanager.secretAccessor"
echo ""
echo "3. View logs:"
echo "   gcloud run services logs read ${SERVICE_NAME} --region ${REGION}"
echo ""
echo "4. View service:"
echo "   gcloud run services describe ${SERVICE_NAME} --region ${REGION}"

