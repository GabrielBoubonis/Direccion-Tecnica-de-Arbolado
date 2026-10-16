// Preparación de las pruebas del cliente: IndexedDB en memoria y la Web Crypto API de Node.
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
