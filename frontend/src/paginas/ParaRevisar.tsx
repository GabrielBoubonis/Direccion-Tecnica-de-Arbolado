// Pantalla 10 · Para revisar. Sigue el wireframe 10-para-revisar (diseño-ui.md, Pantalla 10).
// Cubre RF-53, RF-58, RNF-18, CU-14, HU-16. Solo Administrador, solo consulta: sin acciones de edición.
import { Fragment, useState } from 'react';
import { get } from '../api/cliente';
import { Cargando, ErrorConReintento, fechaHora, Pantalla, useCarga, Vacio } from '../componentes/ui';
import '../estilos/para-revisar.css';

type TipoCaso = 'IntegridadNoVerificada' | 'DatosInvalidosSua';
interface Caso {
  idCaso: number;
  tipo: TipoCaso;
  referenciaSolicitud: string | null;
  idDictamen: number | null;
  motivo: string;
  fechaHora: string;
  firmadoPor: string | null;
  firmadoEn: string | null;
}

const TIPOS: { valor: '' | TipoCaso; texto: string }[] = [
  { valor: '', texto: 'Todos' },
  { valor: 'IntegridadNoVerificada', texto: 'Integridad no verificada' },
  { valor: 'DatosInvalidosSua', texto: 'Datos inválidos del SUA' },
];
const ETIQUETA: Record<TipoCaso, { texto: string; clase: string }> = {
  IntegridadNoVerificada: { texto: 'Integridad no verificada', clase: 'roja' },
  DatosInvalidosSua: { texto: 'Datos inválidos del SUA', clase: 'naranja' },
};
const ESTADO: Record<TipoCaso, string> = {
  IntegridadNoVerificada: 'no se dio por sincronizado',
  DatosInvalidosSua: 'no se guardó la solicitud',
};
const origen = (c: Caso) =>
  c.tipo === 'IntegridadNoVerificada'
    ? c.firmadoPor
      ? `Dictamen firmado por ${c.firmadoPor} · ${fechaHora(c.firmadoEn)}`
      : `Dictamen firmado · ${fechaHora(c.fechaHora)}`
    : `Registro recibido ${fechaHora(c.fechaHora)}`;
const sua = (c: Caso) => `SUA ${c.referenciaSolicitud ?? 'sin referencia'}`;

function Detalle({ c }: { c: Caso }) {
  return (
    <div className="detalle">
      <div>
        <b>Tipo:</b> {ETIQUETA[c.tipo].texto}
      </div>
      <div>
        <b>Solicitud:</b> {sua(c)}
      </div>
      <div>
        <b>Dictamen:</b> {c.idDictamen ?? 'no corresponde'}
      </div>
      <div>
        <b>Detectado:</b> {fechaHora(c.fechaHora)}
      </div>
      <div>
        <b>Motivo:</b> {c.motivo}
      </div>
      <div>
        <b>Estado:</b> {ESTADO[c.tipo]}
      </div>
    </div>
  );
}

export function ParaRevisar() {
  const [tipo, setTipo] = useState<'' | TipoCaso>('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const { datos, error, cargando, recargar } = useCarga(() => get<{ casos: Caso[] }>(`/revision${tipo ? `?tipo=${tipo}` : ''}`), [tipo]);
  const alternar = (id: number) => setAbierto((a) => (a === id ? null : id));

  return (
    <Pantalla titulo="Para revisar" ancho>
      <div className="para-revisar">
        <div className="filtro">
          <label htmlFor="filtro-tipo">Tipo:</label>
          <select id="filtro-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as '' | TipoCaso)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />
        ) : cargando && !datos ? (
          <Cargando />
        ) : datos && datos.casos.length === 0 ? (
          <Vacio>No hay casos para revisar</Vacio>
        ) : (
          datos && (
            <>
              <div className="resumen-lista">
                Mostrando {datos.casos.length} {datos.casos.length === 1 ? 'caso' : 'casos'} · más recientes primero
              </div>
              <div className="lista solo-celular">
                {datos.casos.map((c) => (
                  <button key={c.idCaso} className="tarjeta caso" aria-expanded={abierto === c.idCaso} onClick={() => alternar(c.idCaso)}>
                    <span className={`etiqueta ${ETIQUETA[c.tipo].clase}`}>{ETIQUETA[c.tipo].texto}</span>
                    <b className="sua">{sua(c)}</b>
                    <div className="linea">{origen(c)}</div>
                    <div className="linea">Motivo: {c.motivo}</div>
                    <div className="linea">Estado: {ESTADO[c.tipo]}</div>
                    {abierto === c.idCaso && <Detalle c={c} />}
                  </button>
                ))}
              </div>
              <table className="tabla solo-escritorio">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Solicitud</th>
                    <th>Origen</th>
                    <th>Motivo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.casos.map((c) => (
                    <Fragment key={c.idCaso}>
                      <tr className="clicable" tabIndex={0} aria-expanded={abierto === c.idCaso} onClick={() => alternar(c.idCaso)} onKeyDown={(e) => e.key === 'Enter' && alternar(c.idCaso)}>
                        <td>
                          <span className={`etiqueta ${ETIQUETA[c.tipo].clase}`}>{ETIQUETA[c.tipo].texto}</span>
                        </td>
                        <td>
                          <b>{sua(c)}</b>
                        </td>
                        <td>{origen(c)}</td>
                        <td>{c.motivo}</td>
                        <td>{ESTADO[c.tipo]}</td>
                      </tr>
                      {abierto === c.idCaso && (
                        <tr>
                          <td colSpan={5}>
                            <Detalle c={c} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </>
          )
        )}

        <div className="aviso info solo-consulta">Solo consulta: desde esta pantalla no se puede editar ni descartar casos (RF-58).</div>
      </div>
    </Pantalla>
  );
}
