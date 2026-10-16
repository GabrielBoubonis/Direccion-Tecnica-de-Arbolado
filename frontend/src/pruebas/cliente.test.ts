// Cliente de la API: tiempo límite de 10 segundos por pedido (RNF-04) y, sin señal, no se intenta.
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ErrorApi, get } from '../api/cliente';

afterEach(() => vi.restoreAllMocks());

describe('Tiempo límite de los pedidos (RNF-04)', () => {
  test('[RNF-04] cada pedido corta a los 10 segundos y se trata como falla de red', async () => {
    const espia = vi.spyOn(AbortSignal, 'timeout');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Tiempo agotado', 'TimeoutError'));
    await expect(get('/solicitudes')).rejects.toMatchObject({ codigo: 'SIN_CONEXION' });
    expect(espia).toHaveBeenCalledWith(10_000);
  });

  test('[RNF-04][RF-19] sin señal no se espera: el pedido falla en el acto con el aviso de que hace falta conexión', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchEspia = vi.spyOn(globalThis, 'fetch');
    const error = await get('/rutas/activa').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect((error as ErrorApi).codigo).toBe('SIN_CONEXION');
    expect(fetchEspia).not.toHaveBeenCalled();
  });
});
