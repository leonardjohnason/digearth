# Treasure Raiders Weixin Miniapp

Runnable Weixin Mini Program + Google Cloud Run backend for 《宝藏奇兵》.

## Structure

- `miniprogram/` — Weixin Mini Program client.
- `backend/` — Node.js/Express API for game state, publishing treasure, buying defenses, and battles.

## Mini Program

1. Open `miniprogram/` in Weixin Developer Tools.
2. In `miniprogram/app.js`, replace `apiBase` with your Cloud Run HTTPS URL after deployment.
3. For local testing, keep `http://localhost:8080` and disable URL domain validation in Weixin Developer Tools.

The miniapp API client has:

- Default request timeout: **5 minutes**.
- Default retries: **2 retries** with exponential backoff.

## Backend local run

```bash
cd backend
npm install
USE_MEMORY_STORE=1 npm start
```

Health check:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/api/game
```

## Google Cloud deployment

Prerequisites:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com
```

Create an Artifact Registry repo once:

```bash
gcloud artifacts repositories create treasure-raiders \
  --repository-format=docker \
  --location=asia-east1
```

Deploy with Cloud Build:

```bash
cd backend
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=asia-east1,_SERVICE=treasure-raiders-api
```

The Cloud Run service is configured with a **300 second request timeout**.

After deployment, copy the Cloud Run URL into `miniprogram/app.js` or save it from the miniapp's Backend URL field.

## Notes

- Default backend store is Firestore on Google Cloud.
- Local testing can use in-memory state with `USE_MEMORY_STORE=1`.
- Current player identity defaults to `demo`; later versions should bind to Weixin login/openid.
