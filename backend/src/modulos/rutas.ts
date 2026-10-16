// Módulo 3 · Rutas de trabajo (RF-14 a RF-19, RF-47 a RF-49, CU-04, CU-05) y Módulo 7 · rutas de
// tormenta (RF-41, RF-42, CU-12).
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { conflicto, ErrorNegocio, noEncontrado, prohibido, ServicioNoDisponible } from '../compartido/errores';
import { asincrono, autenticado, exigir, usuarioDe } from '../compartido/sesion';
import { DISTRITOS, PRIORIDADES } from '../dominio/catalogos';
import { type Punto, puntoEnPoligono } from '../dominio/geometria';
import { armarRuta, armarRutaTormenta, type Candidata, type Matriz, type ResultadoRuta } from '../dominio/ruteo';
import { SEDE } from '../dominio/sede';
import { columnaDeFecha, corteDelDia, fechaArgentina, fechaDeColumna, fechaDeJornada, rutaVigente } from '../dominio/tiempo';
import { mapas } from '../integraciones';
import { filtroSinConflicto, liberarVencidas } from './reservas';

const punto = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const esquemaCriterios = z.object({
  distrito: z.enum(DISTRITOS).nullish(),
  cupos: z.object({ Alta: z.number().int().min(0).max(50).optional(), Media: z.number().int().min(0).max(50).optional(), Baja: z.number().int().min(0).max(50).optional() }).default({}),
  zona: z.array(punto).min(3).max(100).nullish(),
  modo: z.enum(['Caminando', 'Vehiculo']),
});
type Criterios = z.infer<typeof esquemaCriterios>;

const MENSAJE_SIN_MAPAS =
  'El servicio de mapas no respondió: las solicitudes se eligieron solo por antigüedad y el orden de visita queda sin optimizar hasta que vuelva (arquitectura §5).';

/** Solicitudes que pueden entrar en una ruta: sin reservar, sin conflicto y con ubicación (RF-16, RF-62). */
async function disponibles(tormenta: boolean) {
  await liberarVencidas();
  return db.solicitud.findMany({
    where: {
      esTormenta: tormenta,
      estado: { in: ['Pendiente', 'PendienteRevision'] },
      reservas: { none: { liberada: false } },
      ...filtroSinConflicto,
    },
    orderBy: [{ fechaUltimaDerivacion: 'asc' }, { numeroSua: 'asc' }],
  });
}

const clave = (s: { numeroSua: string; anio: number }) => `${s.numeroSua}-${s.anio}`;

function aCandidata(s: Awaited<ReturnType<typeof disponibles>>[number]): Candidata {
  return { id: clave(s), lat: s.latitud!, lng: s.longitud!, fechaDerivacion: fechaDeColumna(s.fechaUltimaDerivacion), prioridad: s.prioridad };
}

async function filtrar(c: Criterios) {
  const todas = await disponibles(false);
  const enDistrito = todas.filter((s) => !c.distrito || s.distrito === c.distrito);
  const sinUbicar = enDistrito.filter((s) => s.latitud == null);
  const ubicadas = enDistrito.filter((s) => s.latitud != null);
  const enZona = c.zona ? ubicadas.filter((s) => puntoEnPoligono({ lat: s.latitud!, lng: s.longitud! }, c.zona!)) : ubicadas;
  return { candidatas: enZona, sinUbicar: sinUbicar.length, reservadas: await reservadasPorOtros(c) };
}

/**
 * Cuántas cumplen los criterios —distrito, zona y, si se pidieron cantidades, esas prioridades— pero
 * ya están en la ruta activa de otro ingeniero (CU-04 E3).
 */
async function reservadasPorOtros(c: Criterios): Promise<number> {
  const pedidas = PRIORIDADES.filter((p) => (c.cupos[p] ?? 0) > 0);
  const reservadas = await db.solicitud.findMany({
    where: {
      esTormenta: false,
      estado: { in: ['Pendiente', 'PendienteRevision'] },
      reservas: { some: { liberada: false } },
      latitud: { not: null },
      ...(c.distrito ? { distrito: c.distrito } : {}),
      ...(pedidas.length ? { prioridad: { in: pedidas } } : {}),
    },
    select: { latitud: true, longitud: true },
  });
  return c.zona ? reservadas.filter((s) => puntoEnPoligono({ lat: s.latitud!, lng: s.longitud! }, c.zona!)).length : reservadas.length;
}

