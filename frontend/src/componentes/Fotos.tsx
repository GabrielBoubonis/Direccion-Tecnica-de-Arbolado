// Fotografías del ejemplar (RF-45, Paso 4 del dictamen). Con señal, cada foto se achica y se sube
// apenas se elige; sin señal, se guarda cifrada en el captor y se sube al sincronizar (RF-31, RNF-16).
import { useState } from 'react';
import { post, urlFoto } from '../api/cliente';
import { type FotoFormulario, guardarFotoLocal, prepararFoto } from '../offline/cola';
import { aBase64 } from '../offline/cifrado';
import { useConexion } from '../offline/conexion';
import { mensajeDe } from './ui';

export function Fotos({ fotos, alCambiar, invalido }: { fotos: FotoFormulario[]; alCambiar: (f: FotoFormulario[]) => void; invalido?: boolean }) {
  const conexion = useConexion();
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    setError(null);
    const nuevas: FotoFormulario[] = [];
    try {
      for (const a of Array.from(archivos)) {
        if (!navigator.onLine) {
          nuevas.push(await guardarFotoLocal(a));
          continue;
        }
        const { bytes, tipoMime, sha256 } = await prepararFoto(a);
        const r = await post<{ referencia: string; sha256: string }>('/fotos', { datos: aBase64(bytes), tipoMime });
        nuevas.push({ ref: r.referencia, sha256: r.sha256 ?? sha256, vista: urlFoto(r.referencia) });
      }
    } catch (e) {
      setError(`No se pudo cargar la fotografía: ${mensajeDe(e)}`);
    } finally {
      alCambiar([...fotos, ...nuevas]);
      setSubiendo(false);
    }
  }

  return (
    <div>
      <div className="fotos">
        {fotos.map((f, i) => (
          <div key={f.ref} className="foto">
            <img src={f.vista} alt={`Fotografía ${i + 1} del ejemplar`} />
            {f.ref.startsWith('local:') && <span className="foto-local">en el captor</span>}
            <button type="button" aria-label={`Quitar fotografía ${i + 1}`} onClick={() => alCambiar(fotos.filter((x) => x.ref !== f.ref))}>
              ✕
            </button>
          </div>
        ))}
        <label className={`agregar-foto${invalido ? ' invalida' : ''}`}>
          <span aria-hidden>📷</span>
          {subiendo ? 'Guardando…' : 'Agregar foto'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            disabled={subiendo}
            aria-label="Agregar fotografía del ejemplar"
            onChange={(e) => {
              void elegir(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {!conexion && <p className="ayuda-fotos">Sin señal: las fotos se guardan cifradas en el captor y se envían al sincronizar.</p>}
      {error && <p className="error-campo">{error}</p>}
    </div>
  );
}
