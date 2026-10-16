// El navegador hace de captor (H-070): identificador propio, clave de datos en memoria, credencial
// cifrada para reanudar sin señal (RF-57), bloqueo local a los 5 intentos (RF-52) y borrado total
// cuando un Administrador lo revoca (RF-52).
import bcrypt from 'bcryptjs';
import { almacen, borrarTodo, guardarAjuste, leerAjuste } from './almacen';
import { type Cifrado, cifrarJson, descifrarJson, desenvolverClave, envolverClave, importarClave } from './cifrado';

export const INTENTOS_BLOQUEO = 5;
const DIAS_TOPE_SESION = 7;
const CLAVE_ID = 'arbolado.captor';

/** Identificador de este captor. Se conserva entre sesiones; se pierde solo con la revocación. */
export function idCaptor(): string {
  try {
    const guardado = localStorage.getItem(CLAVE_ID);
    if (guardado) return JSON.parse(guardado) as string;
    const nuevo = crypto.randomUUID();
    localStorage.setItem(CLAVE_ID, JSON.stringify(nuevo));
    return nuevo;
  } catch {
    return crypto.randomUUID();
  }
}

// ── Clave de datos: solo en memoria, mientras haya una sesión abierta ──────────────────────────

let claveDatos: CryptoKey | null = null;
const avisos = new Set<() => void>();
const avisar = () => avisos.forEach((a) => a());

export const claveDisponible = () => claveDatos !== null;
export const claveActual = () => claveDatos;
export function alCambiarClave(aviso: () => void) {
  avisos.add(aviso);
  return () => void avisos.delete(aviso);
}

export async function usarClave(base64: string | null | undefined) {
  claveDatos = base64 ? await importarClave(base64) : null;
  avisar();
}

export function olvidarClave() {
  claveDatos = null;
  avisar();
}

// ── Credencial para reanudar sin señal (RF-57, arquitectura §7.1) ──────────────────────────────

export interface UsuarioCaptor {
  nombreUsuario: string;
  rol: 'Lector' | 'Operador' | 'Jefe' | 'Administrador';
  nombreCompleto: string;
}

interface Credencial {
  usuario: UsuarioCaptor;
  menu: { items: string[]; inicio: string };
  sal: number[];
  claveEnvuelta: Cifrado;
  /** Verificador bcrypt de la contraseña, cifrado con la clave de datos. */
  verificador: Cifrado;
  /** Token de renovación de la sesión, cifrado: al volver la señal se usa para revalidar. */
  refresco: Cifrado;
  ultimoIngresoConConexion: string;
  primerIngreso: string;
  codigoVisible: string;
  revocado: boolean;
}

/** Fecha (AAAA-MM-DD) en la hora de Argentina. */
export const diaArgentina = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);

/** Después de un ingreso con conexión: guarda lo necesario para poder reanudar sin señal ese día. */
export async function recordarIngreso(datos: {
  usuario: UsuarioCaptor;
  menu: { items: string[]; inicio: string };
  contrasena: string;
  refresco: string;
  primerIngreso: string;
  captor: { codigoVisible: string; claveDatos: string | null };
}) {
  await usarClave(datos.captor.claveDatos);
  if (!claveDatos) return;
  const anterior = await leerAjuste<Credencial>('credencial');
  const sal = anterior?.sal ? new Uint8Array(anterior.sal) : crypto.getRandomValues(new Uint8Array(16));
  const credencial: Credencial = {
    usuario: datos.usuario,
    menu: datos.menu,
    sal: [...sal],
    claveEnvuelta: await envolverClave(claveDatos, datos.contrasena, sal),
    verificador: await cifrarJson(claveDatos, bcrypt.hashSync(datos.contrasena, 10)),
    refresco: await cifrarJson(claveDatos, datos.refresco),
    ultimoIngresoConConexion: new Date().toISOString(),
    primerIngreso: datos.primerIngreso,
    codigoVisible: datos.captor.codigoVisible,
    revocado: false,
  };
  await guardarAjuste('credencial', credencial);
  await guardarAjuste('bloqueo', { intentos: 0, bloqueado: false, codigoVisible: datos.captor.codigoVisible, informado: false });
}

export type ResultadoReanudar =
  | { ok: true; usuario: UsuarioCaptor; menu: Credencial['menu']; refresco: string; primerIngreso: string }
  | { ok: false; motivo: 'SIN_CONDICIONES' | 'CREDENCIALES' | 'BLOQUEADO'; codigoVisible?: string };