/** CU-04 E2 y E3: no hay solicitudes que cumplan, o todas están reservadas por otros. */
const sinCandidatas = (reservadas: number) =>
  reservadas > 0
    ? new ErrorNegocio(422, 'TODAS_RESERVADAS', `Las ${reservadas} solicitudes que cumplen estos criterios ya están reservadas en rutas de otros ingenieros. Ampliá los criterios.`)
    : new ErrorNegocio(422, 'SIN_CANDIDATAS', 'No se encontraron solicitudes pendientes que cumplan estos criterios. Modificalos.');

/** Matriz desde la sede a todas las candidatas, o null si el servicio no responde (§5, punto 5). */
async function matrizCon(puntos: Punto[], modo: 'Caminando' | 'Vehiculo'): Promise<Matriz | null> {
  if (!puntos.length) return null;
  try {
    return await mapas.matriz([SEDE, ...puntos], modo);
  } catch (e) {
    if (e instanceof ServicioNoDisponible) return null;
    throw e;
  }
}

async function trazadoDe(orden: Punto[], modo: 'Caminando' | 'Vehiculo'): Promise<[number, number][] | null> {
  if (!orden.length) return null;
  try {
    return await mapas.trazado([SEDE, ...orden], modo);
  } catch {
    return null;
  }
}

/** Ruta activa del usuario: la de la jornada en curso, sin restablecer y antes de las 18:00 (H-040). */
async function rutaActivaDe(nombreUsuario: string) {
  await liberarVencidas();
  const rutas = await db.ruta.findMany({ where: { nombreUsuario, estado: 'Activa' }, orderBy: { creadaEn: 'desc' }, take: 3 });
  return rutas.find((r) => rutaVigente(fechaDeColumna(r.fecha))) ?? null;
}

async function detalleRuta(idRuta: number) {
  const ruta = await db.ruta.findUnique({
    where: { idRuta },
    include: { solicitudes: { orderBy: { orden: 'asc' }, include: { solicitud: true } } },
  });
  if (!ruta) throw noEncontrado('La ruta no existe.');
  const fecha = fechaDeColumna(ruta.fecha);
  return {
    idRuta: ruta.idRuta,
    tipo: ruta.tipo,
    estado: ruta.estado,
    fecha,
    venceEn: corteDelDia(fecha).toISOString(),
    vigente: ruta.estado === 'Activa' && rutaVigente(fecha),
    modo: ruta.modoDesplazamiento,
    criterios: ruta.criterios,
    distanciaTotalM: ruta.distanciaTotalM,
    duracionTotalS: ruta.duracionTotalS,
    ordenOptimizado: ruta.ordenOptimizado,
    geometria: ruta.geometria,
    sede: SEDE,
    paradas: ruta.solicitudes.map((rs) => ({
      orden: rs.orden,
      numeroSua: rs.numeroSua,
      anio: rs.anio,
      direccion: rs.solicitud.direccion,
      distrito: rs.solicitud.distrito,
      prioridad: rs.solicitud.prioridad,
      descripcion: rs.solicitud.descripcionReclamo,
      estado: rs.solicitud.estado,
      lat: rs.solicitud.latitud,
      lng: rs.solicitud.longitud,
      liberada: rs.liberada,
      motivoLiberacion: rs.motivoLiberacion,
      fechaDerivacion: fechaDeColumna(rs.solicitud.fechaUltimaDerivacion),
    })),
  };
}

