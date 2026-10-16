// Pantalla 6 · Protocolo por tormenta (wireframe 06-protocolo-tormenta.png). RF-38 a RF-43; CU-12; HU-12.
// Todos los roles ven la sección; solo Operador y Jefe generan la ruta (CU-12 paso 2.1).
import { useState } from 'react';
import { diasHabilesDesde } from '@dominio/tiempo';
import { useNavigate } from 'react-router-dom';
import { get, post } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, Modal, Pantalla, Paginacion, Vacio, mensajeDe, usePaginado, useCarga } from '../componentes/ui';
import { useSesion } from '../estado/sesion';
import { useConexion } from '../offline/conexion';
import '../estilos/dashboard.css';

interface Caso {
  numeroSua: string;
  anio: number;
  direccion: string;
  distrito: string;
  fechaDerivacion: string;
  reservadaPor: string | null;
}

/** Días hábiles (lunes a sábado, como la jornada operativa) desde la derivación: la misma regla del servidor. */
const diasHabiles = (f: string) => diasHabilesDesde(f);
const textoDias = (n: number) => `Derivada hace ${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
const calle = (c: Caso) => c.direccion.replace(', Rosario, Santa Fe', '');

export function Tormenta() {
  const navegar = useNavigate();
  const sesion = useSesion();
  const conexion = useConexion();
  const puedeGenerar = sesion?.usuario.rol === 'Operador' || sesion?.usuario.rol === 'Jefe';
  const { datos, error, cargando, recargar } = useCarga(() => get<{ pendientes: Caso[] }>('/tormenta'));
  const pendientes = datos?.pendientes ?? [];
  const pag = usePaginado(pendientes, 20);
  const [pidiendo, setPidiendo] = useState(false);
  const [cantidad, setCantidad] = useState('10');
  const [generando, setGenerando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const disponibles = pendientes.filter((p) => !p.reservadaPor).length;

  async function generar() {
    setGenerando(true);
    setErrorAccion(null);
    try {
      const r = await post<{ aviso: string | null }>('/tormenta/rutas', { cantidad: Number(cantidad) });
      window.dispatchEvent(new Event('tormenta-cambio'));
      setPidiendo(false);
      // CU-12 E2: si se pidieron más de las disponibles, se informa cuántas entraron antes de ir a la ruta.
      if (r.aviso) setAviso(r.aviso);
      else navegar('/rutas');
    } catch (e) {
      setErrorAccion(mensajeDe(e));
    } finally {
      setGenerando(false);
    }
  }

  const insignia = <span className="insignia tormenta">Tormenta</span>;
  const reserva = (c: Caso) => (c.reservadaPor ? <span className="etiqueta violeta">En la ruta de {c.reservadaPor}</span> : null);

  return (
    <Pantalla titulo="⛈ Protocolo por tormenta" tono="tormenta" ancho>
      {pendientes.length > 0 && (
        <div className="tormenta-alerta" role="status">
          ⚠ {pendientes.length} solicitudes de emergencia climática sin dictaminar
        </div>
      )}

      {puedeGenerar && (
        <div className="barra-generar">
          <button className="boton tormenta ancho" disabled={!conexion || pendientes.length === 0} onClick={() => setPidiendo(true)}>
            Generar ruta de tormenta
          </button>
          {!conexion && <p className="resumen-lista">Generar una ruta requiere conexión</p>}
        </div>
      )}

      {!conexion && !datos && <Aviso tipo="advertencia">Esta lista necesita conexión. Se va a actualizar cuando vuelva la señal.</Aviso>}
      {error && conexion && <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />}
      {cargando && !datos && conexion && <Cargando />}
      {datos && pendientes.length === 0 && <Vacio>No hay solicitudes de tormenta pendientes.</Vacio>}

      {pendientes.length > 0 && (
        <>
          <div className="solo-celular">
            {pag.visibles.map((c) => {
              const n = diasHabiles(c.fechaDerivacion);
              return (
                <div key={`${c.numeroSua}-${c.anio}`} className="tarjeta tormenta" style={{ marginBottom: 8 }}>
                  <div className="fila-titulo">
                    <b>
                      SUA {c.numeroSua}-{c.anio}
                    </b>
                    {insignia}
                  </div>
                  <div className="linea suave">
                    {calle(c)} — Distrito {c.distrito}
                  </div>
                  <div className={`linea${n >= 3 ? ' dias-rojo' : ' suave'}`}>{textoDias(n)}</div>
                  {c.reservadaPor && <div className="linea">{reserva(c)}</div>}
                </div>
              );
            })}
          </div>
          <table className="tabla solo-escritorio">
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Dirección</th>
                <th>Distrito</th>
                <th>Antigüedad</th>
                <th>Ruta</th>
              </tr>
            </thead>
            <tbody>
              {pag.visibles.map((c) => {
                const n = diasHabiles(c.fechaDerivacion);
                return (
                  <tr key={`${c.numeroSua}-${c.anio}`}>
                    <td>
                      <b>
                        SUA {c.numeroSua}-{c.anio}
                      </b>{' '}
                      {insignia}
                    </td>
                    <td>{calle(c)}</td>
                    <td>{c.distrito}</td>
                    <td className={n >= 3 ? 'dias-rojo' : undefined}>{textoDias(n)}</td>
                    <td>{reserva(c) ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Paginacion pagina={pag.pagina} paginas={pag.paginas} onCambio={pag.setPagina} />
          <p className="tormenta-pie">(ordenadas: más antiguas primero)</p>
        </>
      )}

      {pidiendo && (
        <Modal titulo="Ruta de tormenta" onCerrar={() => setPidiendo(false)}>
          <div className="campo centrado">
            <label htmlFor="cantidad-tormenta">¿Cuántas solicitudes atendés hoy?</label>
            <input
              id="cantidad-tormenta"
              className="entrada cantidad-grande"
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))}
            />
            {Number(cantidad) > disponibles && <div className="ayuda">Hay {disponibles} disponibles: la ruta se arma con todas.</div>}
          </div>
          {errorAccion && <Aviso tipo="error">{errorAccion}</Aviso>}
          <div className="modal-acciones">
            <button className="boton contorno" onClick={() => setPidiendo(false)}>
              Cancelar
            </button>
            <button className="boton tormenta" disabled={!(Number(cantidad) >= 1) || generando} onClick={() => void generar()}>
              {generando ? 'Generando…' : 'Generar'}
            </button>
          </div>
        </Modal>
      )}
      {aviso && (
        <Modal titulo="Ruta de tormenta" onCerrar={() => navegar('/rutas')}>
          <p className="texto-modal">{aviso}</p>
          <div className="modal-acciones">
            <button className="boton tormenta" onClick={() => navegar('/rutas')}>
              Ver mi ruta
            </button>
          </div>
        </Modal>
      )}
    </Pantalla>
  );
}
