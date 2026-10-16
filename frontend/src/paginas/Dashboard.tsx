// Pantalla 5 · Dashboard (wireframe 05-dashboard.png). RF-35, RF-36, RF-37, RF-44; CU-11; HU-11, HU-15.
// Roles: Jefe, Administrador y Lector. El período (mes o año completo) se conserva al cambiar de pestaña.
import { useState } from 'react';
import { get } from '../api/cliente';
import { Cargando, ErrorConReintento, Pantalla, Pestanas, Vacio, useCarga } from '../componentes/ui';
import '../estilos/dashboard.css';

interface Resumen {
  derivadas: number;
  dictaminadas: number;
  sinDictaminar: number;
}
interface Respuesta {
  anio: number;
  mes: number | null;
  general: Resumen;
  tormenta: Resumen;
  evolucion: (Resumen & { mes: number })[];
  actualizado: string;
}

const ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ANIOS = [2025, 2026];

/** Gráfico de línea simple en SVG propio, con la serie de derivadas y la de dictaminadas. */
function Evolucion({ datos }: { datos: Respuesta['evolucion'] }) {
  const ancho = 320;
  const alto = 130;
  const m = { izq: 22, der: 10, sup: 10, inf: 22 };
  const maximo = Math.max(1, ...datos.map((d) => d.derivadas));
  const x = (i: number) => m.izq + (i * (ancho - m.izq - m.der)) / (datos.length - 1);
  const y = (v: number) => alto - m.inf - (v / maximo) * (alto - m.inf - m.sup);
  const linea = (f: (d: Respuesta['evolucion'][number]) => number) => datos.map((d, i) => `${x(i)},${y(f(d))}`).join(' ');
  const descripcion =
    'Evolución mensual. ' + datos.map((d) => `${ABREV[d.mes - 1]}: ${d.derivadas} derivadas, ${d.dictaminadas} dictaminadas`).join('; ') + '.';
  return (
    <div className="dash-grafico">
      <div className="dash-leyenda" aria-hidden>
        <span>
          <i style={{ background: 'var(--pizarra)' }} />
          Derivadas
        </span>
        <span>
          <i style={{ background: 'var(--exito)' }} />
          Dictaminadas
        </span>
      </div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={descripcion}>
        <line x1={m.izq} x2={ancho - m.der} y1={y(0)} y2={y(0)} stroke="var(--borde)" />
        <text x={m.izq - 4} y={y(maximo) + 3} fontSize="8" textAnchor="end" fill="var(--texto-tenue)">
          {maximo}
        </text>
        <text x={m.izq - 4} y={y(0) + 3} fontSize="8" textAnchor="end" fill="var(--texto-tenue)">
          0
        </text>
        <polyline points={linea((d) => d.derivadas)} fill="none" stroke="var(--pizarra)" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={linea((d) => d.dictaminadas)} fill="none" stroke="var(--exito)" strokeWidth="2" strokeLinejoin="round" />
        {datos.map((d, i) => (
          <text key={d.mes} x={x(i)} y={alto - 6} fontSize="8" textAnchor="middle" fill="var(--texto-tenue)">
            {ABREV[d.mes - 1]}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function Dashboard() {
  const hoy = new Date();
  const [anio, setAnio] = useState(ANIOS.includes(hoy.getFullYear()) ? hoy.getFullYear() : ANIOS[ANIOS.length - 1]);
  const [mes, setMes] = useState(hoy.getMonth() + 1); // 0 = año completo
  const [vista, setVista] = useState<'general' | 'tormenta'>('general');
  const { datos, error, cargando, recargar } = useCarga(() => get<Respuesta>(`/dashboard?anio=${anio}${mes ? `&mes=${mes}` : ''}`), [anio, mes]);
  const resumen = datos?.[vista];

  const selector = (
    <>
      <label htmlFor="dash-periodo" className="sr-only">
        Período
      </label>
      <select
        id="dash-periodo"
        className="selector-periodo"
        value={`${anio}-${mes}`}
        onChange={(e) => {
          const [a, mm] = e.target.value.split('-').map(Number);
          setAnio(a);
          setMes(mm);
        }}
      >
        {ANIOS.map((a) => (
          <optgroup key={a} label={String(a)}>
            <option value={`${a}-0`}>Año {a} completo</option>
            {ABREV.map((n, i) => (
              <option key={n} value={`${a}-${i + 1}`}>
                {n} {a}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </>
  );

  return (
    <Pantalla titulo="Dashboard" acciones={selector} ancho>
      <Pestanas
        etiqueta="Vista del dashboard"
        valor={vista}
        onCambio={setVista}
        opciones={[
          { valor: 'general', texto: 'General' },
          { valor: 'tormenta', texto: '⛈ Tormenta' },
        ]}
      />
      {error && <ErrorConReintento mensaje={error} onReintentar={() => void recargar()} />}
      {cargando && !datos && <Cargando />}
      {datos && resumen && (
        <>
          {resumen.derivadas === 0 && <Vacio>No hubo actividad en este período</Vacio>}
          <div className="dash-tarjetas">
            <div className="dash-kpi derivadas">
              <div className="rotulo-kpi">{vista === 'tormenta' ? 'Solicitudes de tormenta derivadas' : 'Solicitudes derivadas'}</div>
              <div className="valor">{resumen.derivadas}</div>
            </div>
            <div className="dash-kpi dictaminadas">
              <div className="rotulo-kpi">Dictaminadas</div>
              <div className="valor">{resumen.dictaminadas}</div>
            </div>
            <div className="dash-kpi sin">
              <div className="rotulo-kpi">Sin dictaminar</div>
              <div className="valor">{resumen.sinDictaminar}</div>
            </div>
          </div>
          {vista === 'general' && (
            <section className="dash-evolucion" aria-labelledby="dash-evo">
              <h2 id="dash-evo">Evolución mensual</h2>
              <Evolucion datos={datos.evolucion} />
            </section>
          )}
          <div className="aviso simulado" style={{ marginTop: 16 }}>
            Cada re-derivación por vencimiento se cuenta como evento independiente.
          </div>
        </>
      )}
    </Pantalla>
  );
}
