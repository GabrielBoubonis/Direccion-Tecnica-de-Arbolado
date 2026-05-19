import { initializeApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCJPSOvHLvtHDXpW5xTfhdo3c0I1WgVa_o",
  authDomain: "arbolado-rosario.firebaseapp.com",
  projectId: "arbolado-rosario",
  storageBucket: "arbolado-rosario.firebasestorage.app",
  messagingSenderId: "185071513721",
  appId: "1:185071513721:web:92d5e4ab2cc8db4b0864a8"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
});