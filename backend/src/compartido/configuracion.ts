// Configuración leída del entorno. Los secretos viven en .env (local) y en Vercel (publicado).
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

const requerida = (nombre: string): string => {
  const v = process.env[nombre];
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return v;
};

/**
 * Esquema propio del sistema dentro de la base. La base publicada puede ser compartida (la de Supabase es
 * del dueño del repositorio): el sistema no lee, crea ni borra nada fuera de este esquema, y sus tablas
 * quedan fuera de la API pública de Supabase, que solo expone `public`.
 */
export const ESQUEMA = 'arbolado';

/** La URL de conexión apuntada al esquema del sistema (Prisma lo toma del parámetro `schema`). */
export function conEsquema(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('schema', ESQUEMA);
    return u.toString();
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}schema=${ESQUEMA}`;
  }
}

export const configuracion = {
  get jwtSecreto() {
    return requerida('JWT_SECRETO');
  },
  /** Opcional: sin clave, el sistema funciona con ubicaciones precargadas y sin orden optimizado. */
  orsClave: process.env.ORS_API_KEY ?? '',
  /** Servicio de mapas: 'ors' (con clave), 'prueba' (coordenadas fijas de los datos de prueba) o 'ninguno'. */
  mapas: (process.env.MAPAS ?? 'ors') as 'ors' | 'prueba' | 'ninguno',
  /** Costo de bcrypt (RNF-05: 12). */
  costoBcrypt: Number(process.env.COSTO_BCRYPT ?? 12),
  /** Vida del token de acceso (RF-04: 30 minutos). */
  minutosAcceso: 30,
  /** Tope absoluto de la sesión renovada (RNF-20: 7 días). */
  diasTopeSesion: 7,
};
