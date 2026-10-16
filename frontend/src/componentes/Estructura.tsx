// Marco de la aplicación (wireframes 02, 05 y 08): barra inferior en el celular y menú lateral en
// escritorio, con solo lo que el rol puede usar y el indicador animado de tormenta (RF-40).
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { get } from '../api/cliente';
import { useConexion } from '../offline/conexion';
import { useSesion } from '../estado/sesion';

export const ITEMS: Record<string, { ruta: string; texto: string; corto?: string; icono: string }> = {
  solicitudes: { ruta: '/solicitudes', texto: 'Solicitudes', icono: '📋' },
  rutas: { ruta: '/rutas', texto: 'Rutas', icono: '🗺️' },
  tormenta: { ruta: '/tormenta', texto: 'Tormenta', icono: '⛈️' },
  dashboard: { ruta: '/dashboard', texto: 'Dashboard', icono: '📊' },
  usuarios: { ruta: '/usuarios', texto: 'Usuarios', icono: '👥' },
  'para-revisar': { ruta: '/para-revisar', texto: 'Para revisar', corto: 'Revisar', icono: '🔎' },
  auditoria: { ruta: '/auditoria', texto: 'Auditoría', icono: '🛡️' },
  perfil: { ruta: '/perfil', texto: 'Perfil', icono: '👤' },
};

/** Cantidad de solicitudes de tormenta sin dictaminar, para el indicador animado (RF-40, CU-12 E3). */
function useIndicadorTormenta() {
  const [pendientes, setPendientes] = useState(0);
  const conexion = useConexion();
  useEffect(() => {
    if (!conexion) return;
    let vivo = true;
    const pedir = () =>
      get<{ pendientes: number }>('/tormenta/indicador')
        .then((r) => vivo && setPendientes(r.pendientes))
        .catch(() => undefined);
    void pedir();
    const reloj = setInterval(pedir, 60_000);
    window.addEventListener('tormenta-cambio', pedir);
    return () => {
      vivo = false;
      clearInterval(reloj);
      window.removeEventListener('tormenta-cambio', pedir);
    };
  }, [conexion]);
  return pendientes;
}

export function Estructura() {
  const sesion = useSesion();
  const tormenta = useIndicadorTormenta();
  if (!sesion) return null;
  const items = sesion.menu.items.filter((id) => ITEMS[id]).map((id) => ({ id, ...ITEMS[id] }));

  const indicador = (id: string) =>
    id === 'tormenta' && tormenta > 0 ? (
      <span className="punto-tormenta" role="status" aria-label={`${tormenta} solicitudes de tormenta sin dictaminar`}>
        {tormenta}
      </span>
    ) : null;

  return (
    <div className="app">
      <nav className="menu-lateral" aria-label="Menú principal">
        <div className="marca">
          <img src="/arbol.svg" alt="" />
          <div>
            <b>Dictaminación Técnica</b>
            <span>Arbolado Público</span>
          </div>
        </div>
        {items.map((i) => (
          <NavLink key={i.id} to={i.ruta} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <span className="icono" aria-hidden>
              {i.icono}
            </span>
            {i.texto}
            {indicador(i.id)}
          </NavLink>
        ))}
        <NavLink to="/simulador" className={({ isActive }) => (isActive ? 'activo' : '')}>
          <span className="icono" aria-hidden>
            🧪
          </span>
          Simulador externo
        </NavLink>
        <div className="pie">
          {sesion.usuario.nombreUsuario} · {sesion.usuario.rol}
        </div>
      </nav>
      <div className="contenido">
        <Outlet />
      </div>
      <nav className="barra-inferior" aria-label="Menú principal">
        {items.map((i) => (
          <NavLink key={i.id} to={i.ruta} className={({ isActive }) => (isActive ? 'activo' : '')}>
            <span className="icono" aria-hidden>
              {i.icono}
            </span>
            <span>{i.corto ?? i.texto}</span>
            {indicador(i.id)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
