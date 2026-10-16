// Cliente de la API. Guarda la sesión, renueva el acceso mientras hay actividad (RF-05), corta a los
// 10 segundos sin respuesta (RNF-04) y aplica en el captor lo que decide el servidor: bloqueo por
// intentos (RF-52), revocación con borrado de los datos locales (RF-52) y revalidación al volver la
// señal después de reanudar sin conexión (RF-57).
import {
  borrarDatosDelCaptor,
  idCaptor,
  marcarBloqueado,
  olvidarClave,
  recordarIngreso,
  usarClave,
  type UsuarioCaptor,
} from '../offline/captor';

export { idCaptor };

const CLAVE_SESION = 'arbolado.sesion';
const ESPERA_MS = 10_000;

export type Rol = UsuarioCaptor['rol'];

export interface Sesion {
  acceso: string;
  refresco: string;
  usuario: UsuarioCaptor;
  menu: { items: string[]; inicio: string };
  primerIngreso: string;
  /** La sesión se reanudó sin señal con la contraseña local: falta revalidarla (RF-57). */
  reanudadaSinConexion?: boolean;
}

export interface PasoVisible {
  titulo: string;
  detalle: string;
  simulado: boolean;
  requisito?: string;
  datos?: unknown;
}

export class ErrorApi extends Error {
  constructor(
    public readonly estado: number,
    public readonly codigo: string,
    mensaje: string,
    public readonly detalle?: unknown,
  ) {
    super(mensaje);
  }
}

export const MENSAJE_SIN_CONEXION = 'Sin conexión. Esta acción necesita señal: intentá de nuevo cuando vuelva.';

export function sesionGuardada(): Sesion | null {
  try {
    const v = localStorage.getItem(CLAVE_SESION);
    return v ? (JSON.parse(v) as Sesion) : null;
  } catch {
    return null;
  }
}

export function guardarSesion(s: Sesion | null) {
  try {
    if (s) localStorage.setItem(CLAVE_SESION, JSON.stringify(s));
    else localStorage.removeItem(CLAVE_SESION);
  } catch {
    /* sin almacenamiento local: la sesión dura lo que la pestaña */
  }
  if (!s) olvidarClave();
  window.dispatchEvent(new Event('sesion-cambio'));
}

/** Aviso global cuando el servidor finaliza la sesión por una decisión administrativa. */
export const avisarSesionFinalizada = (motivo: string) => window.dispatchEvent(new CustomEvent('sesion-finalizada', { detail: motivo }));

async function revocado(mensaje: string) {
  await borrarDatosDelCaptor();
  guardarSesion(null);
  avisarSesionFinalizada(mensaje);
}

async function crudo(metodo: string, ruta: string, cuerpo?: unknown, acceso?: string): Promise<Response> {
  if (!navigator.onLine) throw new ErrorApi(0, 'SIN_CONEXION', MENSAJE_SIN_CONEXION);
  try {
    return await fetch(`/api${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(acceso ? { Authorization: `Bearer ${acceso}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No hay respuesta del servidor. Revisá la conexión e intentá de nuevo.');
  }
}

async function interpretar<T>(r: Response): Promise<T> {
  const tipo = r.headers.get('Content-Type') ?? '';
  const datos = tipo.includes('json') ? await r.json() : null;
  if (!r.ok) throw new ErrorApi(r.status, datos?.codigo ?? 'ERROR', datos?.mensaje ?? 'Ocurrió un error.', datos?.detalle);
  return datos as T;
}

let renovando: Promise<boolean> | null = null;

async function renovar(): Promise<boolean> {
  const s = sesionGuardada();
  if (!s) return false;
  renovando ??= (async () => {
    try {
      const r = await crudo('POST', '/auth/refresh', { refresco: s.refresco });
      const { acceso } = await interpretar<{ acceso: string }>(r);
      guardarSesion({ ...s, acceso });
      return true;
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'SIN_CONEXION') return false;
      if (e instanceof ErrorApi && e.codigo === 'CAPTOR_REVOCADO') await revocado(e.message);
      else {
        guardarSesion(null);
        if (e instanceof ErrorApi) avisarSesionFinalizada(e.message);
      }
      return false;
    } finally {
      renovando = null;
    }
  })();
  return renovando;
}

