// Módulo 1 · Inicio de sesión (RF-01 a RF-05, RF-50, RF-52, RNF-19, RNF-20, CU-01).
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { configuracion } from '../compartido/configuracion';
import { ErrorNegocio, ServicioNoDisponible } from '../compartido/errores';
import { MENU } from '../compartido/permisos';
import { asincrono, autenticado, firmarAcceso, usuarioDe } from '../compartido/sesion';
import { codigoVisibleDispositivo } from '../dominio/usuarios';
import { autenticacionInstitucional } from '../integraciones';

/** Mensaje único ante cualquier fallo de credenciales (RF-50). */
export const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.';
export const MENSAJE_SERVICIO_CAIDO =
  'El servicio de autenticación no está disponible en este momento. Intentá nuevamente en un rato.';

/** Bloqueo local del captor (RF-52) y límite del servidor (RNF-19). */
export const INTENTOS_BLOQUEO_CAPTOR = 5;
export const INTENTOS_SERVIDOR = 10;
const VENTANA_SERVIDOR_MS = 15 * 60 * 1000;

// Hash de relleno para comparar aunque el usuario no exista: el tiempo de respuesta no revela nada.
let hashRelleno: string | undefined;
const relleno = () => (hashRelleno ??= bcrypt.hashSync(randomBytes(12).toString('hex'), configuracion.costoBcrypt));

const credenciales = () => new ErrorNegocio(401, 'CREDENCIALES', MENSAJE_CREDENCIALES);

export const rutasAutenticacion = Router();

/** Estado de un captor, consultable sin sesión desde la pantalla de bloqueo (RF-60). */
rutasAutenticacion.get(
  '/captores/:id/estado',
  asincrono(async (req, res) => {
    const captor = await registrarCaptor(String(req.params.id));
    res.json({ estado: captor.estado, codigoVisible: captor.codigoVisible });
  }),
);

async function registrarCaptor(idDispositivo: string) {
  const id = z.string().uuid().parse(idDispositivo);
  const captor = await db.dispositivo.upsert({
    where: { idDispositivo: id },
    create: { idDispositivo: id, codigoVisible: codigoVisibleDispositivo(id), claveDatos: nuevaClaveDatos() },
    update: { ultimaConexion: new Date() },
  });
  if (captor.claveDatos || captor.estado === 'Revocado') return captor;
  return db.dispositivo.update({ where: { idDispositivo: id }, data: { claveDatos: nuevaClaveDatos() } });
}

/** Clave AES-GCM de 256 bits para cifrar lo que el captor guarda sin señal (RNF-16). */
const nuevaClaveDatos = () => randomBytes(32).toString('base64');

/**
 * El captor se bloqueó solo, sin señal, al quinto intento fallido de reanudar la sesión (RF-52,
 * RF-57). Al recuperar la conexión lo informa, para que un Administrador pueda desbloquearlo (RF-60).
 */
rutasAutenticacion.post(
  '/captores/:id/bloqueo-local',
  asincrono(async (req, res) => {
    const captor = await registrarCaptor(String(req.params.id));
    if (captor.estado !== 'Activo') {
      res.json({ estado: captor.estado, codigoVisible: captor.codigoVisible });
      return;
    }
    const bloqueado = await db.dispositivo.update({
      where: { idDispositivo: captor.idDispositivo },
      data: { estado: 'Bloqueado', fechaBloqueo: new Date(), intentosFallidos: INTENTOS_BLOQUEO_CAPTOR },
    });
    res.json({ estado: bloqueado.estado, codigoVisible: bloqueado.codigoVisible });
  }),
);

async function fallarIntento(clave: string, idDispositivo: string): Promise<never> {
  await db.intentoLogin.create({ data: { clave } });
  const captor = await db.dispositivo.update({
    where: { idDispositivo },
    data: { intentosFallidos: { increment: 1 } },
  });
  if (captor.intentosFallidos >= INTENTOS_BLOQUEO_CAPTOR) {
    const bloqueado = await db.dispositivo.update({
      where: { idDispositivo },
      data: { estado: 'Bloqueado', fechaBloqueo: new Date() },
    });
    throw new ErrorNegocio(423, 'CAPTOR_BLOQUEADO', 'Este captor se bloqueó por 5 intentos fallidos.', {
      codigoVisible: bloqueado.codigoVisible,
    });
  }
  throw credenciales();
}

