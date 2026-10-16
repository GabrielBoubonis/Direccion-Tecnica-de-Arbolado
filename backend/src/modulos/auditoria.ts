// Módulo 8 · Auditoría (RF-54, RF-55, CU-13). El registro es de solo inserción: no hay
// ninguna operación de modificación ni de borrado sobre él en toda la aplicación.
import { Router } from 'express';
import { z } from 'zod';
import { db, type Transaccion } from '../compartido/base-de-datos';
import { invalido } from '../compartido/errores';
import { asincrono, autenticado, exigir } from '../compartido/sesion';

export const ACCIONES_AUDITADAS = [
  'Alta de usuario',
  'Baja de usuario',
  'Cambio de rol',
  'Desbloqueo de captor',
  'Revocación de captor',
] as const;

/** Se llama dentro de la misma transacción que la acción: si falla, se revierte todo (arquitectura §7.5). */
export function registrarAuditoria(
  tx: Transaccion,
  e: { nombreUsuario: string; accion: (typeof ACCIONES_AUDITADAS)[number]; entidadAfectada: string; valorAnterior?: string | null; valorNuevo?: string | null },
) {
  return tx.registroAuditoria.create({ data: e });
}

/** "Mostrando 1-20 de 47 eventos" (wireframe 09). */
const POR_PAGINA = 20;

export const rutasAuditoria = Router();

rutasAuditoria.get(
  '/auditoria',
  autenticado,
  exigir('verAuditoria'),
  asincrono(async (req, res) => {
    const q = z
      .object({
        usuario: z.string().optional(),
        accion: z.enum(ACCIONES_AUDITADAS).optional(),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        pagina: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    if (q.desde && q.hasta && q.desde > q.hasta) throw invalido('La fecha de inicio tiene que ser anterior o igual a la de fin.');
    const where = {
      ...(q.usuario ? { nombreUsuario: { contains: q.usuario.toLowerCase() } } : {}),
      ...(q.accion ? { accion: q.accion } : {}),
      ...(q.desde || q.hasta
        ? {
            fechaHora: {
              ...(q.desde ? { gte: new Date(`${q.desde}T00:00:00-03:00`) } : {}),
              ...(q.hasta ? { lt: new Date(new Date(`${q.hasta}T00:00:00-03:00`).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    };
    const [total, eventos] = await Promise.all([
      db.registroAuditoria.count({ where }),
      db.registroAuditoria.findMany({ where, orderBy: { fechaHora: 'desc' }, skip: (q.pagina - 1) * POR_PAGINA, take: POR_PAGINA }),
    ]);
    res.json({ total, pagina: q.pagina, porPagina: POR_PAGINA, eventos, acciones: ACCIONES_AUDITADAS });
  }),
);
