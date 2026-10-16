// Cifrado en reposo de lo que el captor guarda (RNF-16): AES-GCM con la Web Crypto API.
// La clave de datos la entrega el servidor con la sesión y vive solo en memoria. Para poder abrir
// los datos sin señal (RF-57), el captor guarda además una copia de esa clave envuelta con una clave
// derivada de la contraseña del ingeniero (PBKDF2): sin la contraseña, lo guardado no se puede leer.

export interface Cifrado {
  iv: Uint8Array;
  datos: ArrayBuffer;
}

const ITERACIONES_PBKDF2 = 210_000;
const codificar = new TextEncoder();
const decodificar = new TextDecoder();

export const aBase64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

export const deBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const importarClave = (base64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', deBase64(base64), 'AES-GCM', true, ['encrypt', 'decrypt']);

export async function cifrarBytes(clave: CryptoKey, datos: ArrayBuffer | Uint8Array): Promise<Cifrado> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv, datos: await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos) };
}

export const descifrarBytes = (clave: CryptoKey, c: Cifrado): Promise<ArrayBuffer> =>
  crypto.subtle.decrypt({ name: 'AES-GCM', iv: c.iv }, clave, c.datos);

export const cifrarJson = (clave: CryptoKey, valor: unknown): Promise<Cifrado> => cifrarBytes(clave, codificar.encode(JSON.stringify(valor)));

export async function descifrarJson<T>(clave: CryptoKey, c: Cifrado): Promise<T> {
  return JSON.parse(decodificar.decode(await descifrarBytes(clave, c))) as T;
}

/** Clave para envolver la clave de datos, derivada de la contraseña y de una sal propia del captor. */
async function claveDeContrasena(contrasena: string, sal: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', codificar.encode(contrasena), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: ITERACIONES_PBKDF2, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function envolverClave(clave: CryptoKey, contrasena: string, sal: Uint8Array): Promise<Cifrado> {
  const cruda = await crypto.subtle.exportKey('raw', clave);
  return cifrarBytes(await claveDeContrasena(contrasena, sal), cruda);
}

/** Devuelve la clave de datos, o null si la contraseña no es la correcta (falla la autenticación de AES-GCM). */
export async function desenvolverClave(envuelta: Cifrado, contrasena: string, sal: Uint8Array): Promise<CryptoKey | null> {
  try {
    const cruda = await descifrarBytes(await claveDeContrasena(contrasena, sal), envuelta);
    return crypto.subtle.importKey('raw', cruda, 'AES-GCM', true, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

/** SHA-256 en hexadecimal, igual al que calcula el servidor (RF-22, RF-53). */
export async function sha256Hex(datos: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = typeof datos === 'string' ? codificar.encode(datos) : datos;
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
