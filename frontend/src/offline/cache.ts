// Copia cifrada de lo necesario para trabajar sin señal (HU-09 criterio 1): la ruta activa, el
// detalle de cada solicitud de la ruta, los catálogos y las especies. Se actualiza cada vez que se
// consulta con conexión.
import { almacen } from './almacen';
import { claveActual } from './captor';
import { cifrarJson, descifrarJson } from './cifrado';

export async function guardarEnCache(clave: string, valor: unknown): Promise<void> {
  const k = claveActual();
  if (!k) return;
  await almacen.cache.put({ clave, guardadoEn: new Date().toISOString(), contenido: await cifrarJson(k, valor) });
}

export async function leerDeCache<T>(clave: string): Promise<T | null> {
  const k = claveActual();
  const entrada = await almacen.cache.get(clave);
  if (!k || !entrada) return null;
  try {
    return await descifrarJson<T>(k, entrada.contenido);
  } catch {
    return null;
  }
}

export const claveSolicitud = (numeroSua: string, anio: number | string) => `solicitud:${numeroSua}-${anio}`;
