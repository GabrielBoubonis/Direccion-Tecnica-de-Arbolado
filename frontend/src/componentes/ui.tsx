// Piezas de interfaz comunes, según los wireframes: encabezado por pantalla, insignias de estado con
// texto, pestañas, paginación, modal y avisos.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { useConexion } from '../offline/conexion';
import { useEstadoCola } from '../offline/cola';

export const mensajeDe = (e: unknown) => (e instanceof ErrorApi || e instanceof Error ? e.message : 'Ocurrió un error inesperado.');

/** Carga datos con estado de carga y error. `recargar` vuelve a pedirlos. */
export function useCarga<T>(pedir: () => Promise<T>, dependencias: unknown[] = []) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ejecutar = useCallback(pedir, dependencias);
  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await ejecutar());
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setCargando(false);
    }
  }, [ejecutar]);
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { datos, error, cargando, recargar, setDatos };
}

// ── Encabezado ──────────────────────────────────────────────────────────────────────────────────

/** Indicador permanente de sincronización (RF-34): todo sincronizado, pendientes o sin señal. */
export function IndicadorSincronizacion() {
  const conexion = useConexion();
  const { pendientes, sincronizando } = useEstadoCola();
  if (!conexion)
    return (
      <span className="sync-sin-senal" role="status" aria-label={`Sin señal${pendientes ? `, ${pendientes} dictámenes pendientes de enviar` : ''}`}>
        SIN SEÑAL{pendientes ? ` · ${pendientes}` : ''}
      </span>
    );
  return (
    <Link to="/perfil" className={`sync${pendientes ? ' pendientes' : ''}`} aria-label={pendientes ? `${pendientes} dictámenes pendientes de sincronizar` : 'Todo sincronizado'}>
      <span className="circulo" aria-hidden>
        {pendientes ? (sincronizando ? '…' : pendientes) : '✓'}
      </span>
      <span>{pendientes ? 'pend.' : 'sync'}</span>
    </Link>
  );
}

export function Encabezado({
  titulo,
  subtitulo,
  volver,
  acciones,
  tono,
  conIndicador = true,
}: {
  titulo: string;
  subtitulo?: string;
  /** Ruta a la que vuelve la flecha, o true para volver atrás en el historial. */
  volver?: string | true;
  acciones?: ReactNode;
  tono?: 'tormenta';
  conIndicador?: boolean;
}) {
  const navegar = useNavigate();
  return (
    <header className={`encabezado${tono ? ` ${tono}` : ''}`}>
      {volver && (
        <button className="volver" aria-label="Volver" onClick={() => (volver === true ? navegar(-1) : navegar(volver))}>
          ←
        </button>
      )}
      <div className="titulos">
        <h1>{titulo}</h1>
        {subtitulo && <div className="subtitulo">{subtitulo}</div>}
      </div>
      <div className="acciones">
        {acciones}
        {conIndicador && <IndicadorSincronizacion />}
      </div>
    </header>
  );
}

/** Pantalla: encabezado propio y cuerpo. */
export function Pantalla({ children, ancho, ...encabezado }: Parameters<typeof Encabezado>[0] & { children: ReactNode; ancho?: boolean }) {
  return (
    <>
      <Encabezado {...encabezado} />
      <main className={`cuerpo${ancho ? ' ancho' : ''}`}>{children}</main>
    </>
  );
}

// ── Estados y etiquetas ─────────────────────────────────────────────────────────────────────────

export type EstadoSolicitud = 'Pendiente' | 'Dictaminada' | 'PendienteRevision';

const ESTADOS: Record<EstadoSolicitud, { texto: string; clase: string }> = {
  Pendiente: { texto: 'Pendiente', clase: 'pendiente' },
  PendienteRevision: { texto: 'En revisión', clase: 'revision' },
  Dictaminada: { texto: 'Dictaminada', clase: 'dictaminada' },
};

/** Estado de la solicitud con texto, no solo color (diseño-ui.md, accesibilidad). */
export const InsigniaEstado = ({ estado }: { estado: EstadoSolicitud }) => (
  <span className={`insignia ${ESTADOS[estado].clase}`} title={estado === 'PendienteRevision' ? 'Pendiente-revisión' : estado}>
    {ESTADOS[estado].texto}
  </span>
);

export const textoEstado = (estado: EstadoSolicitud) => (estado === 'PendienteRevision' ? 'Pendiente-revisión' : estado);

export const ROL_COLOR: Record<string, string> = { Operador: 'azul', Jefe: 'naranja', Lector: '', Administrador: 'violeta' };
export const EtiquetaRol = ({ rol }: { rol: string }) => <span className={`etiqueta ${ROL_COLOR[rol] ?? ''}`}>{rol}</span>;

