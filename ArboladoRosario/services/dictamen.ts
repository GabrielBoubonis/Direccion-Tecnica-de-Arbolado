import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';

export interface Dictamen {
  id?: string;
  reclamoId: string;
  nsum: string;
  fecha: Timestamp;
  tecnico: string;
  legajo: string;
  distrito: string;
  direccion: string;
  especie: string;
  danoVereda: 'Alto' | 'Medio' | 'Bajo' | '';
  extraccion: string[];
  trabajosSubterraneos: string[];
  trabajosAereos: string[];
  sinTrabajo: string[];
  complejidad: 'Baja' | 'Media' | 'Alta' | 'Máxima' | '';
  urgente: boolean;
  frenteGarage: boolean;
  mediaTension: boolean;
  deOficio: boolean;
  plantar: string[];
  observaciones: string;
  firmaBase64: string;
}

export async function guardarDictamen(dictamen: Omit<Dictamen, 'id'>) {
  const ref = await addDoc(collection(db, 'dictamenes'), dictamen);
  return ref.id;
}

export async function obtenerDictamenes() {
  const q = query(collection(db, 'dictamenes'), orderBy('fecha', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Dictamen[];
}