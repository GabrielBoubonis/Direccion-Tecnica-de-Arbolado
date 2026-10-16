// Simulador externo (fuera del sistema, solo demo). No tiene wireframe: no es parte del sistema, es el control
// de los sistemas simulados (SUA, Autenticación Institucional y servicio de mapas) para mostrar cómo reacciona
// el sistema. Referencias: RF-12, RF-24, RF-25, RF-50, RNF-17, RNF-18.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, fechaHora, mensajeDe, Modal, Pantalla, useCarga } from '../componentes/ui';
import { useSesion } from '../estado/sesion';
import { borrarTodo } from '../offline/almacen';
import { olvidarClave } from '../offline/captor';
import '../estilos/simulador.css';

type Clave = 'sua_caido' | 'autenticacion_caida' | 'mapas_caido';

interface Estado {
  interruptores: { suaCaido: boolean; autenticacionCaida: boolean; mapasCaido: boolean };
  servicioMapas: 'prueba' | 'openrouteservice' | 'ninguno';
  sinLeer: number;
  recibidos: { id: number; numeroSua: string; anio: number; contenido: unknown; recibidoEn: string }[];
  institucionales: { nombreUsuario: string; nombreCompleto: string; vigente: boolean }[];
}

const SERVICIO_MAPAS = {
  prueba: 'Prueba: coordenadas fijas de los datos de prueba',
  openrouteservice: 'OpenRouteService',
  ninguno: 'Ninguno (sin servicio de mapas configurado)',
} as const;

const DISTRITOS = ['Centro', 'Noroeste', 'Norte', 'Oeste', 'Sudoeste', 'Sur'];
// Calles reales de Rosario con numeración inventada, como en los datos de prueba.
const EJEMPLOS = [
  { distrito: 'Centro', direccion: 'Entre Ríos 1450', descripcion: 'Rama seca de gran porte sobre la vereda.' },
  { distrito: 'Norte', direccion: 'Av. Alberdi 1820', descripcion: 'Árbol inclinado hacia la calzada después del viento.' },
  { distrito: 'Oeste', direccion: 'Av. Pellegrini 4300', descripcion: 'Raíces que levantan la vereda frente a una escuela.' },
  { distrito: 'Sur', direccion: 'Av. San Martín 4100', descripcion: 'Copa que tapa la luminaria de la esquina.' },
  { distrito: 'Noroeste', direccion: 'Av. Eva Perón 7200', descripcion: 'Ejemplar con signos de enfermedad en el tronco.' },
  { distrito: 'Sudoeste', direccion: 'Av. Francia 3900', descripcion: 'Ramas que rozan el cableado de media tensión.' },
];

const QUIEN: Record<Clave, string> = { sua_caido: 'El SUA', autenticacion_caida: 'La Autenticación Institucional', mapas_caido: 'El servicio de mapas' };

