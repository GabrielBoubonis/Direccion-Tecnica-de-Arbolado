// Pantalla 2 · Listado de solicitudes. Sigue el wireframe 02-listado-solicitudes. Cubre RF-09 a RF-13,
// RF-39 (el servidor excluye las de tormenta), RF-62 (sin ubicar), CU-03 (E1 SUA caído, E2 lista vacía),
// HU-03 y HU-14. Paginación de 30 por página sobre todo lo que devuelve el servidor.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, fecha, InsigniaEstado, Pantalla, Paginacion, Pestanas, usePaginado, useCarga, Vacio, type EstadoSolicitud } from '../componentes/ui';
import { useConexion } from '../offline/conexion';
import '../estilos/solicitudes.css';

interface Fila {
  numeroSua: string;
  anio: number;
  estado: EstadoSolicitud;
  direccion: string;
  distrito: string;
  prioridad: string;
  descripcion: string;
  fechaDerivacion: string;
  sinUbicar: boolean;
}

interface Respuesta {
  total: number;
  pagina: number;
  porPagina: number;
  anios: number[];
  sua: { suaDisponible: boolean };
  solicitudes: Fila[];
}

type Pestania = 'todas' | 'pendientes' | 'revision';
const POR_PAGINA = 30;
const limpiar = (d: string) => d.replace(', Rosario, Santa Fe', '');

/** Trae todas las páginas del servidor (30 c/u) para buscar y paginar en la pantalla. */
async function cargarTodas(pestania: Pestania, anio: string): Promise<Respuesta> {
  const url = (p: number) => `/solicitudes?pestania=${pestania}&pagina=${p}${anio ? `&anio=${anio}` : ''}`;
  const primera = await get<Respuesta>(url(1));
  const paginas = Math.ceil(primera.total / primera.porPagina);
  const resto = await Promise.all(Array.from({ length: Math.max(0, paginas - 1) }, (_, i) => get<Respuesta>(url(i + 2))));
  return { ...primera, solicitudes: [...primera.solicitudes, ...resto.flatMap((r) => r.solicitudes)] };
}

export function Solicitudes() {
  const conexion = useConexion();
  const navegar = useNavigate();
  const [pestania, setPestania] = useState<Pestania>('todas');
  const [anio, setAnio] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { datos, error, cargando, recargar } = useCarga<Respuesta | null>(() => (conexion ? cargarTodas(pestania, anio) : Promise.resolve(null)), [pestania, anio, conexion]);

  const filtradas = (datos?.solicitudes ?? []).filter((s) => `${s.numeroSua}-${s.anio}`.includes(busqueda.trim()));
  const pag = usePaginado(filtradas, POR_PAGINA, [pestania, anio, busqueda]);
  const resumen = pag.resumen ? `${pag.resumen} solicitudes` : '';

  return (
    <Pantalla titulo="Solicitudes" ancho>
      <Pestanas
        etiqueta="Estado de las solicitudes"
        valor={pestania}
        onCambio={setPestania}
        opciones={[
          { valor: 'todas', texto: 'Todas' },
          { valor: 'pendientes', texto: 'Pendientes' },
          { valor: 'revision', texto: 'En revisión' },
        ]}
      />
      {!conexion ? (
        <Aviso tipo="advertencia" titulo="Sin señal">
          El listado necesita señal. Las solicitudes de tu ruta están disponibles en <Link to="/rutas">Rutas</Link>.
        </Aviso>
      ) : (
        <>
          <div className="barra-busqueda">
            <div className="buscador">
              <span aria-hidden>🔍</span>
              <label htmlFor="buscar-sua" className="solo-lector">
                Buscar por número de SUA
              </label>
              <input id="buscar-sua" type="search" placeholder="Buscar por número de SUA…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <label htmlFor="filtro-anio" className="solo-lector">
              Año
            </label>
            <select id="filtro-anio" className="entrada" value={anio} onChange={(e) => setAnio(e.target.value)}>
              <option value="">Todos</option>
              {datos?.anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {datos && !datos.sua.suaDisponible && (
            <Aviso tipo="advertencia" titulo="No se pueden obtener las solicitudes nuevas del SUA en este momento">
              Se muestran las solicitudes ya guardadas.
              <div style={{ marginTop: 8 }}>
                <button className="boton chico contorno" onClick={() => void recargar()}>
                  Reintentar
                </button>
              </div>
            </Aviso>
          )}
          {error && <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />}
          {cargando && !datos && <Cargando />}
          {datos && filtradas.length === 0 && (
            <Vacio>{busqueda.trim() ? 'Ninguna solicitud coincide con esa búsqueda.' : 'No hay solicitudes para mostrar con este filtro. Cuando el SUA derive nuevas, van a aparecer acá.'}</Vacio>
          )}

          {filtradas.length > 0 && (
            <>
              <div className="lista-tarjetas solo-celular">
                {pag.visibles.map((s) => (
                  <Link key={`${s.numeroSua}-${s.anio}`} to={`/solicitudes/${s.numeroSua}/${s.anio}`} className="tarjeta">
                    <div className="fila-titulo">
                      <b>
                        SUA {s.numeroSua}-{s.anio}
                      </b>
                      <InsigniaEstado estado={s.estado} />
                    </div>
                    <div className="linea">
                      {limpiar(s.direccion)} — Distrito {s.distrito}
                    </div>
                    <div className="linea suave">{s.descripcion}</div>
                    <div className="etiquetas">
                      <span className="etiqueta">Prioridad {s.prioridad}</span>
                      {s.sinUbicar && <span className="etiqueta naranja">Sin ubicar en el mapa</span>}
                    </div>
                  </Link>
                ))}
              </div>
              <table className="tabla solo-escritorio">
                <thead>
                  <tr>
                    <th>SUA</th>
                    <th>Estado</th>
                    <th>Dirección</th>
                    <th>Distrito</th>
                    <th>Prioridad</th>
                    <th>Derivada el</th>
                  </tr>
                </thead>
                <tbody>
                  {pag.visibles.map((s) => (
                    <tr key={`${s.numeroSua}-${s.anio}`} className="clicable" onClick={() => navegar(`/solicitudes/${s.numeroSua}/${s.anio}`)}>
                      <td>
                        <Link to={`/solicitudes/${s.numeroSua}/${s.anio}`}>
                          <b>
                            {s.numeroSua}-{s.anio}
                          </b>
                        </Link>
                      </td>
                      <td>
                        <InsigniaEstado estado={s.estado} />
                      </td>
                      <td>
                        {limpiar(s.direccion)} {s.sinUbicar && <span className="etiqueta naranja">Sin ubicar en el mapa</span>}
                      </td>
                      <td>{s.distrito}</td>
                      <td>{s.prioridad}</td>
                      <td>{fecha(s.fechaDerivacion)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="resumen-lista pie-lista">{resumen}</p>
              <Paginacion pagina={pag.pagina} paginas={pag.paginas} onCambio={pag.setPagina} />
            </>
          )}
        </>
      )}
    </Pantalla>
  );
}
