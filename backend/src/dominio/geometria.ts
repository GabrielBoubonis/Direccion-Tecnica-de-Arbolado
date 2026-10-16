// Cálculos geométricos simples sobre coordenadas WGS84.

export interface Punto {
  lat: number;
  lng: number;
}

/** Distancia en línea recta, en metros (fórmula de haversine). */
export function distanciaMetros(a: Punto, b: Punto): number {
  const R = 6_371_000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Si un punto cae dentro de un polígono (ray casting). El polígono es una lista de vértices. */
export function puntoEnPoligono(p: Punto, poligono: readonly Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    const cruza = a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}
