// Pantalla 1c · Reanudar la sesión sin señal (wireframe 01c; RF-57, CU-01 E3, CU-10 E4).
import { useEffect, useState } from 'react';
import { guardarSesion } from '../api/cliente';
import { condicionesParaReanudar, reanudarSinConexion, usuarioRecordado } from '../offline/captor';
import { refrescarEstado } from '../offline/cola';

const TITULOS = {
  inactividad: 'Tu sesión se cerró por inactividad',
  'sin-senal': 'Estás sin señal',
  recarga: 'Abrí los datos del captor',
};

export function ReanudarSinSenal({ motivo }: { motivo: keyof typeof TITULOS }) {
  const [usuario, setUsuario] = useState('');
  const [fijo, setFijo] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [impedimento, setImpedimento] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    void usuarioRecordado().then((u) => {
      if (u) {
        setUsuario(u.nombreUsuario);
        setFijo(true);
      }
    });
    void condicionesParaReanudar().then(setImpedimento);
  }, []);

  async function reanudar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    const r = await reanudarSinConexion(usuario, contrasena);
    setEnviando(false);
    setContrasena('');
    if (r.ok) {
      guardarSesion({ acceso: '', refresco: r.refresco, usuario: r.usuario, menu: r.menu, primerIngreso: r.primerIngreso, reanudadaSinConexion: true });
      await refrescarEstado();
      return;
    }
    if (r.motivo === 'BLOQUEADO') window.dispatchEvent(new Event('captor-cambio'));
    else if (r.motivo === 'SIN_CONDICIONES') setError('Necesitás señal para volver a ingresar.');
    else setError('Usuario o contraseña incorrectos.');
  }

  return (
    <div className="pantalla-ingreso sin-senal">
      <div className="franja-sin-senal" role="status">
        ⚠ Sin conexión
      </div>
      <div className="marca-ingreso">
        <div className="logo" aria-hidden>
          <img src="/arbol.svg" alt="" />
        </div>
        <h1>{TITULOS[motivo]}</h1>
        <p>Podés reanudarla sin señal con tu contraseña.</p>
      </div>
      <form className="tarjeta-ingreso plana" onSubmit={reanudar} noValidate>
        <div className="campo">
          <label htmlFor="usuario-reanudar">Usuario</label>
          <input id="usuario-reanudar" className="entrada" value={usuario} readOnly={fijo} autoComplete="username" onChange={(e) => setUsuario(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="contrasena-reanudar">Contraseña</label>
          <div className="con-ojo">
            <input
              id="contrasena-reanudar"
              className="entrada"
              type={ver ? 'text' : 'password'}
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            <button type="button" aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVer(!ver)}>
              {ver ? '🙈' : '👁'}
            </button>
          </div>
        </div>
        {error && (
          <p className="error-ingreso" role="alert">
            ⚠ {error}
          </p>
        )}
        <button className="boton exito ancho mayus" disabled={!usuario || !contrasena || enviando}>
          {enviando ? 'Verificando…' : 'Reanudar sesión'}
        </button>
        <div className="condiciones">
          Se puede reanudar solo si:
          <br />• ingresaste hoy con conexión,
          <br />• no pasaron 7 días desde tu primer ingreso,
          <br />• el captor no fue revocado.
          <br />
          Cuando vuelva la señal, se revalida tu usuario.
        </div>
        {impedimento && (
          <div className="aviso error">
            <b>No se cumple una condición:</b>
            {impedimento} Necesitás señal para volver a ingresar.
          </div>
        )}
      </form>
    </div>
  );
}
