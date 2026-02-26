import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let initialized = false;

export function initializeFirebase() {
  if (initialized) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || 'solaris-cd166';

  try {
    // Check if running on Cloud Run (has GOOGLE_CLOUD_PROJECT env var)
    // Cloud Run uses Application Default Credentials (ADC)
    if (process.env.GOOGLE_CLOUD_PROJECT || process.env.K_SERVICE) {
      console.log('🌐 Initializing Firebase Admin with Application Default Credentials (Cloud Run)');
      admin.initializeApp({
        projectId: projectId
      });
      initialized = true;
      console.log('✅ Firebase Admin initialized (Cloud Run mode)');
      return;
    }

    // Try to use SERVICE_ACCOUNT_KEY environment variable (for Docker/Cloud Run with env vars)
    if (process.env.SERVICE_ACCOUNT_KEY) {
      console.log('🔑 Initializing Firebase Admin with SERVICE_ACCOUNT_KEY env var');
      const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId
      });
      initialized = true;
      console.log('✅ Firebase Admin initialized (env var mode)');
      return;
    }

    // Fall back to service account key file (local development)
    const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
    if (existsSync(serviceAccountPath)) {
      console.log('📁 Initializing Firebase Admin with service account key file');
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: projectId
      });
      initialized = true;
      console.log('✅ Firebase Admin initialized (local file mode)');
      return;
    }

    // Last resort: try Application Default Credentials (for local gcloud auth)
    console.log('🔐 Attempting to initialize Firebase Admin with Application Default Credentials');
    admin.initializeApp({
      projectId: projectId
    });
    initialized = true;
    console.log('✅ Firebase Admin initialized (ADC mode)');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin:', error.message);
    console.error('Tried: Cloud Run ADC -> SERVICE_ACCOUNT_KEY env -> serviceAccountKey.json -> Local ADC');
    throw error;
  }
}

export function getFirestore() {
  if (!initialized) {
    initializeFirebase();
  }
  return admin.firestore();
}

export function getAuth() {
  if (!initialized) {
    initializeFirebase();
  }
  return admin.auth();
}

