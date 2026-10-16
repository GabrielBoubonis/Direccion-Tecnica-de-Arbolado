// Dictámenes firmados sin señal (CU-10): se firman en el captor, se guardan cifrados en estado
// "pendiente de sincronizar" (RF-32) y se reenvían solos apenas hay conexión, sin tope de reintentos
// (RF-33). El reintento solo se detiene ante un rechazo explícito del servidor (RF-53).
import { useSyncExternalStore } from 'react';
import { esquemaFormulario, reglasDelDictamen } from '@dominio/dictamen';
import { camposDesdeFormulario, textoAFirmar } from '@dominio/firma';
import { ErrorApi, post, sesionGuardada } from '../api/cliente';
import { almacen, type ItemCola } from './almacen';
import { claveActual } from './captor';
import { aBase64, cifrarBytes, cifrarJson, descifrarBytes, descifrarJson, sha256Hex } from './cifrado';

export const PREFIJO_LOCAL = 'local:';

/** Una foto del formulario: ya subida al servidor o guardada cifrada en el captor. */
export interface FotoFormulario {
  ref: string;
  sha256: string;
  vista: string;
}

interface ContenidoFirmado {
  numeroSua: string;
  anio: number;
  nombreUsuario: string;
  fechaEmision: string;
  formulario: Record<string, unknown> & { fotografias: string[] };
  hashFirma: string;
  segundoFactor: { metodo: 'huella-simulada'; verificado: boolean };
}

export class ErrorGuardadoLocal extends Error {}

const sinClave = () => new ErrorGuardadoLocal('El captor no tiene abierta la clave de cifrado: volvé a ingresar con tu contraseña.');

// ── Fotos guardadas en el captor ────────────────────────────────────────────────────────────────

/** Reduce la foto antes de guardarla para no agotar el espacio del captor (arquitectura §7.4). */
async function comprimir(archivo: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return archivo;
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, 1600 / Math.max(imagen.width, imagen.height));
    if (escala === 1 && archivo.size < 1_500_000) return archivo;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(imagen.width * escala);
    lienzo.height = Math.round(imagen.height * escala);
    lienzo.getContext('2d')?.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise<Blob>((ok) => lienzo.toBlob((b) => ok(b ?? archivo), 'image/jpeg', 0.82));
  } catch {
    return archivo;
  }
}

export async function prepararFoto(archivo: Blob): Promise<{ bytes: ArrayBuffer; tipoMime: string; sha256: string }> {
  const final = await comprimir(archivo);
  const bytes = await final.arrayBuffer();
  return { bytes, tipoMime: final.type || 'image/jpeg', sha256: await sha256Hex(bytes) };
}

/** Guarda una foto cifrada en el captor y devuelve su referencia local. */
export async function guardarFotoLocal(archivo: Blob): Promise<FotoFormulario> {
  const clave = claveActual();
  if (!clave) throw sinClave();
  const { bytes, tipoMime, sha256 } = await prepararFoto(archivo);
  const id = crypto.randomUUID();
  try {
    await almacen.fotos.put({ id, uuidDictamen: null, tipoMime, sha256, contenido: await cifrarBytes(clave, bytes) });
  } catch {
    throw new ErrorGuardadoLocal('No hay espacio en el captor para guardar la foto.');
  }
  return { ref: `${PREFIJO_LOCAL}${id}`, sha256, vista: URL.createObjectURL(new Blob([bytes], { type: tipoMime })) };
}

/** Sube al servidor una foto guardada en el captor (se tomó sin señal y se firma con señal). */
export async function subirFotoLocal(foto: FotoFormulario): Promise<FotoFormulario> {
  if (!foto.ref.startsWith(PREFIJO_LOCAL)) return foto;
  const clave = claveActual();
  const local = await almacen.fotos.get(foto.ref.slice(PREFIJO_LOCAL.length));
  if (!clave || !local) throw new ErrorGuardadoLocal('La foto ya no está en el captor: volvé a cargarla.');
  const bytes = await descifrarBytes(clave, local.contenido);
  const r = await post<{ referencia: string; sha256: string }>('/fotos', { datos: aBase64(bytes), tipoMime: local.tipoMime });
  await almacen.fotos.delete(local.id);
  return { ...foto, ref: r.referencia, sha256: r.sha256 };
}

// ── Firma en el captor ──────────────────────────────────────────────────────────────────────────

export interface FirmaLocal {
  uuid: string;
  fechaEmision: string;
  hashFirma: string;
  textoFirmado: string;
}

