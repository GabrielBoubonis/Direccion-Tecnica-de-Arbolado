// Pantalla · Detalle de una solicitud (sin wireframe propio, mismo lenguaje visual que el listado).
// Cubre CU-03 paso 3, CU-06 paso 1, CU-08 (PDF), CU-09 (dictamen anterior), RF-26 a RF-29 (sin datos
// del vecino) y RF-59 (dos dictámenes en espera). Sin señal lee la copia del captor.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { descargar, get } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, fecha, fechaHora, InsigniaEstado, mensajeDe, Modal, Pantalla, textoEstado, useCarga, type EstadoSolicitud } from '../componentes/ui';
import { Mapa } from '../componentes/Mapa';
import { useSesion } from '../estado/sesion';
import { claveSolicitud, guardarEnCache, leerDeCache } from '../offline/cache';
import { useConexion } from '../offline/conexion';
import { BloquesDictamen, type Dictamen } from './DetalleDictamen';
import '../estilos/solicitudes.css';

interface Detalle {
  numeroSua: string;
  anio: number;
  estado: EstadoSolicitud;
  direccion: string;
  distrito: string;
  prioridad: string;
  descripcion: string;
  esTormenta: boolean;
  lat: number | null;
  lng: number | null;
  sinUbicar: boolean;
  geoError: string | null;
  fechaDerivacion: string;
  enConflicto: boolean;
  derivaciones: { fecha: string; motivo: string }[];
  dictamenes: { idDictamen: number; nombreUsuario: string; fechaEmision: string; vigente: boolean | null; intervencion: string; especie: string }[];
}

const textoVigencia = (v: boolean | null) => (v === true ? 'Vigente' : v === false ? 'No vigente' : 'En espera');

