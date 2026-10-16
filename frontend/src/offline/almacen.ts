// Almacenamiento local del captor en IndexedDB (Dexie). Todo lo que tiene datos del trabajo se guarda
// cifrado (RNF-16): la cola de dictámenes firmados sin señal, sus fotografías y la copia de la ruta
// para trabajar sin señal. Lo único en claro son marcas sin contenido (fechas, contadores, estados).
import Dexie, { type Table } from 'dexie';
import type { Cifrado } from './cifrado';

/** Dictamen firmado sin señal, esperando que el servidor confirme su recepción (RF-32, RF-33). */
export interface ItemCola {
  uuid: string;
  numeroSua: string;
  anio: number;
  firmadoEn: string;
  /** "pendiente" se reintenta siempre; "rechazado" solo ante un rechazo explícito del servidor (RF-33). */
  estado: 'pendiente' | 'rechazado';
  intentos: number;
  ultimoIntento: string | null;
  motivoRechazo: string | null;
  /** Fotos ya subidas al servidor: id local → referencia del servidor. Si falla una, solo se reintenta esa (§7.4). */
  fotosSubidas: Record<string, string>;
  /** Contenido firmado (formulario, fecha, hash, segundo factor), cifrado. Se borra al confirmarse. */
  contenido: Cifrado | null;
}

export interface FotoLocal {
  id: string;
  uuidDictamen: string | null;
  tipoMime: string;
  /** SHA-256 de la imagen, para la firma. */
  sha256: string;
  contenido: Cifrado;
}

export interface EntradaCache {
  clave: string;
  guardadoEn: string;
  contenido: Cifrado;
}

export interface Ajuste {
  clave: string;
  valor: unknown;
}

class AlmacenCaptor extends Dexie {
  cola!: Table<ItemCola, string>;
  fotos!: Table<FotoLocal, string>;
  cache!: Table<EntradaCache, string>;
  ajustes!: Table<Ajuste, string>;

  constructor() {
    super('arbolado-captor');
    this.version(1).stores({ cola: 'uuid, estado', fotos: 'id, uuidDictamen', cache: 'clave', ajustes: 'clave' });
  }
}

export const almacen = new AlmacenCaptor();

export async function leerAjuste<T>(clave: string): Promise<T | null> {
  return ((await almacen.ajustes.get(clave))?.valor as T | undefined) ?? null;
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<void> {
  await almacen.ajustes.put({ clave, valor });
}

/** Borra todo lo guardado en el captor (revocación por pérdida o robo, RF-52). */
export async function borrarTodo(): Promise<void> {
  await Promise.all([almacen.cola.clear(), almacen.fotos.clear(), almacen.cache.clear(), almacen.ajustes.clear()]);
}
