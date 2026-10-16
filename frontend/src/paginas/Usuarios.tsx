// Pantalla 7 · Gestión de usuarios y 7b · Captores bloqueados. Siguen los wireframes 07-gestion-usuarios y
// 07b-desbloquear-captor (diseño-ui.md, Pantalla 7). Cubren RF-06, RF-07, RF-08, RF-22, RF-52, RF-54, RF-60,
// CU-02, CU-16, HU-02, HU-18. Solo Administrador. La sección "captores" se elige con la prop `seccion`.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch, post } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, EtiquetaRol, fecha, fechaHora, mensajeDe, Modal, Pantalla, Paginacion, useCarga, Vacio } from '../componentes/ui';
import { useConexion } from '../offline/conexion';
import '../estilos/usuarios.css';

type RolUsuario = 'Administrador' | 'Jefe' | 'Operador' | 'Lector';
const ROLES: RolUsuario[] = ['Administrador', 'Jefe', 'Operador', 'Lector'];

interface Captor {
  codigoVisible: string;
  estado: string;
}
interface UsuarioFila {
  nombreUsuario: string;
  rol: RolUsuario;
  activo: boolean;
  fechaAlta: string;
  dispositivos: Captor[];
}
interface Listado {
  total: number;
  pagina: number;
  porPagina: number;
  usuarios: UsuarioFila[];
}
interface CaptorBloqueado {
  codigoVisible: string;
  nombreUsuario: string | null;
  fechaBloqueo: string | null;
  estado: string;
}

const REGLAS: { texto: string; cumple: (c: string) => boolean }[] = [
  { texto: 'Mínimo 8 caracteres', cumple: (c) => c.length >= 8 },
  { texto: 'Una mayúscula', cumple: (c) => /[A-ZÁÉÍÓÚÑ]/.test(c) },
  { texto: 'Una minúscula', cumple: (c) => /[a-záéíóúñ]/.test(c) },
  { texto: 'Un número', cumple: (c) => /\d/.test(c) },
  { texto: 'Un carácter especial', cumple: (c) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(c) },
];

const AVISO_SIN_CONEXION = 'Sin conexión: esta acción necesita señal.';
const enc = encodeURIComponent;

export function Usuarios({ seccion }: { seccion?: 'captores' }) {
  return seccion === 'captores' ? <CaptoresBloqueados /> : <ListaUsuarios />;
}

// ── Gestión de usuarios (wireframe 07) ──────────────────────────────────────────────────────────

type Accion = { tipo: 'baja' | 'revocar' | 'blanqueo'; usuario: UsuarioFila };