/** Dictámenes anteriores con su contenido completo, de solo lectura (CU-09, E1: el historial completo). */
function DictamenesAnteriores({ ids, onCerrar }: { ids: number[]; onCerrar: () => void }) {
  const { datos, error, cargando } = useCarga(() => Promise.all(ids.map((i) => get<Dictamen>(`/dictamenes/${i}`))), [ids.join(',')]);
  return (
    <Modal titulo={ids.length > 1 ? 'Historial de dictámenes' : 'Dictamen anterior'} onCerrar={onCerrar}>
      <p className="texto-modal">Solo lectura: no se precarga en el dictamen nuevo.</p>
      {cargando && <Cargando />}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {datos?.map((d) => (
        <div key={d.idDictamen} style={{ marginTop: 12 }}>
          <p className="chico">
            <b>Dictamen N.° {d.idDictamen}</b> · firmó <b>{d.nombreUsuario}</b> · {fechaHora(d.fechaEmision)} · {textoVigencia(d.vigente)}
          </p>
          <BloquesDictamen d={d} />
        </div>
      ))}
      <div className="acciones-modal">
        <button className="boton contorno" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}

export function DetalleSolicitud() {
  const { numero = '', anio = '' } = useParams();
  const conexion = useConexion();
  const navegar = useNavigate();
  const rol = useSesion()?.usuario.rol;
  const [verAnterior, setVerAnterior] = useState(false);
  const [errorPdf, setErrorPdf] = useState<string | null>(null);

  const { datos: s, error, cargando, recargar } = useCarga<Detalle>(async () => {
    if (conexion) {
      const d = await get<Detalle>(`/solicitudes/${numero}/${anio}`);
      await guardarEnCache(claveSolicitud(numero, anio), d).catch(() => undefined);
      return d;
    }
    const copia = await leerDeCache<Detalle>(claveSolicitud(numero, anio));
    if (!copia) throw new Error('Esta solicitud no está guardada en el captor: necesitás señal para verla.');
    return copia;
  }, [numero, anio, conexion]);

  const titulo = `SUA ${numero}-${anio}`;
  if (error)
    return (
      <Pantalla titulo={titulo} volver="/solicitudes">
        <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
      </Pantalla>
    );
  if (cargando || !s)
    return (
      <Pantalla titulo={titulo} volver="/solicitudes">
        <Cargando />
      </Pantalla>
    );

  const esperando = s.dictamenes.filter((d) => d.vigente === null).length;
  const conflicto = s.enConflicto || esperando > 1;
  const puedeDictaminar = (rol === 'Operador' || rol === 'Jefe') && (s.estado === 'Pendiente' || s.estado === 'PendienteRevision') && !conflicto;
  const anteriores = s.dictamenes.filter((d) => d.vigente !== null);
  const idsAnteriores = anteriores.map((d) => d.idDictamen);
  const pdf = (id: number) =>
    void descargar(`/dictamenes/${id}/pdf`, `dictamen-${s.numeroSua}-${s.anio}-${id}.pdf`).then(
      () => setErrorPdf(null),
      (e) => setErrorPdf(`No se pudo descargar el PDF del dictamen N.° ${id}. ${mensajeDe(e)}`),
    );

  return (
    <Pantalla titulo={titulo} subtitulo={textoEstado(s.estado)} volver={s.esTormenta ? '/tormenta' : '/solicitudes'}>
      {!conexion && <Aviso tipo="neutro">Sin señal: se muestra la copia guardada en el captor.</Aviso>}
      {errorPdf && <Aviso tipo="error">{errorPdf}</Aviso>}
      {conflicto && (
        <Aviso tipo="advertencia" titulo="Dos dictámenes en espera">
          {rol === 'Jefe' ? (
            <>
              Hay dos dictámenes para el mismo caso.
              <div style={{ marginTop: 8 }}>
                <Link className="boton chico" to={`/solicitudes/${s.numeroSua}/${s.anio}/conflicto`}>
                  Elegir el dictamen vigente
                </Link>
              </div>
            </>
          ) : (
            'Esperando que un Jefe elija el dictamen vigente'
          )}
        </Aviso>
      )}

      <section className="tarjeta bloque-dictamen">
        <h2>Detalle técnico</h2>
        <dl className="datos-lista">
          <dt>Estado</dt>
          <dd>
            <InsigniaEstado estado={s.estado} />
          </dd>
          <dt>Dirección</dt>
          <dd>{s.direccion.replace(', Rosario, Santa Fe', '')}</dd>
          <dt>Distrito</dt>
          <dd>{s.distrito}</dd>
          <dt>Prioridad</dt>
          <dd>{s.prioridad}</dd>
          <dt>Descripción</dt>
          <dd>{s.descripcion}</dd>
          <dt>Derivada el</dt>
          <dd>{fecha(s.fechaDerivacion)}</dd>
          <dt>Tormenta</dt>
          <dd>{s.esTormenta ? 'Sí' : 'No'}</dd>
        </dl>
      </section>

      <section className="tarjeta bloque-dictamen">
        <h2>Ubicación</h2>
        {s.lat != null && s.lng != null ? (
          conexion ? (
            <Mapa puntos={[{ id: 'sol', lat: s.lat, lng: s.lng, etiqueta: s.direccion }]} />
          ) : (
            <p className="suave">
              Coordenadas: {s.lat.toFixed(5)}, {s.lng.toFixed(5)} (el mapa necesita señal).
            </p>
          )
        ) : (
          <Aviso tipo="advertencia" titulo="Sin ubicar en el mapa">
            Sin ubicar: el sistema reintenta solo cada hora.
          </Aviso>
        )}
      </section>

      <section className="tarjeta bloque-dictamen">
        <h2>Historial de derivaciones</h2>
        {s.derivaciones.map((d, i) => (
          <div key={i} className="registro chico">
            <b>{fecha(d.fecha)}</b> · {d.motivo}
          </div>
        ))}
      </section>

      <section className="tarjeta bloque-dictamen">
        <h2>Historial de dictámenes</h2>
        {s.dictamenes.length === 0 && <p className="suave">Todavía no tiene dictámenes.</p>}
        {s.dictamenes.map((d) => (
          <div key={d.idDictamen} className="registro">
            <div className="fila-titulo" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <b>Dictamen N.° {d.idDictamen}</b>
              <span className={`etiqueta ${d.vigente === true ? 'verde' : d.vigente === null ? 'naranja' : ''}`}>{textoVigencia(d.vigente)}</span>
            </div>
            <div className="chico">
              Firmó {d.nombreUsuario} · {fechaHora(d.fechaEmision)}
            </div>
            <div className="chico suave">
              {d.intervencion} · {d.especie}
            </div>
            <div className="acciones-registro">
              <button className="boton chico contorno" onClick={() => navegar(`/dictamenes/${d.idDictamen}`)} disabled={!conexion}>
                Ver
              </button>
              <button className="boton chico contorno" aria-label={`Descargar PDF del dictamen N.° ${d.idDictamen}`} onClick={() => pdf(d.idDictamen)} disabled={!conexion}>
                Descargar PDF
              </button>
            </div>
          </div>
        ))}
        {s.estado === 'PendienteRevision' && anteriores.length > 0 && (
          <button className="boton chico contorno separado" style={{ marginTop: 10 }} onClick={() => setVerAnterior(true)} disabled={!conexion}>
            Ver dictamen anterior
          </button>
        )}
      </section>

      {puedeDictaminar && (
        <div className="pie-acciones">
          <Link className="boton mayus" to={`/dictaminar/${s.numeroSua}/${s.anio}`}>
            Dictaminar
          </Link>
        </div>
      )}
      {verAnterior && <DictamenesAnteriores ids={idsAnteriores} onCerrar={() => setVerAnterior(false)} />}
    </Pantalla>
  );
}