/** Crea la ruta y reserva sus solicitudes de forma atómica (Slicing, Parte B: condición de carrera). */
async function reservar(
  nombreUsuario: string,
  tipo: 'Normal' | 'Tormenta',
  modo: 'Caminando' | 'Vehiculo',
  criterios: object,
  resultado: ResultadoRuta,
  porId: Map<string, Candidata>,
) {
  const geometria = resultado.ordenOptimizado ? await trazadoDe(resultado.orden.map((id) => porId.get(id)!), modo) : null;
  try {
    const ruta = await db.$transaction(async (tx) => {
      const r = await tx.ruta.create({
        data: {
          nombreUsuario,
          fecha: columnaDeFecha(fechaDeJornada()),
          tipo,
          modoDesplazamiento: modo,
          criterios: { ...criterios, cupos: resultado.cupos },
          distanciaTotalM: resultado.distanciaTotalM,
          duracionTotalS: resultado.duracionTotalS,
          ordenOptimizado: resultado.ordenOptimizado,
          geometria: geometria ?? Prisma.JsonNull,
        },
      });
      await tx.rutaSolicitud.createMany({
        data: resultado.orden.map((id, k) => {
          const [numeroSua, anio] = id.split('-');
          return { idRuta: r.idRuta, numeroSua, anio: Number(anio), orden: k + 1 };
        }),
      });
      return r;
    });
    return ruta;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      throw conflicto('RESERVA_TOMADA', 'Otro ingeniero reservó alguna de estas solicitudes mientras armabas la ruta. Volvé a generarla.');
    throw e;
  }
}

export const rutasRutas = Router();

/** Resumen en vivo mientras se ajustan los criterios: cuántas cumplen y cuántas entrarían. */
rutasRutas.post(
  '/rutas/vista-previa',
  autenticado,
  exigir('generarRuta'),
  asincrono(async (req, res) => {
    const c = esquemaCriterios.parse(req.body);
    const { candidatas, sinUbicar, reservadas } = await filtrar(c);
    const porPrioridad = Object.fromEntries(PRIORIDADES.map((p) => [p, candidatas.filter((s) => s.prioridad === p).length]));
    const pedidas = PRIORIDADES.filter((p) => (c.cupos[p] ?? 0) > 0);
    const entrarian = pedidas.length ? pedidas.reduce((t, p) => t + Math.min(c.cupos[p] ?? 0, porPrioridad[p]), 0) : candidatas.length;
    res.json({ cumplen: candidatas.length, porPrioridad, entrarian, sinUbicar, reservadasPorOtros: reservadas, puntos: candidatas.map((s) => ({ id: clave(s), lat: s.latitud, lng: s.longitud, prioridad: s.prioridad })) });
  }),
);

rutasRutas.post(
  '/rutas',
  autenticado,
  exigir('generarRuta'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const c = esquemaCriterios.parse(req.body);
    if (await rutaActivaDe(u.nombreUsuario))
      throw conflicto('RUTA_ACTIVA', 'Ya tenés una ruta activa. Restablecela antes de generar otra.');
    const { candidatas, reservadas } = await filtrar(c);
    if (!candidatas.length) throw sinCandidatas(reservadas);
    const lista = candidatas.map(aCandidata);
    const matriz = await matrizCon(lista, c.modo);
    const resultado = armarRuta(lista, c.cupos, matriz, fechaArgentina());
    if (!resultado.orden.length) throw sinCandidatas(reservadas);
    const ruta = await reservar(u.nombreUsuario, 'Normal', c.modo, { distrito: c.distrito ?? null, zona: c.zona ?? null }, resultado, new Map(lista.map((x) => [x.id, x])));
    res.status(201).json({ ruta: await detalleRuta(ruta.idRuta), aviso: matriz ? null : MENSAJE_SIN_MAPAS, cupos: resultado.cupos });
  }),
);

rutasRutas.get(
  '/rutas/activa',
  autenticado,
  exigir('generarRuta'),
  asincrono(async (req, res) => {
    const r = await rutaActivaDe(usuarioDe(req).nombreUsuario);
    res.json({ ruta: r ? await detalleRuta(r.idRuta) : null, sede: SEDE });
  }),
);