export async function api<T>(metodo: 'GET' | 'POST' | 'PATCH', ruta: string, cuerpo?: unknown): Promise<T> {
  let r = await crudo(metodo, ruta, cuerpo, sesionGuardada()?.acceso);
  if (r.status === 401) {
    const datos = await r.clone().json().catch(() => null);
    if (datos?.codigo === 'CAPTOR_REVOCADO') {
      await revocado(datos.mensaje);
      throw new ErrorApi(401, 'CAPTOR_REVOCADO', datos.mensaje);
    }
    if (datos?.codigo === 'SESION_VENCIDA' && (await renovar())) r = await crudo(metodo, ruta, cuerpo, sesionGuardada()?.acceso);
    else if (datos?.codigo === 'USUARIO_INACTIVO') {
      guardarSesion(null);
      avisarSesionFinalizada(datos.mensaje);
    }
  }
  return interpretar<T>(r);
}

export const get = <T,>(ruta: string) => api<T>('GET', ruta);
export const post = <T,>(ruta: string, cuerpo?: unknown) => api<T>('POST', ruta, cuerpo ?? {});
export const patch = <T,>(ruta: string, cuerpo?: unknown) => api<T>('PATCH', ruta, cuerpo ?? {});

interface RespuestaIngreso extends Omit<Sesion, 'reanudadaSinConexion'> {
  captor: { idDispositivo: string; codigoVisible: string; claveDatos: string | null };
  pasos: PasoVisible[];
}

export async function login(nombreUsuario: string, contrasena: string) {
  const r = await crudo('POST', '/auth/login', { nombreUsuario, contrasena, idDispositivo: idCaptor() });
  let s: RespuestaIngreso;
  try {
    s = await interpretar<RespuestaIngreso>(r);
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === 'CAPTOR_BLOQUEADO') await marcarBloqueado((e.detalle as { codigoVisible?: string })?.codigoVisible ?? '');
    if (e instanceof ErrorApi && e.codigo === 'CAPTOR_REVOCADO') await borrarDatosDelCaptor();
    throw e;
  }
  await recordarIngreso({ usuario: s.usuario, menu: s.menu, contrasena, refresco: s.refresco, primerIngreso: s.primerIngreso, captor: s.captor });
  guardarSesion({ acceso: s.acceso, refresco: s.refresco, usuario: s.usuario, menu: s.menu, primerIngreso: s.primerIngreso });
  return s;
}

export async function logout() {
  const s = sesionGuardada();
  guardarSesion(null);
  if (s && navigator.onLine) await crudo('POST', '/auth/logout', { refresco: s.refresco }).catch(() => undefined);
}

/**
 * Con una sesión abierta y señal: pide la clave de datos del captor (se perdió al recargar la página)
 * y, si la sesión se reanudó sin señal, la revalida contra la Autenticación Institucional (RF-57).
 */
export async function ponerAlDia(): Promise<void> {
  const s = sesionGuardada();
  if (!s || !navigator.onLine) return;
  if (s.reanudadaSinConexion) {
    try {
      const { acceso } = await interpretar<{ acceso: string }>(await crudo('POST', '/auth/revalidar', { refresco: s.refresco }));
      guardarSesion({ ...s, acceso, reanudadaSinConexion: false });
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.codigo === 'SIN_CONEXION' || e.estado === 503) return;
      if (e.codigo === 'CAPTOR_REVOCADO') await revocado(e.message);
      else {
        guardarSesion(null);
        avisarSesionFinalizada(e.message);
      }
      return;
    }
  }
  const yo = await get<{ captor: { claveDatos: string | null } | null }>('/auth/yo').catch(() => null);
  if (yo?.captor?.claveDatos) await usarClave(yo.captor.claveDatos);
}

/** URL de una foto, con el token en la consulta porque <img> no manda cabeceras. */
export const urlFoto = (ref: string) => `/api/fotos/${encodeURIComponent(ref)}?t=${encodeURIComponent(sesionGuardada()?.acceso ?? '')}`;

/** Descarga un archivo (el PDF del dictamen) con la sesión. */
export async function descargar(ruta: string, nombre: string) {
  let r = await crudo('GET', ruta, undefined, sesionGuardada()?.acceso);
  if (r.status === 401 && (await renovar())) r = await crudo('GET', ruta, undefined, sesionGuardada()?.acceso);
  if (!r.ok) throw new ErrorApi(r.status, 'DESCARGA', 'No se pudo generar el archivo. Intentá de nuevo.');
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
