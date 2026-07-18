import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCxLoCCSltzS8qwlDaUQX-wGSoGSFtvp1k",
  authDomain: "boutique-martita.firebaseapp.com",
  projectId: "boutique-martita",
  storageBucket: "boutique-martita.firebasestorage.app",
  messagingSenderId: "10215568803",
  appId: "1:10215568803:web:b7300362ae6ca66ee15616",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