// ── Pestañas y paginación ───────────────────────────────────────────────────────────────────────

export function Pestanas<T extends string>({ opciones, valor, onCambio, etiqueta }: { opciones: { valor: T; texto: ReactNode }[]; valor: T; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div className="pestanas" role="tablist" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button key={o.valor} role="tab" aria-selected={o.valor === valor} onClick={() => onCambio(o.valor)}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Paginacion({ pagina, paginas, onCambio }: { pagina: number; paginas: number; onCambio: (p: number) => void }) {
  if (paginas <= 1) return null;
  const numeros = Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pagina) <= 1);
  return (
    <nav className="paginacion" aria-label="Páginas">
      <button aria-label="Página anterior" disabled={pagina === 1} onClick={() => onCambio(pagina - 1)}>
        ‹
      </button>
      {numeros.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - numeros[i - 1] > 1 && <span aria-hidden>…</span>}
          <button aria-current={n === pagina ? 'page' : undefined} onClick={() => onCambio(n)}>
            {n}
          </button>
        </span>
      ))}
      <button aria-label="Página siguiente" disabled={pagina === paginas} onClick={() => onCambio(pagina + 1)}>
        ›
      </button>
    </nav>
  );
}

/** Pagina una lista ya cargada: devuelve la página actual y el texto "Mostrando 1–30 de 84". */
export function usePaginado<T>(items: T[] | null | undefined, porPagina: number, reiniciarCon: unknown[] = []) {
  const [pagina, setPagina] = useState(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPagina(1), reiniciarCon);
  const total = items?.length ?? 0;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const actual = Math.min(pagina, paginas);
  const desde = (actual - 1) * porPagina;
  return {
    pagina: actual,
    paginas,
    setPagina,
    visibles: (items ?? []).slice(desde, desde + porPagina),
    resumen: total ? `Mostrando ${desde + 1}–${Math.min(desde + porPagina, total)} de ${total}` : '',
  };
}

// ── Modal ───────────────────────────────────────────────────────────────────────────────────────

export function Modal({ titulo, children, onCerrar, etiqueta }: { titulo?: string; children: ReactNode; onCerrar?: () => void; etiqueta?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar?.();
    window.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('keydown', tecla);
      anterior?.focus?.();
    };
  }, [onCerrar]);
  return (
    <div className="velo" onClick={(e) => e.target === e.currentTarget && onCerrar?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={etiqueta ?? titulo} ref={ref}>
        {titulo && <h2>{titulo}</h2>}
        {children}
      </div>
    </div>
  );
}

// ── Avisos ──────────────────────────────────────────────────────────────────────────────────────

type TipoAviso = 'info' | 'exito' | 'error' | 'advertencia' | 'neutro' | 'simulado';

export function Aviso({ tipo = 'info', titulo, children }: { tipo?: TipoAviso; titulo?: string; children?: ReactNode }) {
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {titulo && <b>{tipo === 'error' || tipo === 'advertencia' ? `⚠ ${titulo}` : titulo}</b>}
      {children}
    </div>
  );
}

/** Marca lo que en la demo representa a un sistema externo o a un dispositivo (SUA, huella). */
export const Simulado = ({ children }: { children: ReactNode }) => (
  <Aviso tipo="simulado" titulo="Simulado en la demo">
    {children}
  </Aviso>
);

export const Cargando = ({ texto = 'Cargando…' }: { texto?: string }) => (
  <div className="cargando" role="status">
    {texto}
  </div>
);

export const Vacio = ({ children }: { children: ReactNode }) => (
  <div className="vacio" role="status">
    {children}
  </div>
);

export function ErrorConReintento({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  return (
    <Aviso tipo="error" titulo="No se pudo cargar">
      {mensaje}
      <div style={{ marginTop: 8 }}>
        <button className="boton chico contorno" onClick={onReintentar}>
          Reintentar
        </button>
      </div>
    </Aviso>
  );
}

// ── Fechas ──────────────────────────────────────────────────────────────────────────────────────

const ZONA = 'America/Argentina/Buenos_Aires';
/** Fecha a mostrar. Una fecha sin hora (columna DATE) llega como medianoche UTC: se muestra tal cual, sin pasarla a hora argentina. */
export const fecha = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const soloFecha = iso.length === 10 || iso.endsWith('T00:00:00.000Z');
  return new Intl.DateTimeFormat('es-AR', { timeZone: soloFecha ? 'UTC' : ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso));
};
export const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(iso))
        .replace(',', ' ·')
    : '—';
export const iniciales = (texto: string) =>
  texto
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
