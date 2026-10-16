// Módulo 2 · Lectura de solicitudes del SUA (RF-09 a RF-12, RF-62, RNF-17, RNF-18).
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { ServicioNoDisponible } from '../compartido/errores';
import { DISTRITOS, FILTRO_SUA, PRIORIDADES } from '../dominio/catalogos';
import { columnaDeFecha } from '../dominio/tiempo';
import { mapas, sua } from '../integraciones';
import type { RegistroSua } from '../integraciones/puertos';

/** Quita caracteres de control y de marcado: el dato del SUA se guarda saneado (RNF-18). */
const saneado = (max: number) =>
  z
    .string()
    // eslint-disable-next-line no-control-regex -- quitar caracteres de control es justamente el saneamiento
    .transform((s) => s.replace(/[\u0000-\u001f\u007f<>]/g, '').trim())
    .pipe(z.string().min(1).max(max));

/** Esquema esperado de un registro del SUA. Lo que no lo cumple va a "Para revisar" (RF-58). */
export const esquemaRegistroSua = z.object({
  numeroSua: z.string().regex(/^\d{1,10}$/, 'el número de SUA tiene que ser numérico'),
  anio: z.number().int().min(2000).max(2100),
  distrito: z.enum(DISTRITOS, { errorMap: () => ({ message: 'el distrito no pertenece a la lista de distritos' }) }),
  prioridad: z.enum(PRIORIDADES, { errorMap: () => ({ message: 'la prioridad no es Alta, Media ni Baja' }) }),
  direccion: saneado(200),
  descripcionReclamo: saneado(1000),
  esTormenta: z.boolean(),
  esRederivacion: z.boolean(),
  fechaDerivacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha de derivación no es válida'),
});

const nombresDeCampo: Record<string, string> = {
  numeroSua: 'número de SUA',
  anio: 'año',
  distrito: 'distrito',
  prioridad: 'prioridad',
  direccion: 'dirección',
  descripcionReclamo: 'descripción',
  esTormenta: 'etiqueta de tormenta',
  esRederivacion: 'indicador de re-derivación',
  fechaDerivacion: 'fecha de derivación',
};

export interface ResultadoLectura {
  nuevas: number;
  rederivadas: number;
  rechazadas: number;
  suaDisponible: boolean;
}

/** Consulta al SUA las derivaciones nuevas y las incorpora. Si el SUA cae, informa y sigue (RNF-17). */
export async function leerDerivaciones(): Promise<ResultadoLectura> {
  const r: ResultadoLectura = { nuevas: 0, rederivadas: 0, rechazadas: 0, suaDisponible: true };
  let registros: RegistroSua[];
  try {
    registros = await sua.consultarDerivaciones(FILTRO_SUA);
  } catch (e) {
    if (e instanceof ServicioNoDisponible) return { ...r, suaDisponible: false };
    throw e;
  }
  for (const reg of registros) {
    const v = esquemaRegistroSua.safeParse(reg);
    if (!v.success) {
      const motivo = v.error.issues.map((i) => `${nombresDeCampo[String(i.path[0])] ?? i.path.join('.')}: ${i.message}`).join('; ');
      await db.casoRevision.create({
        data: { tipo: 'DatosInvalidosSua', referenciaSolicitud: `${String(reg.numeroSua)}-${String(reg.anio)}`, motivo: `Registro rechazado. ${motivo}.` },
      });
      r.rechazadas++;
      continue;
    }
    const d = v.data;
    const clave = { numeroSua_anio: { numeroSua: d.numeroSua, anio: d.anio } };
    const existente = await db.solicitud.findUnique({ where: clave, include: { dictamenes: true } });
    const fecha = columnaDeFecha(d.fechaDerivacion);
    if (!existente) {
      await db.solicitud.create({
        data: {
          numeroSua: d.numeroSua,
          anio: d.anio,
          distrito: d.distrito,
          prioridad: d.prioridad,
          direccion: d.direccion,
          descripcionReclamo: d.descripcionReclamo,
          esTormenta: d.esTormenta,
          fechaUltimaDerivacion: fecha,
          estado: 'Pendiente',
          derivaciones: { create: { fechaDerivacion: fecha, motivo: d.esRederivacion ? 'Re-derivación por vencimiento' : 'Nueva' } },
        },
      });
      r.nuevas++;
      await geocodificar(d.numeroSua, d.anio, d.direccion);
    } else {
      // Re-derivación (RF-12): si ya tuvo un dictamen pasa a Pendiente-revisión; si no, queda Pendiente.
      const enConflicto = existente.dictamenes.filter((x) => x.vigente === null).length > 1;
      const tuvoDictamen = existente.dictamenes.some((x) => x.vigente !== false);
      const cambioDireccion = existente.direccion !== d.direccion;
      await db.solicitud.update({
        where: clave,
        data: {
          distrito: d.distrito,
          prioridad: d.prioridad,
          direccion: d.direccion,
          descripcionReclamo: d.descripcionReclamo,
          esTormenta: d.esTormenta,
          fechaUltimaDerivacion: fecha,
          estado: enConflicto ? existente.estado : tuvoDictamen ? 'PendienteRevision' : 'Pendiente',
          ...(cambioDireccion ? { latitud: null, longitud: null, geoIntentos: 0, geoError: null } : {}),
          derivaciones: { create: { fechaDerivacion: fecha, motivo: 'Re-derivación por vencimiento' } },
        },
      });
      r.rederivadas++;
      if (cambioDireccion) await geocodificar(d.numeroSua, d.anio, d.direccion);
    }
  }
  if (registros.length) await sua.confirmarLectura(registros.map((x) => x.idExterno));
  return r;
}

/** Geocodifica una vez y guarda el resultado (Decisión 9). Si falla, queda para el reintento (RF-62). */
export async function geocodificar(numeroSua: string, anio: number, direccion: string): Promise<boolean> {
  const clave = { numeroSua_anio: { numeroSua, anio } };
  try {
    const p = await mapas.geocodificar(direccion);
    await db.solicitud.update({
      where: clave,
      data: p
        ? { latitud: p.lat, longitud: p.lng, geoError: null, geoUltimoIntento: new Date(), geoIntentos: { increment: 1 } }
        : { geoError: 'Dirección ambigua: no se pudo ubicar con precisión.', geoUltimoIntento: new Date(), geoIntentos: { increment: 1 } },
    });
    return !!p;
  } catch (e) {
    if (!(e instanceof ServicioNoDisponible)) throw e;
    await db.solicitud.update({
      where: clave,
      data: { geoError: 'El servicio de mapas no respondió.', geoUltimoIntento: new Date(), geoIntentos: { increment: 1 } },
    });
    return false;
  }
}

/** Reintento automático cada hora de las solicitudes sin ubicar (RF-62). Nadie las corrige a mano. */
export async function reintentarGeocodificacion(limite = 5): Promise<number> {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  const pendientes = await db.solicitud.findMany({
    where: { latitud: null, OR: [{ geoUltimoIntento: null }, { geoUltimoIntento: { lt: haceUnaHora } }] },
    take: limite,
  });
  let ubicadas = 0;
  for (const s of pendientes) if (await geocodificar(s.numeroSua, s.anio, s.direccion)) ubicadas++;
  return ubicadas;
}
