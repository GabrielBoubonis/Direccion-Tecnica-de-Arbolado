// Pruebas del adaptador de OpenRouteService contra un fetch simulado (sin red).
import { crearOpenRouteService } from '../src/integraciones/openrouteservice';

const fetchOriginal = global.fetch;
afterEach(() => {
  global.fetch = fetchOriginal;
});

describe('OpenRouteService (RNF-14)', () => {
  test('[RNF-14] el trazado acepta la respuesta GeoJSON (con solo application/json el servicio contesta 406)', async () => {
    const pedido = jest.fn(async (_url: string, init: RequestInit) => {
      const acepta = String((init.headers as Record<string, string>).Accept);
      if (!acepta.includes('application/geo+json')) return new Response('{}', { status: 406 });
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [[-60.6553, -32.9565], [-60.64137, -32.951184]] } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/geo+json' },
      });
    });
    global.fetch = pedido as unknown as typeof fetch;

    const trazado = await crearOpenRouteService('clave').trazado(
      [
        { lat: -32.9565, lng: -60.6553 },
        { lat: -32.951184, lng: -60.64137 },
      ],
      'Vehiculo',
    );

    expect(pedido.mock.calls[0][0]).toBe('https://api.openrouteservice.org/v2/directions/driving-car/geojson');
    expect(trazado).toEqual([
      [-32.9565, -60.6553],
      [-32.951184, -60.64137],
    ]);
  });
});