/**
 * Firma el dictamen en el captor, sin señal: valida con las mismas reglas que el servidor, calcula
 * el SHA-256 del JSON canónico (con las huellas de las fotos) y lo guarda cifrado en la cola.
 */
export async function firmarYGuardarEnElCaptor(datos: {
  numeroSua: string;
  anio: number;
  formulario: Record<string, unknown>;
  fotos: FotoFormulario[];
  segundoFactor: { metodo: 'huella-simulada'; verificado: boolean };
  /** Identificador ya usado en un envío con señal que no tuvo respuesta: así un reintento no duplica (§7.2). */
  uuid?: string;
}): Promise<FirmaLocal> {
  const clave = claveActual();
  const sesion = sesionGuardada();
  if (!clave || !sesion) throw sinClave();
  const f = esquemaFormulario.parse({ ...datos.formulario, fotografias: datos.fotos.map((x) => x.ref) });
  const fallas = reglasDelDictamen(f);
  if (fallas.length) throw new Error(fallas.map((x) => x.mensaje).join(' '));

  const uuid = datos.uuid ?? crypto.randomUUID();
  const fechaEmision = new Date().toISOString();
  const nombreUsuario = sesion.usuario.nombreUsuario;
  const textoFirmado = textoAFirmar({
    uuid,
    numeroSua: datos.numeroSua,
    anio: datos.anio,
    nombreUsuario,
    fechaEmision,
    campos: camposDesdeFormulario(f),
    trabajosAereos: f.trabajosAereos,
    trabajosSubterraneos: f.trabajosSubterraneos,
    huellasFotos: datos.fotos.map((x) => x.sha256),
  });
  const hashFirma = await sha256Hex(textoFirmado);
  const contenido: ContenidoFirmado = {
    numeroSua: datos.numeroSua,
    anio: datos.anio,
    nombreUsuario,
    fechaEmision,
    formulario: { ...f, fotografias: f.fotografias },
    hashFirma,
    segundoFactor: datos.segundoFactor,
  };
  const item: ItemCola = {
    uuid,
    numeroSua: datos.numeroSua,
    anio: datos.anio,
    firmadoEn: fechaEmision,
    estado: 'pendiente',
    intentos: 0,
    ultimoIntento: null,
    motivoRechazo: null,
    fotosSubidas: {},
    contenido: await cifrarJson(clave, contenido),
  };
  try {
    await almacen.transaction('rw', almacen.cola, almacen.fotos, async () => {
      await almacen.cola.put(item);
      for (const foto of datos.fotos)
        if (foto.ref.startsWith(PREFIJO_LOCAL)) await almacen.fotos.update(foto.ref.slice(PREFIJO_LOCAL.length), { uuidDictamen: uuid });
    });
  } catch {
    throw new ErrorGuardadoLocal('El almacenamiento local del captor está lleno o no disponible. El dictamen no quedó firmado todavía.');
  }
  await refrescarEstado();
  void sincronizar();
  return { uuid, fechaEmision, hashFirma, textoFirmado };
}

// ── Estado de la cola, para el indicador (RF-34) ────────────────────────────────────────────────

export interface EstadoCola {
  pendientes: number;
  rechazados: { uuid: string; solicitud: string; motivo: string }[];
  sincronizando: boolean;
  ultimoMensaje: string | null;
}

let estado: EstadoCola = { pendientes: 0, rechazados: [], sincronizando: false, ultimoMensaje: null };
const avisos = new Set<() => void>();
const publicar = (cambios: Partial<EstadoCola>) => {
  estado = { ...estado, ...cambios };
  avisos.forEach((a) => a());
};

export async function refrescarEstado() {
  const items = await almacen.cola.toArray();
  publicar({
    pendientes: items.filter((i) => i.estado === 'pendiente').length,
    rechazados: items
      .filter((i) => i.estado === 'rechazado')
      .map((i) => ({ uuid: i.uuid, solicitud: `${i.numeroSua}-${i.anio}`, motivo: i.motivoRechazo ?? 'Rechazado por el servidor.' })),
  });
}

export const useEstadoCola = () =>
  useSyncExternalStore(
    (aviso) => {
      avisos.add(aviso);
      return () => void avisos.delete(aviso);
    },
    () => estado,
  );

// ── Sincronización (RF-33, CU-07) ───────────────────────────────────────────────────────────────

let enCurso: Promise<void> | null = null;