export function Simulador() {
  const { datos, error, recargar } = useCarga(() => get<Estado>('/simulador'));
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'advertencia'; texto: string } | null>(null);
  const [form, setForm] = useState({ ...EJEMPLOS[0], prioridad: 'Media', esTormenta: false });
  const [rederivar, setRederivar] = useState({ numeroSua: '', anio: '2026' });
  const [ocupado, setOcupado] = useState(false);
  const [nuevoInst, setNuevoInst] = useState({ nombreUsuario: '', nombreCompleto: '' });
  const esAdministrador = useSesion()?.usuario.rol === 'Administrador';
  const [confirmandoReinicio, setConfirmandoReinicio] = useState(false);

  /** Solo demo: la base vuelve a los datos de prueba; las sesiones y lo guardado en este celular dejan de valer. */
  async function reiniciarDemo() {
    setOcupado(true);
    setMensaje(null);
    try {
      await post('/simulador/reiniciar');
      olvidarClave();
      await borrarTodo();
      try {
        localStorage.removeItem('arbolado.sesion');
      } catch {
        /* nada que borrar */
      }
      window.location.assign('/ingresar');
    } catch (e) {
      setConfirmandoReinicio(false);
      setMensaje({ tipo: 'error', texto: mensajeDe(e) });
      setOcupado(false);
    }
  }

  async function accion(fn: () => Promise<string>) {
    setOcupado(true);
    setMensaje(null);
    try {
      setMensaje({ tipo: 'exito', texto: await fn() });
      await recargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: mensajeDe(e) });
    } finally {
      setOcupado(false);
    }
  }

  const interruptor = (clave: Clave, activo: boolean) =>
    accion(async () => {
      await post('/simulador/interruptor', { clave, activo });
      return activo ? `${QUIEN[clave]} ahora NO responde.` : `${QUIEN[clave]} volvió a responder.`;
    });

  const titulo = 'Simulador externo';
  const subtitulo = 'Fuera del sistema · solo demo';
  if (error)
    return (
      <Pantalla titulo={titulo} subtitulo={subtitulo} volver ancho>
        <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
      </Pantalla>
    );
  if (!datos)
    return (
      <Pantalla titulo={titulo} subtitulo={subtitulo} volver ancho>
        <Cargando />
      </Pantalla>
    );

  return (
    <Pantalla titulo={titulo} subtitulo={subtitulo} volver ancho>
      <Aviso tipo="simulado" titulo="Esto no es el sistema">
        Esta pantalla representa a sistemas externos (el SUA, la Autenticación Institucional y el servicio de mapas), no a funciones del sistema. En producción son
        sistemas de la Municipalidad o de terceros a los que el sistema se conecta; para la demo son simulados y desde acá se actúa como ellos.
      </Aviso>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      <div className="sim-grilla">
        <div className="tarjeta sim-bloque">
          <h2>SUA: derivar un reclamo nuevo</h2>
          <p className="suave">Se carga en el SUA simulado como derivado hoy a la Dirección Técnica. El sistema lo lee en el acto, lo valida y lo ubica en el mapa.</p>
          <div className="campo">
            <label htmlFor="sim-ejemplo">Ejemplo</label>
            <select id="sim-ejemplo" className="entrada" onChange={(e) => setForm({ ...form, ...EJEMPLOS[Number(e.target.value)] })}>
              {EJEMPLOS.map((x, i) => (
                <option key={x.direccion} value={i}>
                  {x.direccion} ({x.distrito})
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sim-direccion">Dirección</label>
            <input id="sim-direccion" className="entrada" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="sim-distrito">Distrito</label>
            <select id="sim-distrito" className="entrada" value={form.distrito} onChange={(e) => setForm({ ...form, distrito: e.target.value })}>
              {DISTRITOS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sim-prioridad">Prioridad de triage</label>
            <select id="sim-prioridad" className="entrada" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
              {['Alta', 'Media', 'Baja'].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sim-descripcion">Descripción del reclamo</label>
            <input id="sim-descripcion" className="entrada" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <label className="casilla" htmlFor="sim-tormenta">
            <input id="sim-tormenta" type="checkbox" checked={form.esTormenta} onChange={(e) => setForm({ ...form, esTormenta: e.target.checked })} />
            Etiqueta "emergencia por tormenta"
          </label>
          <button
            className="boton ancho"
            disabled={ocupado}
            onClick={() =>
              void accion(async () => {
                const r = await post<{ numeroSua: string; anio: number; lectura: { nuevas: number; suaDisponible: boolean } }>('/simulador/derivacion', form);
                if (!r.lectura.suaDisponible) return `Se cargó la ${r.numeroSua}-${r.anio} en el SUA, pero el SUA está "caído": el sistema la va a leer cuando vuelva a responder.`;
                return `El SUA derivó la ${r.numeroSua}-${r.anio} y el sistema ya la leyó. Está en ${form.esTormenta ? 'Protocolo por tormenta' : 'Solicitudes'}.`;
              })
            }
          >
            Derivar desde el SUA
          </button>
        </div>

        <div>
          <div className="tarjeta sim-bloque">
            <h2>Interruptores</h2>
            <label className="casilla" htmlFor="sim-sua">
              <input id="sim-sua" type="checkbox" checked={datos.interruptores.suaCaido} disabled={ocupado} onChange={(e) => void interruptor('sua_caido', e.target.checked)} />
              El SUA no responde
            </label>
            <p className="sim-ayuda">El listado sigue andando con lo ya cargado (RNF-17) y los dictámenes firmados quedan "pendientes de sincronizar" y se reenvían solos al volver (RF-25).</p>
            <label className="casilla" htmlFor="sim-auth">
              <input id="sim-auth" type="checkbox" checked={datos.interruptores.autenticacionCaida} disabled={ocupado} onChange={(e) => void interruptor('autenticacion_caida', e.target.checked)} />
              La Autenticación Institucional no responde
            </label>
            <p className="sim-ayuda">El inicio de sesión muestra un mensaje propio, distinto del de credenciales, y no cuenta como intento fallido (RF-50).</p>
            <label className="casilla" htmlFor="sim-mapas">
              <input id="sim-mapas" type="checkbox" checked={datos.interruptores.mapasCaido} disabled={ocupado} onChange={(e) => void interruptor('mapas_caido', e.target.checked)} />
              El servicio de mapas no responde
            </label>
            <p className="sim-ayuda">
              Servicio de mapas activo: <b>{SERVICIO_MAPAS[datos.servicioMapas] ?? datos.servicioMapas}</b>.
            </p>
          </div>

          <div className="tarjeta sim-bloque">
            <h2>SUA: otras acciones</h2>
            <div className="campo">
              <label htmlFor="sim-numero">Re-derivar por vencimiento una solicitud</label>
              <div className="sim-fila">
                <input id="sim-numero" className="entrada" placeholder="N.° SUA (ej. 48070)" value={rederivar.numeroSua} onChange={(e) => setRederivar({ ...rederivar, numeroSua: e.target.value.replace(/\D/g, '') })} />
                <input aria-label="Año" className="entrada" style={{ maxWidth: 100, flex: 'none' }} value={rederivar.anio} onChange={(e) => setRederivar({ ...rederivar, anio: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="ayuda">Si ya tenía un dictamen, pasa a "En revisión" (RF-12). Probá con una dictaminada, por ejemplo 48070-2026.</div>
            </div>
            <button
              className="boton contorno ancho"
              disabled={ocupado || !rederivar.numeroSua}
              onClick={() =>
                void accion(async () => {
                  await post('/simulador/rederivacion', { numeroSua: rederivar.numeroSua, anio: Number(rederivar.anio) });
                  return `Re-derivada la ${rederivar.numeroSua}-${rederivar.anio}.`;
                })
              }
            >
              Re-derivar
            </button>
            <button
              className="boton contorno ancho"
              disabled={ocupado}
              onClick={() =>
                void accion(async () => {
                  await post('/simulador/registro-invalido');
                  return 'El SUA mandó un registro con distrito y prioridad fuera de la lista. El sistema lo rechazó y lo dejó en "Para revisar" del Administrador (RNF-18, RF-58).';
                })
              }
            >
              Mandar un registro con datos inválidos
            </button>
          </div>
        </div>
      </div>

      <div className="tarjeta sim-bloque" style={{ marginTop: 12 }}>
        <h2>Lo que recibió el SUA</h2>
        <p className="suave">Los datos complementarios de cada dictamen firmado (RF-24): todo lo que cargó el ingeniero, las fotos, el autor y la fecha, sin el hash ni el estado de sincronización.</p>
        {datos.recibidos.length === 0 && <p className="vacio">Todavía no se firmó ningún dictamen en esta demo.</p>}
        {datos.recibidos.map((r) => (
          <details key={r.id} className="sim-recibido">
            <summary>
              <b>
                SUA {r.numeroSua}-{r.anio}
              </b>{' '}
              · recibido el {fechaHora(r.recibidoEn)}
            </summary>
            <pre className="sim-json mono">{JSON.stringify(r.contenido, null, 2)}</pre>
          </details>
        ))}
      </div>

      <div className="tarjeta sim-bloque">
        <h2>Autenticación Institucional simulada</h2>
        <div className="sim-tabla-envoltorio">
          <table className="tabla">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Vigente</th>
              </tr>
            </thead>
            <tbody>
              {datos.institucionales.map((u) => (
                <tr key={u.nombreUsuario}>
                  <td className="mono">{u.nombreUsuario}</td>
                  <td>{u.nombreCompleto}</td>
                  <td>
                    <label className="casilla" htmlFor={`sim-vig-${u.nombreUsuario}`}>
                      <input
                        id={`sim-vig-${u.nombreUsuario}`}
                        type="checkbox"
                        checked={u.vigente}
                        disabled={ocupado}
                        onChange={(e) => {
                          // Se lee antes de esperar al servidor: después, la casilla controlada vuelve a su valor anterior.
                          const vigente = e.target.checked;
                          void accion(async () => {
                            await post('/simulador/institucional', { nombreUsuario: u.nombreUsuario, vigente });
                            return `${u.nombreUsuario} ahora está ${vigente ? 'vigente' : 'no vigente'} en la Autenticación Institucional.`;
                          });
                        }}
                      />
                      {u.vigente ? 'Vigente' : <span className="etiqueta roja">No vigente</span>}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sim-fila" style={{ marginTop: 10 }}>
          <input aria-label="Usuario nuevo" className="entrada" placeholder="usuario" value={nuevoInst.nombreUsuario} onChange={(e) => setNuevoInst({ ...nuevoInst, nombreUsuario: e.target.value })} />
          <input aria-label="Nombre y apellido" className="entrada" placeholder="Nombre y apellido" value={nuevoInst.nombreCompleto} onChange={(e) => setNuevoInst({ ...nuevoInst, nombreCompleto: e.target.value })} />
          <button
            className="boton contorno"
            disabled={ocupado || nuevoInst.nombreUsuario.trim().length < 2 || nuevoInst.nombreCompleto.trim().length < 2}
            onClick={() =>
              void accion(async () => {
                await post('/simulador/institucional', { ...nuevoInst, vigente: true });
                setNuevoInst({ nombreUsuario: '', nombreCompleto: '' });
                return `Se agregó ${nuevoInst.nombreUsuario} a la Autenticación Institucional.`;
              })
            }
          >
            Agregar a la Autenticación Institucional
          </button>
        </div>
        <p className="sim-pie">
          Un usuario dado de alta en Gestión de usuarios necesita existir también acá para poder entrar. Para entrar al sistema hace falta estar acá como vigente <i>y</i> tener cuenta propia del sistema (RF-02, RF-03). <Link to="/ingresar">Usuarios de prueba</Link>.
        </p>
      </div>

      {esAdministrador && (
        <div className="tarjeta sim-bloque">
          <h2>Demo: volver al estado inicial</h2>
          <p className="suave">
            Borra todo lo que se hizo durante la demo (dictámenes, rutas, usuarios, auditoría, reclamos derivados desde acá) y vuelve a cargar los datos de prueba, como
            quedan al desplegar. Se cierran todas las sesiones. Sirve para dejar la demo lista antes de presentarla.
          </p>
          <button className="boton peligro ancho" disabled={ocupado} onClick={() => setConfirmandoReinicio(true)}>
            Volver la demo al estado inicial
          </button>
        </div>
      )}
      {confirmandoReinicio && (
        <Modal titulo="¿Volver la demo al estado inicial?" onCerrar={() => !ocupado && setConfirmandoReinicio(false)}>
          <p>Se pierde todo lo hecho en la demo y se vuelve a los datos de prueba. Después hay que ingresar de nuevo.</p>
          <div className="acciones-modal">
            <button className="boton contorno" disabled={ocupado} onClick={() => setConfirmandoReinicio(false)}>
              Cancelar
            </button>
            <button className="boton peligro" disabled={ocupado} onClick={() => void reiniciarDemo()}>
              {ocupado ? 'Reiniciando…' : 'Volver al estado inicial'}
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}
