// Estado de la sesión en toda la interfaz, cierre por inactividad a los 30 minutos (RF-04) y el
// trabajo de fondo del captor: poner al día la sesión, sincronizar la cola apenas hay señal (RF-33)
// y aplicar lo que decidió un Administrador sobre este captor (revocación o desbloqueo, RF-52, RF-60).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ErrorApi, get, guardarSesion, logout, ponerAlDia, post, sesionGuardada, type Sesion } from '../api/cliente';
import { alCambiarClave, borrarDatosDelCaptor, claveDisponible, estadoBloqueo, idCaptor, marcarBloqueado, quitarBloqueo } from '../offline/captor';
import { guardarEnCache } from '../offline/cache';
import { refrescarEstado, sincronizar } from '../offline/cola';
import { alVolverLaConexion } from '../offline/conexion';

export const INACTIVIDAD_MS = 30 * 60 * 1000;
const CLAVE_ACTIVIDAD = 'arbolado.actividad';

let instantanea: Sesion | null = sesionGuardada();
const suscribir = (aviso: () => void) => {
  const alCambiar = () => {
    instantanea = sesionGuardada();
    aviso();
  };
  window.addEventListener('sesion-cambio', alCambiar);
  window.addEventListener('storage', alCambiar);
  return () => {
    window.removeEventListener('sesion-cambio', alCambiar);
    window.removeEventListener('storage', alCambiar);
  };
};

export const useSesion = () => useSyncExternalStore(suscribir, () => instantanea);

/** Si la clave de datos del captor está abierta (hace falta para trabajar sin señal). */
export const useClaveAbierta = () => useSyncExternalStore(alCambiarClave, claveDisponible);

export function registrarActividad() {
  try {
    localStorage.setItem(CLAVE_ACTIVIDAD, String(Date.now()));
  } catch {
    /* sin almacenamiento local */
  }
}

export type MotivoCierre = 'inactividad' | 'inactividad-sin-senal' | null;

/**
 * Cierra la sesión tras 30 minutos sin interacción (RF-04). Con señal, la sesión se da de baja en el
 * servidor. Sin señal, se cierra en el captor y queda la posibilidad de reanudarla (RF-57).
 */
export function useCierrePorInactividad(activa: boolean): MotivoCierre {
  const [motivo, setMotivo] = useState<MotivoCierre>(null);
  useEffect(() => {
    if (!activa) return;
    setMotivo(null);
    registrarActividad();
    const eventos = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    let ultimaEscritura = 0;
    const alInteractuar = () => {
      if (Date.now() - ultimaEscritura > 15_000) {
        ultimaEscritura = Date.now();
        registrarActividad();
      }
    };
    eventos.forEach((e) => window.addEventListener(e, alInteractuar, { passive: true }));
    const revisar = () => {
      const ultima = Number(localStorage.getItem(CLAVE_ACTIVIDAD) ?? Date.now());
      if (Date.now() - ultima <= INACTIVIDAD_MS) return;
      if (navigator.onLine) {
        setMotivo('inactividad');
        void logout();
      } else {
        setMotivo('inactividad-sin-senal');
        guardarSesion(null);
      }
    };
    const reloj = setInterval(revisar, 15_000);
    return () => {
      eventos.forEach((e) => window.removeEventListener(e, alInteractuar));
      clearInterval(reloj);
    };
  }, [activa]);
  return motivo;
}

/**
 * Estado de este captor en el servidor. Si fue revocado, se borra todo (RF-52). Si se bloqueó sin
 * señal, se informa para que un Administrador lo encuentre por su código (RF-60). Si ya lo
 * desbloquearon, se quita el bloqueo local.
 */
export async function revisarCaptor(): Promise<'Activo' | 'Bloqueado' | 'Revocado' | null> {
  if (!navigator.onLine) return null;
  try {
    const local = await estadoBloqueo();
    if (local.bloqueado && !local.informado) {
      const r = await post<{ estado: 'Activo' | 'Bloqueado' | 'Revocado'; codigoVisible: string }>(`/captores/${idCaptor()}/bloqueo-local`);
      if (r.estado === 'Bloqueado') await marcarBloqueado(r.codigoVisible, true);
    }
    const { estado, codigoVisible } = await get<{ estado: 'Activo' | 'Bloqueado' | 'Revocado'; codigoVisible: string }>(`/captores/${idCaptor()}/estado`);
    if (estado === 'Revocado') {
      await borrarDatosDelCaptor();
      guardarSesion(null);
      window.dispatchEvent(new CustomEvent('sesion-finalizada', { detail: 'Sesión finalizada por un administrador: este captor fue revocado.' }));
    } else if (estado === 'Bloqueado') await marcarBloqueado(codigoVisible, true);
    else if (local.bloqueado) await quitarBloqueo();
    window.dispatchEvent(new Event('captor-cambio'));
    return estado;
  } catch (e) {
    if (e instanceof ErrorApi) return null;
    throw e;
  }
}

/**
 * Lo que el formulario del dictamen necesita para trabajar sin señal (HU-09 c1): catálogos y especies.
 * Se guarda cifrado apenas un Operador o un Jefe tiene sesión con señal.
 */
async function guardarCatalogosParaSinSenal() {
  const rol = sesionGuardada()?.usuario.rol;
  if (rol !== 'Operador' && rol !== 'Jefe') return;
  try {
    await guardarEnCache('catalogos', await get('/catalogos'));
    await guardarEnCache('especies', (await get<{ especies: unknown[] }>('/especies')).especies);
  } catch {
    /* se reintenta en la próxima ronda */
  }
}

/** Trabajo de fondo mientras la aplicación está abierta. */
export function useMotorDelCaptor(conSesion: boolean) {
  useEffect(() => {
    let vivo = true;
    const ronda = async () => {
      if (!vivo || !navigator.onLine) return;
      await revisarCaptor();
      if (sesionGuardada()) {
        await ponerAlDia();
        await guardarCatalogosParaSinSenal();
        await sincronizar();
      }
    };
    void refrescarEstado();
    void ronda();
    const quitar = alVolverLaConexion(() => void ronda());
    // Reintento periódico, sin tope, mientras haya algo pendiente (RF-33).
    const reloj = setInterval(() => {
      if (navigator.onLine && sesionGuardada()) void sincronizar();
    }, 20_000);
    return () => {
      vivo = false;
      quitar();
      clearInterval(reloj);
    };
  }, [conSesion]);
}

/** Mensaje de "sesión finalizada" que manda el servidor (baja, revocación, usuario no vigente). */
export function useAvisoSesionFinalizada(): [string | null, () => void] {
  const [mensaje, setMensaje] = useState<string | null>(null);
  useEffect(() => {
    const alFinalizar = (e: Event) => setMensaje((e as CustomEvent<string>).detail);
    window.addEventListener('sesion-finalizada', alFinalizar);
    return () => window.removeEventListener('sesion-finalizada', alFinalizar);
  }, []);
  return [mensaje, () => setMensaje(null)];
}

/** Estado del bloqueo local, actualizado cuando cambia. */
export function useBloqueoLocal() {
  const [bloqueo, setBloqueo] = useState<{ bloqueado: boolean; codigoVisible: string } | null>(null);
  useEffect(() => {
    let vivo = true;
    const leer = () => void estadoBloqueo().then((b) => vivo && setBloqueo(b));
    leer();
    window.addEventListener('captor-cambio', leer);
    window.addEventListener('sesion-cambio', leer);
    return () => {
      vivo = false;
      window.removeEventListener('captor-cambio', leer);
      window.removeEventListener('sesion-cambio', leer);
    };
  }, []);
  return bloqueo;
}
