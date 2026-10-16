// Pantalla · Detalle de un dictamen firmado (sin wireframe propio, mismo lenguaje visual). Cubre RF-22,
// RF-26 (PDF), RF-53 (verificar integridad) y HU-07: contenido por los 5 pasos del formulario, fotos y
// datos de la firma.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { descargar, get, urlFoto } from '../api/cliente';
import { Aviso, Cargando, fechaHora, mensajeDe, Pantalla, useCarga } from '../componentes/ui';
import { Mapa } from '../componentes/Mapa';
import '../estilos/solicitudes.css';

export interface Dictamen {
  idDictamen: number;
  numeroSua: string;
  anio: number;
  nombreUsuario: string;
  fechaEmision: string;
  notaNumero: number | null;
  expedienteNumero: number | null;
  domicilioEjemplar: string;
  latitudEjemplar: number;
  longitudEjemplar: number;
  referenciaUbicacion: string | null;
  distanciaMedianeraReferencia: number | null;
  especie: string;
  cantidadFrente: number;
  nivelDanoVereda: string | null;
  esExtraccion: boolean;
  perimetroTronco: number | null;
  motivoExtraccion: string | null;
  esSinTrabajo: boolean;
  motivoSinTrabajo: string | null;
  complejidad: string;
  urgente: boolean;
  arbolFrenteGarage: boolean;
  mediaTension: boolean;
  deOficio: boolean;
  plantar: string | null;
  nivelPrioridad: string;
  observaciones: string | null;
  vigente: boolean | null;
  vigenteElegidoPor: string | null;
  vigenteElegidoEn: string | null;
  hashFirma: string;
  estadoSincronizacion: string;
  firmadoSinConexion?: boolean;
  enviadoSuaEn: string | null;
  trabajosAereos: { tipoTrabajo: string }[];
  trabajosSubterraneos: { tipoTrabajo: string; distanciaBorde: number | null }[];
  fotografias: { archivoReferencia: string; orden: number }[];
}

const si = (b: boolean) => (b ? 'Sí' : 'No');
const o = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

