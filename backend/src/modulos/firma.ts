// Contenido que se firma, se verifica y se envía al SUA. Una sola definición para los tres usos,
// así el hash que se recalcula al verificar es exactamente el que se calculó al firmar (RF-22, RF-53).
import { createHash } from 'node:crypto';
import type { Dictamen, TrabajoAereo, TrabajoSubterraneo } from '@prisma/client';
import { type CamposFirmados, type DatosDeFirma, soloCamposFirmados, textoAFirmar } from '../dominio/firma';
import { fotos } from '../integraciones';

export const sha256 = (datos: string | Buffer): string => createHash('sha256').update(datos).digest('hex');

export type DictamenCompleto = Pick<Dictamen, 'uuid' | 'numeroSua' | 'anio' | 'nombreUsuario' | 'fechaEmision'> &
  Partial<Dictamen> & {
    trabajosAereos: Pick<TrabajoAereo, 'tipoTrabajo'>[];
    trabajosSubterraneos: Pick<TrabajoSubterraneo, 'tipoTrabajo' | 'distanciaBorde'>[];
    fotografias: { archivoReferencia: string; orden: number }[];
  };

/** Campos del formulario tal como quedan guardados. */
export const camposDelFormulario = (d: Partial<Dictamen>): CamposFirmados => soloCamposFirmados(d);

/** SHA-256 de cada foto, en orden. Cubre las imágenes con la firma. */
export async function huellasDeFotos(referencias: string[]): Promise<string[]> {
  const huellas: string[] = [];
  for (const ref of referencias) {
    const f = await fotos.obtener(ref);
    if (!f) throw new Error(`La fotografía ${ref} no existe.`);
    huellas.push(sha256(f.datos));
  }
  return huellas;
}

const enOrden = (d: DictamenCompleto) => [...d.fotografias].sort((a, b) => a.orden - b.orden).map((f) => f.archivoReferencia);

export function datosDeFirma(d: DictamenCompleto, huellasFotos: string[]): DatosDeFirma {
  return {
    uuid: d.uuid,
    numeroSua: d.numeroSua,
    anio: d.anio,
    nombreUsuario: d.nombreUsuario,
    fechaEmision: d.fechaEmision.toISOString(),
    campos: camposDelFormulario(d),
    trabajosAereos: d.trabajosAereos.map((t) => t.tipoTrabajo),
    trabajosSubterraneos: d.trabajosSubterraneos,
    huellasFotos,
  };
}

/** Recalcula el hash de firma sobre el contenido guardado y las fotos almacenadas (RF-53). */
export async function calcularHash(d: DictamenCompleto): Promise<string> {
  return sha256(textoAFirmar(datosDeFirma(d, await huellasDeFotos(enOrden(d)))));
}

/**
 * Datos complementarios que se envían al SUA (RF-24): todo lo que cargó el ingeniero, las fotos,
 * el autor y la fecha. No van el hash de firma ni el estado de sincronización.
 */
export function datosComplementarios(d: DictamenCompleto, especie: string) {
  const { idEspecie: _omitida, ...campos } = camposDelFormulario(d);
  return {
    solicitud: `${d.numeroSua}-${d.anio}`,
    autor: d.nombreUsuario,
    fechaEmision: d.fechaEmision.toISOString(),
    ...campos,
    especie,
    trabajosAereos: d.trabajosAereos.map((t) => t.tipoTrabajo),
    trabajosSubterraneos: d.trabajosSubterraneos.map((t) => ({ tipoTrabajo: t.tipoTrabajo, distanciaBorde: t.distanciaBorde })),
    fotografias: enOrden(d).map((referencia, k) => ({ orden: k + 1, referencia })),
  };
}
