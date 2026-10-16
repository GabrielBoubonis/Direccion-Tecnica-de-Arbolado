// Estado de la señal del captor. Se usa para avisar "SIN SEÑAL", para no intentar lo que requiere
// conexión (generar rutas, RF-19) y para disparar la sincronización apenas vuelve (RF-33).
import { useSyncExternalStore } from 'react';

const suscribir = (aviso: () => void) => {
  window.addEventListener('online', aviso);
  window.addEventListener('offline', aviso);
  return () => {
    window.removeEventListener('online', aviso);
    window.removeEventListener('offline', aviso);
  };
};

export const hayConexion = () => navigator.onLine;

export const useConexion = () => useSyncExternalStore(suscribir, hayConexion);

export function alVolverLaConexion(accion: () => void) {
  window.addEventListener('online', accion);
  return () => window.removeEventListener('online', accion);
}
