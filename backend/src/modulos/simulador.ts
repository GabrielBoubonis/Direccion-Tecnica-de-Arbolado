// Panel del simulador de sistemas externos. NO es parte del sistema: reemplaza, para la demo, lo que
// en producción hacen el SUA y la Autenticación Institucional (derivar reclamos, caerse, recibir datos).
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { noEncontrado, prohibido } from '../compartido/errores';
import { asincrono, autenticado, usuarioDe } from '../compartido/sesion';
import { DISTRITOS, FILTRO_SUA, PRIORIDADES } from '../dominio/catalogos';
import { columnaDeFecha, fechaArgentina } from '../dominio/tiempo';
import { nombreServicioMapas } from '../integraciones';
import { INTERRUPTORES } from '../integraciones/simulacion';
import { cargarDatosDePrueba } from './datos-de-prueba';
import { reiniciarEsperas, tareasPeriodicas } from './tareas';

export const rutasSimulador = Router();
rutasSimulador.use('/simulador', autenticado);

async function siguienteNumero(): Promise<string> {
  const filas = await db.simSuaSolicitud.findMany({ select: { numeroSua: true } });
  const max = Math.max(50_000, ...filas.map((f) => Number(f.numeroSua)).filter(Number.isFinite));
  return String(max + 1);
}

rutasSimulador.get(
  '/simulador',
  asincrono(async (_req, res) => {
    const [config, sinLeer, recibidos, institucionales] = await Promise.all([
      db.simConfiguracion.findMany(),
      db.simSuaSolicitud.count({ where: { leido: false } }),
      db.simSuaDatosComplementarios.findMany({ orderBy: { recibidoEn: 'desc' }, take: 15 }),
      db.simUsuarioInstitucional.findMany({ orderBy: { nombreUsuario: 'asc' } }),
    ]);
    const activo = (clave: string) => config.find((c) => c.clave === clave)?.valor === 'si';
    res.json({
      interruptores: {
        suaCaido: activo(INTERRUPTORES.suaCaido),
        autenticacionCaida: activo(INTERRUPTORES.autenticacionCaida),
        mapasCaido: activo(INTERRUPTORES.mapasCaido),
      },
      servicioMapas: nombreServicioMapas,
      sinLeer,
      recibidos,
      institucionales,
    });
  }),
);

rutasSimulador.post(
  '/simulador/interruptor',
  asincrono(async (req, res) => {
    const { clave, activo } = z.object({ clave: z.enum([INTERRUPTORES.suaCaido, INTERRUPTORES.autenticacionCaida, INTERRUPTORES.mapasCaido]), activo: z.boolean() }).parse(req.body);
    await db.simConfiguracion.upsert({ where: { clave }, create: { clave, valor: activo ? 'si' : 'no' }, update: { valor: activo ? 'si' : 'no' } });
    // Al volver un servicio, el sistema lo reintenta en el acto en lugar de esperar el próximo turno.
    if (!activo) await reiniciarEsperas();
    res.json({ clave, activo });
  }),
);

/** El SUA deriva un reclamo nuevo a la Dirección Técnica; el sistema lo lee en el acto. */
rutasSimulador.post(
  '/simulador/derivacion',
  asincrono(async (req, res) => {
    const d = z
      .object({
        distrito: z.enum(DISTRITOS),
        prioridad: z.enum(PRIORIDADES),
        direccion: z.string().trim().min(3).max(200),
        descripcion: z.string().trim().min(3).max(1000),
        esTormenta: z.boolean().default(false),
      })
      .parse(req.body);
    const hoy = fechaArgentina();
    const numeroSua = await siguienteNumero();
    await db.simSuaSolicitud.create({
      data: {
        numeroSua,
        anio: Number(hoy.slice(0, 4)),
        ...FILTRO_SUA,
        distrito: d.distrito,
        prioridad: d.prioridad,
        direccion: d.direccion.includes('Rosario') ? d.direccion : `${d.direccion}, Rosario, Santa Fe`,
        descripcionReclamo: d.descripcion,
        esTormenta: d.esTormenta,
        esRederivacion: false,
        fechaDerivacion: columnaDeFecha(hoy),
      },
    });
    const { lectura } = await tareasPeriodicas(true);
    res.status(201).json({ numeroSua, anio: Number(hoy.slice(0, 4)), lectura });
  }),
);

