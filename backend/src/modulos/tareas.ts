// Tareas que en producción corren solas cada cierto tiempo. En la demo (funciones sin servidor
// permanente) se disparan con las consultas habituales, como mucho una vez por minuto.
import { db } from '../compartido/base-de-datos';
import { leerDerivaciones, reintentarGeocodificacion, type ResultadoLectura } from './derivaciones';
import { reintentarEnviosSua } from './dictamenes';
import { liberarVencidas } from './reservas';

let ultima = 0;
let ultimaLectura: ResultadoLectura = { nuevas: 0, rederivadas: 0, rechazadas: 0, suaDisponible: true };

/** Espera entre intentos ante una caída del SUA: 1, 2, 4, 8, 16 y como máximo 32 minutos (RNF-17). */
export const esperaTrasFallos = (fallos: number): number => Math.min(2 ** Math.max(0, fallos - 1), 32) * 60_000;

/**
 * Corre una tarea que depende del SUA respetando la espera creciente: si el SUA no respondió la vez
 * anterior, no se vuelve a intentar hasta que pase la espera. Lo que no depende del SUA sigue andando.
 */
async function conEsperaCreciente(clave: string, tarea: () => Promise<boolean>): Promise<boolean | null> {
  const estado = await db.estadoTarea.findUnique({ where: { clave } });
  if (estado && estado.proximoIntento > new Date()) return null;
  const respondio = await tarea();
  const fallos = respondio ? 0 : (estado?.fallos ?? 0) + 1;
  const proximoIntento = new Date(Date.now() + (respondio ? 0 : esperaTrasFallos(fallos)));
  await db.estadoTarea.upsert({ where: { clave }, create: { clave, fallos, proximoIntento }, update: { fallos, proximoIntento } });
  return respondio;
}

/** Vuelve a habilitar los intentos en el acto (por ejemplo, cuando el simulador "levanta" el SUA). */
export async function reiniciarEsperas(): Promise<void> {
  await db.estadoTarea.deleteMany();
}

export async function tareasPeriodicas(forzar = false): Promise<{ lectura: ResultadoLectura }> {
  if (!forzar && Date.now() - ultima < 60_000) return { lectura: ultimaLectura };
  ultima = Date.now();
  // RF-09, RNF-17, RNF-18
  const leyo = await conEsperaCreciente('lectura_sua', async () => {
    ultimaLectura = await leerDerivaciones();
    return ultimaLectura.suaDisponible;
  });
  if (leyo === null) ultimaLectura = { ...ultimaLectura, nuevas: 0, rederivadas: 0, rechazadas: 0, suaDisponible: false };
  await reintentarGeocodificacion(); // RF-62
  await conEsperaCreciente('envio_sua', async () => (await reintentarEnviosSua()).suaDisponible); // RF-25, RNF-17
  await liberarVencidas(); // RF-17
  return { lectura: ultimaLectura };
}
