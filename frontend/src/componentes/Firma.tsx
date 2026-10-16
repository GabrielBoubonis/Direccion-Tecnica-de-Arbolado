// Acto de firma del dictamen (RF-22, RF-24, RF-51; wireframe 04b-segundo-factor). Antes de firmar se
// pide el segundo factor; en esta demo la huella es simulada y así se dice en pantalla (D-03).
// Después se muestra, paso a paso, lo que hizo el sistema: lo simulado se marca como tal.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { descargar, type PasoVisible } from '../api/cliente';
import { Modal } from './ui';

export type ResultadoHuella = 'aceptada' | 'rechazada' | 'cancelada';

/** Modal "Verificá tu identidad" (04b). Devuelve el resultado del segundo factor. */
export function ModalSegundoFactor({ alTerminar }: { alTerminar: (r: ResultadoHuella) => void }) {
  const [leyendo, setLeyendo] = useState(false);
  const leer = async (r: ResultadoHuella) => {
    setLeyendo(true);
    await new Promise((ok) => setTimeout(ok, 900));
    alTerminar(r);
  };
  return (
    <Modal etiqueta="Verificá tu identidad" onCerrar={leyendo ? undefined : () => alTerminar('cancelada')}>
      <div className="segundo-factor">
        <div className="candado-firma" aria-hidden>
          🔒
        </div>
        <h2>Verificá tu identidad</h2>
        <p className="texto-modal">
          Para firmar este dictamen necesitamos
          <br />
          confirmar que sos vos (RF-51).
        </p>
        <button className="boton ancho" disabled={leyendo} onClick={() => void leer('aceptada')}>
          {leyendo ? 'Leyendo la huella…' : '👆 Usar huella / Face ID'}
        </button>
        <p className="nota-webauthn">Verificación biométrica del dispositivo (WebAuthn)</p>
        <div className="aviso simulado huella-simulada">
          <b>Simulado en la demo</b>
          Aquí el captor pide la huella con su sensor. En esta demo no se lee ninguna huella: el botón simula una lectura correcta.{' '}
          <button className="boton enlace" disabled={leyendo} onClick={() => void leer('rechazada')}>
            Simular huella rechazada
          </button>
        </div>
        <button className="boton contorno ancho" disabled={leyendo} onClick={() => alTerminar('cancelada')}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

interface DatosFirma {
  hash?: string;
  fechaHora?: string;
  usuario?: string;
  contenidoCanonico?: string;
  enviado?: unknown;
}

/** Lo que hizo el sistema al firmar, a la vista (D-03). */
export function TrazaDeFirma({
  pasos,
  idDictamen,
  numeroSua,
  anio,
}: {
  pasos: PasoVisible[];
  idDictamen?: number;
  numeroSua: string;
  anio: number;
}) {
  const [verContenido, setVerContenido] = useState(false);
  return (
    <>
      <ol className="traza">
        {pasos.map((p, i) => {
          const d = p.datos as DatosFirma | undefined;
          return (
            <li key={i}>
              <span className="marca-paso" aria-hidden>
                ✓
              </span>
              <div className="paso-traza">
                <div className="cabeza-paso">
                  <b>{p.titulo}</b>
                  <span className={`etiqueta ${p.simulado ? 'violeta' : 'verde'}`}>{p.simulado ? 'Simulado' : 'Real'}</span>
                  {p.requisito && <span className="requisito">{p.requisito}</span>}
                </div>
                <p>{p.detalle}</p>
                {d?.hash && (
                  <div className="datos-firma">
                    <div>
                      <b>Hash SHA-256:</b> <span className="mono">{d.hash}</span>
                    </div>
                    <div>
                      <b>Fecha y hora:</b> {d.fechaHora && new Date(d.fechaHora).toLocaleString('es-AR')} · <b>Usuario:</b> {d.usuario}
                    </div>
                    {d.contenidoCanonico && (
                      <>
                        <button className="boton enlace" onClick={() => setVerContenido(!verContenido)}>
                          {verContenido ? 'Ocultar' : 'Ver'} el contenido exacto que se firmó
                        </button>
                        {verContenido && <pre className="json">{d.contenidoCanonico}</pre>}
                      </>
                    )}
                  </div>
                )}
                {d?.enviado !== undefined && (
                  <details>
                    <summary>Ver lo que recibió el SUA</summary>
                    <pre className="json">{JSON.stringify(d.enviado, null, 2)}</pre>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="acciones-firmado">
        {idDictamen && (
          <>
            <button className="boton contorno" onClick={() => void descargar(`/dictamenes/${idDictamen}/pdf`, `dictamen-${numeroSua}-${anio}-${idDictamen}.pdf`).catch(() => undefined)}>
              ⬇ Descargar PDF
            </button>
            <Link className="boton contorno" to={`/dictamenes/${idDictamen}`}>
              Ver dictamen
            </Link>
          </>
        )}
        <Link className="boton" to="/rutas">
          Volver a la ruta
        </Link>
      </div>
    </>
  );
}
