// Pantalla 11 · Dictámenes en conflicto. Sigue el wireframe 11-conflicto-dictamenes.png.
// Cubre RF-21, RF-59, CU-15 y HU-17: el Jefe elige cuál de los dos dictámenes firmados queda vigente.
// E1: cerrar el modal sin confirmar no cambia nada. E2: si otro Jefe ya lo resolvió (409 YA_RESUELTO) se informa.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorApi, get, post } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, fechaHora, mensajeDe, Modal, Pantalla, textoEstado, useCarga } from '../componentes/ui';
import { useConexion } from '../offline/conexion';
import '../estilos/conflicto.css';

interface DictamenConflicto {
  idDictamen: number;
  nombreUsuario: string;
  fechaEmision: string;
  firmadoSinConexion: boolean;
  esExtraccion: boolean;
  motivoExtraccion: string | null;
  esSinTrabajo: boolean;
  motivoSinTrabajo: string | null;
  nivelPrioridad: string;
  vigente: boolean | null;
  vigenteElegidoPor: string | null;
  vigenteElegidoEn: string | null;
  trabajosAereos: { tipoTrabajo: string }[];
  trabajosSubterraneos: { tipoTrabajo: string; distanciaBorde: number | null }[];
}

interface Respuesta {
  resuelto: boolean;
  dictamenes: DictamenConflicto[];
}

interface Eleccion {
  vigente: number;
  elegidoPor: string;
  elegidoEn: string;
}

const LETRAS = ['A', 'B'];

/** Qué se decidió hacer en el árbol: extracción, los trabajos o sin trabajo (mismo orden en las dos tarjetas). */
function intervencion(d: DictamenConflicto): string {
  if (d.esExtraccion) return `Extracción · ${d.motivoExtraccion ?? '—'}`;
  if (d.esSinTrabajo) return `Sin trabajo · ${d.motivoSinTrabajo ?? '—'}`;
  const trabajos = [...d.trabajosAereos.map((t) => t.tipoTrabajo), ...d.trabajosSubterraneos.map((t) => t.tipoTrabajo)];
  return trabajos.length ? trabajos.join(' · ') : '—';
}

export function Conflicto() {
  const { numero = '', anio = '' } = useParams();
  const hayConexion = useConexion();
  const { datos, error, recargar } = useCarga(() => get<Respuesta>(`/dictamenes/conflicto/${numero}/${anio}`), [numero, anio]);
  const [elegido, setElegido] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Eleccion | null>(null);
  const detalle = `/solicitudes/${numero}/${anio}`;
  const titulo = 'Dictámenes en conflicto';

  async function confirmar() {
    if (elegido === null) return;
    setOcupado(true);
    setFallo(null);
    try {
      setHecho(await post<Eleccion>(`/dictamenes/${elegido}/vigente`));
    } catch (e) {
      const yaResuelto = e instanceof ErrorApi && e.codigo === 'YA_RESUELTO';
      setFallo(yaResuelto ? 'Otro Jefe ya resolvió este caso. Se muestra el dictamen que quedó vigente.' : mensajeDe(e));
      // E2: se recarga para mostrar el dictamen que quedó vigente.
      if (yaResuelto) await recargar();
    } finally {
      setConfirmando(false);
      setOcupado(false);
    }
  }

  if (error)
    return (
      <Pantalla titulo={titulo} volver={detalle}>
        <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
      </Pantalla>
    );
  if (!datos)
    return (
      <Pantalla titulo={titulo} volver={detalle}>
        <Cargando />
      </Pantalla>
    );

  const lista = datos.dictamenes;
  const vigenteActual = lista.find((d) => d.vigente === true);
  const letraDe = (id: number) => LETRAS[lista.findIndex((d) => d.idDictamen === id)] ?? '';
  const otra = elegido === null ? '' : (LETRAS[1 - lista.findIndex((d) => d.idDictamen === elegido)] ?? '');

  return (
    <Pantalla titulo={titulo} volver={detalle}>
      <div className="conflicto-caso">
        SUA {numero}-{anio} · {textoEstado(datos.resuelto ? 'Dictaminada' : 'PendienteRevision')}
      </div>

      {hecho && (
        <>
          <Aviso tipo="exito" titulo="Elección registrada">
            Quedó vigente el Dictamen {letraDe(hecho.vigente)}. Eligió {hecho.elegidoPor} el {fechaHora(hecho.elegidoEn)}.
          </Aviso>
          <Link className="boton ancho conflicto-vuelta" to={detalle}>
            Volver a la solicitud
          </Link>
        </>
      )}

      {!hecho && datos.resuelto && (
        <>
          {fallo && <Aviso tipo="advertencia">{fallo}</Aviso>}
          <Aviso tipo="info" titulo="Este caso ya está resuelto">
            {vigenteActual
              ? `El dictamen vigente es el de ${vigenteActual.nombreUsuario}${vigenteActual.vigenteElegidoEn ? `, elegido el ${fechaHora(vigenteActual.vigenteElegidoEn)}` : ''}.`
              : 'No quedan dos dictámenes esperando elección.'}
          </Aviso>
          {vigenteActual && (
            <Link className="boton ancho contorno conflicto-vuelta" to={`/dictamenes/${vigenteActual.idDictamen}`}>
              Ver dictamen vigente
            </Link>
          )}
        </>
      )}

      {!hecho && !datos.resuelto && (
        <>
          <p className="conflicto-ayuda">Dos dictámenes firmados para el mismo caso. Elegí cuál queda vigente.</p>
          {fallo && <Aviso tipo="error">{fallo}</Aviso>}
          {!hayConexion && <Aviso tipo="advertencia">Sin conexión. Elegir el dictamen vigente necesita señal.</Aviso>}
          <div className="conflicto-lista" role="radiogroup" aria-label="Dictamen que queda vigente">
            {lista.map((d, i) => (
              <div key={d.idDictamen} className={`tarjeta conflicto-tarjeta${elegido === d.idDictamen ? ' seleccionada' : ''}`}>
                <h2>Dictamen {LETRAS[i]}</h2>
                <div className="linea">
                  Firmado por {d.nombreUsuario} · {fechaHora(d.fechaEmision)}
                  {d.firmadoSinConexion ? ' (sin señal)' : ''}
                </div>
                <div className="linea">Intervención: {intervencion(d)}</div>
                <div className="linea">Prioridad: {d.nivelPrioridad}</div>
                <div className="pie">
                  <label className="elegir" htmlFor={`vigente-${d.idDictamen}`}>
                    <input id={`vigente-${d.idDictamen}`} type="radio" name="vigente" checked={elegido === d.idDictamen} onChange={() => setElegido(d.idDictamen)} />
                    Dejar vigente este dictamen
                  </label>
                  <Link className="ver" to={`/dictamenes/${d.idDictamen}`}>
                    Ver completo
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="pie-acciones">
            <button className="boton exito" disabled={elegido === null || !hayConexion || ocupado} onClick={() => setConfirmando(true)}>
              Confirmar
            </button>
          </div>
        </>
      )}

      {confirmando && elegido !== null && (
        <Modal titulo="Confirmar elección" onCerrar={() => setConfirmando(false)}>
          <p className="texto-modal">
            Queda vigente el Dictamen {letraDe(elegido)}. El Dictamen {otra} queda en el historial como no vigente. Se registra quién eligió, la fecha y la hora (RF-59).
          </p>
          <div className="acciones-modal">
            <button className="boton contorno" onClick={() => setConfirmando(false)} disabled={ocupado}>
              Cancelar
            </button>
            <button className="boton exito" onClick={() => void confirmar()} disabled={ocupado}>
              Confirmar
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}
