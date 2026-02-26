#!/bin/bash

# Script to set up secrets in Google Cloud Secret Manager
# Run this before deploying to Cloud Run

set -e

PROJECT_ID="solaris-cd166"

echo "🔐 Setting up secrets in Google Cloud Secret Manager..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it first."
    exit 1
fi

# Source .env file
source .env

# Enable Secret Manager API
echo "🔧 Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --project=${PROJECT_ID}

# Create DISCORD_TOKEN secret
if [ -z "$DISCORD_TOKEN" ]; then
    echo "❌ DISCORD_TOKEN not found in .env file"
    exit 1
fi

echo "Creating DISCORD_TOKEN secret..."
echo -n "$DISCORD_TOKEN" | gcloud secrets create DISCORD_TOKEN \
    --data-file=- \
    --project=${PROJECT_ID} \
    2>/dev/null || echo -n "$DISCORD_TOKEN" | gcloud secrets versions add DISCORD_TOKEN \
    --data-file=- \
    --project=${PROJECT_ID}

# Create DISCORD_CLIENT_ID secret
if [ -z "$DISCORD_CLIENT_ID" ]; then
    echo "⚠️  DISCORD_CLIENT_ID not found in .env file (optional)"
else
    echo "Creating DISCORD_CLIENT_ID secret..."
    echo -n "$DISCORD_CLIENT_ID" | gcloud secrets create DISCORD_CLIENT_ID \
        --data-file=- \
        --project=${PROJECT_ID} \
        2>/dev/null || echo -n "$DISCORD_CLIENT_ID" | gcloud secrets versions add DISCORD_CLIENT_ID \
        --data-file=- \
        --project=${PROJECT_ID}
fi

# Grant Cloud Run service account access to secrets
SERVICE_ACCOUNT="${PROJECT_ID}@appspot.gserviceaccount.com"

echo "Granting Cloud Run service account access to secrets..."
gcloud secrets add-iam-policy-binding DISCORD_TOKEN \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/secretmanager.secretAccessor" \
    --project=${PROJECT_ID}

if [ ! -z "$DISCORD_CLIENT_ID" ]; then
    gcloud secrets add-iam-policy-binding DISCORD_CLIENT_ID \
        --member="serviceAccount:${SERVICE_ACCOUNT}" \
        --role="roles/secretmanager.secretAccessor" \
        --project=${PROJECT_ID}
fi

echo ""
echo "✅ Secrets set up successfully!"
echo ""
echo "You can now deploy using: ./deploy-cloud-run.sh"