function Bloque({ titulo, filas }: { titulo: string; filas: [string, string][] }) {
  return (
    <section className="tarjeta bloque-dictamen">
      <h2>{titulo}</h2>
      <dl className="datos-lista">
        {filas.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Contenido completo del dictamen por los 5 pasos del formulario (también lo usa el modal de DetalleSolicitud). */
export function BloquesDictamen({ d }: { d: Dictamen }) {
  const fotos = [...d.fotografias].sort((a, b) => a.orden - b.orden);
  return (
    <>
      <Bloque
        titulo="1 · Datos del ejemplar y ubicación"
        filas={[
          ['Nota N.°', o(d.notaNumero)],
          ['Expediente N.°', o(d.expedienteNumero)],
          ['Domicilio del ejemplar', d.domicilioEjemplar],
          ['Referencia de ubicación', o(d.referenciaUbicacion)],
          ['Especie', d.especie],
          ['Distancia a medianera / referencia (m)', o(d.distanciaMedianeraReferencia)],
          ['Cantidad de ejemplares al frente', String(d.cantidadFrente)],
        ]}
      />
      <section className="tarjeta bloque-dictamen">
        <h2>Ubicación del ejemplar</h2>
        <Mapa puntos={[{ id: 'ej', lat: d.latitudEjemplar, lng: d.longitudEjemplar, etiqueta: d.domicilioEjemplar }]} />
      </section>
      <Bloque
        titulo="2 · Diagnóstico"
        filas={[
          ['Nivel de daño en vereda', o(d.nivelDanoVereda)],
          ['Extracción', d.esExtraccion ? `Sí · ${o(d.motivoExtraccion)} · perímetro del tronco ${o(d.perimetroTronco)} m` : 'No'],
          ['Sin trabajo', d.esSinTrabajo ? `Sí · ${o(d.motivoSinTrabajo)}` : 'No'],
        ]}
      />
      <Bloque
        titulo="3 · Intervención"
        filas={[
          ['Trabajos subterráneos', d.trabajosSubterraneos.map((t) => (t.distanciaBorde != null ? `${t.tipoTrabajo} (${t.distanciaBorde} m)` : t.tipoTrabajo)).join(', ') || 'Ninguno'],
          ['Trabajos aéreos', d.trabajosAereos.map((t) => t.tipoTrabajo).join(', ') || 'Ninguno'],
        ]}
      />
      <Bloque
        titulo="4 · Información adicional"
        filas={[
          ['Complejidad de la intervención', d.complejidad],
          ['Urgente', si(d.urgente)],
          ['Árbol frente a garage', si(d.arbolFrenteGarage)],
          ['Media tensión', si(d.mediaTension)],
          ['De oficio', si(d.deOficio)],
          ['Plantar', o(d.plantar)],
        ]}
      />
      <section className="tarjeta bloque-dictamen">
        <h2>Fotografías del ejemplar</h2>
        <div className="miniaturas">
          {fotos.map((f) => (
            <a key={f.archivoReferencia} href={urlFoto(f.archivoReferencia)} target="_blank" rel="noreferrer">
              <img src={urlFoto(f.archivoReferencia)} alt={`Fotografía ${f.orden}`} />
            </a>
          ))}
          {fotos.length === 0 && <span className="suave">Sin fotografías.</span>}
        </div>
      </section>
      <Bloque titulo="5 · Observaciones" filas={[['Prioridad de la intervención', d.nivelPrioridad], ['Observaciones', o(d.observaciones)]]} />
    </>
  );
}

export function DetalleDictamen() {
  const { id } = useParams();
  const { datos: d, error, cargando } = useCarga(() => get<Dictamen>(`/dictamenes/${id}`), [id]);
  const [verificacion, setVerificacion] = useState<{ coincide: boolean; recalculado: string } | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  if (error)
    return (
      <Pantalla titulo="Dictamen" volver>
        <Aviso tipo="error">{error}</Aviso>
      </Pantalla>
    );
  if (cargando || !d)
    return (
      <Pantalla titulo="Dictamen" volver>
        <Cargando />
      </Pantalla>
    );

  async function verificar() {
    setErrorAccion(null);
    try {
      setVerificacion(await get<{ coincide: boolean; recalculado: string }>(`/dictamenes/${d!.idDictamen}/verificar`));
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    }
  }

  return (
    <Pantalla titulo={`Dictamen N.° ${d.idDictamen}`} subtitulo={`Solicitud SUA ${d.numeroSua}-${d.anio}`} volver={`/solicitudes/${d.numeroSua}/${d.anio}`}>
      {d.vigente === false && (
        <Aviso tipo="advertencia" titulo="No vigente">
          {d.vigenteElegidoPor && d.vigenteElegidoEn ? `${d.vigenteElegidoPor} eligió otro dictamen para este caso el ${fechaHora(d.vigenteElegidoEn)}.` : 'Otro dictamen quedó vigente.'} Se conserva en el historial.
        </Aviso>
      )}
      {d.vigente === null && <Aviso tipo="advertencia">Este dictamen está en espera: hay otro para el mismo caso y un Jefe tiene que elegir cuál queda vigente.</Aviso>}
      {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}

      <BloquesDictamen d={d} />

      <section className="tarjeta bloque-dictamen">
        <h2>Firma digital</h2>
        <dl className="datos-lista">
          <dt>Firmó</dt>
          <dd>{d.nombreUsuario}</dd>
          <dt>Fecha y hora</dt>
          <dd>{fechaHora(d.fechaEmision)}</dd>
          <dt>Hash SHA-256</dt>
          <dd className="mono">{d.hashFirma}</dd>
          <dt>Firmado sin conexión</dt>
          <dd>{d.firmadoSinConexion === undefined ? '—' : si(d.firmadoSinConexion)}</dd>
          <dt>Sincronización con el SUA</dt>
          <dd>
            {d.estadoSincronizacion}
            {d.enviadoSuaEn && ` · recibido el ${fechaHora(d.enviadoSuaEn)}`}
          </dd>
          <dt>Vigente</dt>
          <dd>{d.vigente === true ? 'Sí' : d.vigente === false ? 'No vigente' : 'En espera'}</dd>
        </dl>
        {verificacion && (
          <div className="separado" style={{ marginTop: 12 }}>
            <Aviso tipo={verificacion.coincide ? 'exito' : 'error'} titulo={verificacion.coincide ? 'Íntegro: el hash coincide' : 'Integridad no verificada: el hash no coincide'}>
              El servidor recalculó el SHA-256 sobre el contenido guardado: <span className="mono">{verificacion.recalculado}</span>
            </Aviso>
          </div>
        )}
      </section>

      <div className="pie-acciones">
        <button className="boton contorno" onClick={() => void verificar()}>
          Verificar integridad
        </button>
        <button
          className="boton"
          onClick={() => void descargar(`/dictamenes/${d.idDictamen}/pdf`, `dictamen-${d.numeroSua}-${d.anio}-${d.idDictamen}.pdf`).catch((e) => setErrorAccion(mensajeDe(e)))}
        >
          Descargar PDF
        </button>
      </div>
    </Pantalla>
  );
}
