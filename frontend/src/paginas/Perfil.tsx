// Pantalla 8 · Mi perfil. Sigue el wireframe 08-perfil.png.
// Cubre RF-34 (indicador de sincronización), RF-33 (reenvío automático) y HU-10 criterio 3 (cerrar sesión
// avisando si quedan dictámenes sin enviar).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '../api/cliente';
import { EtiquetaRol, iniciales, Modal, Pantalla } from '../componentes/ui';
import { useSesion } from '../estado/sesion';
import { useConexion } from '../offline/conexion';
import { descartarRechazo, useEstadoCola } from '../offline/cola';
import '../estilos/perfil.css';

export function Perfil() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const hayConexion = useConexion();
  const { pendientes, rechazados, sincronizando, ultimoMensaje } = useEstadoCola();
  const [acerca, setAcerca] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  if (!sesion) return null;
  const { usuario } = sesion;
  const ingeniero = usuario.rol === 'Operador' || usuario.rol === 'Jefe';

  async function salir() {
    await logout();
    navegar('/ingresar');
  }

  const textoPendientes = `${pendientes} ${pendientes === 1 ? 'dictamen pendiente' : 'dictámenes pendientes'} de enviar`;
  let tipo: 'exito' | 'advertencia' | 'error' = 'exito';
  if (!hayConexion) tipo = 'error';
  else if (pendientes > 0) tipo = 'advertencia';

  return (
    <Pantalla titulo="Mi perfil">
      <div className="perfil-cabecera">
        <div className="perfil-avatar" aria-hidden>
          {iniciales(usuario.nombreCompleto || usuario.nombreUsuario)}
        </div>
        <h2>{usuario.nombreUsuario}</h2>
        <EtiquetaRol rol={usuario.rol} />
        <div className="nombre">{usuario.nombreCompleto}</div>
      </div>

      <div className="perfil-sync">
        <div className={`aviso ${tipo}`} role="status">
          {!hayConexion ? (
            <>
              <b>Sin conexión</b>
              {pendientes > 0 ? `${textoPendientes}. Se reenvían solos cuando haya señal.` : 'Los dictámenes que firmes se guardan en el captor y se envían solos cuando haya señal.'}
            </>
          ) : pendientes > 0 ? (
            <>
              <b>{textoPendientes}</b>
              {sincronizando ? 'sincronizando… ' : ''}Se reenvían solos al haber señal.
            </>
          ) : (
            <>
              <b>✓ Todo sincronizado</b>0 dictámenes pendientes de enviar
            </>
          )}
        </div>
        {ultimoMensaje && <div className="aviso neutro" role="status">{ultimoMensaje}</div>}
        {rechazados.length > 0 && (
          <div className="aviso error" role="alert">
            <b>Dictámenes rechazados</b>
            <ul>
              {rechazados.map((r) => (
                <li key={r.uuid}>
                  SUA {r.solicitud}: {r.motivo}{' '}
                  <button className="boton chico contorno" onClick={() => void descartarRechazo(r.uuid)}>
                    Entendido
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="perfil-opciones">
        {ingeniero && (
          <Link className="perfil-opcion" to="/rutas">
            Ruta activa de hoy <span className="flecha" aria-hidden>›</span>
          </Link>
        )}
        <button className="perfil-opcion" aria-expanded={acerca} onClick={() => setAcerca(!acerca)}>
          Acerca de / versión 1.0.0 <span className="flecha" aria-hidden>{acerca ? '⌄' : '›'}</span>
        </button>
        {acerca && (
          <div className="perfil-acerca">
            <p>
              <b>Sistema de Dictaminación Técnica de Arbolado Público</b>
            </p>
            <p>Dirección Técnica de Arbolado – Municipalidad de Rosario.</p>
            <p>En esta demo el SUA y la Autenticación Institucional están simulados, igual que la huella al firmar.</p>
          </div>
        )}
        <Link className="perfil-opcion" to="/simulador">
          Simulador externo (fuera del sistema) <span className="flecha" aria-hidden>›</span>
        </Link>
      </div>

      <button className="boton peligro ancho mayus" onClick={() => (pendientes > 0 ? setConfirmando(true) : void salir())}>
        Cerrar sesión
      </button>

      {confirmando && (
        <Modal titulo="Cerrar sesión" onCerrar={() => setConfirmando(false)}>
          <p className="texto-modal">
            Tenés {textoPendientes}. Quedan guardados en el captor y se envían en el próximo ingreso.
          </p>
          <div className="acciones-modal">
            <button className="boton contorno" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="boton peligro" onClick={() => void salir()}>
              Cerrar sesión
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}
