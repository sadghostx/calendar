// src/firebaseConfig.js

import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from 'firebase/auth'; // Required for authentication
import { getFirestore } from 'firebase/firestore'; // Required for Firestore database

// -----------------------------------------------------------------
// !!! YOUR ACTUAL FIREBASE CONFIGURATION FROM THE CONSOLE !!!
// -----------------------------------------------------------------
const firebaseConfig = {
  // CORRECTED: Added a comma after import.meta.env.VITE_FIREBASE_API_KEY
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY, 
  authDomain: "database-ef40a.firebaseapp.com",
  projectId: "database-ef40a",
  storageBucket: "database-ef40a.firebasestorage.app",
  messagingSenderId: "910670080448",
  appId: "1:910670080448:web:ebbb8cf06e2e6558df8025",
  measurementId: "G-3Q169B2KY4"
};
// -----------------------------------------------------------------


// Initialize Firebase (Check if app is already initialized for StackBlitz HMR)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Export the necessary services
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export the APP_DATA_ID for use in path construction (used in App.jsx)
export const APP_DATA_ID = firebaseConfig.appId;