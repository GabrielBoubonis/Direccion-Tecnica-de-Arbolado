// Errores de negocio con su código HTTP. El manejador central los convierte en respuestas JSON.
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class ErrorNegocio extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

export const noEncontrado = (mensaje: string) => new ErrorNegocio(404, 'NO_ENCONTRADO', mensaje);
export const prohibido = (mensaje = 'Tu rol no tiene acceso a esta acción.') => new ErrorNegocio(403, 'SIN_PERMISO', mensaje);
export const conflicto = (codigo: string, mensaje: string, detalle?: unknown) => new ErrorNegocio(409, codigo, mensaje, detalle);
export const invalido = (mensaje: string, detalle?: unknown) => new ErrorNegocio(422, 'DATOS_INVALIDOS', mensaje, detalle);

/** Un servicio externo (SUA, Autenticación Institucional, mapas) no respondió. */
export class ServicioNoDisponible extends Error {
  constructor(public readonly servicio: string, mensaje?: string) {
    super(mensaje ?? `${servicio} no responde.`);
  }
}

// El cuarto parámetro es obligatorio para que Express lo reconozca como manejador de errores.
export function manejadorDeErrores(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ErrorNegocio) {
    res.status(err.estado).json({ codigo: err.codigo, mensaje: err.message, detalle: err.detalle });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({
      codigo: 'DATOS_INVALIDOS',
      mensaje: 'Hay datos con valores fuera de lo permitido (RF-56).',
      detalle: err.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    });
    return;
  }
  if (err instanceof ServicioNoDisponible) {
    res.status(503).json({ codigo: 'SERVICIO_NO_DISPONIBLE', mensaje: err.message, servicio: err.servicio });
    return;
  }
  console.error(err);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado. Intentá de nuevo.' });
}
