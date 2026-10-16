// Selector de especie con búsqueda y "Agregar especie" (RF-56, HU-06 criterio 8): filtra el catálogo
// mientras se escribe y, si la especie no figura, la incorpora normalizada y sin duplicados.
// Sin señal filtra la copia del catálogo guardada en el captor; agregar una especie requiere señal.
import { useEffect, useState } from 'react';
import { ErrorApi, get, post } from '../api/cliente';
import { guardarEnCache, leerDeCache } from '../offline/cache';
import { useConexion } from '../offline/conexion';
import { mensajeDe } from './ui';

export interface Especie {
  idEspecie: number;
  nombreComun: string;
  nombreCientifico: string | null;
}

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export function SelectorEspecie({ valor, alElegir, invalido }: { valor: Especie | null; alElegir: (e: Especie | null) => void; invalido?: boolean }) {
  const conexion = useConexion();
  const [catalogo, setCatalogo] = useState<Especie[]>([]);
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  // El catálogo entero se trae una vez y se guarda para trabajar sin señal.
  useEffect(() => {
    let vivo = true;
    (async () => {
      if (navigator.onLine) {
        try {
          const r = await get<{ especies: Especie[] }>('/especies');
          if (vivo) setCatalogo(r.especies);
          await guardarEnCache('especies', r.especies);
          return;
        } catch {
          /* se usa la copia */
        }
      }
      const copia = await leerDeCache<Especie[]>('especies');
      if (vivo && copia) setCatalogo(copia);
    })();
    return () => {
      vivo = false;
    };
  }, [conexion]);

  const buscado = normalizar(texto);
  const opciones = catalogo.filter((o) => !buscado || normalizar(o.nombreComun).includes(buscado) || normalizar(o.nombreCientifico ?? '').includes(buscado));
  const exacta = catalogo.some((o) => normalizar(o.nombreComun) === buscado);

  async function agregar() {
    setError(null);
    setAgregando(true);
    try {
      const e = await post<{ idEspecie: number; nombreComun: string }>('/especies', { nombreComun: texto });
      const nueva = { ...e, nombreCientifico: null };
      setCatalogo((c) => [...c, nueva]);
      alElegir(nueva);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof ErrorApi && e.codigo === 'ESPECIE_EXISTENTE' ? e.message : mensajeDe(e));
    } finally {
      setAgregando(false);
    }
  }

  if (valor && !abierto)
    return (
      <div className="especie-elegida">
        <span>
          🌳 <b>{valor.nombreComun}</b>
          {valor.nombreCientifico && <i> ({valor.nombreCientifico})</i>}
        </span>
        <button
          type="button"
          className="boton enlace"
          onClick={() => {
            setTexto('');
            setAbierto(true);
          }}
        >
          Cambiar
        </button>
      </div>
    );

  return (
    <div className="selector-especie">
      <input
        id="especie"
        className={`entrada${invalido ? ' invalida' : ''}`}
        placeholder="Escribí para buscar (ej. plátano, fresno)…"
        value={texto}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierto}
        aria-controls="lista-especies"
        onFocus={() => setAbierto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
        }}
      />
      {abierto && (
        <div className="opciones-especie" id="lista-especies" role="listbox" aria-label="Especies">
          {opciones.slice(0, 40).map((o) => (
            <button
              type="button"
              role="option"
              aria-selected={valor?.idEspecie === o.idEspecie}
              key={o.idEspecie}
              onClick={() => {
                alElegir(o);
                setAbierto(false);
              }}
            >
              {o.nombreComun} <i>{o.nombreCientifico}</i>
            </button>
          ))}
          {opciones.length === 0 && <p className="sin-opciones">No hay especies con ese nombre en el catálogo.</p>}
          {texto.trim().length >= 2 && !exacta && (
            <button type="button" className="boton contorno chico ancho" disabled={!conexion || agregando} onClick={() => void agregar()}>
              ➕ Agregar especie "{texto.trim()}"
            </button>
          )}
          {texto.trim().length >= 2 && !exacta && !conexion && <p className="sin-opciones">Agregar una especie requiere señal.</p>}
          {error && <p className="error-campo">{error}</p>}
        </div>
      )}
    </div>
  );
}
