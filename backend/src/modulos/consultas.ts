// Especies (RF-56), Dashboard (Módulo 6: RF-35 a RF-37, RF-44, CU-11), "Para revisar" (RF-58,
// CU-14), catálogos y mapas para el formulario.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { conflicto, invalido } from '../compartido/errores';
import { asincrono, autenticado, exigir, usuarioDe } from '../compartido/sesion';
import { CATALOGOS } from '../dominio/catalogos';
import { normalizarTexto } from '../dominio/usuarios';
import { fechaArgentina } from '../dominio/tiempo';
import { mapas } from '../integraciones';
import { tareasPeriodicas } from './tareas';

export const rutasConsultas = Router();

rutasConsultas.get('/catalogos', autenticado, (_req, res) => {
  res.json(CATALOGOS);
});

// ── Especies ────────────────────────────────────────────────────────────────────────────────────

/** Normalización para comparar especies: sin mayúsculas, tildes ni espacios. */
const claveEspecie = (nombre: string) => normalizarTexto(nombre);

rutasConsultas.get(
  '/especies',
  autenticado,
  exigir('dictaminar'),
  asincrono(async (req, res) => {
    const q = claveEspecie(z.string().default('').parse(req.query.q));
    const especies = await db.especie.findMany({
      where: { activa: true, ...(q ? { nombreNormalizado: { contains: q } } : {}) },
      orderBy: { nombreComun: 'asc' },
      // Sin texto de búsqueda se devuelve el catálogo entero: el captor lo guarda para trabajar sin señal.
      take: q ? 30 : 500,
    });
    res.json({ especies: especies.map((e) => ({ idEspecie: e.idEspecie, nombreComun: e.nombreComun, nombreCientifico: e.nombreCientifico })) });
  }),
);

rutasConsultas.post(
  '/especies',
  autenticado,
  exigir('agregarEspecie'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const nombre = z.string().trim().min(2).max(60).parse(req.body?.nombreComun);
    const limpio = nombre.replace(/\s+/g, ' ').replace(/[^\p{L}\s.-]/gu, '');
    if (limpio.length < 2) throw invalido('El nombre de la especie solo admite letras.');
    const presentable = limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
    const existente = await db.especie.findUnique({ where: { nombreNormalizado: claveEspecie(limpio) } });
    if (existente) throw conflicto('ESPECIE_EXISTENTE', `La especie ya está en el catálogo como "${existente.nombreComun}".`, { idEspecie: existente.idEspecie });
    const e = await db.especie.create({ data: { nombreComun: presentable, nombreNormalizado: claveEspecie(limpio), creadaPor: u.nombreUsuario } });
    res.status(201).json({ idEspecie: e.idEspecie, nombreComun: e.nombreComun });
  }),
);

// ── Mapa del formulario: el domicilio del ejemplar se elige como un punto, sin tipeo libre (RF-56) ──

rutasConsultas.get(
  '/mapas/punto',
  autenticado,
  exigir('dictaminar'),
  asincrono(async (req, res) => {
    const p = z.object({ lat: z.coerce.number(), lng: z.coerce.number() }).parse(req.query);
    const direccion = await mapas.geocodificarInverso(p).catch(() => null);
    res.json({ disponible: mapas.disponible, direccion });
  }),
);

// ── Dashboard ───────────────────────────────────────────────────────────────────────────────────

rutasConsultas.get(
  '/dashboard',
  autenticado,
  exigir('verDashboard'),
  asincrono(async (req, res) => {
    await tareasPeriodicas();
    const hoy = fechaArgentina();
    const q = z
      .object({ anio: z.coerce.number().int().default(Number(hoy.slice(0, 4))), mes: z.coerce.number().int().min(1).max(12).optional() })
      .parse(req.query);

    // Cada derivación es un evento (RF-37). Una derivación cuenta como dictaminada si su solicitud
    // tiene un dictamen vigente o en espera emitido desde esa derivación y antes de la siguiente.
    const derivaciones = await db.historialDerivacion.findMany({
      where: { fechaDerivacion: { gte: new Date(`${q.anio}-01-01T00:00:00Z`), lt: new Date(`${q.anio + 1}-01-01T00:00:00Z`) } },
      include: { solicitud: { include: { dictamenes: { select: { fechaEmision: true, vigente: true } }, derivaciones: { select: { fechaDerivacion: true } } } } },
    });
    const eventos = derivaciones.map((d) => {
      const desde = d.fechaDerivacion.getTime();
      const siguiente = d.solicitud.derivaciones.map((x) => x.fechaDerivacion.getTime()).filter((t) => t > desde).sort((a, b) => a - b)[0] ?? Infinity;
      const dictaminada = d.solicitud.dictamenes.some((x) => x.vigente !== false && x.fechaEmision.getTime() >= desde && x.fechaEmision.getTime() < siguiente);
      return { mes: d.fechaDerivacion.getUTCMonth() + 1, tormenta: d.solicitud.esTormenta, dictaminada };
    });
    const resumen = (lista: typeof eventos) => ({
      derivadas: lista.length,
      dictaminadas: lista.filter((e) => e.dictaminada).length,
      sinDictaminar: lista.filter((e) => !e.dictaminada).length,
    });
    const delPeriodo = eventos.filter((e) => !q.mes || e.mes === q.mes);
    res.json({
      anio: q.anio,
      mes: q.mes ?? null,
      general: resumen(delPeriodo),
      tormenta: resumen(delPeriodo.filter((e) => e.tormenta)),
      evolucion: Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ...resumen(eventos.filter((e) => e.mes === i + 1)) })),
      actualizado: new Date().toISOString(),
    });
  }),
);

// ── Para revisar (solo consulta, Administrador) ─────────────────────────────────────────────────

rutasConsultas.get(
  '/revision',
  autenticado,
  exigir('verParaRevisar'),
  asincrono(async (req, res) => {
    await tareasPeriodicas();
    const tipo = z.enum(['IntegridadNoVerificada', 'DatosInvalidosSua']).optional().parse(req.query.tipo);
    const casos = await db.casoRevision.findMany({
      where: tipo ? { tipo } : {},
      orderBy: { fechaHora: 'desc' },
      include: { dictamen: { select: { nombreUsuario: true, fechaEmision: true } } },
    });
    // Para un dictamen, el autor y la fecha de firma (CU-14 paso 2).
    res.json({
      casos: casos.map(({ dictamen, ...c }) => ({ ...c, firmadoPor: dictamen?.nombreUsuario ?? null, firmadoEn: dictamen?.fechaEmision.toISOString() ?? null })),
    });
  }),
);

