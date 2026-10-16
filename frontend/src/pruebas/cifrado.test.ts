// Cifrado en reposo del captor (RNF-16) y clave envuelta con la contraseña (RF-57).
import { describe, expect, test } from 'vitest';
import { aBase64, cifrarJson, descifrarJson, desenvolverClave, envolverClave, importarClave, sha256Hex } from '../offline/cifrado';

const claveDePrueba = () => importarClave(aBase64(crypto.getRandomValues(new Uint8Array(32))));

describe('Cifrado en el captor (RNF-16)', () => {
  test('lo cifrado no contiene el texto original y se recupera con la clave', async () => {
    const k = await claveDePrueba();
    const c = await cifrarJson(k, { solicitud: '48509-2026', observaciones: 'raíz levanta vereda' });
    expect(new TextDecoder().decode(c.datos)).not.toContain('raíz');
    expect(await descifrarJson(k, c)).toEqual({ solicitud: '48509-2026', observaciones: 'raíz levanta vereda' });
  });
  test('con otra clave no se puede leer', async () => {
    const c = await cifrarJson(await claveDePrueba(), { a: 1 });
    await expect(descifrarJson(await claveDePrueba(), c)).rejects.toThrow();
  });
});

describe('Clave envuelta con la contraseña (RF-57)', () => {
  test('con la contraseña correcta se abre; con otra, no', async () => {
    const k = await claveDePrueba();
    const sal = crypto.getRandomValues(new Uint8Array(16));
    const envuelta = await envolverClave(k, 'Demo2026!', sal);
    const abierta = await desenvolverClave(envuelta, 'Demo2026!', sal);
    expect(abierta).not.toBeNull();
    const c = await cifrarJson(k, 'dato');
    expect(await descifrarJson(abierta!, c)).toBe('dato');
    expect(await desenvolverClave(envuelta, 'otra', sal)).toBeNull();
  });
});

describe('SHA-256', () => {
  test('coincide con el valor conocido', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
