import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Llaves publicas del proyecto de Firebase "Boutique Martita".
// Esto NO es un secreto: es normal que estas llaves vivan en el codigo
// del cliente. La seguridad real la dan las Reglas de Seguridad de
// Firestore (configuradas en la consola de Firebase), no estas llaves.
const firebaseConfig = {
    apiKey: "AIzaSyCxLoCCSltzS8qwlDaUQX-wGSoGSFtvp1k",
    authDomain: "boutique-martita.firebaseapp.com",
    projectId: "boutique-martita",
    storageBucket: "boutique-martita.firebasestorage.app",
    messagingSenderId: "10215568803",
    appId: "1:10215568803:web:b7300362ae6ca66ee15616",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
