import { db } from './firebase';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';

export type Prioridad = 'urgente' | 'alta' | 'media' | 'baja' | 'tormenta';

export interface Reclamo {
  id?: string;
  nsum: string;
  fecha: Timestamp;
  descripcion: string;
  direccion: string;
  prioridad: Prioridad;
  estado: 'pendiente' | 'en_ruta' | 'resuelto';
  esTormenta: boolean;
}

export async function agregarReclamo(reclamo: Omit<Reclamo, 'id'>) {
  const ref = await addDoc(collection(db, 'reclamos'), reclamo);
  return ref.id;
}

export async function obtenerReclamos() {
  const q = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Reclamo[];
}

export async function obtenerReclamosTormenta() {
  const q = query(collection(db, 'reclamos'), orderBy('fecha', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }) as Reclamo)
    .filter(r => r.esTormenta && r.estado === 'pendiente');
}