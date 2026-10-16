// Reglas del formulario del dictamen (RF-20, RF-45, RF-46, RF-56, RF-61).
// El formulario las aplica mientras se completa; el servidor las repite antes de firmar.

import { z } from 'zod';
import {
  COMPLEJIDAD,
  MOTIVOS_EXTRACCION,
  MOTIVOS_SIN_TRABAJO,
  NIVEL_DANO_VEREDA,
  NIVEL_PRIORIDAD,
  PLANTAR,
  TRABAJO_CON_DISTANCIA,
  TRABAJOS_AEREOS,
  TRABAJOS_SUBTERRANEOS,
} from './catalogos';

export const LARGO_REFERENCIA = 200;
export const LARGO_OBSERVACIONES = 1000;

const entero = z.number().int();
const enteroPositivo = entero.positive();
const medida = z.number().nonnegative();
const deLista = (lista: readonly [string, ...string[]]) => z.enum(lista as [string, ...string[]]);

/** Lo que el ingeniero carga en los 5 pasos del formulario. */
export const esquemaFormulario = z.object({
  // Paso 1 · Datos del ejemplar y ubicación
  notaNumero: enteroPositivo.nullish(),
  expedienteNumero: enteroPositivo.nullish(),
  domicilioEjemplar: z.string().trim().min(1).max(LARGO_REFERENCIA),
  latitudEjemplar: z.number().min(-90).max(90),
  longitudEjemplar: z.number().min(-180).max(180),
  referenciaUbicacion: z.string().trim().max(LARGO_REFERENCIA).nullish(),
  distanciaMedianeraReferencia: medida.nullish(),
  idEspecie: enteroPositivo,
  cantidadFrente: enteroPositivo.default(1),
  // Paso 2 · Diagnóstico
  nivelDanoVereda: deLista(NIVEL_DANO_VEREDA).nullish(),
  esExtraccion: z.boolean().default(false),
  perimetroTronco: medida.nullish(),
  motivoExtraccion: deLista(MOTIVOS_EXTRACCION).nullish(),
  esSinTrabajo: z.boolean().default(false),
  motivoSinTrabajo: deLista(MOTIVOS_SIN_TRABAJO).nullish(),
  // Paso 3 · Intervención
  trabajosSubterraneos: z
    .array(z.object({ tipoTrabajo: deLista(TRABAJOS_SUBTERRANEOS), distanciaBorde: medida.nullish() }))
    .default([]),
  trabajosAereos: z.array(deLista(TRABAJOS_AEREOS)).default([]),
  // Paso 4 · Información adicional y fotografías
  complejidad: deLista(COMPLEJIDAD),
  urgente: z.boolean().default(false),
  arbolFrenteGarage: z.boolean().default(false),
  mediaTension: z.boolean().default(false),
  deOficio: z.boolean().default(false),
  plantar: deLista(PLANTAR).nullish(),
  fotografias: z.array(z.string().min(1)).default([]),
  // Paso 5 · Observaciones y firma
  nivelPrioridad: deLista(NIVEL_PRIORIDAD),
  observaciones: z.string().trim().max(LARGO_OBSERVACIONES).nullish(),
});

export type Formulario = z.infer<typeof esquemaFormulario>;

export interface Incumplimiento {
  campo: string;
  regla: string;
  mensaje: string;
}

/** Reglas entre campos que el esquema no expresa. Devuelve todas las que no se cumplen. */
export function reglasDelDictamen(f: Formulario): Incumplimiento[] {
  const fallas: Incumplimiento[] = [];
  const falla = (campo: string, regla: string, mensaje: string) => fallas.push({ campo, regla, mensaje });
  const hayTrabajos = f.trabajosAereos.length > 0 || f.trabajosSubterraneos.length > 0;

  if (f.esExtraccion) {
    if (f.perimetroTronco == null) falla('perimetroTronco', 'RF-20', 'Con Extracción marcada, el perímetro del tronco es obligatorio.');
    if (!f.motivoExtraccion) falla('motivoExtraccion', 'RF-20', 'Con Extracción marcada, el motivo de extracción es obligatorio.');
    if (hayTrabajos) falla('trabajos', 'RF-46', 'Con Extracción marcada no se pueden cargar trabajos aéreos ni subterráneos.');
  }
  if (f.esSinTrabajo) {
    if (!f.motivoSinTrabajo) falla('motivoSinTrabajo', 'RF-20', 'Con "Sin trabajo" marcado, el motivo es obligatorio.');
    if (f.esExtraccion || hayTrabajos)
      falla('esSinTrabajo', 'RF-61', '"Sin trabajo" es excluyente con Extracción y con los trabajos aéreos y subterráneos.');
  }
  if (!f.esExtraccion && !f.esSinTrabajo && !hayTrabajos)
    falla('intervencion', 'RF-61', 'El dictamen tiene que tener alguna intervención marcada o "Sin trabajo".');

  const aereos = new Set(f.trabajosAereos);
  if (aereos.size !== f.trabajosAereos.length) falla('trabajosAereos', 'RF-56', 'Hay trabajos aéreos repetidos.');
  const subterraneos = new Set(f.trabajosSubterraneos.map((t) => t.tipoTrabajo));
  if (subterraneos.size !== f.trabajosSubterraneos.length) falla('trabajosSubterraneos', 'RF-56', 'Hay trabajos subterráneos repetidos.');
  for (const t of f.trabajosSubterraneos) {
    if (t.tipoTrabajo === TRABAJO_CON_DISTANCIA && t.distanciaBorde == null)
      falla('trabajosSubterraneos', 'RF-20', 'El corte vertical de raíces lleva la distancia al borde del árbol.');
    if (t.tipoTrabajo !== TRABAJO_CON_DISTANCIA && t.distanciaBorde != null)
      falla('trabajosSubterraneos', 'RF-56', 'Solo el corte vertical de raíces lleva distancia.');
  }
  if (f.fotografias.length === 0) falla('fotografias', 'RF-45', 'Hace falta al menos una fotografía del ejemplar para firmar.');
  return fallas;
}