function ListaUsuarios() {
  const conexion = useConexion();
  const [pagina, setPagina] = useState(1);
  const [texto, setTexto] = useState('');
  const { datos, error, cargando, recargar } = useCarga(() => get<Listado>(`/usuarios?pagina=${pagina}`), [pagina]);
  const [alta, setAlta] = useState(false);
  const [ficha, setFicha] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return (datos?.usuarios ?? []).filter((u) => !q || u.nombreUsuario.toLowerCase().includes(q));
  }, [datos, texto]);
  const usuarioFicha = datos?.usuarios.find((u) => u.nombreUsuario === ficha) ?? null;

  return (
    <Pantalla
      titulo="Usuarios"
      ancho
      acciones={
        <button className="boton exito" onClick={() => setAlta(true)} disabled={!conexion}>
          + Nuevo
        </button>
      }
    >
      <div className="usuarios">
        <div className="barra-superior">
          <div className="buscador">
            <span aria-hidden>🔍</span>
            <label htmlFor="buscar-usuario" className="solo-lector">
              Buscar usuario
            </label>
            <input id="buscar-usuario" placeholder="Buscar usuario…" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <div className="accesos">
            <Link className="boton contorno chico" to="/usuarios/captores">
              Captores bloqueados
            </Link>
          </div>
        </div>

        {!conexion && <Aviso tipo="advertencia">{AVISO_SIN_CONEXION}</Aviso>}
        {exito && <Aviso tipo="exito">{exito}</Aviso>}

        {error ? (
          <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
        ) : cargando && !datos ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio>{texto ? 'Ningún usuario coincide con la búsqueda' : 'No hay usuarios'}</Vacio>
        ) : (
          <>
            <div className="lista solo-celular">
              {visibles.map((u) => (
                <button key={u.nombreUsuario} className={`tarjeta${u.activo ? '' : ' inactivo'}`} onClick={() => setFicha(u.nombreUsuario)} aria-label={`Abrir ficha de ${u.nombreUsuario}`}>
                  <span className="fila-usuario">
                    <span className="avatar" aria-hidden>
                      {u.nombreUsuario.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="datos-usuario">
                      <b>{u.nombreUsuario}</b>
                      <EtiquetaRol rol={u.rol} />
                    </span>
                    <span className="estado">
                      <span className={`punto${u.activo ? '' : ' inactivo'}`} aria-hidden />
                      {!u.activo && 'Inactivo'}
                      {u.activo && <span className="solo-lector">Activo</span>}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <table className="tabla solo-escritorio">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Alta</th>
                  <th>Captores</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr key={u.nombreUsuario} className="clicable" tabIndex={0} onClick={() => setFicha(u.nombreUsuario)} onKeyDown={(e) => e.key === 'Enter' && setFicha(u.nombreUsuario)}>
                    <td>
                      <b>{u.nombreUsuario}</b>
                    </td>
                    <td>
                      <EtiquetaRol rol={u.rol} />
                    </td>
                    <td>
                      <span className={`punto${u.activo ? '' : ' inactivo'}`} aria-hidden /> {u.activo ? 'Activo' : 'Inactivo'}
                    </td>
                    <td>{fecha(u.fechaAlta)}</td>
                    <td>
                      {u.dispositivos.length === 0
                        ? '—'
                        : u.dispositivos.map((d) => (
                            <div key={d.codigoVisible}>
                              <span className="mono">{d.codigoVisible}</span> · {d.estado}
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {datos && <Paginacion pagina={datos.pagina} paginas={Math.max(1, Math.ceil(datos.total / datos.porPagina))} onCambio={setPagina} />}
          </>
        )}
      </div>

      {alta && (
        <AltaUsuario
          conexion={conexion}
          onCerrar={() => setAlta(false)}
          onCreado={async (u) => {
            setExito(`Usuario creado: ${u.nombreUsuario} (${u.rol}). Quedó registrado en Auditoría (RF-54).`);
            setAlta(false);
            await recargar();
          }}
        />
      )}
      {usuarioFicha && (
        <FichaUsuario
          usuario={usuarioFicha}
          conexion={conexion}
          onCerrar={() => setFicha(null)}
          onHecho={async (mensaje) => {
            if (mensaje) setExito(mensaje);
            await recargar();
          }}
        />
      )}
    </Pantalla>
  );
}

function FichaUsuario({ usuario, conexion, onCerrar, onHecho }: { usuario: UsuarioFila; conexion: boolean; onCerrar: () => void; onHecho: (mensaje: string | null) => Promise<void> }) {
  const [rol, setRol] = useState<RolUsuario>(usuario.rol);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [temporal, setTemporal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vigentes = usuario.dispositivos.filter((d) => d.estado !== 'Revocado');
  const id = enc(usuario.nombreUsuario);

  async function correr(trabajo: () => Promise<string | null>, cerrar: boolean) {
    setEnviando(true);
    setError(null);
    try {
      const mensaje = await trabajo();
      setAccion(null);
      await onHecho(mensaje);
      if (cerrar) onCerrar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const cambiarRol = () =>
    correr(async () => {
      await patch(`/usuarios/${id}`, { rol });
      return `Se cambió el rol de ${usuario.nombreUsuario} a ${rol}. Quedó registrado en Auditoría (RF-54).`;
    }, true);

  const confirmar = () => {
    if (!accion) return Promise.resolve();
    if (accion.tipo === 'baja')
      return correr(async () => {
        await post(`/usuarios/${id}/baja`);
        return `${usuario.nombreUsuario} quedó dado de baja. Quedó registrado en Auditoría (RF-54).`;
      }, true);
    if (accion.tipo === 'revocar')
      return correr(async () => {
        const r = await post<{ revocados: string[] }>(`/usuarios/${id}/revocar-captor`);
        return `Se revocó ${r.revocados.length === 1 ? 'el captor' : 'los captores'} ${r.revocados.join(', ')} de ${usuario.nombreUsuario}. Quedó registrado en Auditoría (RF-54).`;
      }, true);
    return correr(async () => {
      const r = await post<{ contrasenaTemporal: string }>(`/usuarios/${id}/reset-password`);
      setTemporal(r.contrasenaTemporal);
      return null;
    }, false);
  };

  return (
    <>
      <Modal titulo={usuario.nombreUsuario} etiqueta={`Ficha de ${usuario.nombreUsuario}`} onCerrar={enviando ? undefined : onCerrar}>
        <p className="texto-modal">
          <EtiquetaRol rol={usuario.rol} /> · {usuario.activo ? 'Activo' : 'Inactivo'} · alta {fecha(usuario.fechaAlta)}
        </p>
        {!conexion && <Aviso tipo="advertencia">{AVISO_SIN_CONEXION}</Aviso>}
        {error && !accion && <Aviso tipo="error">{error}</Aviso>}
        {!usuario.activo ? (
          <p className="texto-modal" style={{ marginTop: 12 }}>
            El usuario está dado de baja: no tiene acciones disponibles.
          </p>
        ) : (
          <>
            <div className="ficha-bloque">
              <h3>Cambiar rol</h3>
              <div className="ficha-fila">
                <label htmlFor="ficha-rol" className="solo-lector">
                  Rol
                </label>
                <select id="ficha-rol" className="entrada" value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)}>
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className="boton" disabled={rol === usuario.rol || enviando || !conexion} onClick={() => void cambiarRol()}>
                  Confirmar cambio
                </button>
              </div>
              <p className="nota-pie">El cambio queda registrado en Auditoría (RF-54).</p>
            </div>
            <div className="ficha-bloque">
              <h3>Contraseña</h3>
              <button className="boton contorno chico" disabled={!conexion} onClick={() => setAccion({ tipo: 'blanqueo', usuario })}>
                Restablecer contraseña
              </button>
            </div>
            {vigentes.length > 0 && (
              <div className="ficha-bloque">
                <h3>Captor</h3>
                <p className="linea suave">
                  {vigentes.map((d) => `${d.codigoVisible} (${d.estado})`).join(' · ')}
                </p>
                <button className="boton peligro chico" disabled={!conexion} onClick={() => setAccion({ tipo: 'revocar', usuario })}>
                  Revocar captor por pérdida o robo
                </button>
              </div>
            )}
            <div className="ficha-bloque">
              <h3>Baja</h3>
              <button className="boton peligro chico" disabled={!conexion} onClick={() => setAccion({ tipo: 'baja', usuario })}>
                Dar de baja
              </button>
            </div>
          </>
        )}
        <div className="acciones-modal">
          <button className="boton contorno" onClick={onCerrar} disabled={enviando}>
            Cerrar
          </button>
        </div>
      </Modal>

      {accion && !temporal && (
        <Modal
          titulo={accion.tipo === 'baja' ? '¿Dar de baja al usuario?' : accion.tipo === 'revocar' ? '¿Revocar el captor?' : '¿Restablecer la contraseña?'}
          onCerrar={enviando ? undefined : () => { setAccion(null); setError(null); }}
        >
          {error && <Aviso tipo="error">{error}</Aviso>}
          {accion.tipo === 'baja' && (
            <p className="texto-modal">
              <b>{usuario.nombreUsuario}</b> ya no va a poder ingresar. El usuario no se borra: queda el historial de lo que firmó.
            </p>
          )}
          {accion.tipo === 'revocar' && (
            <p className="texto-modal">
              Se cierra la sesión de <b>{usuario.nombreUsuario}</b> y se borran los datos del captor cuando vuelva a tener conexión. Esta acción no se puede deshacer.
            </p>
          )}
          {accion.tipo === 'blanqueo' && (
            <p className="texto-modal">
              Se genera una contraseña temporal para <b>{usuario.nombreUsuario}</b> y se muestra una sola vez. La contraseña anterior deja de valer.
            </p>
          )}
          {accion.tipo !== 'blanqueo' && <p className="texto-modal" style={{ marginTop: 8 }}>Queda registrado en Auditoría (RF-54).</p>}
          <div className="acciones-modal">
            <button className="boton contorno" disabled={enviando} onClick={() => { setAccion(null); setError(null); }}>
              Cancelar
            </button>
            <button className={`boton${accion.tipo === 'blanqueo' ? '' : ' tormenta'}`} disabled={enviando || !conexion} onClick={() => void confirmar()}>
              {enviando ? 'Procesando…' : accion.tipo === 'baja' ? 'Dar de baja' : accion.tipo === 'revocar' ? 'Revocar captor' : 'Restablecer'}
            </button>
          </div>
        </Modal>
      )}

      {temporal && (
        <Modal titulo="Contraseña temporal" onCerrar={() => { setTemporal(null); onCerrar(); }}>
          <p className="texto-modal">
            Nueva contraseña de <b>{usuario.nombreUsuario}</b>:
          </p>
          <p className="contrasena-temporal mono">{temporal}</p>
          <Aviso tipo="advertencia">Anotala ahora: se muestra una sola vez. La contraseña anterior deja de valer (RF-08). Pasásela a la persona por un medio seguro.</Aviso>
          <div className="acciones-modal">
            <button className="boton exito" onClick={() => { setTemporal(null); onCerrar(); }}>
              Ya la anoté
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AltaUsuario({ conexion, onCerrar, onCreado }: { conexion: boolean; onCerrar: () => void; onCreado: (u: { nombreUsuario: string; rol: string }) => Promise<void> }) {
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [rol, setRol] = useState<RolUsuario>('Operador');
  const [identificador, setIdentificador] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const n = nombre.trim();
    const a = apellido.trim();
    if (!n || !a) {
      setIdentificador('');
      return;
    }
    let vigente = true;
    get<{ nombreUsuario: string }>(`/usuarios/identificador?nombre=${enc(n)}&apellido=${enc(a)}`)
      .then((r) => vigente && setIdentificador(r.nombreUsuario))
      .catch(() => vigente && setIdentificador(''));
    return () => {
      vigente = false;
    };
  }, [nombre, apellido]);

  const cumplidas = REGLAS.map((r) => r.cumple(contrasena));
  const completo = cumplidas.every(Boolean) && nombre.trim() !== '' && apellido.trim() !== '';

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!completo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await onCreado(await post<{ nombreUsuario: string; rol: string }>('/usuarios', { nombre: nombre.trim(), apellido: apellido.trim(), contrasena, rol }));
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal titulo="Nuevo usuario" onCerrar={enviando ? undefined : onCerrar}>
      <form onSubmit={crear} className="usuarios">
        {!conexion && <Aviso tipo="advertencia">{AVISO_SIN_CONEXION}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="campo">
          <label htmlFor="alta-nombre">Nombre</label>
          <input id="alta-nombre" className="entrada" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor="alta-apellido">Apellido</label>
          <input id="alta-apellido" className="entrada" value={apellido} onChange={(e) => setApellido(e.target.value)} autoComplete="off" />
        </div>
        <div className="campo">
          <label htmlFor="alta-usuario">Usuario (autogenerado)</label>
          <input id="alta-usuario" className="entrada" readOnly value={identificador} placeholder="inicial + apellido + n°" />
        </div>
        <div className="campo">
          <label htmlFor="alta-contrasena">Contraseña</label>
          <input id="alta-contrasena" type="password" className="entrada" value={contrasena} onChange={(e) => setContrasena(e.target.value)} autoComplete="new-password" aria-describedby="alta-ayuda" />
          <span id="alta-ayuda" className="ayuda">
            Mín. 8 car., mayúscula, minúscula, número y carácter especial
          </span>
          {contrasena !== '' && (
            <ul className="reglas" aria-label="Requisitos de la contraseña">
              {REGLAS.map((r, i) => (
                <li key={r.texto} className={cumplidas[i] ? 'ok' : 'falta'}>
                  {cumplidas[i] ? '✓' : '✗'} {r.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="campo">
          <label htmlFor="alta-rol">Rol</label>
          <select id="alta-rol" className="entrada" value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)}>
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="acciones-modal-cols">
          <button type="button" className="boton contorno" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button className="boton exito" disabled={!completo || enviando || !conexion}>
            {enviando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Captores bloqueados (wireframe 07b) ─────────────────────────────────────────────────────────

function CaptoresBloqueados() {
  const conexion = useConexion();
  const [codigo, setCodigo] = useState('');
  const busqueda = codigo.trim();
  const { datos, error, cargando, recargar } = useCarga(() => get<{ captores: CaptorBloqueado[] }>(`/captores-admin/bloqueados?codigo=${enc(busqueda)}`), [busqueda]);
  const [captor, setCaptor] = useState<CaptorBloqueado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  async function desbloquear() {
    if (!captor) return;
    setEnviando(true);
    setErrorAccion(null);
    try {
      await post(`/captores-admin/${enc(captor.codigoVisible)}/desbloquear`);
      setExito(`Se desbloqueó el captor ${captor.codigoVisible}. Se aplica cuando el captor tenga conexión. Quedó registrado en Auditoría (RF-54).`);
      setCaptor(null);
      await recargar();
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    } finally {
      setEnviando(false);
    }
  }

  const cerrar = () => {
    setCaptor(null);
    setErrorAccion(null);
  };
  const lista = datos?.captores ?? [];

  return (
    <Pantalla titulo="Captores bloqueados" volver="/usuarios" ancho>
      <div className="usuarios">
        <div className="barra-superior">
          <div className="buscador">
            <span aria-hidden>🔍</span>
            <label htmlFor="buscar-captor" className="solo-lector">
              Código del dispositivo
            </label>
            <input id="buscar-captor" placeholder="Código del dispositivo: K7M2-X9QD" value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" />
          </div>
        </div>
        {!conexion && <Aviso tipo="advertencia">{AVISO_SIN_CONEXION}</Aviso>}
        {exito && <Aviso tipo="exito">{exito}</Aviso>}

        {error ? (
          <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
        ) : cargando && !datos ? (
          <Cargando />
        ) : lista.length === 0 ? (
          // CU-16 E1: el código no corresponde a ningún captor bloqueado; el campo sigue editable para corregirlo.
          <Vacio>{busqueda ? 'No se encontró un captor bloqueado con ese código' : 'No hay captores bloqueados'}</Vacio>
        ) : (
          <>
            <div className="lista solo-celular">
              {lista.map((c) => (
                <TarjetaCaptor key={c.codigoVisible} c={c} conexion={conexion} onDesbloquear={() => setCaptor(c)} />
              ))}
            </div>
            <table className="tabla solo-escritorio">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Estado</th>
                  <th>Usuario</th>
                  <th>Bloqueado</th>
                  <th>Motivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.codigoVisible}>
                    <td className="codigo-captor">{c.codigoVisible}</td>
                    <td>
                      <EtiquetaEstado estado={c.estado} />
                    </td>
                    <td>{c.nombreUsuario ?? '—'}</td>
                    <td>{fechaHora(c.fechaBloqueo)}</td>
                    <td>{c.estado === 'Revocado' ? 'Revocado por pérdida o robo: no se puede desbloquear' : '5 intentos de ingreso fallidos'}</td>
                    <td>
                      {c.estado !== 'Revocado' && (
                        <button className="boton exito chico" disabled={!conexion} onClick={() => setCaptor(c)}>
                          Desbloquear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {captor && (
        <Modal titulo="¿Desbloquear este captor?" onCerrar={enviando ? undefined : cerrar}>
          {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
          <p className="texto-modal">
            {captor.codigoVisible}
            {captor.nombreUsuario ? ` · ${captor.nombreUsuario}` : ''}
          </p>
          <p className="texto-modal" style={{ marginTop: 8 }}>
            El ingeniero podrá volver a ingresar cuando el captor tenga conexión.
          </p>
          <p className="texto-modal" style={{ marginTop: 8 }}>
            Queda registrado en Auditoría (RF-54).
          </p>
          <div className="acciones-modal">
            <button className="boton contorno" onClick={cerrar} disabled={enviando}>
              Cancelar
            </button>
            <button className="boton exito" onClick={() => void desbloquear()} disabled={enviando || !conexion}>
              {enviando ? 'Procesando…' : 'Desbloquear'}
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}

const EtiquetaEstado = ({ estado }: { estado: string }) => <span className={`etiqueta${estado === 'Revocado' ? '' : ' roja'}`}>{estado === 'Revocado' ? 'Revocado' : 'Bloqueado'}</span>;

function TarjetaCaptor({ c, conexion, onDesbloquear }: { c: CaptorBloqueado; conexion: boolean; onDesbloquear: () => void }) {
  const revocado = c.estado === 'Revocado';
  return (
    <div className={`tarjeta${revocado ? ' tenue' : ''}`}>
      <div className="fila-captor">
        <div className="cuerpo-captor">
          <div className="codigo-captor">{c.codigoVisible}</div>
          <EtiquetaEstado estado={c.estado} />
          {revocado ? (
            <div className="nota-revocado">Revocado por pérdida o robo: no se puede desbloquear</div>
          ) : (
            <>
              <div className="linea suave">
                Usuario: {c.nombreUsuario ?? '—'} · bloqueado {fechaHora(c.fechaBloqueo)}
              </div>
              <div className="linea suave">Motivo: 5 intentos de ingreso fallidos</div>
            </>
          )}
        </div>
        {!revocado && (
          <button className="boton exito" disabled={!conexion} onClick={onDesbloquear}>
            Desbloquear
          </button>
        )}
      </div>
    </div>
  );
}