rutasAutenticacion.post(
  '/auth/login',
  asincrono(async (req, res) => {
    const datos = z
      .object({ nombreUsuario: z.string().trim().min(1).max(40), contrasena: z.string().min(1).max(200), idDispositivo: z.string().uuid() })
      .parse(req.body);
    const nombreUsuario = datos.nombreUsuario.toLowerCase();
    const captor = await registrarCaptor(datos.idDispositivo);
    if (captor.estado === 'Bloqueado')
      throw new ErrorNegocio(423, 'CAPTOR_BLOQUEADO', 'Este captor está bloqueado.', { codigoVisible: captor.codigoVisible });
    if (captor.estado === 'Revocado')
      throw new ErrorNegocio(401, 'CAPTOR_REVOCADO', 'Este captor fue revocado por un administrador.');

    // RNF-19: 10 intentos fallidos cada 15 minutos por IP y usuario, también para usuarios inexistentes.
    const clave = `${req.ip ?? 'sin-ip'}|${nombreUsuario}`;
    const recientes = await db.intentoLogin.count({ where: { clave, fechaHora: { gte: new Date(Date.now() - VENTANA_SERVIDOR_MS) } } });
    if (recientes >= INTENTOS_SERVIDOR)
      throw new ErrorNegocio(429, 'DEMASIADOS_INTENTOS', 'Demasiados intentos fallidos. Esperá unos minutos antes de volver a intentar.');

    // Paso 1: contraseña local (RF-01, RF-03).
    const usuario = await db.usuario.findUnique({ where: { nombreUsuario } });
    const coincide = await bcrypt.compare(datos.contrasena, usuario?.contrasenaHash ?? relleno());
    if (!usuario || !usuario.activo || !coincide) return fallarIntento(clave, captor.idDispositivo);

    // Paso 2: Autenticación Institucional (RF-02). Su caída no cuenta como intento (RF-50, RF-52).
    let vigencia: 'vigente' | 'no-vigente' | 'inexistente';
    try {
      vigencia = await autenticacionInstitucional.consultarVigencia(nombreUsuario);
    } catch (e) {
      if (e instanceof ServicioNoDisponible) throw new ErrorNegocio(503, 'AUTENTICACION_NO_DISPONIBLE', MENSAJE_SERVICIO_CAIDO);
      throw e;
    }
    if (vigencia !== 'vigente') return fallarIntento(clave, captor.idDispositivo);

    await db.dispositivo.update({
      where: { idDispositivo: captor.idDispositivo },
      data: { intentosFallidos: 0, nombreUsuario, ultimaConexion: new Date() },
    });
    const ahora = new Date();
    const refresco = await db.sesionRefresco.create({
      data: {
        id: randomBytes(32).toString('base64url'),
        nombreUsuario,
        idDispositivo: captor.idDispositivo,
        inicio: ahora,
        venceEn: new Date(ahora.getTime() + configuracion.diasTopeSesion * 86_400_000),
      },
    });
    const sesion = { nombreUsuario, rol: usuario.rol, idDispositivo: captor.idDispositivo };
    const institucional = await db.simUsuarioInstitucional.findUnique({ where: { nombreUsuario } });
    const conClave = await registrarCaptor(captor.idDispositivo);
    res.json({
      acceso: firmarAcceso(sesion),
      refresco: refresco.id,
      primerIngreso: refresco.inicio.toISOString(),
      captor: { idDispositivo: captor.idDispositivo, codigoVisible: captor.codigoVisible, claveDatos: conClave.claveDatos },
      usuario: { nombreUsuario, rol: usuario.rol, nombreCompleto: institucional?.nombreCompleto ?? nombreUsuario },
      menu: MENU[usuario.rol],
      pasos: [
        { titulo: 'Contraseña local', detalle: 'Validada contra la base propia del sistema (bcrypt).', simulado: false },
        {
          titulo: 'Autenticación Institucional',
          detalle: 'Confirmó que el usuario está vigente, con usuario + API key del sistema. La contraseña institucional nunca se envía.',
          simulado: true,
        },
      ],
    });
  }),
);

