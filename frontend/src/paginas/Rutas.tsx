// Pantalla 3 · Generar ruta (sin ruta activa) y Ruta de hoy (con ruta activa).
// Sigue el wireframe 03-generar-ruta y diseño-ui.md, Pantalla 3.
// Cubre RF-14 a RF-19, RF-42, RF-47 a RF-49, CU-04, CU-05, HU-04, HU-05 y, para la parte sin señal,
// RF-31 / HU-09 criterio 1 (copia de la ruta y de cada solicitud en el captor).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi, get, post } from '../api/cliente';
import { COLOR_PRIORIDAD, Mapa } from '../componentes/Mapa';
import { Aviso, Cargando, ErrorConReintento, fecha, InsigniaEstado, mensajeDe, Modal, Pantalla, type EstadoSolicitud } from '../componentes/ui';
import { claveSolicitud, guardarEnCache, leerDeCache } from '../offline/cache';
import { useConexion } from '../offline/conexion';
import '../estilos/rutas.css';

export interface Parada {
  orden: number;
  numeroSua: string;
  anio: number;
  direccion: string;
  distrito: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  lat: number | null;
  lng: number | null;
  liberada: boolean;
  motivoLiberacion: string | null;
  fechaDerivacion: string;
}

export interface RutaDetalle {
  idRuta: number;
  tipo: 'Normal' | 'Tormenta';
  estado: string;
  fecha: string;
  venceEn: string;
  vigente: boolean;
  modo: 'Caminando' | 'Vehiculo';
  distanciaTotalM: number | null;
  duracionTotalS: number | null;
  ordenOptimizado: boolean;
  geometria: [number, number][] | null;
  sede: { lat: number; lng: number; direccion: string };
  paradas: Parada[];
}

const PRIORIDADES = ['Alta', 'Media', 'Baja'] as const;
const MODOS = { Caminando: 'a pie', Vehiculo: 'en vehículo' } as const;
const ETIQUETA_MODO = { Caminando: '🚶 A pie', Vehiculo: '🚗 Vehículo' } as const;

const distancia = (m: number | null) => (m == null ? '—' : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const duracion = (s: number | null) => {
  if (s == null) return '—';
  const min = Math.round(s / 60);
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
};
const sinCiudad = (d: string) => d.replace(', Rosario, Santa Fe', '');

/** Después de las 18:00 la ruta que se genera es para la jornada siguiente. */
export const jornada = () =>
  Number(new Intl.DateTimeFormat('es-AR', { hour: 'numeric', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())) >= 18 ? 'mañana' : 'hoy';

/** Guarda la ruta y el detalle de cada solicitud para dictaminar sin señal (RF-31, HU-09 criterio 1). */
async function copiarParaTrabajarSinSenal(ruta: RutaDetalle) {
  await guardarEnCache('ruta-activa', ruta).catch(() => undefined);
  await Promise.all(
    ruta.paradas.map(async (p) => {
      try {
        await guardarEnCache(claveSolicitud(p.numeroSua, p.anio), await get(`/solicitudes/${p.numeroSua}/${p.anio}`));
      } catch {
        /* si una no se pudo bajar, las demás quedan guardadas */
      }
    }),
  );
}

// ── Pantalla ────────────────────────────────────────────────────────────────────────────────────

interface Activa {
  ruta: RutaDetalle | null;
  desdeCache: boolean;
}

export function Rutas() {
  const conexion = useConexion();
  const [activa, setActiva] = useState<Activa | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await get<{ ruta: RutaDetalle | null }>('/rutas/activa');
      setActiva({ ruta: r.ruta, desdeCache: false });
      if (!r.ruta) await guardarEnCache('ruta-activa', null).catch(() => undefined);
    } catch (e) {
      // Sin señal: se muestra la copia guardada en el captor (HU-09 criterio 1).
      const guardada = await leerDeCache<RutaDetalle | null>('ruta-activa').catch(() => null);
      if (guardada) setActiva({ ruta: guardada, desdeCache: true });
      // Sin señal y sin ruta guardada: el formulario se muestra deshabilitado con el aviso (RF-19, CU-04 E1).
      else if (e instanceof ErrorApi && e.codigo === 'SIN_CONEXION') setActiva({ ruta: null, desdeCache: true });
      else setError(mensajeDe(e));
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar, conexion]);

  if (error)
    return (
      <Pantalla titulo="Ruta de hoy">
        <ErrorConReintento mensaje={error} onReintentar={() => void cargar()} />
      </Pantalla>
    );
  if (!activa)
    return (
      <Pantalla titulo="Ruta de hoy">
        <Cargando />
      </Pantalla>
    );
  return activa.ruta ? <RutaActiva ruta={activa.ruta} desdeCache={activa.desdeCache} alRestablecer={() => void cargar()} /> : <GenerarRuta alGenerar={() => void cargar()} />;
}

