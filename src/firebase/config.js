import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCbrcWIyM_OlI177FSvix3KgNuJCnbNFkU",
  authDomain: "solaris-cd166.firebaseapp.com",
  projectId: "solaris-cd166",
  storageBucket: "solaris-cd166.firebasestorage.app",
  messagingSenderId: "685631111714",
  appId: "1:685631111714:web:fe0d5079cb0ac5f2d1407b",
  measurementId: "G-5QW61WN5TY"
};

// Initialize Firebase
let app;
let auth;
let db;
let storage;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  
  console.log('✅ Firebase initialized successfully');
  console.log('Auth domain:', firebaseConfig.authDomain);
  console.log('Project ID:', firebaseConfig.projectId);
  
  // Set auth language to English (helps with some network issues)
  if (auth && typeof auth.languageCode !== 'undefined') {
    auth.languageCode = 'en';
  }
  
  // Initialize Analytics only if not in test environment
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    try {
      const analytics = getAnalytics(app);
      console.log('✅ Analytics initialized');
    } catch (error) {
      console.warn('⚠️ Analytics initialization failed:', error);
    }
  }
} catch (error) {
  console.error('❌ Firebase initialization failed:', error);
  throw error;
}

export { auth, db, storage };
export default app;
