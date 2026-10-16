// Pantalla 1 · Inicio de sesión (wireframe 01-login; RF-01 a RF-03, RF-50, RF-52, CU-01).
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi, login } from '../api/cliente';
import { ITEMS } from '../componentes/Estructura';

/** Usuarios de los datos de prueba (DatosPrueba/README-datos-prueba.md). Solo para la demo. */
const USUARIOS_DEMO = [
  { usuario: 'mrossi0', rol: 'Operador' },
  { usuario: 'cbenite0', rol: 'Operador' },
  { usuario: 'lfernan0', rol: 'Operador' },
  { usuario: 'pgimene0', rol: 'Jefe' },
  { usuario: 'asuarez0', rol: 'Administrador' },
  { usuario: 'tmolina0', rol: 'Lector' },
  { usuario: 'jdiaz0', rol: 'no vigente: falla' },
  { usuario: 'nmedina0', rol: 'sin cuenta: falla' },
];

export function MarcaIngreso({ children }: { children?: ReactNode }) {
  return (
    <div className="marca-ingreso">
      <div className="logo" aria-hidden>
        <img src="/arbol.svg" alt="" />
      </div>
      <h1>Dictaminación Técnica</h1>
      <p>Arbolado Público</p>
      {children}
    </div>
  );
}

export function Ingresar({ children }: { children?: ReactNode }) {
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<{ tipo: 'credenciales' | 'servicio'; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const s = await login(usuario.trim(), contrasena);
      navegar(ITEMS[s.menu.inicio]?.ruta ?? '/perfil', { replace: true });
    } catch (err) {
      setContrasena('');
      if (err instanceof ErrorApi && err.codigo === 'CAPTOR_BLOQUEADO') {
        window.dispatchEvent(new Event('captor-cambio'));
        return;
      }
      // RF-50: la caída de la Autenticación Institucional tiene un mensaje propio; el resto, uno genérico.
      const servicio = err instanceof ErrorApi && ['AUTENTICACION_NO_DISPONIBLE', 'DEMASIADOS_INTENTOS', 'SIN_CONEXION', 'CAPTOR_REVOCADO'].includes(err.codigo);
      setError({ tipo: servicio ? 'servicio' : 'credenciales', texto: err instanceof Error ? err.message : 'Usuario o contraseña incorrectos.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pantalla-ingreso">
      <MarcaIngreso />
      <form className="tarjeta-ingreso" onSubmit={ingresar} noValidate>
        {children}
        <div className="campo">
          <label htmlFor="usuario">Usuario</label>
          <input
            id="usuario"
            className="entrada"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="nombre.apellido"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor="contrasena">Contraseña</label>
          <div className="con-ojo">
            <input
              id="contrasena"
              className="entrada"
              type={ver ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            <button type="button" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVer(!ver)}>
              {ver ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        {error && (
          <p className={error.tipo === 'credenciales' ? 'error-ingreso' : 'error-ingreso servicio'} role="alert">
            ⚠ {error.texto}
          </p>
        )}
        <button className="boton ancho mayus" disabled={!usuario.trim() || !contrasena || enviando}>
          {enviando ? 'Verificando…' : 'Ingresar'}
        </button>
      </form>
      <p className="pie-ingreso">
        Centro de Informática Local (CIL)
        <br />
        Parques y Paseos — Dirección Técnica
      </p>
      <details className="usuarios-demo">
        <summary>Usuarios de prueba (solo demo)</summary>
        <p>
          Contraseña de todos: <code>Demo2026!</code>
        </p>
        <ul>
          {USUARIOS_DEMO.map((u) => (
            <li key={u.usuario}>
              <button type="button" className="boton enlace" onClick={() => setUsuario(u.usuario)}>
                {u.usuario}
              </button>{' '}
              · {u.rol}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