/** "Restablecer": descarta la ruta y libera las solicitudes no dictaminadas (RF-18, CU-05). */
rutasRutas.post(
  '/rutas/:id/restablecer',
  autenticado,
  exigir('generarRuta'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const idRuta = z.coerce.number().int().parse(req.params.id);
    const ruta = await db.ruta.findUnique({ where: { idRuta } });
    if (!ruta) throw noEncontrado('La ruta no existe.');
    if (ruta.nombreUsuario !== u.nombreUsuario) throw prohibido('Solo podés restablecer tu propia ruta.');
    if (ruta.estado !== 'Activa') throw conflicto('YA_RESTABLECIDA', 'La ruta ya estaba restablecida.');
    const liberadas = await db.$transaction(async (tx) => {
      const { count } = await tx.rutaSolicitud.updateMany({
        where: { idRuta, liberada: false },
        data: { liberada: true, fechaLiberacion: new Date(), motivoLiberacion: 'Restablecer' },
      });
      await tx.ruta.update({ where: { idRuta }, data: { estado: 'Restablecida' } });
      return count;
    });
    res.json({ liberadas });
  }),
);

// ── Protocolo por tormenta ──────────────────────────────────────────────────────────────────────

export const rutasTormenta = Router();

rutasTormenta.get(
  '/tormenta',
  autenticado,
  exigir('verTormenta'),
  asincrono(async (_req, res) => {
    await liberarVencidas();
    const solicitudes = await db.solicitud.findMany({
      where: { esTormenta: true },
      orderBy: [{ fechaUltimaDerivacion: 'asc' }, { numeroSua: 'asc' }],
      include: { reservas: { where: { liberada: false }, include: { ruta: { select: { nombreUsuario: true } } } } },
    });
    const forma = (s: (typeof solicitudes)[number]) => ({
      numeroSua: s.numeroSua,
      anio: s.anio,
      direccion: s.direccion,
      distrito: s.distrito,
      descripcion: s.descripcionReclamo,
      estado: s.estado,
      fechaDerivacion: fechaDeColumna(s.fechaUltimaDerivacion),
      reservadaPor: s.reservas[0]?.ruta.nombreUsuario ?? null,
      sinUbicar: s.latitud == null,
    });
    res.json({
      pendientes: solicitudes.filter((s) => s.estado !== 'Dictaminada').map(forma),
      dictaminadas: solicitudes.filter((s) => s.estado === 'Dictaminada').map(forma),
    });
  }),
);

/** Indicador animado de tormenta (RF-40): cuántas solicitudes de tormenta siguen sin dictaminar. */
rutasTormenta.get(
  '/tormenta/indicador',
  autenticado,
  asincrono(async (_req, res) => {
    const pendientes = await db.solicitud.count({ where: { esTormenta: true, estado: { not: 'Dictaminada' } } });
    res.json({ pendientes });
  }),
);

rutasTormenta.post(
  '/tormenta/rutas',
  autenticado,
  exigir('generarRutaTormenta'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const { cantidad } = z.object({ cantidad: z.number().int().min(1).max(100) }).parse(req.body);
    if (await rutaActivaDe(u.nombreUsuario))
      throw conflicto('RUTA_ACTIVA', 'Ya tenés una ruta activa. Restablecela antes de generar otra.');
    const lista = (await disponibles(true)).filter((s) => s.latitud != null).map(aCandidata);
    if (!lista.length) throw new ErrorNegocio(422, 'SIN_CANDIDATAS', 'No hay solicitudes de tormenta disponibles para una ruta.');
    // Elegidas las más antiguas, el orden de visita se calcula a pie desde la sede.
    const elegidas = [...lista].sort((a, b) => a.fechaDerivacion.localeCompare(b.fechaDerivacion) || a.id.localeCompare(b.id)).slice(0, cantidad);
    const matriz = await matrizCon(elegidas, 'Caminando');
    const resultado = armarRutaTormenta(elegidas, cantidad, matriz);
    const ruta = await reservar(u.nombreUsuario, 'Tormenta', 'Caminando', { cantidad }, resultado, new Map(elegidas.map((x) => [x.id, x])));
    const faltan = cantidad - resultado.orden.length;
    res.status(201).json({
      ruta: await detalleRuta(ruta.idRuta),
      aviso: [faltan > 0 ? `Pediste ${cantidad}, pero solo hay ${resultado.orden.length} disponibles: la ruta se armó con todas.` : null, matriz ? null : MENSAJE_SIN_MAPAS]
        .filter(Boolean)
        .join(' ') || null,
    });
  }),
);
