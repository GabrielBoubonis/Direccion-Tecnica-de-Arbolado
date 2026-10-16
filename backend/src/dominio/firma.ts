// Firma digital del dictamen (RF-22, RF-53): SHA-256 sobre el JSON canónico del contenido.
// Código puro, sin dependencias de Node: lo usan el servidor y también el captor, que firma sin
// señal (CU-10). Así el contenido que se firma en el dispositivo es exactamente el que el servidor
// recalcula al sincronizar.
import type { Formulario } from './dictamen';

/** JSON con las claves ordenadas y sin espacios, para que el mismo contenido dé el mismo hash. */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  const obj = valor as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`)
    .join(',')}}`;
}

/** Campos del formulario que se guardan en la fila del dictamen y entran en la firma. */
export const CAMPOS_FIRMADOS = [
  'notaNumero', 'expedienteNumero', 'domicilioEjemplar', 'latitudEjemplar', 'longitudEjemplar',
  'referenciaUbicacion', 'distanciaMedianeraReferencia', 'idEspecie', 'cantidadFrente',
  'nivelDanoVereda', 'esExtraccion', 'perimetroTronco', 'motivoExtraccion', 'esSinTrabajo', 'motivoSinTrabajo',
  'complejidad', 'urgente', 'arbolFrenteGarage', 'mediaTension', 'deOficio', 'plantar', 'nivelPrioridad', 'observaciones',
] as const;

export type CampoFirmado = (typeof CAMPOS_FIRMADOS)[number];
export type CamposFirmados = Record<CampoFirmado, string | number | boolean | null>;

/** Toma solo los campos firmados, con null donde falta un valor. */
export function soloCamposFirmados(origen: Partial<Record<CampoFirmado, unknown>>): CamposFirmados {
  return Object.fromEntries(CAMPOS_FIRMADOS.map((k) => [k, origen[k] ?? null])) as CamposFirmados;
}

/**
 * Valores que se guardan a partir del formulario ya validado: los opcionales vacíos quedan en null
 * y los datos que dependen de una casilla desmarcada no se guardan (perímetro y motivo sin Extracción).
 */
export function camposDesdeFormulario(f: Formulario): CamposFirmados {
  return soloCamposFirmados({
    notaNumero: f.notaNumero ?? null,
    expedienteNumero: f.expedienteNumero ?? null,
    domicilioEjemplar: f.domicilioEjemplar,
    latitudEjemplar: f.latitudEjemplar,
    longitudEjemplar: f.longitudEjemplar,
    referenciaUbicacion: f.referenciaUbicacion || null,
    distanciaMedianeraReferencia: f.distanciaMedianeraReferencia ?? null,
    idEspecie: f.idEspecie,
    cantidadFrente: f.cantidadFrente,
    nivelDanoVereda: f.nivelDanoVereda ?? null,
    esExtraccion: f.esExtraccion,
    perimetroTronco: f.esExtraccion ? (f.perimetroTronco ?? null) : null,
    motivoExtraccion: f.esExtraccion ? (f.motivoExtraccion ?? null) : null,
    esSinTrabajo: f.esSinTrabajo,
    motivoSinTrabajo: f.esSinTrabajo ? (f.motivoSinTrabajo ?? null) : null,
    complejidad: f.complejidad,
    urgente: f.urgente,
    arbolFrenteGarage: f.arbolFrenteGarage,
    mediaTension: f.mediaTension,
    deOficio: f.deOficio,
    plantar: f.plantar ?? null,
    nivelPrioridad: f.nivelPrioridad,
    observaciones: f.observaciones || null,
  });
}

/** Contenido que cubre la firma: todo lo que cargó el ingeniero, el autor, la fecha y las fotos. */
export interface ContenidoFirmable {
  uuid: string;
  numeroSua: string;
  anio: number;
  nombreUsuario: string;
  fechaEmision: string;
  campos: CamposFirmados;
  trabajosAereos: string[];
  trabajosSubterraneos: { tipoTrabajo: string; distanciaBorde: number | null }[];
  /** SHA-256 de cada fotografía, en orden. */
  fotografias: string[];
}

export interface DatosDeFirma {
  uuid: string;
  numeroSua: string;
  anio: number;
  nombreUsuario: string;
  /** Fecha y hora de la firma, en ISO 8601 con milisegundos. */
  fechaEmision: string;
  campos: Partial<Record<CampoFirmado, unknown>>;
  trabajosAereos: string[];
  trabajosSubterraneos: { tipoTrabajo: string; distanciaBorde?: number | null }[];
  /** SHA-256 de cada foto, en el orden en que se cargaron. */
  huellasFotos: string[];
}

/** Arma el contenido firmable con un orden fijo para listas cuyo orden no tiene significado. */
export function armarContenidoFirmable(d: DatosDeFirma): ContenidoFirmable {
  return {
    uuid: d.uuid,
    numeroSua: d.numeroSua,
    anio: d.anio,
    nombreUsuario: d.nombreUsuario,
    fechaEmision: d.fechaEmision,
    campos: soloCamposFirmados(d.campos),
    trabajosAereos: [...d.trabajosAereos].sort(),
    trabajosSubterraneos: d.trabajosSubterraneos
      .map((t) => ({ tipoTrabajo: t.tipoTrabajo, distanciaBorde: t.distanciaBorde ?? null }))
      .sort((a, b) => (a.tipoTrabajo < b.tipoTrabajo ? -1 : a.tipoTrabajo > b.tipoTrabajo ? 1 : 0)),
    fotografias: d.huellasFotos,
  };
}

/** Texto exacto sobre el que se calcula el SHA-256 de la firma. */
export const textoAFirmar = (d: DatosDeFirma): string => jsonCanonico(armarContenidoFirmable(d));