/** Procesamiento de Datos re-deriva por vencimiento una solicitud existente (RF-12). */
rutasSimulador.post(
  '/simulador/rederivacion',
  asincrono(async (req, res) => {
    const { numeroSua, anio } = z.object({ numeroSua: z.string(), anio: z.number().int() }).parse(req.body);
    const s = await db.solicitud.findUnique({ where: { numeroSua_anio: { numeroSua, anio } } });
    if (!s) throw noEncontrado('La solicitud no existe.');
    await db.simSuaSolicitud.create({
      data: {
        numeroSua,
        anio,
        ...FILTRO_SUA,
        distrito: s.distrito,
        prioridad: s.prioridad,
        direccion: s.direccion,
        descripcionReclamo: s.descripcionReclamo,
        esTormenta: s.esTormenta,
        esRederivacion: true,
        fechaDerivacion: columnaDeFecha(fechaArgentina()),
      },
    });
    const { lectura } = await tareasPeriodicas(true);
    res.status(201).json({ lectura });
  }),
);

/** El SUA manda un registro que no cumple el esquema: el sistema lo rechaza a "Para revisar" (RNF-18). */
rutasSimulador.post(
  '/simulador/registro-invalido',
  asincrono(async (_req, res) => {
    const hoy = fechaArgentina();
    await db.simSuaSolicitud.create({
      data: {
        numeroSua: await siguienteNumero(),
        anio: Number(hoy.slice(0, 4)),
        ...FILTRO_SUA,
        distrito: 'Zona Franca',
        prioridad: 'Urgentísima',
        direccion: 'Córdoba 1500, Rosario, Santa Fe',
        descripcionReclamo: 'Registro de prueba con datos fuera del esquema esperado.',
        esTormenta: false,
        esRederivacion: false,
        fechaDerivacion: columnaDeFecha(hoy),
      },
    });
    const { lectura } = await tareasPeriodicas(true);
    res.status(201).json({ lectura });
  }),
);

/** Alta o cambio de vigencia de un usuario en la Autenticación Institucional simulada. */
rutasSimulador.post(
  '/simulador/institucional',
  asincrono(async (req, res) => {
    const d = z
      .object({ nombreUsuario: z.string().trim().toLowerCase().min(2).max(40), nombreCompleto: z.string().trim().min(2).max(80).optional(), vigente: z.boolean() })
      .parse(req.body);
    const u = await db.simUsuarioInstitucional.upsert({
      where: { nombreUsuario: d.nombreUsuario },
      create: { nombreUsuario: d.nombreUsuario, nombreCompleto: d.nombreCompleto ?? d.nombreUsuario, vigente: d.vigente },
      update: { vigente: d.vigente, ...(d.nombreCompleto ? { nombreCompleto: d.nombreCompleto } : {}) },
    });
    res.json(u);
  }),
);

/**
 * Solo demo: vuelve la base al estado inicial de los datos de prueba, el mismo que deja el despliegue.
 * Borra lo hecho durante la demo (dictámenes, rutas, auditoría, sesiones). Lo puede hacer solo el
 * Administrador, para preparar una presentación sin tener que volver a desplegar.
 */
rutasSimulador.post(
  '/simulador/reiniciar',
  asincrono(async (req, res) => {
    if (usuarioDe(req).rol !== 'Administrador') throw prohibido('Solo el Administrador puede volver la demo al estado inicial.');
    await cargarDatosDePrueba(() => undefined);
    await reiniciarEsperas();
    res.json({ ok: true });
  }),
);