// ── Ruta activa ─────────────────────────────────────────────────────────────────────────────────

export function RutaActiva({
  ruta,
  alRestablecer,
  aviso,
  desdeCache = false,
}: {
  ruta: RutaDetalle;
  alRestablecer: () => void;
  aviso?: string | null;
  desdeCache?: boolean;
}) {
  const conexion = useConexion();
  const [confirmando, setConfirmando] = useState(false);
  const [restableciendo, setRestableciendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tormenta = ruta.tipo === 'Tormenta';
  const pendientes = ruta.paradas.filter((p) => p.estado !== 'Dictaminada').length;
  const tocado = useRef(false);

  // Cada vez que se carga la ruta con señal se deja la copia para trabajar sin señal.
  useEffect(() => {
    if (!desdeCache) void copiarParaTrabajarSinSenal(ruta);
  }, [ruta, desdeCache]);

  async function restablecer() {
    if (tocado.current) return; // doble toque (arquitectura §7.3)
    tocado.current = true;
    setRestableciendo(true);
    try {
      await post(`/rutas/${ruta.idRuta}/restablecer`);
      await guardarEnCache('ruta-activa', null).catch(() => undefined);
      setConfirmando(false);
      alRestablecer();
    } catch (e) {
      setError(mensajeDe(e));
      setConfirmando(false);
    } finally {
      tocado.current = false;
      setRestableciendo(false);
    }
  }

  const puedeRestablecer = conexion && !desdeCache;
  const enlacesParada = (p: Parada) => (
    <div className="acciones-parada">
      <Link className="boton chico contorno" to={`/solicitudes/${p.numeroSua}/${p.anio}`}>
        Ver detalle
      </Link>
      {p.estado !== 'Dictaminada' && (
        <Link className="boton chico" to={`/dictaminar/${p.numeroSua}/${p.anio}`}>
          Dictaminar
        </Link>
      )}
    </div>
  );

  return (
    <Pantalla titulo={tormenta ? 'Ruta de tormenta' : 'Ruta de hoy'} subtitulo={`${MODOS[ruta.modo]} · jornada del ${fecha(ruta.fecha)}`} tono={tormenta ? 'tormenta' : undefined} ancho>
      {desdeCache && <Aviso tipo="advertencia">Sin señal: mostrando la ruta guardada en el captor</Aviso>}
      {aviso && <Aviso tipo="advertencia">{aviso}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!ruta.ordenOptimizado && (
        <Aviso tipo="advertencia" titulo="Orden sin optimizar">
          El servicio de mapas no respondió al generar la ruta: las solicitudes se eligieron por antigüedad y el orden de visita no está optimizado.
        </Aviso>
      )}
      {ruta.ordenOptimizado && <p className="resumen-lista">Orden de visita optimizado.</p>}

      <div className="cabecera-ruta">
        <div>
          <b>{MODOS[ruta.modo]}</b>
          <span>Modo</span>
        </div>
        <div>
          <b>{ruta.paradas.length}</b>
          <span>Solicitudes</span>
        </div>
        <div>
          <b>{distancia(ruta.distanciaTotalM)}</b>
          <span>Distancia est.</span>
        </div>
        <div>
          <b>{duracion(ruta.duracionTotalS)}</b>
          <span>Tiempo est.</span>
        </div>
      </div>

      <div className="seccion">
        <div className="titulo-seccion">Recorrido</div>
        <Mapa
          alto
          sede={ruta.sede}
          trazado={ruta.geometria}
          puntos={ruta.paradas
            .filter((p) => p.lat != null)
            .map((p) => ({
              id: `${p.numeroSua}-${p.anio}`,
              lat: p.lat!,
              lng: p.lng!,
              numero: p.orden,
              color: tormenta ? COLOR_PRIORIDAD.Tormenta : COLOR_PRIORIDAD[p.prioridad],
              apagado: p.estado === 'Dictaminada',
            }))}
        />
        <p className="nota-pie">Parte de la sede de Parques y Paseos ({ruta.sede.direccion}).</p>
      </div>

      <h2 style={{ margin: '4px 0 8px' }}>Orden de visita</h2>
      <div className="lista solo-celular">
        {ruta.paradas.map((p) => (
          <div key={`${p.numeroSua}-${p.anio}`} className={`tarjeta parada${p.estado === 'Dictaminada' ? ' tenue' : ''}`}>
            <div className="fila-parada">
              <span className="orden">{p.orden}</span>
              <div className="cuerpo-parada">
                <div className="fila-titulo">
                  <Link to={`/solicitudes/${p.numeroSua}/${p.anio}`}>
                    <b>
                      SUA {p.numeroSua}-{p.anio}
                    </b>
                  </Link>
                  <InsigniaEstado estado={p.estado as EstadoSolicitud} />
                </div>
                <div className="linea">{sinCiudad(p.direccion)}</div>
                <div className="linea suave">
                  {p.distrito} · Prioridad {p.prioridad}
                  {p.estado === 'Dictaminada' ? ' · Ya dictaminada' : ''}
                </div>
                {enlacesParada(p)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <table className="tabla solo-escritorio">
        <thead>
          <tr>
            <th>Orden</th>
            <th>SUA</th>
            <th>Dirección</th>
            <th>Distrito</th>
            <th>Prioridad</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {ruta.paradas.map((p) => (
            <tr key={`${p.numeroSua}-${p.anio}`}>
              <td>{p.orden}</td>
              <td>
                <Link to={`/solicitudes/${p.numeroSua}/${p.anio}`}>
                  {p.numeroSua}-{p.anio}
                </Link>
              </td>
              <td>{sinCiudad(p.direccion)}</td>
              <td>{p.distrito}</td>
              <td>{p.prioridad}</td>
              <td>
                <InsigniaEstado estado={p.estado as EstadoSolicitud} />
              </td>
              <td>{enlacesParada(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="nota-pie">Las solicitudes sin dictaminar se liberan solas a las 18:00 (RF-17).</p>
      {!conexion && <Aviso tipo="advertencia">Restablecer la ruta requiere conexión.</Aviso>}
      <div className="pie-ruta">
        <button className="boton ancho peligro" disabled={!puedeRestablecer} onClick={() => setConfirmando(true)}>
          ↺ Restablecer
        </button>
      </div>

      {confirmando && (
        <Modal titulo="Restablecer la ruta" onCerrar={() => setConfirmando(false)}>
          {pendientes === 0 ? (
            <p className="texto-modal">Todas las solicitudes de esta ruta ya están dictaminadas: no hay nada para liberar. Restablecer cierra la ruta y vuelve a generar una.</p>
          ) : (
            <p className="texto-modal">
              Se descarta la ruta completa y se liberan las {pendientes} solicitudes sin dictaminar, que vuelven a estar disponibles para otros ingenieros. Los dictámenes ya firmados no cambian.
            </p>
          )}
          <div className="acciones-modal">
            <button className="boton contorno" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="boton" disabled={restableciendo} onClick={() => void restablecer()}>
              {restableciendo ? 'Restableciendo…' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}

// ── Generar ruta ────────────────────────────────────────────────────────────────────────────────

interface VistaPrevia {
  cumplen: number;
  porPrioridad: Record<string, number>;
  entrarian: number;
  sinUbicar: number;
  /** Cumplen los criterios pero están en rutas de otros ingenieros (CU-04 E3). */
  reservadasPorOtros: number;
  puntos: { id: string; lat: number; lng: number; prioridad: string }[];
}

interface Resultado {
  ruta: RutaDetalle;
  aviso: string | null;
  cupos: { prioridad: string; pedidas: number; incluidas: number }[];
}

function GenerarRuta({ alGenerar }: { alGenerar: () => void }) {
  const conexion = useConexion();
  const [distritos, setDistritos] = useState<string[]>([]);
  const [distrito, setDistrito] = useState('');
  const [cupos, setCupos] = useState<Record<string, number>>({ Alta: 0, Media: 0, Baja: 0 });
  const [zona, setZona] = useState<{ lat: number; lng: number }[]>([]);
  const [modo, setModo] = useState<'Caminando' | 'Vehiculo' | null>(null);
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const tocado = useRef(false);

  useEffect(() => {
    get<{ distritos: string[] }>('/catalogos')
      .then((c) => setDistritos(c.distritos))
      .catch(() => undefined);
  }, []);

  const criterios = useMemo(
    () => ({
      distrito: distrito || null,
      cupos: Object.fromEntries(PRIORIDADES.filter((p) => cupos[p] > 0).map((p) => [p, cupos[p]])),
      zona: zona.length >= 3 ? zona : null,
      modo: modo ?? 'Caminando',
    }),
    [distrito, cupos, zona, modo],
  );

  useEffect(() => {
    if (!conexion) return;
    const t = setTimeout(() => {
      post<VistaPrevia>('/rutas/vista-previa', criterios)
        .then((v) => {
          setVista(v);
          setError(null);
        })
        .catch((e) => setError(mensajeDe(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [criterios, conexion]);

  async function generar() {
    if (tocado.current) return; // doble toque (arquitectura §7.3)
    tocado.current = true;
    setGenerando(true);
    setError(null);
    try {
      setResultado(await post<Resultado>('/rutas', criterios));
    } catch (e) {
      setError(mensajeDe(e));
      setConfirmando(false);
    } finally {
      tocado.current = false;
      setGenerando(false);
    }
  }

  if (resultado) {
    const faltantes = resultado.cupos.filter((c) => c.incluidas < c.pedidas);
    const avisos = [resultado.aviso, ...faltantes.map((f) => `Pediste ${f.pedidas} de prioridad ${f.prioridad} y había ${f.incluidas}.`)].filter(Boolean).join(' ');
    return (
      <RutaActiva
        ruta={resultado.ruta}
        aviso={avisos || null}
        alRestablecer={() => {
          setResultado(null);
          setConfirmando(false);
          alGenerar();
        }}
      />
    );
  }

  const sinCandidatas = vista != null && vista.entrarian === 0;
  const puedeGenerar = !!modo && conexion && !!vista && !sinCandidatas && !generando;
  const cambiarCupo = (p: string, d: number) => setCupos((c) => ({ ...c, [p]: Math.max(0, Math.min(50, c[p] + d)) }));

  return (
    <Pantalla titulo="Generar ruta" volver>
      <p className="resumen-lista">Combiná los criterios que necesites. El modo de desplazamiento es obligatorio.</p>
      {!conexion && <Aviso tipo="advertencia">Generar una ruta requiere conexión</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      <div className="seccion">
        <div className="titulo-seccion">
          <label htmlFor="distrito">Distrito</label>
          <span className="opcional">opcional</span>
        </div>
        <select id="distrito" className="entrada" value={distrito} onChange={(e) => setDistrito(e.target.value)}>
          <option value="">Sin filtrar por distrito</option>
          {distritos.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="seccion" role="group" aria-label="Cantidad por prioridad">
        <div className="titulo-seccion">Cantidad por prioridad</div>
        <div className="cajas-prioridad">
          {PRIORIDADES.map((p) => (
            <div key={p} className={`caja-prioridad ${p.toLowerCase()}`}>
              <div className="rotulo-prioridad">{p}</div>
              <div className="numero" role="status" aria-label={`Cantidad de prioridad ${p}`}>
                {cupos[p]}
              </div>
              <div className="controles">
                <button type="button" aria-label={`Menos ${p}`} disabled={cupos[p] === 0} onClick={() => cambiarCupo(p, -1)}>
                  −
                </button>
                <button type="button" aria-label={`Más ${p}`} onClick={() => cambiarCupo(p, 1)}>
                  +
                </button>
              </div>
              <div className="disp">{vista ? `${vista.porPrioridad[p] ?? 0} disponibles` : ' '}</div>
            </div>
          ))}
        </div>
        <p className="nota-pie">Si no pedís ninguna cantidad, entran todas las que cumplen.</p>
      </div>

      <div className="seccion">
        <div className="titulo-seccion">
          <span>Zona en el mapa</span>
          <span className="opcional">opcional</span>
        </div>
        <Mapa
          alto
          encuadrar={zona.length === 0}
          zona={zona}
          alHacerClic={(lat, lng) => setZona((z) => [...z, { lat, lng }])}
          puntos={(vista?.puntos ?? []).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, color: COLOR_PRIORIDAD[p.prioridad], etiqueta: `SUA ${p.id} · ${p.prioridad}` }))}
        />
        <div className="leyenda-mapa">
          {PRIORIDADES.map((p) => (
            <span key={p}>
              <i style={{ background: COLOR_PRIORIDAD[p] }} />
              {p}
            </span>
          ))}
        </div>
        <div className="barra-zona">
          <span>
            {zona.length === 0
              ? 'Tocá el mapa para dibujar una zona (mínimo 3 puntos).'
              : zona.length < 3
                ? `${zona.length} punto(s): faltan ${3 - zona.length} para cerrar la zona.`
                : `Zona de ${zona.length} puntos.`}
          </span>
          <button type="button" className="boton chico contorno" disabled={zona.length === 0} onClick={() => setZona([])}>
            Borrar zona
          </button>
        </div>
      </div>

      <div className="seccion">
        <div className="titulo-seccion">
          <span id="rotulo-modo">Modo de desplazamiento</span>
          <span className="opcional">obligatorio</span>
        </div>
        <div className="modo-toggle" role="group" aria-labelledby="rotulo-modo">
          {(['Caminando', 'Vehiculo'] as const).map((m) => (
            <button key={m} type="button" className="boton" aria-pressed={modo === m} onClick={() => setModo(m)}>
              {ETIQUETA_MODO[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="resumen-vivo" role="status">
        {vista ? `${vista.cumplen} solicitudes cumplen estos criterios` : 'Calculando…'}
        {vista && vista.entrarian !== vista.cumplen && <small>Entrarían {vista.entrarian} en tu ruta.</small>}
        {vista && vista.sinUbicar > 0 && <small>{vista.sinUbicar} sin ubicar en el mapa quedan afuera.</small>}
      </div>
      {sinCandidatas && vista.reservadasPorOtros > 0 ? (
        <Aviso tipo="advertencia">
          Las {vista.reservadasPorOtros} solicitudes que cumplen estos criterios ya están reservadas en rutas de otros ingenieros. Ampliá los criterios.
        </Aviso>
      ) : (
        sinCandidatas && <Aviso tipo="advertencia">No se encontraron solicitudes con estos criterios: modificalos.</Aviso>
      )}

      <button className="boton ancho" disabled={!puedeGenerar} onClick={() => setConfirmando(true)}>
        Generar ruta
      </button>
      {!modo && <p className="nota-pie centro">Elegí el modo de desplazamiento para habilitar el botón.</p>}

      {confirmando && modo && vista && (
        <Modal titulo="Confirmar ruta" onCerrar={() => !generando && setConfirmando(false)}>
          <p className="texto-modal">
            Se reservarán {vista.entrarian} solicitudes para tu ruta de {jornada()}, {MODOS[modo]}.
          </p>
          <p className="texto-modal" style={{ marginTop: 8, color: 'var(--tormenta)' }}>
            Ninguna estará disponible para otros ingenieros.
          </p>
          <div className="acciones-modal">
            <button className="boton contorno" disabled={generando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button className="boton" disabled={generando} onClick={() => void generar()}>
              {generando ? 'Reservando…' : 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}
