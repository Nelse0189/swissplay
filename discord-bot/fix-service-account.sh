#!/bin/bash

# Script to fix service account permissions for Cloud Run deployment

set -e

PROJECT_ID="solaris-cd166"
SERVICE_ACCOUNT_NAME="cloud-run-discord-bot"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "🔐 Setting up service account for Cloud Run..."

# Set project
gcloud config set project ${PROJECT_ID}

# Create service account if it doesn't exist
echo "Creating service account..."
gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
    --display-name="Cloud Run Discord Bot Service Account" \
    --project=${PROJECT_ID} \
    2>/dev/null && echo "✅ Service account created" || echo "ℹ️  Service account already exists"

# Grant necessary roles for Firestore access
echo "Granting Firestore access..."
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/datastore.user" \
    2>/dev/null && echo "✅ Firestore access granted" || echo "ℹ️  Firestore access already granted"

# Grant permission for the current user to act as this service account
CURRENT_USER=$(gcloud config get-value account)
echo "Granting ${CURRENT_USER} permission to use service account..."
gcloud iam service-accounts add-iam-policy-binding ${SERVICE_ACCOUNT_EMAIL} \
    --member="user:${CURRENT_USER}" \
    --role="roles/iam.serviceAccountUser" \
    --project=${PROJECT_ID} \
    2>/dev/null && echo "✅ Permission granted" || echo "ℹ️  Permission may already exist"

echo ""
echo "✅ Service account setup complete!"
echo ""
echo "Service account email: ${SERVICE_ACCOUNT_EMAIL}"
echo ""
echo "You can now deploy using: ./deploy-cloud-run-local.sh"




