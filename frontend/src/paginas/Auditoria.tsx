// Pantalla 9 · Auditoría. Sigue el wireframe 09-auditoria (diseño-ui.md, Pantalla 9).
// Cubre RF-54, RF-55, CU-13, HU-13. Solo Administrador. Registro de solo lectura: sin editar ni borrar.
import { useState } from 'react';
import { get } from '../api/cliente';
import { Aviso, Cargando, ErrorConReintento, fechaHora, Pantalla, useCarga, Vacio } from '../componentes/ui';
import '../estilos/auditoria.css';

interface Evento {
  idAuditoria: number;
  nombreUsuario: string;
  accion: string;
  entidadAfectada: string;
  fechaHora: string;
}
interface Respuesta {
  total: number;
  pagina: number;
  porPagina: number;
  eventos: Evento[];
  acciones: string[];
}
interface Filtros {
  usuario: string;
  accion: string;
  desde: string;
  hasta: string;
}
const SIN_FILTROS: Filtros = { usuario: '', accion: '', desde: '', hasta: '' };

const COLOR: Record<string, string> = {
  'Cambio de rol': 'naranja',
  'Alta de usuario': 'azul',
  'Desbloqueo de captor': 'verde',
  'Baja de usuario': 'roja',
  'Revocación de captor': 'roja',
};
const ACCIONES_BASE = ['Alta de usuario', 'Baja de usuario', 'Cambio de rol', 'Desbloqueo de captor', 'Revocación de captor'];

function consulta(f: Filtros, pagina: number) {
  const p = new URLSearchParams({ pagina: String(pagina) });
  (Object.keys(f) as (keyof Filtros)[]).forEach((k) => f[k].trim() && p.set(k, f[k].trim()));
  return `/auditoria?${p.toString()}`;
}

export function Auditoria() {
  const [abiertos, setAbiertos] = useState(true);
  const [borrador, setBorrador] = useState<Filtros>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS);
  const [pagina, setPagina] = useState(1);
  const [rangoInvalido, setRangoInvalido] = useState(false);
  const { datos, error, cargando, recargar } = useCarga(() => get<Respuesta>(consulta(aplicados, pagina)), [aplicados, pagina]);

  function aplicar(e: React.FormEvent) {
    e.preventDefault();
    // CU-13 E2: con rango inválido no se aplica el filtro y se conserva el listado anterior.
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setRangoInvalido(true);
      return;
    }
    setRangoInvalido(false);
    setPagina(1);
    setAplicados({ ...borrador });
  }
  const campo = (k: keyof Filtros) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setBorrador({ ...borrador, [k]: e.target.value });

  const acciones = datos?.acciones ?? ACCIONES_BASE;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;
  const desde = datos ? (datos.pagina - 1) * datos.porPagina : 0;

  return (
    <Pantalla titulo="Auditoría" ancho>
      <div className="auditoria">
        <button className="barra-filtros" aria-expanded={abiertos} aria-controls="filtros-auditoria" onClick={() => setAbiertos(!abiertos)}>
          Filtros {abiertos ? '▴' : '▾'} (usuario, acción, rango de fechas)
        </button>
        {abiertos && (
          <form id="filtros-auditoria" className="controles" onSubmit={aplicar}>
            <div className="campo">
              <label htmlFor="f-usuario">Usuario</label>
              <input id="f-usuario" className="entrada" value={borrador.usuario} onChange={campo('usuario')} />
            </div>
            <div className="campo">
              <label htmlFor="f-accion">Tipo de acción</label>
              <select id="f-accion" className="entrada" value={borrador.accion} onChange={campo('accion')}>
                <option value="">Todas</option>
                {acciones.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="rango">
              <div className="campo">
                <label htmlFor="f-desde">Desde</label>
                <input id="f-desde" type="date" className="entrada" value={borrador.desde} onChange={campo('desde')} />
              </div>
              <div className="campo">
                <label htmlFor="f-hasta">Hasta</label>
                <input id="f-hasta" type="date" className="entrada" value={borrador.hasta} onChange={campo('hasta')} />
              </div>
            </div>
            <button className="boton">Aplicar</button>
          </form>
        )}
        {rangoInvalido && <Aviso tipo="advertencia">El rango de fechas es inválido: "desde" no puede ser posterior a "hasta". Se mantiene el listado anterior.</Aviso>}

        {error ? (
          <ErrorConReintento mensaje="No se pudo cargar el registro" onReintentar={() => void recargar()} />
        ) : cargando && !datos ? (
          <Cargando />
        ) : datos && datos.eventos.length === 0 ? (
          <Vacio>No hay eventos para este filtro</Vacio>
        ) : (
          datos && (
            <>
              <div className="resumen-lista">
                Mostrando {desde + 1}-{desde + datos.eventos.length} de {datos.total} eventos · más recientes primero
              </div>
              <div className="lista solo-celular">
                {datos.eventos.map((ev) => (
                  <div key={ev.idAuditoria} className="tarjeta evento">
                    <div className="actor">{ev.nombreUsuario}</div>
                    <span className={`etiqueta ${COLOR[ev.accion] ?? ''}`}>{ev.accion}</span>
                    <div className="pie-evento">
                      <span>{fechaHora(ev.fechaHora)}</span>
                      <span>afectado: {ev.entidadAfectada}</span>
                    </div>
                  </div>
                ))}
              </div>
              <table className="tabla solo-escritorio">
                <thead>
                  <tr>
                    <th>Fecha y hora</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Afectado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.eventos.map((ev) => (
                    <tr key={ev.idAuditoria}>
                      <td>{fechaHora(ev.fechaHora)}</td>
                      <td>
                        <b>{ev.nombreUsuario}</b>
                      </td>
                      <td>
                        <span className={`etiqueta ${COLOR[ev.accion] ?? ''}`}>{ev.accion}</span>
                      </td>
                      <td>{ev.entidadAfectada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="aviso neutro inmutable">🔒 Registro inmutable: ningún evento de esta lista puede editarse ni eliminarse desde la aplicación (RF-54).</div>
              {paginas > 1 && (
                <nav className="paginacion" aria-label="Páginas">
                  <button aria-label="Página anterior" disabled={datos.pagina <= 1} onClick={() => setPagina(datos.pagina - 1)}>
                    ‹
                  </button>
                  <span aria-current="page">
                    Página {datos.pagina} de {paginas}
                  </span>
                  <button aria-label="Página siguiente" disabled={datos.pagina >= paginas} onClick={() => setPagina(datos.pagina + 1)}>
                    ›
                  </button>
                </nav>
              )}
            </>
          )
        )}

        {(error || !datos || datos.eventos.length === 0) && (
          <div className="aviso neutro inmutable">🔒 Registro inmutable: ningún evento de esta lista puede editarse ni eliminarse desde la aplicación (RF-54).</div>
        )}
      </div>
    </Pantalla>
  );
}
