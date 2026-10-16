// Reglas de tiempo del sistema, siempre en hora argentina (UTC-3, sin horario de verano).

export const ZONA = 'America/Argentina/Buenos_Aires';
const DESFASE_MS = -3 * 60 * 60 * 1000;

/** Hora de liberación automática de las reservas de una ruta (RF-17). */
export const HORA_CORTE = 18;

/** Fecha calendario argentina (AAAA-MM-DD) de un instante. */
export function fechaArgentina(instante: Date = new Date()): string {
  return new Date(instante.getTime() + DESFASE_MS).toISOString().slice(0, 10);
}

/** Hora argentina (0–23) de un instante. */
export function horaArgentina(instante: Date = new Date()): number {
  return new Date(instante.getTime() + DESFASE_MS).getUTCHours();
}

/** Instante en que vencen las reservas de una ruta del día indicado: ese día, 18:00 hs. */
export function corteDelDia(fecha: string): Date {
  return new Date(`${fecha}T${String(HORA_CORTE).padStart(2, '0')}:00:00-03:00`);
}

/** Una ruta sigue activa si es de hoy y todavía no son las 18:00 hs (RF-17). */
export function rutaVigente(fechaRuta: string, ahora: Date = new Date()): boolean {
  return ahora.getTime() < corteDelDia(fechaRuta).getTime();
}

/** Fecha (AAAA-MM-DD) guardada como columna DATE, leída en UTC por Prisma. */
export const fechaDeColumna = (d: Date): string => d.toISOString().slice(0, 10);

export const columnaDeFecha = (fecha: string): Date => new Date(`${fecha}T00:00:00.000Z`);

/** Días corridos entre dos fechas AAAA-MM-DD. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((columnaDeFecha(hasta).getTime() - columnaDeFecha(desde).getTime()) / 86_400_000);
}

/** Días hábiles (lunes a sábado) transcurridos desde una fecha hasta hoy. */
export function diasHabilesDesde(desde: string, hasta: string = fechaArgentina()): number {
  let cuenta = 0;
  const d = columnaDeFecha(desde);
  const fin = columnaDeFecha(hasta);
  while (d < fin) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) cuenta++;
  }
  return cuenta;
}

/**
 * Jornada a la que corresponde una ruta generada ahora: hoy, o mañana si ya pasó el corte de las
 * 18:00 (una ruta armada a la noche es para la jornada siguiente y vence a las 18:00 de ese día).
 */
export function fechaDeJornada(ahora: Date = new Date()): string {
  if (horaArgentina(ahora) < HORA_CORTE) return fechaArgentina(ahora);
  return fechaArgentina(new Date(ahora.getTime() + 86_400_000));
}