/** Por qué no se puede reanudar sin señal, o null si se cumplen las tres condiciones de RF-57. */
export async function condicionesParaReanudar(ahora = new Date()): Promise<string | null> {
  const c = await leerAjuste<Credencial>('credencial');
  if (!c) return 'Este captor no tiene un ingreso con conexión registrado.';
  if (c.revocado) return 'El captor fue revocado.';
  if (diaArgentina(new Date(c.ultimoIngresoConConexion)) !== diaArgentina(ahora)) return 'Hoy todavía no ingresaste con conexión.';
  if (ahora.getTime() - new Date(c.primerIngreso).getTime() > DIAS_TOPE_SESION * 86_400_000) return 'Pasaron 7 días desde tu primer ingreso.';
  return null;
}

export async function usuarioRecordado(): Promise<UsuarioCaptor | null> {
  return (await leerAjuste<Credencial>('credencial'))?.usuario ?? null;
}

/** Reanuda la sesión sin señal con la contraseña local. Los intentos fallidos suman al bloqueo (RF-52). */
export async function reanudarSinConexion(nombreUsuario: string, contrasena: string): Promise<ResultadoReanudar> {
  const bloqueo = await estadoBloqueo();
  if (bloqueo.bloqueado) return { ok: false, motivo: 'BLOQUEADO', codigoVisible: bloqueo.codigoVisible };
  if (await condicionesParaReanudar()) return { ok: false, motivo: 'SIN_CONDICIONES' };
  const c = (await leerAjuste<Credencial>('credencial'))!;
  const clave = c.usuario.nombreUsuario === nombreUsuario.trim().toLowerCase() ? await desenvolverClave(c.claveEnvuelta, contrasena, new Uint8Array(c.sal)) : null;
  const verificador = clave ? await descifrarJson<string>(clave, c.verificador).catch(() => null) : null;
  if (!clave || !verificador || !bcrypt.compareSync(contrasena, verificador)) {
    const b = await sumarIntentoFallido();
    return b.bloqueado ? { ok: false, motivo: 'BLOQUEADO', codigoVisible: b.codigoVisible } : { ok: false, motivo: 'CREDENCIALES' };
  }
  claveDatos = clave;
  avisar();
  await guardarAjuste('bloqueo', { ...bloqueo, intentos: 0 });
  return { ok: true, usuario: c.usuario, menu: c.menu, refresco: await descifrarJson<string>(clave, c.refresco), primerIngreso: c.primerIngreso };
}

// ── Bloqueo local del captor (RF-52, RF-60) ─────────────────────────────────────────────────────

export interface EstadoBloqueo {
  intentos: number;
  bloqueado: boolean;
  codigoVisible: string;
  /** Si el bloqueo ya se informó al servidor, para que un Administrador pueda desbloquearlo. */
  informado: boolean;
}

export async function estadoBloqueo(): Promise<EstadoBloqueo> {
  return (await leerAjuste<EstadoBloqueo>('bloqueo')) ?? { intentos: 0, bloqueado: false, codigoVisible: '', informado: false };
}

async function sumarIntentoFallido(): Promise<EstadoBloqueo> {
  const b = await estadoBloqueo();
  const intentos = b.intentos + 1;
  const nuevo = { ...b, intentos, bloqueado: intentos >= INTENTOS_BLOQUEO, informado: false };
  await guardarAjuste('bloqueo', nuevo);
  return nuevo;
}

/** El servidor bloqueó el captor (RF-52) o informó su estado: se refleja localmente. */
export async function marcarBloqueado(codigoVisible: string, informado = true) {
  const b = await estadoBloqueo();
  await guardarAjuste('bloqueo', { ...b, bloqueado: true, codigoVisible: codigoVisible || b.codigoVisible, informado });
}

export async function quitarBloqueo() {
  const b = await estadoBloqueo();
  await guardarAjuste('bloqueo', { ...b, intentos: 0, bloqueado: false, informado: false });
}

/** Revocación por pérdida o robo (RF-52): se borra todo lo guardado. El identificador queda, y el servidor lo sigue rechazando. */
export async function borrarDatosDelCaptor() {
  olvidarClave();
  await borrarTodo();
  await almacen.ajustes.put({ clave: 'revocado', valor: true });
  try {
    localStorage.removeItem('arbolado.sesion');
  } catch {
    /* nada que borrar */
  }
}
