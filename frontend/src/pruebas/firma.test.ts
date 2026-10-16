// La firma que calcula el captor sin señal tiene que ser idéntica a la que recalcula el servidor
// (RF-22, RF-53): los dos usan el mismo código del dominio. Esta prueba fija un caso concreto y su
// hash esperado; el mismo caso se verifica del lado del servidor en backend/test.
import { describe, expect, test } from 'vitest';
import { esquemaFormulario } from '@dominio/dictamen';
import { camposDesdeFormulario, textoAFirmar } from '@dominio/firma';
import { sha256Hex } from '../offline/cifrado';
import caso from '../../../backend/test/caso-firma.json';

describe('Firma en el captor (RF-22, RF-53)', () => {
  test('el hash del captor es el mismo que calcula el servidor para el caso de referencia', async () => {
    const f = esquemaFormulario.parse(caso.formulario);
    const texto = textoAFirmar({
      ...caso.datos,
      campos: camposDesdeFormulario(f),
      trabajosAereos: f.trabajosAereos,
      trabajosSubterraneos: f.trabajosSubterraneos,
      huellasFotos: caso.huellasFotos,
    });
    expect(await sha256Hex(texto)).toBe(caso.hashEsperado);
  });
});