/** Envía la cola. Se llama al volver la señal, al abrir la app, después de firmar y periódicamente. */
export function sincronizar(): Promise<void> {
  enCurso ??= (async () => {
    try {
      await sincronizarCola();
    } finally {
      enCurso = null;
      await refrescarEstado();
    }
  })();
  return enCurso;
}

async function sincronizarCola() {
  const clave = claveActual();
  if (!clave || !navigator.onLine || !sesionGuardada()) return;
  const pendientes = await almacen.cola.where('estado').equals('pendiente').toArray();
  if (!pendientes.length) return;
  publicar({ sincronizando: true });
  try {
    for (const item of pendientes) {
      const seguir = await enviarItem(clave, item);
      if (!seguir) break;
    }
  } finally {
    publicar({ sincronizando: false });
  }
}

/** Devuelve false si conviene cortar la ronda (sin señal o servidor caído). */
async function enviarItem(clave: CryptoKey, item: ItemCola): Promise<boolean> {
  if (!item.contenido) return true;
  const c = await descifrarJson<ContenidoFirmado>(clave, item.contenido);
  if (c.nombreUsuario !== sesionGuardada()?.usuario.nombreUsuario) return true; // lo sincroniza quien lo firmó
  await almacen.cola.update(item.uuid, { intentos: item.intentos + 1, ultimoIntento: new Date().toISOString() });
  try {
    // 1. Fotos que todavía no llegaron: solo esas se reintentan (§7.4).
    const subidas = { ...item.fotosSubidas };
    for (const ref of c.formulario.fotografias) {
      if (!ref.startsWith(PREFIJO_LOCAL) || subidas[ref]) continue;
      const foto = await almacen.fotos.get(ref.slice(PREFIJO_LOCAL.length));
      if (!foto) throw new ErrorApi(422, 'FOTO_PERDIDA', 'Una fotografía del dictamen ya no está en el captor.');
      const bytes = await descifrarBytes(clave, foto.contenido);
      const r = await post<{ referencia: string }>('/fotos', { datos: aBase64(bytes), tipoMime: foto.tipoMime });
      subidas[ref] = r.referencia;
      await almacen.cola.update(item.uuid, { fotosSubidas: subidas });
    }
    // 2. El dictamen: el servidor recalcula el hash y lo compara con el de la firma (RF-53).
    const r = await post<{ mensaje: string }>('/sync/dictamenes', {
      uuid: item.uuid,
      numeroSua: c.numeroSua,
      anio: c.anio,
      fechaEmision: c.fechaEmision,
      hashFirma: c.hashFirma,
      segundoFactor: c.segundoFactor,
      formulario: { ...c.formulario, fotografias: c.formulario.fotografias.map((ref) => subidas[ref] ?? ref) },
    });
    // 3. Confirmado: se borra del captor el dictamen y sus fotos (RNF-16).
    await borrarDelCaptor(item.uuid, c.formulario.fotografias);
    publicar({ ultimoMensaje: `${c.numeroSua}-${c.anio}: ${r.mensaje}` });
    return true;
  } catch (e) {
    if (!(e instanceof ErrorApi) || e.estado === 0 || e.estado >= 500 || e.estado === 401 || e.estado === 429) return false;
    // Rechazo explícito: deja de reintentarse y se le muestra al ingeniero.
    const integridad = e.codigo === 'INTEGRIDAD_NO_VERIFICADA';
    await almacen.cola.update(item.uuid, { estado: 'rechazado', motivoRechazo: e.message, ...(integridad ? { contenido: null } : {}) });
    if (integridad) await almacen.fotos.where('uuidDictamen').equals(item.uuid).delete();
    publicar({ ultimoMensaje: `${c.numeroSua}-${c.anio}: ${e.message}` });
    return true;
  }
}

async function borrarDelCaptor(uuid: string, refs: string[]) {
  await almacen.transaction('rw', almacen.cola, almacen.fotos, async () => {
    await almacen.cola.delete(uuid);
    await almacen.fotos.bulkDelete(refs.filter((r) => r.startsWith(PREFIJO_LOCAL)).map((r) => r.slice(PREFIJO_LOCAL.length)));
  });
}

/** Quita de la lista un rechazo que el ingeniero ya vio. */
export async function descartarRechazo(uuid: string) {
  await almacen.cola.delete(uuid);
  await almacen.fotos.where('uuidDictamen').equals(uuid).delete();
  await refrescarEstado();
}
