// Reservas de solicitudes en rutas y su liberación (RF-16, RF-17, RF-42).
import type { Prisma } from '@prisma/client';
import { db, type Transaccion } from '../compartido/base-de-datos';
import { corteDelDia, fechaDeColumna, rutaVigente } from '../dominio/tiempo';

/** Libera las reservas de rutas de días anteriores y, después de las 18:00, las de hoy (RF-17). */
export async function liberarVencidas(ahora: Date = new Date()): Promise<number> {
  const abiertas = await db.rutaSolicitud.findMany({
    where: { liberada: false },
    select: { idRuta: true, ruta: { select: { fecha: true } } },
    distinct: ['idRuta'],
  });
  const vencidas = abiertas.filter((r) => !rutaVigente(fechaDeColumna(r.ruta.fecha), ahora));
  let total = 0;
  for (const r of vencidas) {
    const fecha = fechaDeColumna(r.ruta.fecha);
    const { count } = await db.rutaSolicitud.updateMany({
      where: { idRuta: r.idRuta, liberada: false },
      data: { liberada: true, fechaLiberacion: corteDelDia(fecha), motivoLiberacion: 'Corte de las 18:00' },
    });
    total += count;
  }
  return total;
}

/** Libera la reserva de una solicitud porque se dictaminó (RF-17). */
export function liberarPorDictamen(tx: Transaccion, numeroSua: string, anio: number) {
  return tx.rutaSolicitud.updateMany({
    where: { numeroSua, anio, liberada: false },
    data: { liberada: true, fechaLiberacion: new Date(), motivoLiberacion: 'Dictaminada' },
  });
}

/** Reserva activa de una solicitud, si la tiene, con el ingeniero que la tiene en su ruta. */
export async function reservaActiva(numeroSua: string, anio: number) {
  await liberarVencidas();
  return db.rutaSolicitud.findFirst({
    where: { numeroSua, anio, liberada: false },
    include: { ruta: { select: { nombreUsuario: true, tipo: true, idRuta: true } } },
  });
}

/** Una solicitud está en conflicto si tiene dos o más dictámenes esperando que un Jefe elija (RF-59). */
export const filtroSinConflicto: Prisma.SolicitudWhereInput = {
  NOT: { dictamenes: { some: { vigente: null } } },
};
