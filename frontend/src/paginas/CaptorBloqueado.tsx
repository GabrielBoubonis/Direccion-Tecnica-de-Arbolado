// Pantalla 1b · Captor bloqueado (wireframe 01b; RF-52, RF-60, CU-16). Sin campos de ingreso.
import { useState } from 'react';
import { revisarCaptor } from '../estado/sesion';
import { useConexion } from '../offline/conexion';

export function CaptorBloqueado({ codigo }: { codigo: string }) {
  const conexion = useConexion();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [revisando, setRevisando] = useState(false);

  async function reintentar() {
    setRevisando(true);
    setMensaje(null);
    const estado = await revisarCaptor();
    setRevisando(false);
    if (estado === null) setMensaje('Sin conexión: abrí la app cuando tengas señal.');
    else if (estado === 'Bloqueado') setMensaje('El captor sigue bloqueado. Pasale el código a un Administrador.');
    else if (estado === 'Revocado') setMensaje('Este captor fue revocado: no se puede desbloquear.');
  }

  return (
    <div className="pantalla-bloqueo" role="alert">
      <div className="candado" aria-hidden>
        🔒
      </div>
      <h1>Captor bloqueado</h1>
      <p>Se superó el máximo de 5 intentos de ingreso.</p>
      <div className="tarjeta-codigo">
        <span>Código del dispositivo</span>
        <strong data-prueba="codigo-captor">{codigo || '— — — —'}</strong>
        <small>Identifica a este captor</small>
      </div>
      <p>
        Pasale este código a un Administrador del CIL
        <br />
        para que lo desbloquee.
        <br />
        Cuando lo haga, abrí la app con conexión.
      </p>
      <button className="boton ancho reintento" onClick={reintentar} disabled={revisando || !conexion}>
        {revisando ? 'Consultando…' : 'Ya me desbloquearon, reintentar'}
      </button>
      {!conexion && <p className="sin-senal-bloqueo">Sin señal: el desbloqueo se aplica cuando el captor tenga conexión.</p>}
      {mensaje && <p className="sin-senal-bloqueo">{mensaje}</p>}
    </div>
  );
}
