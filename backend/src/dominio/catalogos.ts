// Listas cerradas del formulario en papel "Dictamen Técnico de Arbolado" y de la solicitud.
// El servidor rechaza cualquier valor fuera de estas listas (RF-56).

export const DISTRITOS = ['Centro', 'Noroeste', 'Norte', 'Oeste', 'Sudoeste', 'Sur'] as const;

export const PRIORIDADES = ['Alta', 'Media', 'Baja'] as const;

export const NIVEL_DANO_VEREDA = ['Alto', 'Medio', 'Bajo'] as const;

export const MOTIVOS_EXTRACCION = [
  'Árbol muerto',
  'Con riesgo de caída por ahuecamiento',
  'Con riesgo de caída por inclinación',
  'Afectado por enfermedad incurable',
  'Con pronunciado desequilibrio estructural',
  'En precario estado vegetativo',
  'No es posible implementar solución técnica',
  'Por daño intencional irreversible',
  'Obra pública',
  'Especie no apta para el lugar implantado',
  'Cepa verde',
  'Cepa muerta',
] as const;

export const TRABAJOS_SUBTERRANEOS = [
  'Corte vertical de raíces',
  'Corte horizontal de raíces',
] as const;

/** El único trabajo subterráneo que registra una distancia al borde del árbol. */
export const TRABAJO_CON_DISTANCIA = 'Corte vertical de raíces';

export const TRABAJOS_AEREOS = [
  'Poda de formación',
  'Liberación de conductores eléctricos',
  'Liberación de tránsito peatonal',
  'Liberación de tránsito vehicular',
  'Despeje de espacio aéreo privado',
  'Despeje de luminarias',
  'Equilibrio del ejemplar',
  'Raleo y limpieza',
  'Elevación de copa',
  'Reducción de altura de copa',
  'Reducción volumétrica',
  'Eliminación de ramas peligro',
] as const;

export const MOTIVOS_SIN_TRABAJO = [
  'Ejemplar extraído',
  'Trabajos realizados en ramas y raíces',
  'El/los ejemplar/es no ocasionan problemas visibles',
  'El domicilio no existe',
  'Ejemplar/es en propiedad privada',
  'En el domicilio no existe arbolado público',
] as const;

export const COMPLEJIDAD = ['Baja', 'Media', 'Alta', 'Máxima'] as const;

/** "Plantar árboles": opcional; "ninguna" deja constancia de que no corresponde plantar. */
export const PLANTAR = ['Cazuela', 'Construir cazuela', 'Vereda jardín', 'Agrandar cazuela', 'ninguna'] as const;

export const NIVEL_PRIORIDAD = ['Alta', 'Media', 'Baja'] as const;

export const ROLES = ['Lector', 'Operador', 'Jefe', 'Administrador'] as const;
export type RolNombre = (typeof ROLES)[number];

/** Filtro del SUA que define qué solicitudes le corresponden al sistema (RF-09). */
export const FILTRO_SUA = {
  tipo: 'reclamo',
  subtipo: 'problema con el arbolado público',
  areaDerivada: 'Parques y Paseos - Dirección Técnica',
} as const;

export const CATALOGOS = {
  distritos: DISTRITOS,
  prioridades: PRIORIDADES,
  nivelDanoVereda: NIVEL_DANO_VEREDA,
  motivosExtraccion: MOTIVOS_EXTRACCION,
  trabajosSubterraneos: TRABAJOS_SUBTERRANEOS,
  trabajosAereos: TRABAJOS_AEREOS,
  motivosSinTrabajo: MOTIVOS_SIN_TRABAJO,
  complejidad: COMPLEJIDAD,
  plantar: PLANTAR,
  nivelPrioridad: NIVEL_PRIORIDAD,
};

export const pertenece = (lista: readonly string[], valor: unknown): boolean =>
  typeof valor === 'string' && lista.includes(valor);
