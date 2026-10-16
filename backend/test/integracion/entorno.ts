// Ayudas para las pruebas de integración. Cada prueba lleva en su nombre los IDs que verifica
// (por ejemplo "[RF-50][CU-01 2.1][HU-01 c2]"): con eso se arma la matriz de trazabilidad.
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { crearApp } from '../../src/app';
import { db } from '../../src/compartido/base-de-datos';
import { cargarDatosDePrueba } from '../../prisma/seed';

export const app = crearApp();
export const CONTRASENA = 'Demo2026!';
export { db };

/** Vuelve la base al estado inicial de los datos de prueba. */
export const reiniciarBase = () => cargarDatosDePrueba(() => undefined);

export interface Sesion {
  acceso: string;
  refresco: string;
  idDispositivo: string;
  claveDatos: string | null;
  codigoVisible: string;
}

export async function ingresar(usuario: string, contrasena = CONTRASENA, idDispositivo = randomUUID()): Promise<Sesion> {
  const r = await request(app).post('/api/auth/login').send({ nombreUsuario: usuario, contrasena, idDispositivo });
  if (r.status !== 200) throw new Error(`No se pudo ingresar como ${usuario}: ${r.status} ${JSON.stringify(r.body)}`);
  return { acceso: r.body.acceso, refresco: r.body.refresco, idDispositivo, claveDatos: r.body.captor.claveDatos, codigoVisible: r.body.captor.codigoVisible };
}

/** Cliente con la sesión puesta. */
export function como(s: Sesion) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${s.acceso}`);
  return {
    get: (ruta: string) => auth(request(app).get(`/api${ruta}`)),
    post: (ruta: string, cuerpo: object = {}) => auth(request(app).post(`/api${ruta}`)).send(cuerpo),
    patch: (ruta: string, cuerpo: object = {}) => auth(request(app).patch(`/api${ruta}`)).send(cuerpo),
  };
}

export const sinSesion = {
  get: (ruta: string) => request(app).get(`/api${ruta}`),
  post: (ruta: string, cuerpo: object = {}) => request(app).post(`/api${ruta}`).send(cuerpo),
};

/** Enciende o apaga una caída simulada de un sistema externo. */
export async function simularCaida(clave: 'sua_caido' | 'autenticacion_caida' | 'mapas_caido', activo: boolean) {
  await db.simConfiguracion.upsert({ where: { clave }, create: { clave, valor: activo ? 'si' : 'no' }, update: { valor: activo ? 'si' : 'no' } });
  if (!activo) await db.estadoTarea.deleteMany();
}

/** Sube una foto de prueba y devuelve su referencia y su SHA-256. */
export async function subirFoto(s: Sesion, n: 1 | 2 | 3 = 1): Promise<{ referencia: string; sha256: string }> {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const datos = readFileSync(join(__dirname, '../../../datos-prueba/fotos', `foto-prueba-${n}.jpg`)).toString('base64');
  const r = await como(s).post('/fotos', { datos, tipoMime: 'image/jpeg' });
  if (r.status !== 201) throw new Error(`No se pudo subir la foto: ${JSON.stringify(r.body)}`);
  return r.body;
}

/** Un formulario de dictamen válido (poda), para variar en cada prueba. */
export function formularioValido(fotografias: string[], cambios: Record<string, unknown> = {}) {
  return {
    notaNumero: 1201,
    expedienteNumero: 55,
    domicilioEjemplar: 'Laprida 1350, Rosario',
    latitudEjemplar: -32.954036,
    longitudEjemplar: -60.635901,
    referenciaUbicacion: 'Frente al kiosco',
    distanciaMedianeraReferencia: 3,
    idEspecie: 1,
    cantidadFrente: 1,
    nivelDanoVereda: 'Medio',
    esExtraccion: false,
    esSinTrabajo: false,
    trabajosSubterraneos: [],
    trabajosAereos: ['Raleo y limpieza'],
    complejidad: 'Media',
    urgente: false,
    arbolFrenteGarage: false,
    mediaTension: false,
    deOficio: false,
    plantar: 'ninguna',
    fotografias,
    nivelPrioridad: 'Media',
    observaciones: 'Prueba automática.',
    ...cambios,
  };
}

export const huellaSimulada = { metodo: 'huella-simulada', verificado: true } as const;

/** Firma un dictamen con señal y devuelve la respuesta. */
export async function firmar(s: Sesion, numeroSua: string, anio: number, formulario: object, uuid = randomUUID()) {
  return como(s).post('/dictamenes', { uuid, numeroSua, anio, formulario, segundoFactor: huellaSimulada });
}

export const cerrarBase = () => db.$disconnect();
