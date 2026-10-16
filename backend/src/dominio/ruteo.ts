// Selección y orden de las solicitudes de una ruta (RF-15, RF-41, RF-47, RF-48, RF-49).
// Algoritmo de arquitectura-técnica §5: franjas de antigüedad de 2 días y vecino más próximo.
// Es puro: recibe las distancias ya calculadas y no conoce el servicio de mapas.

import { diasEntre } from './tiempo';
import type { Punto } from './geometria';

export interface Candidata extends Punto {
  id: string;
  /** Fecha de la última derivación, AAAA-MM-DD. */
  fechaDerivacion: string;
  prioridad: string;
}

/**
 * Distancias y tiempos entre puntos. El índice 0 es la sede y el índice i+1 es la candidata i.
 * Nulo cuando el servicio de mapas no respondió.
 */
export interface Matriz {
  distancias: number[][];
  duraciones: number[][];
}

export interface ResultadoRuta {
  /** Identificadores en orden de visita. */
  orden: string[];
  /** Falso si no hubo distancias: la selección fue solo por antigüedad y el orden no se optimizó. */
  ordenOptimizado: boolean;
  distanciaTotalM: number | null;
  duracionTotalS: number | null;
  /** Por prioridad: cuántas se pidieron y cuántas entraron (CU-04: se informa la diferencia). */
  cupos: { prioridad: string; pedidas: number; incluidas: number }[];
}

/** Franja de antigüedad de 2 días corridos contada desde hoy: a mayor número, más antigua. */
export const franjaDeAntiguedad = (fechaDerivacion: string, hoy: string): number =>
  Math.floor(diasEntre(fechaDerivacion, hoy) / 2);

const masAntiguaPrimero = (a: Candidata, b: Candidata) =>
  a.fechaDerivacion.localeCompare(b.fechaDerivacion) || a.id.localeCompare(b.id);

/**
 * Elige hasta `cupo` candidatas: recorre las franjas de la más antigua a la más nueva y, dentro de
 * cada franja, toma la más cercana a algún punto ya elegido (la sede cuenta como elegido).
 */
function seleccionar(
  grupo: { c: Candidata; i: number }[],
  cupo: number,
  elegidos: number[],
  matriz: Matriz | null,
  hoy: string,
): { c: Candidata; i: number }[] {
  if (!matriz) return [...grupo].sort((a, b) => masAntiguaPrimero(a.c, b.c)).slice(0, cupo);

  const franjas = new Map<number, { c: Candidata; i: number }[]>();
  for (const g of grupo) {
    const f = franjaDeAntiguedad(g.c.fechaDerivacion, hoy);
    franjas.set(f, [...(franjas.get(f) ?? []), g]);
  }
  const resultado: { c: Candidata; i: number }[] = [];
  for (const f of [...franjas.keys()].sort((a, b) => b - a)) {
    const pendientes = franjas.get(f)!;
    while (pendientes.length && resultado.length < cupo) {
      let mejor = 0;
      let mejorDist = Infinity;
      pendientes.forEach((g, k) => {
        const d = Math.min(...elegidos.map((e) => matriz.distancias[e][g.i]));
        if (d < mejorDist || (d === mejorDist && masAntiguaPrimero(g.c, pendientes[mejor].c) < 0)) {
          mejor = k;
          mejorDist = d;
        }
      });
      const [g] = pendientes.splice(mejor, 1);
      resultado.push(g);
      elegidos.push(g.i);
    }
    if (resultado.length >= cupo) break;
  }
  return resultado;
}

/** Orden de visita por vecino más próximo, partiendo de la sede (índice 0). */
function ordenarDesdeSede(indices: number[], matriz: Matriz): number[] {
  const restantes = [...indices];
  const orden: number[] = [];
  let actual = 0;
  while (restantes.length) {
    let k = 0;
    restantes.forEach((x, j) => {
      if (matriz.distancias[actual][x] < matriz.distancias[actual][restantes[k]]) k = j;
    });
    actual = restantes.splice(k, 1)[0];
    orden.push(actual);
  }
  return orden;
}

/** Totales del recorrido sede → visitas → sede (la sede es partida y cierre del cálculo, RF-48). */
function totales(orden: number[], m: Matriz) {
  const tramo = [0, ...orden, 0];
  let dist = 0;
  let dur = 0;
  for (let k = 0; k < tramo.length - 1; k++) {
    dist += m.distancias[tramo[k]][tramo[k + 1]];
    dur += m.duraciones[tramo[k]][tramo[k + 1]];
  }
  return { dist, dur };
}

/**
 * Arma una ruta normal. `cupos` lleva la cantidad pedida por prioridad; si no se pidió ninguna,
 * entran todas las candidatas (H-059).
 */
export function armarRuta(
  candidatas: readonly Candidata[],
  cupos: Partial<Record<string, number>>,
  matriz: Matriz | null,
  hoy: string,
): ResultadoRuta {
  const indexadas = candidatas.map((c, k) => ({ c, i: k + 1 }));
  const pedidas = Object.entries(cupos).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  const elegidos = [0];
  let seleccion: { c: Candidata; i: number }[] = [];
  const informe: ResultadoRuta['cupos'] = [];

  if (pedidas.length === 0) {
    seleccion = seleccionar(indexadas, indexadas.length, elegidos, matriz, hoy);
  } else {
    for (const [prioridad, n] of pedidas) {
      const grupo = indexadas.filter((g) => g.c.prioridad === prioridad);
      const elegidas = seleccionar(grupo, n, elegidos, matriz, hoy);
      seleccion.push(...elegidas);
      informe.push({ prioridad, pedidas: n, incluidas: elegidas.length });
    }
  }
  return ordenar(seleccion, matriz, informe);
}

/** Arma una ruta de tormenta: las más antiguas primero, solo con la cantidad pedida (RF-41). */
export function armarRutaTormenta(
  candidatas: readonly Candidata[],
  cantidad: number,
  matriz: Matriz | null,
): ResultadoRuta {
  const indexadas = candidatas.map((c, k) => ({ c, i: k + 1 }));
  const seleccion = [...indexadas].sort((a, b) => masAntiguaPrimero(a.c, b.c)).slice(0, cantidad);
  return ordenar(seleccion, matriz, [{ prioridad: 'Tormenta', pedidas: cantidad, incluidas: seleccion.length }]);
}

function ordenar(
  seleccion: { c: Candidata; i: number }[],
  matriz: Matriz | null,
  cupos: ResultadoRuta['cupos'],
): ResultadoRuta {
  if (!matriz) {
    const orden = [...seleccion].sort((a, b) => masAntiguaPrimero(a.c, b.c)).map((g) => g.c.id);
    return { orden, ordenOptimizado: false, distanciaTotalM: null, duracionTotalS: null, cupos };
  }
  const porIndice = new Map(seleccion.map((g) => [g.i, g.c.id]));
  const orden = ordenarDesdeSede(seleccion.map((g) => g.i), matriz);
  const { dist, dur } = totales(orden, matriz);
  return {
    orden: orden.map((i) => porIndice.get(i)!),
    ordenOptimizado: true,
    distanciaTotalM: Math.round(dist),
    duracionTotalS: Math.round(dur),
    cupos,
  };
}