/** Renueva el acceso mientras haya actividad, con tope de 7 días desde el primer ingreso (RF-05, RNF-20). */
rutasAutenticacion.post(
  '/auth/refresh',
  asincrono(async (req, res) => {
    const { refresco } = z.object({ refresco: z.string().min(1) }).parse(req.body);
    const s = await db.sesionRefresco.findUnique({ where: { id: refresco } });
    if (!s || s.revocada || s.venceEn < new Date()) throw new ErrorNegocio(401, 'SESION_VENCIDA', 'Tu sesión venció. Volvé a ingresar.');
    const usuario = await db.usuario.findUnique({ where: { nombreUsuario: s.nombreUsuario } });
    if (!usuario?.activo) throw new ErrorNegocio(401, 'USUARIO_INACTIVO', 'Tu usuario fue dado de baja.');
    if (s.idDispositivo) {
      const captor = await db.dispositivo.findUnique({ where: { idDispositivo: s.idDispositivo } });
      if (captor?.estado === 'Revocado')
        throw new ErrorNegocio(401, 'CAPTOR_REVOCADO', 'Sesión finalizada por un administrador: este captor fue revocado.');
    }
    res.json({ acceso: firmarAcceso({ nombreUsuario: s.nombreUsuario, rol: usuario.rol, idDispositivo: s.idDispositivo }) });
  }),
);

/**
 * Al volver la señal después de reanudar la sesión sin conexión (RF-57): confirma que la sesión no
 * fue revocada y que el usuario sigue vigente en la Autenticación Institucional. Si ya no lo está,
 * cierra la sesión; los dictámenes que el captor tenga en cola se conservan y se sincronizan igual.
 */
rutasAutenticacion.post(
  '/auth/revalidar',
  asincrono(async (req, res) => {
    const { refresco } = z.object({ refresco: z.string().min(1) }).parse(req.body);
    const s = await db.sesionRefresco.findUnique({ where: { id: refresco } });
    if (!s || s.revocada || s.venceEn < new Date()) throw new ErrorNegocio(401, 'SESION_VENCIDA', 'Tu sesión venció. Volvé a ingresar.');
    const usuario = await db.usuario.findUnique({ where: { nombreUsuario: s.nombreUsuario } });
    if (!usuario?.activo) throw new ErrorNegocio(401, 'USUARIO_INACTIVO', 'Tu usuario fue dado de baja.');
    if (s.idDispositivo) {
      const captor = await db.dispositivo.findUnique({ where: { idDispositivo: s.idDispositivo } });
      if (captor?.estado === 'Revocado')
        throw new ErrorNegocio(401, 'CAPTOR_REVOCADO', 'Sesión finalizada por un administrador: este captor fue revocado.');
    }
    let vigencia: 'vigente' | 'no-vigente' | 'inexistente';
    try {
      vigencia = await autenticacionInstitucional.consultarVigencia(s.nombreUsuario);
    } catch (e) {
      if (e instanceof ServicioNoDisponible) throw new ErrorNegocio(503, 'AUTENTICACION_NO_DISPONIBLE', MENSAJE_SERVICIO_CAIDO);
      throw e;
    }
    if (vigencia !== 'vigente') {
      await db.sesionRefresco.update({ where: { id: refresco }, data: { revocada: true } });
      throw new ErrorNegocio(401, 'USUARIO_NO_VIGENTE', 'Tu usuario ya no está vigente en la institución: se cerró la sesión.');
    }
    res.json({ acceso: firmarAcceso({ nombreUsuario: s.nombreUsuario, rol: usuario.rol, idDispositivo: s.idDispositivo }) });
  }),
);

rutasAutenticacion.post(
  '/auth/logout',
  asincrono(async (req, res) => {
    const { refresco } = z.object({ refresco: z.string().optional() }).parse(req.body ?? {});
    if (refresco) await db.sesionRefresco.updateMany({ where: { id: refresco }, data: { revocada: true } });
    res.json({ ok: true });
  }),
);

rutasAutenticacion.get(
  '/auth/yo',
  autenticado,
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const institucional = await db.simUsuarioInstitucional.findUnique({ where: { nombreUsuario: u.nombreUsuario } });
    const pendientesSua = await db.dictamen.count({
      where: { nombreUsuario: u.nombreUsuario, estadoSincronizacion: 'Pendiente de sincronizar' },
    });
    const captor = u.idDispositivo ? await db.dispositivo.findUnique({ where: { idDispositivo: u.idDispositivo } }) : null;
    res.json({
      usuario: { nombreUsuario: u.nombreUsuario, rol: u.rol, nombreCompleto: institucional?.nombreCompleto ?? u.nombreUsuario },
      menu: MENU[u.rol],
      pendientesSua,
      captor: captor
        ? { codigoVisible: captor.codigoVisible, estado: captor.estado, claveDatos: captor.estado === 'Revocado' ? null : captor.claveDatos }
        : null,
    });
  }),
);
