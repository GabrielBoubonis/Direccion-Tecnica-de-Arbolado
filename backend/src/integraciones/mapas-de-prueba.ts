// Servicio de mapas DE PRUEBA: reemplaza a OpenRouteService cuando no hay clave o en las pruebas
// automáticas. Ubica las direcciones de los datos de prueba con coordenadas fijas (obtenidas una
// sola vez de OpenStreetMap) y estima distancias en línea recta con un factor de desvío por la
// trama de calles. No es el cálculo real de recorrido: sirve para que la demo y las pruebas sean
// reproducibles sin depender de un servicio externo.
import { ServicioNoDisponible } from '../compartido/errores';
import { distanciaMetros, type Punto } from '../dominio/geometria';
import type { ServicioMapas } from './puertos';
import { interruptor, INTERRUPTORES } from './simulacion';
import ubicaciones from './ubicaciones-de-prueba.json';

/** Las calles no son rectas: el recorrido real es más largo que la línea recta. */
const DESVIO = 1.3;
/** Velocidades medias en metros por segundo: a pie y en vehículo por la ciudad. */
const VELOCIDAD = { Caminando: 1.25, Vehiculo: 6.9 } as const;

const TABLA = ubicaciones as Record<string, Punto | null>;
const clave = (direccion: string) => direccion.trim().toLowerCase();
const POR_CLAVE = new Map(Object.entries(TABLA).map(([d, p]) => [clave(d), p ? { ...p, etiqueta: d } : null]));

/** Si la dirección es una de los datos de prueba (con ubicación o marcada como ambigua a propósito). */
export const esDireccionDePrueba = (direccion: string) => POR_CLAVE.has(clave(direccion));

async function verificarDisponible() {
  if (await interruptor(INTERRUPTORES.mapasCaido)) throw new ServicioNoDisponible('Servicio de mapas');
}

export const mapasDePrueba: ServicioMapas = {
  disponible: true,

  async geocodificar(direccion) {
    await verificarDisponible();
    return POR_CLAVE.get(clave(direccion)) ?? null;
  },

  async geocodificarInverso(p) {
    let cercana: { etiqueta: string; d: number } | null = null;
    for (const [etiqueta, q] of Object.entries(TABLA)) {
      if (!q) continue;
      const d = distanciaMetros(p, q);
      if (!cercana || d < cercana.d) cercana = { etiqueta, d };
    }
    if (cercana && cercana.d <= 150) return { etiqueta: cercana.etiqueta.replace(/, Santa Fe$/, ''), calle: null, numero: null };
    return { etiqueta: `Punto marcado en el mapa (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})`, calle: null, numero: null };
  },

  async matriz(puntos, modo) {
    await verificarDisponible();
    const distancias = puntos.map((a) => puntos.map((b) => Math.round(distanciaMetros(a, b) * DESVIO)));
    const duraciones = distancias.map((fila) => fila.map((m) => Math.round(m / VELOCIDAD[modo])));
    return { distancias, duraciones };
  },

  async trazado(puntos) {
    return puntos.map((p): [number, number] => [p.lat, p.lng]);
  },
};
