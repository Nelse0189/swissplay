#!/bin/bash

# Cloud Run Deployment Script (Local Build)
# This builds the Docker image locally and pushes to Artifact Registry
# Use this if Cloud Build gives permission errors

set -e

# Configuration
PROJECT_ID="solaris-cd166"
SERVICE_NAME="solaris-discord-bot"
REGION="us-central1"
REPOSITORY="discord-bot"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${SERVICE_NAME}"

echo "🚀 Deploying Solaris Discord Bot to Cloud Run (Local Build)..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first:"
    echo "   https://www.docker.com/products/docker-desktop"
    exit 1
fi

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
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable firestore.googleapis.com

# Create Artifact Registry repository if it doesn't exist
echo "📦 Setting up Artifact Registry..."
gcloud artifacts repositories create ${REPOSITORY} \
  --repository-format=docker \
  --location=${REGION} \
  2>/dev/null || echo "Repository already exists"

# Configure Docker authentication
echo "🔐 Configuring Docker authentication..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build Docker image locally for amd64/linux (Cloud Run requirement)
echo "🐳 Building Docker image locally for amd64/linux platform..."
cd "$(dirname "$0")"
docker build --platform linux/amd64 -t ${IMAGE_NAME} .

# Push image to Artifact Registry
echo "📤 Pushing image to Artifact Registry..."
docker push ${IMAGE_NAME}

# Check if .env file exists and load variables
if [ -f .env ]; then
    echo "📝 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
else
    echo "⚠️  .env file not found. You'll need to set environment variables manually."
fi

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
DEPLOY_CMD="gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
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

# Try to use the default Compute Engine service account instead
# Cloud Run will use the default service account which has necessary permissions
# Remove the service account flag to use defaults, or create one if needed

# Check if we should use a service account or let Cloud Run use defaults
if [ -z "$SKIP_SERVICE_ACCOUNT" ]; then
    # Try to create/get the App Engine default service account
    echo "🔐 Setting up service account..."
    gcloud iam service-accounts create cloud-run-discord-bot \
        --display-name="Cloud Run Discord Bot Service Account" \
        --project=${PROJECT_ID} \
        2>/dev/null || echo "Service account may already exist"
    
    # Grant necessary roles
    gcloud projects add-iam-policy-binding ${PROJECT_ID} \
        --member="serviceAccount:cloud-run-discord-bot@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="roles/datastore.user" \
        2>/dev/null || true
    
    SERVICE_ACCOUNT="cloud-run-discord-bot@${PROJECT_ID}.iam.gserviceaccount.com"
    DEPLOY_CMD="${DEPLOY_CMD} --service-account ${SERVICE_ACCOUNT}"
else
    echo "ℹ️  Using Cloud Run default service account"
fi

eval $DEPLOY_CMD

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Useful commands:"
echo "  View logs: gcloud run services logs read ${SERVICE_NAME} --region ${REGION} --follow"
echo "  View service: gcloud run services describe ${SERVICE_NAME} --region ${REGION}"

