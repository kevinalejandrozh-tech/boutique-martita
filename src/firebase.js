import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Base de datos. Para una copia independiente del proyecto, define en Vercel
// (Settings → Environment Variables) las variables VITE_FIREBASE_* con los datos
// de un proyecto de Firebase nuevo. Sin ellas se usa la base de datos original.
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyCxLoCCSltzS8qwlDaUQX-wGSoGSFtvp1k",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "boutique-martita.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "boutique-martita",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "boutique-martita.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "10215568803",
  appId: env.VITE_FIREBASE_APP_ID || "1:10215568803:web:b7300362ae6ca66ee15616",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
