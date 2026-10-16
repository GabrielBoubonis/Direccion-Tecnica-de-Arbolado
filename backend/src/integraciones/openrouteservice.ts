// Adaptador de OpenRouteService (RNF-14): geocodificación, matriz de distancias y trazado.
// Cada llamada corta a los 10 segundos; si no hay respuesta se trata como servicio caído.
import { ServicioNoDisponible } from '../compartido/errores';
import type { Punto } from '../dominio/geometria';
import type { ServicioMapas } from './puertos';

const BASE = 'https://api.openrouteservice.org';
const ESPERA_MS = 10_000;

/** Recuadro que contiene la ciudad de Rosario: se usa para no ubicar direcciones en otra ciudad. */
export const ROSARIO = { minLat: -33.06, maxLat: -32.85, minLng: -60.8, maxLng: -60.6 };

const perfil = (modo: 'Caminando' | 'Vehiculo') => (modo === 'Caminando' ? 'foot-walking' : 'driving-car');

interface Feature {
  geometry: { coordinates: [number, number] };
  properties: { label: string; layer: string; confidence?: number; street?: string; housenumber?: string; name?: string };
}

export function crearOpenRouteService(clave: string): ServicioMapas {
  async function pedir<T>(ruta: string, cuerpo?: unknown): Promise<T> {
    let respuesta: Response;
    try {
      respuesta = await fetch(`${BASE}${ruta}`, {
        method: cuerpo ? 'POST' : 'GET',
        // El trazado responde en GeoJSON: con solo `application/json` OpenRouteService contesta 406.
        headers: { Authorization: clave, 'Content-Type': 'application/json', Accept: 'application/json, application/geo+json' },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new ServicioNoDisponible('OpenRouteService');
    }
    if (!respuesta.ok) throw new ServicioNoDisponible('OpenRouteService', `OpenRouteService respondió ${respuesta.status}.`);
    return (await respuesta.json()) as T;
  }

  const recuadro =
    `boundary.rect.min_lat=${ROSARIO.minLat}&boundary.rect.max_lat=${ROSARIO.maxLat}` +
    `&boundary.rect.min_lon=${ROSARIO.minLng}&boundary.rect.max_lon=${ROSARIO.maxLng}`;

  return {
    disponible: true,

    async geocodificar(direccion) {
      const texto = encodeURIComponent(direccion);
      const r = await pedir<{ features: Feature[] }>(`/geocode/search?text=${texto}&size=1&boundary.country=AR&${recuadro}`);
      const f = r.features[0];
      // Solo se acepta una dirección con numeración: una calle o un barrio no ubican al ejemplar.
      if (!f || f.properties.layer !== 'address') return null;
      const [lng, lat] = f.geometry.coordinates;
      return { lat, lng, etiqueta: f.properties.label };
    },

    async geocodificarInverso(p) {
      const r = await pedir<{ features: Feature[] }>(
        `/geocode/reverse?point.lat=${p.lat}&point.lon=${p.lng}&size=1&layers=address`,
      );
      const f = r.features[0];
      if (!f) return null;
      return { etiqueta: f.properties.label, calle: f.properties.street ?? null, numero: f.properties.housenumber ?? null };
    },

    async matriz(puntos: Punto[], modo) {
      const r = await pedir<{ distances: number[][]; durations: number[][] }>(`/v2/matrix/${perfil(modo)}`, {
        locations: puntos.map((p) => [p.lng, p.lat]),
        metrics: ['distance', 'duration'],
      });
      return { distancias: r.distances, duraciones: r.durations };
    },

    async trazado(puntos: Punto[], modo) {
      const r = await pedir<{ features: { geometry: { coordinates: [number, number][] } }[] }>(
        `/v2/directions/${perfil(modo)}/geojson`,
        { coordinates: puntos.map((p) => [p.lng, p.lat]) },
      );
      return r.features[0].geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    },
  };
}

/** Sin clave configurada, el servicio de mapas se comporta como caído (arquitectura §5, punto 5). */
export const mapasNoConfigurados: ServicioMapas = {
  disponible: false,
  geocodificar: async () => {
    throw new ServicioNoDisponible('OpenRouteService', 'El servicio de mapas no está configurado.');
  },
  geocodificarInverso: async () => null,
  matriz: async () => {
    throw new ServicioNoDisponible('OpenRouteService', 'El servicio de mapas no está configurado.');
  },
  trazado: async () => [],
};
