// Sesión por JWT (RF-04, RF-05) y control de permisos por rol en cada endpoint.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { RolNombre } from '../dominio/catalogos';
import { db } from './base-de-datos';
import { configuracion } from './configuracion';
import { ErrorNegocio, prohibido } from './errores';
import { type Accion, puede } from './permisos';

export interface UsuarioSesion {
  nombreUsuario: string;
  rol: RolNombre;
  idDispositivo: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    usuario?: UsuarioSesion;
  }
}

export const firmarAcceso = (u: UsuarioSesion): string =>
  jwt.sign(u, configuracion.jwtSecreto, { expiresIn: `${configuracion.minutosAcceso}m` });

const noAutenticado = (codigo = 'SESION_VENCIDA', mensaje = 'Tu sesión venció. Volvé a ingresar.') =>
  new ErrorNegocio(401, codigo, mensaje);

/** Envuelve un manejador asíncrono para que sus errores lleguen al manejador central. */
export const asincrono =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Exige un token de acceso válido. Rechaza al instante un captor revocado (arquitectura §7.1). */
async function verificarSesion(req: Request): Promise<void> {
  const [tipo, token] = (req.headers.authorization ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) throw noAutenticado('SIN_SESION', 'Tenés que iniciar sesión.');
  let datos: UsuarioSesion;
  try {
    datos = jwt.verify(token, configuracion.jwtSecreto) as UsuarioSesion;
  } catch {
    throw noAutenticado();
  }
  const usuario = await db.usuario.findUnique({ where: { nombreUsuario: datos.nombreUsuario } });
  if (!usuario?.activo) throw noAutenticado('USUARIO_INACTIVO', 'Tu usuario fue dado de baja.');
  if (datos.idDispositivo) {
    const captor = await db.dispositivo.findUnique({ where: { idDispositivo: datos.idDispositivo } });
    if (captor?.estado === 'Revocado')
      throw noAutenticado('CAPTOR_REVOCADO', 'Sesión finalizada por un administrador: este captor fue revocado.');
  }
  // El rol se toma de la base: un cambio de rol rige desde la petición siguiente.
  req.usuario = { ...datos, rol: usuario.rol };
}

export const autenticado: RequestHandler = (req, _res, next) => {
  verificarSesion(req).then(() => next(), next);
};

/** Exige que el rol del usuario tenga la acción indicada. */
export const exigir =
  (accion: Accion): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !puede(req.usuario.rol, accion)) return next(prohibido());
    next();
  };

export const usuarioDe = (req: Request): UsuarioSesion => {
  if (!req.usuario) throw noAutenticado();
  return req.usuario;
};
