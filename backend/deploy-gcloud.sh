#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-asia-east1}"
SERVICE="${SERVICE:-treasure-raiders-api}"
REPOSITORY="${REPOSITORY:-treasure-raiders}"
FIRESTORE_LOCATION="${FIRESTORE_LOCATION:-$REGION}"
PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Missing gcloud CLI. Install Google Cloud SDK first: https://cloud.google.com/sdk/docs/install" >&2
  exit 127
fi

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "Usage: ./deploy-gcloud.sh YOUR_PROJECT_ID" >&2
  exit 2
fi

cd "$(dirname "$0")"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com

if ! gcloud artifacts repositories describe "$REPOSITORY" --location="$REGION" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repository $REPOSITORY in $REGION..."
  gcloud artifacts repositories create "$REPOSITORY" \
    --repository-format=docker \
    --location="$REGION"
fi

if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "Creating Firestore default database in $FIRESTORE_LOCATION..."
  gcloud firestore databases create \
    --database='(default)' \
    --location="$FIRESTORE_LOCATION"
fi

SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

echo "Building and deploying Cloud Run service $SERVICE in $REGION..."
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d%H%M%S)}"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_SERVICE=$SERVICE,_SESSION_SECRET=$SESSION_SECRET,_IMAGE_TAG=$IMAGE_TAG"

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"

echo ""
echo "Deployment complete: $SERVICE_URL"
echo "Health check: $SERVICE_URL/healthz"
echo "Copy this URL into miniprogram/app.js apiBase, or enter it in the miniapp Backend URL field."
