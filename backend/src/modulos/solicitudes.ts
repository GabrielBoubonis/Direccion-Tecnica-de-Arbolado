// Módulo 2 · Listado y detalle de solicitudes (RF-10, RF-11, RF-13, RF-27 a RF-29, RF-39, CU-03).
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { noEncontrado } from '../compartido/errores';
import { asincrono, autenticado, exigir } from '../compartido/sesion';
import { fechaDeColumna } from '../dominio/tiempo';
import { liberarVencidas } from './reservas';
import { tareasPeriodicas } from './tareas';

const POR_PAGINA = 30;

export const rutasSolicitudes = Router();

rutasSolicitudes.get(
  '/solicitudes',
  autenticado,
  exigir('verSolicitudes'),
  asincrono(async (req, res) => {
    const tareas = await tareasPeriodicas();
    const q = z
      .object({
        pestania: z.enum(['todas', 'pendientes', 'revision']).default('todas'),
        anio: z.coerce.number().int().optional(),
        distrito: z.string().optional(),
        pagina: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    const estado =
      q.pestania === 'pendientes' ? { estado: 'Pendiente' as const } : q.pestania === 'revision' ? { estado: 'PendienteRevision' as const } : {};
    // Las solicitudes de tormenta no aparecen en el listado general (RF-39).
    const where = { esTormenta: false, ...estado, ...(q.anio ? { anio: q.anio } : {}), ...(q.distrito ? { distrito: q.distrito } : {}) };
    const [total, filas, anios] = await Promise.all([
      db.solicitud.count({ where }),
      db.solicitud.findMany({
        where,
        orderBy: [{ fechaUltimaDerivacion: 'asc' }, { numeroSua: 'asc' }],
        skip: (q.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        include: {
          reservas: { where: { liberada: false }, include: { ruta: { select: { nombreUsuario: true } } } },
          dictamenes: { select: { vigente: true } },
        },
      }),
      db.solicitud.findMany({ where: { esTormenta: false }, distinct: ['anio'], select: { anio: true }, orderBy: { anio: 'desc' } }),
    ]);
    res.json({
      total,
      pagina: q.pagina,
      porPagina: POR_PAGINA,
      anios: anios.map((a) => a.anio),
      sua: tareas.lectura,
      solicitudes: filas.map((s) => ({
        numeroSua: s.numeroSua,
        anio: s.anio,
        estado: s.estado,
        direccion: s.direccion,
        distrito: s.distrito,
        prioridad: s.prioridad,
        descripcion: s.descripcionReclamo,
        fechaDerivacion: fechaDeColumna(s.fechaUltimaDerivacion),
        reservadaPor: s.reservas[0]?.ruta.nombreUsuario ?? null,
        sinUbicar: s.latitud == null,
        enConflicto: s.dictamenes.filter((d) => d.vigente === null).length > 1,
      })),
    });
  }),
);

rutasSolicitudes.get(
  '/solicitudes/:numero/:anio',
  autenticado,
  exigir('verSolicitudes'),
  asincrono(async (req, res) => {
    const numeroSua = String(req.params.numero);
    const anio = z.coerce.number().int().parse(req.params.anio);
    await liberarVencidas();
    const s = await db.solicitud.findUnique({
      where: { numeroSua_anio: { numeroSua, anio } },
      include: {
        derivaciones: { orderBy: { fechaDerivacion: 'asc' } },
        dictamenes: { orderBy: { fechaEmision: 'asc' }, include: { especie: true, trabajosAereos: true, trabajosSubterraneos: true } },
        reservas: { where: { liberada: false }, include: { ruta: { select: { nombreUsuario: true, tipo: true } } } },
      },
    });
    if (!s) throw noEncontrado(`La solicitud ${numeroSua}-${anio} no existe.`);
    const enConflicto = s.dictamenes.filter((d) => d.vigente === null).length > 1;
    res.json({
      numeroSua: s.numeroSua,
      anio: s.anio,
      estado: s.estado,
      // Solo ubicación y descripción técnica: ningún dato del vecino (RF-29).
      direccion: s.direccion,
      distrito: s.distrito,
      prioridad: s.prioridad,
      descripcion: s.descripcionReclamo,
      esTormenta: s.esTormenta,
      lat: s.latitud,
      lng: s.longitud,
      sinUbicar: s.latitud == null,
      geoError: s.geoError,
      fechaDerivacion: fechaDeColumna(s.fechaUltimaDerivacion),
      reserva: s.reservas[0] ? { nombreUsuario: s.reservas[0].ruta.nombreUsuario, tipo: s.reservas[0].ruta.tipo } : null,
      enConflicto,
      derivaciones: s.derivaciones.map((d) => ({ fecha: fechaDeColumna(d.fechaDerivacion), motivo: d.motivo })),
      dictamenes: s.dictamenes.map((d) => ({
        idDictamen: d.idDictamen,
        nombreUsuario: d.nombreUsuario,
        fechaEmision: d.fechaEmision.toISOString(),
        vigente: d.vigente,
        intervencion: d.esExtraccion
          ? `Extracción: ${d.motivoExtraccion}`
          : d.esSinTrabajo
            ? `Sin trabajo: ${d.motivoSinTrabajo}`
            : [...d.trabajosSubterraneos, ...d.trabajosAereos].map((t) => t.tipoTrabajo).join(', '),
        especie: d.especie.nombreComun,
        nivelPrioridad: d.nivelPrioridad,
        estadoSincronizacion: d.estadoSincronizacion,
      })),
    });
  }),
);
