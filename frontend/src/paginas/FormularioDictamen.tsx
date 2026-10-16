// Pantalla 4 · Dictamen técnico en 5 pasos (wireframes 04, 04b y 04c; diseño-ui.md Pantalla 4).
// RF-20, RF-21, RF-22, RF-24, RF-28, RF-31, RF-32, RF-43, RF-45, RF-46, RF-51, RF-56, RF-61;
// CU-06, CU-09, CU-10; HU-06, HU-08, HU-09. Las reglas se aplican mientras se completa y el servidor
// las repite al firmar. Sin señal se firma en el captor y queda cifrado en la cola (CU-10).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ErrorApi, get, post, sesionGuardada, urlFoto, type PasoVisible } from '../api/cliente';
import { ModalSegundoFactor, type ResultadoHuella, TrazaDeFirma } from '../componentes/Firma';
import { Fotos } from '../componentes/Fotos';
import { Mapa } from '../componentes/Mapa';
import { type Especie, SelectorEspecie } from '../componentes/SelectorEspecie';
import { Aviso, Cargando, Encabezado, fecha, fechaHora, mensajeDe, Modal, textoEstado, type EstadoSolicitud } from '../componentes/ui';
import { almacen } from '../offline/almacen';
import { claveSolicitud, guardarEnCache, leerDeCache } from '../offline/cache';
import { claveActual } from '../offline/captor';
import { descifrarBytes } from '../offline/cifrado';
import { ErrorGuardadoLocal, type FirmaLocal, firmarYGuardarEnElCaptor, type FotoFormulario, PREFIJO_LOCAL, subirFotoLocal } from '../offline/cola';
import { useConexion } from '../offline/conexion';
import { useClaveAbierta } from '../estado/sesion';
import '../estilos/dictamen.css';

interface Catalogos {
  nivelDanoVereda: string[];
  motivosExtraccion: string[];
  trabajosSubterraneos: string[];
  trabajosAereos: string[];
  motivosSinTrabajo: string[];
  complejidad: string[];
  plantar: string[];
  nivelPrioridad: string[];
}

interface Solicitud {
  numeroSua: string;
  anio: number;
  estado: EstadoSolicitud;
  direccion: string;
  distrito: string;
  descripcion: string;
  esTormenta: boolean;
  lat: number | null;
  lng: number | null;
  enConflicto: boolean;
  dictamenes: { idDictamen: number; nombreUsuario: string; fechaEmision: string; vigente: boolean | null; intervencion: string }[];
}

const CORTE_VERTICAL = 'Corte vertical de raíces';
const LARGO_REFERENCIA = 200;
const LARGO_OBSERVACIONES = 1000;
const PASOS = [
  { corto: 'Datos', titulo: 'Datos del ejemplar y ubicación' },
  { corto: 'Diagnóst.', titulo: 'Diagnóstico' },
  { corto: 'Intervenc.', titulo: 'Trabajos de intervención' },
  { corto: 'Adicional', titulo: 'Información adicional y fotografías' },
  { corto: 'Firma', titulo: 'Observaciones y firma' },
];

interface Estado {
  notaNumero: string;
  expedienteNumero: string;
  ejemplar: { lat: number; lng: number; etiqueta: string } | null;
  referenciaUbicacion: string;
  distanciaMedianeraReferencia: string;
  especie: Especie | null;
  cantidadFrente: string;
  nivelDanoVereda: string;
  esExtraccion: boolean;
  perimetroTronco: string;
  motivoExtraccion: string;
  esSinTrabajo: boolean;
  motivoSinTrabajo: string;
  subterraneos: string[];
  distanciaBorde: string;
  aereos: string[];
  complejidad: string;
  urgente: boolean;
  arbolFrenteGarage: boolean;
  mediaTension: boolean;
  deOficio: boolean;
  plantar: string;
  fotografias: FotoFormulario[];
  nivelPrioridad: string;
  observaciones: string;
}

/** El formulario arranca en blanco, también en Pendiente-revisión (RF-28, HU-08 criterio 1). */
const INICIAL: Estado = {
  notaNumero: '',
  expedienteNumero: '',
  ejemplar: null,
  referenciaUbicacion: '',
  distanciaMedianeraReferencia: '',
  especie: null,
  cantidadFrente: '1',
  nivelDanoVereda: '',
  esExtraccion: false,
  perimetroTronco: '',
  motivoExtraccion: '',
  esSinTrabajo: false,
  motivoSinTrabajo: '',
  subterraneos: [],
  distanciaBorde: '',
  aereos: [],
  complejidad: '',
  urgente: false,
  arbolFrenteGarage: false,
  mediaTension: false,
  deOficio: false,
  plantar: 'ninguna',
  fotografias: [],
  nivelPrioridad: '',
  observaciones: '',
};

const soloEntero = (v: string) => v.replace(/\D/g, '');
const soloDecimal = (v: string) => v.replace(',', '.').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** Qué falta o qué choca, por paso. Son las mismas reglas que valida el servidor (RF-20). */
function validar(e: Estado): string[][] {
  const f: string[][] = [[], [], [], [], []];
  if (e.notaNumero && !(Number(e.notaNumero) > 0)) f[0].push('La Nota N.° tiene que ser un número entero positivo.');
  if (e.expedienteNumero && !(Number(e.expedienteNumero) > 0)) f[0].push('El Expediente N.° tiene que ser un número entero positivo.');
  if (!e.ejemplar) f[0].push('Marcá en el mapa el domicilio del ejemplar.');
  if (!e.especie) f[0].push('Elegí la especie.');
  if (!(Number(e.cantidadFrente) >= 1)) f[0].push('La cantidad de ejemplares al frente tiene que ser 1 o más.');
  if (e.esExtraccion && !e.perimetroTronco) f[1].push('Con Extracción, el perímetro del tronco es obligatorio.');
  if (e.esExtraccion && !e.motivoExtraccion) f[1].push('Con Extracción, elegí el motivo de extracción.');
  if (e.esSinTrabajo && !e.motivoSinTrabajo) f[1].push('Con "Sin trabajo", elegí el motivo.');
  if (e.subterraneos.includes(CORTE_VERTICAL) && !e.distanciaBorde) f[2].push('El corte vertical de raíces lleva la distancia al borde del árbol.');
  if (!e.esExtraccion && !e.esSinTrabajo && e.subterraneos.length + e.aereos.length === 0)
    f[2].push('El dictamen tiene que decir algo: marcá Extracción, algún trabajo o "Sin trabajo" (RF-61).');
  if (!e.complejidad) f[3].push('Elegí la complejidad de la intervención.');
  if (e.fotografias.length === 0) f[3].push('Cargá al menos una fotografía del ejemplar (RF-45).');
  if (!e.nivelPrioridad) f[4].push('Elegí el nivel de prioridad de la intervención.');
  return f;
}

function aFormulario(e: Estado, fotos = e.fotografias) {
  return {
    notaNumero: num(e.notaNumero),
    expedienteNumero: num(e.expedienteNumero),
    domicilioEjemplar: e.ejemplar?.etiqueta ?? '',
    latitudEjemplar: e.ejemplar?.lat,
    longitudEjemplar: e.ejemplar?.lng,
    referenciaUbicacion: e.referenciaUbicacion.trim() || null,
    distanciaMedianeraReferencia: num(e.distanciaMedianeraReferencia),
    idEspecie: e.especie?.idEspecie,
    cantidadFrente: Number(e.cantidadFrente),
    nivelDanoVereda: e.nivelDanoVereda || null,
    esExtraccion: e.esExtraccion,
    perimetroTronco: e.esExtraccion ? num(e.perimetroTronco) : null,
    motivoExtraccion: e.esExtraccion ? e.motivoExtraccion || null : null,
    esSinTrabajo: e.esSinTrabajo,
    motivoSinTrabajo: e.esSinTrabajo ? e.motivoSinTrabajo || null : null,
    trabajosSubterraneos: e.subterraneos.map((t) => ({ tipoTrabajo: t, distanciaBorde: t === CORTE_VERTICAL ? num(e.distanciaBorde) : null })),
    trabajosAereos: e.aereos,
    complejidad: e.complejidad,
    urgente: e.urgente,
    arbolFrenteGarage: e.arbolFrenteGarage,
    mediaTension: e.mediaTension,
    deOficio: e.deOficio,
    plantar: e.plantar || null,
    fotografias: fotos.map((f) => f.ref),
    nivelPrioridad: e.nivelPrioridad,
    observaciones: e.observaciones.trim() || null,
  };
}

/** Con señal pide y guarda una copia; sin señal usa la copia guardada en el captor. */
async function conCopia<T>(ruta: string, clave: string): Promise<T> {
  if (navigator.onLine) {
    try {
      const datos = await get<T>(ruta);
      await guardarEnCache(clave, datos);
      return datos;
    } catch (e) {
      if (!(e instanceof ErrorApi) || e.codigo !== 'SIN_CONEXION') throw e;
    }
  }
  const copia = await leerDeCache<T>(clave);
  if (copia) return copia;
  throw new Error('Esta solicitud no está guardada en el captor: necesitás señal para abrirla. Las de tu ruta se guardan al verla con señal.');
}

/** Vuelve a mostrar las fotos de un borrador (las del captor se descifran de nuevo). */
async function vistasDeFotos(fotos: FotoFormulario[]): Promise<FotoFormulario[]> {
  const clave = claveActual();
  const salida: FotoFormulario[] = [];
  for (const f of fotos) {
    if (!f.ref.startsWith(PREFIJO_LOCAL)) {
      salida.push({ ...f, vista: urlFoto(f.ref) });
      continue;
    }
    const local = await almacen.fotos.get(f.ref.slice(PREFIJO_LOCAL.length));
    if (!clave || !local) continue;
    salida.push({ ...f, vista: URL.createObjectURL(new Blob([await descifrarBytes(clave, local.contenido)], { type: local.tipoMime })) });
  }
  return salida;
}

type Resultado =
  | { tipo: 'firmado'; idDictamen: number; pasos: PasoVisible[] }
  | { tipo: 'firmado-sin-senal'; firma: FirmaLocal }
  | { tipo: 'error-guardado'; mensaje: string; uuid: string };

export function FormularioDictamen() {
  const { numero = '', anio = '' } = useParams();
  const conexion = useConexion();
  const claveBorrador = `borrador:${numero}-${anio}`;
  const [datos, setDatos] = useState<{ solicitud: Solicitud; catalogos: Catalogos } | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [e, setE] = useState<Estado>(INICIAL);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const [paso, setPaso] = useState(0);
  const [mostrarFallas, setMostrarFallas] = useState<boolean[]>([false, false, false, false, false]);
  const [pidiendoHuella, setPidiendoHuella] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [avisoFirma, setAvisoFirma] = useState<{ tipo: 'error' | 'advertencia'; texto: string } | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [verAnterior, setVerAnterior] = useState(false);
  const [uuid] = useState(() => crypto.randomUUID());
  const listo = useRef(false);
  // Recién ingresado, la clave del captor puede llegar después: se vuelve a cargar para recuperar el borrador.
  const claveAbierta = useClaveAbierta();

  // Carga: solicitud y catálogos (con copia para trabajar sin señal) y el borrador, si había (CU-06 E3).
  useEffect(() => {
    let vivo = true;
    listo.current = false;
    (async () => {
      try {
        const [solicitud, catalogos] = await Promise.all([
          conCopia<Solicitud>(`/solicitudes/${numero}/${anio}`, claveSolicitud(numero, anio)),
          conCopia<Catalogos>('/catalogos', 'catalogos'),
        ]);
        const borrador = await leerDeCache<Estado>(claveBorrador);
        if (!vivo) return;
        setDatos({ solicitud, catalogos });
        if (borrador) {
          setE({ ...INICIAL, ...borrador, fotografias: await vistasDeFotos(borrador.fotografias ?? []) });
          setBorradorRecuperado(true);
        }
      } catch (err) {
        if (vivo) setErrorCarga(mensajeDe(err));
      } finally {
        listo.current = true;
      }
    })();
    return () => {
      vivo = false;
    };
  }, [numero, anio, claveBorrador, claveAbierta]);

  // Borrador cifrado: si la sesión vence mientras se carga, los datos no se pierden (CU-06 E3).
  useEffect(() => {
    if (!listo.current || resultado) return;
    const t = setTimeout(() => void guardarEnCache(claveBorrador, { ...e, fotografias: e.fotografias.map((f) => ({ ...f, vista: '' })) }), 600);
    return () => clearTimeout(t);
  }, [e, claveBorrador, resultado]);

  const fallas = useMemo(() => validar(e), [e]);
  const cambiar = (c: Partial<Estado>) => setE((x) => ({ ...x, ...c }));

  const titulo = `SUA ${numero}-${anio}`;
  if (errorCarga)
    return (
      <>
        <Encabezado titulo="Dictamen técnico" subtitulo={titulo} volver />
        <main className="cuerpo">
          <Aviso tipo="error" titulo="No se puede abrir el formulario">
            {errorCarga}
          </Aviso>
        </main>
      </>
    );
  if (!datos)
    return (
      <>
        <Encabezado titulo="Dictamen técnico" subtitulo={titulo} volver />
        <Cargando />
      </>
    );
  const { solicitud: s, catalogos: cat } = datos;

  // ── Resultado de la firma ─────────────────────────────────────────────────────────────────────
  if (resultado?.tipo === 'firmado' || resultado?.tipo === 'firmado-sin-senal')
    return (
      <>
        <Encabezado titulo="Dictamen firmado" subtitulo={titulo} volver="/rutas" />
        <main className="cuerpo">
          {resultado.tipo === 'firmado' ? (
            <>
              <Aviso tipo="exito" titulo={`Dictamen N.° ${resultado.idDictamen} firmado`}>
                Así lo procesó el sistema, paso a paso. Lo marcado como "Simulado" representa a sistemas externos o al sensor del captor.
              </Aviso>
              <TrazaDeFirma pasos={resultado.pasos} idDictamen={resultado.idDictamen} numeroSua={s.numeroSua} anio={s.anio} />
            </>
          ) : (
            <>
              <Aviso tipo="advertencia" titulo="Firmado sin señal: pendiente de sincronizar">
                El dictamen quedó firmado y guardado cifrado en el captor (RF-32, RNF-16). Se envía solo apenas vuelva la señal, sin que hagas nada
                (RF-33). El servidor va a recalcular el hash para verificar que no cambió (RF-53).
              </Aviso>
              <TrazaDeFirma
                numeroSua={s.numeroSua}
                anio={s.anio}
                pasos={[
                  { titulo: 'Verificación biométrica (segundo factor)', detalle: 'En el captor, WebAuthn pide la huella. En esta demo se simula.', simulado: true, requisito: 'RF-51' },
                  { titulo: 'Validación del formulario', detalle: 'Las mismas reglas que aplica el servidor, repetidas en el captor.', simulado: false, requisito: 'RF-45, RF-46, RF-56, RF-61' },
                  {
                    titulo: 'Firma digital en el captor',
                    detalle: 'SHA-256 sobre el JSON canónico del dictamen, con fecha y hora, el usuario y las huellas de las fotos. Es el mismo cálculo que hace el servidor.',
                    simulado: false,
                    requisito: 'RF-22, RF-31',
                    datos: { hash: resultado.firma.hashFirma, fechaHora: resultado.firma.fechaEmision, usuario: sesionGuardada()?.usuario.nombreUsuario, contenidoCanonico: resultado.firma.textoFirmado },
                  },
                  { titulo: 'Guardado cifrado en el captor', detalle: 'AES-GCM, en estado "pendiente de sincronizar". Se borra del captor cuando el servidor confirma la recepción.', simulado: false, requisito: 'RF-32, RNF-16' },
                ]}
              />
            </>
          )}
        </main>
      </>
    );

  // ── No se puede dictaminar ────────────────────────────────────────────────────────────────────
  if (s.estado === 'Dictaminada' || s.enConflicto)
    return (
      <>
        <Encabezado titulo="Dictamen técnico" subtitulo={titulo} volver />
        <main className="cuerpo">
          <Aviso tipo="advertencia" titulo={s.enConflicto ? 'Dictámenes en conflicto' : 'El caso ya fue dictaminado'}>
            {s.enConflicto
              ? 'Esta solicitud tiene dos dictámenes esperando que un Jefe elija el vigente: no se puede dictaminar de nuevo.'
              : 'Esta solicitud ya tiene un dictamen activo (RF-21).'}{' '}
            <Link to={`/solicitudes/${s.numeroSua}/${s.anio}`}>Ver el detalle</Link>
          </Aviso>
        </main>
      </>
    );

  // ── Navegación entre pasos ────────────────────────────────────────────────────────────────────
  const marcarFallas = (i: number) => setMostrarFallas((m) => m.map((v, k) => (k === i ? true : v)));
  const siguiente = () => {
    if (fallas[paso].length) return marcarFallas(paso);
    setPaso(paso + 1);
    window.scrollTo(0, 0);
  };
  const alFirmar = () => {
    const primero = fallas.findIndex((f) => f.length);
    if (primero >= 0) {
      setMostrarFallas([true, true, true, true, true]);
      setPaso(primero);
      setAvisoFirma({ tipo: 'error', texto: 'Faltan datos obligatorios: revisá los campos marcados (RF-20).' });
      return;
    }
    setAvisoFirma(null);
    setPidiendoHuella(true);
  };

  async function guardarEnElCaptor(uuidFirma: string) {
    try {
      const firma = await firmarYGuardarEnElCaptor({
        numeroSua: s.numeroSua,
        anio: s.anio,
        formulario: aFormulario(e),
        fotos: e.fotografias,
        segundoFactor: { metodo: 'huella-simulada', verificado: true },
        uuid: uuidFirma,
      });
      await almacen.cache.delete(claveBorrador);
      setResultado({ tipo: 'firmado-sin-senal', firma });
    } catch (err) {
      if (err instanceof ErrorGuardadoLocal) setResultado({ tipo: 'error-guardado', mensaje: err.message, uuid: uuidFirma });
      else setAvisoFirma({ tipo: 'error', texto: mensajeDe(err) });
    }
  }

  async function trasLaHuella(r: ResultadoHuella) {
    setPidiendoHuella(false);
    if (r !== 'aceptada') {
      // CU-06 paso 4.1: sin segundo factor no se firma y los datos quedan cargados.
      setAvisoFirma({
        tipo: 'advertencia',
        texto: r === 'rechazada' ? 'La huella no coincide: el dictamen no se firmó. Tus datos siguen cargados.' : 'Cancelaste la verificación: el dictamen no se firmó. Tus datos siguen cargados.',
      });
      return;
    }
    setFirmando(true);
    try {
      if (!navigator.onLine) return await guardarEnElCaptor(uuid);
      const fotos: FotoFormulario[] = [];
      for (const f of e.fotografias) fotos.push(await subirFotoLocal(f));
      if (fotos.some((f, i) => f.ref !== e.fotografias[i].ref)) cambiar({ fotografias: fotos });
      const res = await post<{ dictamen: { idDictamen: number }; pasos: PasoVisible[] }>('/dictamenes', {
        uuid,
        numeroSua: s.numeroSua,
        anio: s.anio,
        formulario: aFormulario(e, fotos),
        segundoFactor: { metodo: 'huella-simulada', verificado: true },
      });
      await almacen.cache.delete(claveBorrador);
      window.dispatchEvent(new Event('tormenta-cambio'));
      setResultado({ tipo: 'firmado', idDictamen: res.dictamen.idDictamen, pasos: res.pasos });
    } catch (err) {
      // RNF-04: sin respuesta en 10 segundos se sigue el camino sin señal, con el mismo identificador.
      if (err instanceof ErrorApi && err.codigo === 'SIN_CONEXION') return await guardarEnElCaptor(uuid);
      if (err instanceof ErrorApi && err.codigo === 'YA_DICTAMINADA')
        setAvisoFirma({ tipo: 'error', texto: 'Otro ingeniero ya firmó un dictamen para este caso: el tuyo no se guardó (RF-21).' });
      else if (err instanceof ErrorApi && Array.isArray(err.detalle) && err.detalle.length)
        setAvisoFirma({ tipo: 'error', texto: (err.detalle as { mensaje: string }[]).map((x) => x.mensaje).join(' ') });
      else setAvisoFirma({ tipo: 'error', texto: mensajeDe(err) });
    } finally {
      setFirmando(false);
    }
  }

  const deshabilitarSinTrabajo = e.esExtraccion || e.subterraneos.length > 0 || e.aereos.length > 0;
  const fallasDelPaso = mostrarFallas[paso] ? fallas[paso] : [];
  const conError = (texto: string) => fallasDelPaso.some((f) => f.includes(texto));
  const anteriores = s.dictamenes.filter((d) => d.vigente !== null);

  // ── 04c: falló el guardado local ──────────────────────────────────────────────────────────────
  const errorGuardado = resultado?.tipo === 'error-guardado' ? resultado : null;

  return (
    <>
      <Encabezado titulo="Dictamen técnico" subtitulo={`${titulo} · Paso ${paso + 1} de 5`} volver />
      <main className="cuerpo dictamen">
        <ol className="pasos" aria-label="Pasos del dictamen">
          {PASOS.map((p, i) => (
            <li key={p.corto} className={i < paso ? 'hecho' : i === paso ? 'actual' : ''} aria-current={i === paso ? 'step' : undefined}>
              <button type="button" disabled={i > paso} onClick={() => setPaso(i)} aria-label={`Paso ${i + 1}: ${p.titulo}`}>
                {i < paso ? '✓' : i + 1}
              </button>
              <span>{p.corto}</span>
            </li>
          ))}
        </ol>

        {borradorRecuperado && paso === 0 && (
          <Aviso tipo="info" titulo="Recuperamos lo que habías cargado">
            Tus datos quedaron guardados en el captor mientras completabas el dictamen.{' '}
            <button
              type="button"
              className="boton enlace"
              onClick={() => {
                setE(INICIAL);
                setBorradorRecuperado(false);
                void almacen.cache.delete(claveBorrador);
              }}
            >
              Empezar de nuevo
            </button>
          </Aviso>
        )}

        {errorGuardado && (
          <div className="error-guardado" role="alert">
            <Aviso tipo="error" titulo="No se pudo guardar el dictamen en el dispositivo">
              <p>{errorGuardado.mensaje}</p>
              <p style={{ marginTop: 6 }}>Tus datos cargados en el formulario NO se perdieron: podés reintentar guardar sin volver a completarlos.</p>
            </Aviso>
            <button className="boton ancho mayus" onClick={() => void guardarEnElCaptor(errorGuardado.uuid)}>
              Reintentar guardado
            </button>
          </div>
        )}

        {avisoFirma && (
          <Aviso tipo={avisoFirma.tipo} titulo={avisoFirma.tipo === 'error' ? 'No se firmó' : 'Sin firmar'}>
            {avisoFirma.texto}
          </Aviso>
        )}

        <h2 className="titulo-paso">{PASOS[paso].titulo}</h2>

        {fallasDelPaso.length > 0 && (
          <Aviso tipo="error" titulo="Completá lo que falta">
            <ul className="lista-fallas">
              {fallasDelPaso.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Aviso>
        )}

        {/* ── Paso 1 · Datos del ejemplar y ubicación ── */}
        {paso === 0 && (
          <>
            {s.estado === 'PendienteRevision' && anteriores.length > 0 && (
              <Aviso tipo="info" titulo="Caso re-derivado (Pendiente-revisión)">
                El formulario empieza en blanco. Podés consultar lo que se dictaminó antes sin que se cargue acá (RF-28).{' '}
                <button type="button" className="boton enlace" onClick={() => setVerAnterior(true)}>
                  Ver dictamen anterior
                </button>
              </Aviso>
            )}
            <div className="grilla-2">
              <Campo etiqueta="Distrito" id="distrito">
                <input id="distrito" className="entrada" readOnly value={s.distrito} />
              </Campo>
              <Campo etiqueta="SUA N.°" id="sua">
                <input id="sua" className="entrada" readOnly value={`${s.numeroSua}-${s.anio}`} />
              </Campo>
              <Campo etiqueta="Nota N.°" id="nota">
                <input id="nota" className="entrada" inputMode="numeric" value={e.notaNumero} onChange={(v) => cambiar({ notaNumero: soloEntero(v.target.value).slice(0, 9) })} />
              </Campo>
              <Campo etiqueta="Exp. N.°" id="expediente">
                <input id="expediente" className="entrada" inputMode="numeric" value={e.expedienteNumero} onChange={(v) => cambiar({ expedienteNumero: soloEntero(v.target.value).slice(0, 9) })} />
              </Campo>
            </div>
            <Campo etiqueta="Fecha" id="fecha" ayuda="La fecha y la hora exactas se registran al firmar.">
              <input id="fecha" className="entrada" readOnly value={fecha(new Date().toISOString())} />
            </Campo>
            <Campo etiqueta="Domicilio de la solicitud" id="domicilio-solicitud">
              <input id="domicilio-solicitud" className="entrada" readOnly value={s.direccion} />
            </Campo>
            <div className="campo">
              <span className="rotulo">Descripción del reclamo</span>
              <p className="entrada lectura">{s.descripcion}</p>
              <span className="ayuda">Solo la información técnica del caso (RF-29).</span>
            </div>
            <div className="campo">
              <span className="rotulo obligatorio">Domicilio del ejemplar</span>
              <span className="ayuda">Tocá el mapa donde está el ejemplar: puede diferir del domicilio de la solicitud.</span>
              <Mapa
                puntos={e.ejemplar ? [{ id: 'ejemplar', lat: e.ejemplar.lat, lng: e.ejemplar.lng, color: '#27ae60', etiqueta: 'Ejemplar' }] : s.lat != null && s.lng != null ? [{ id: 's', lat: s.lat, lng: s.lng, color: '#95a5a6', etiqueta: 'Domicilio de la solicitud' }] : []}
                alHacerClic={(lat, lng) => void marcarEjemplar(lat, lng)}
              />
              <div className="domicilio-elegido" aria-live="polite">
                {e.ejemplar ? <b>📍 {e.ejemplar.etiqueta}</b> : <span className={conError('domicilio') ? 'error-campo' : 'ayuda'}>Sin marcar todavía.</span>}
                {s.lat != null && s.lng != null && (
                  <button type="button" className="boton enlace" onClick={() => cambiar({ ejemplar: { lat: s.lat!, lng: s.lng!, etiqueta: s.direccion.replace(/, Santa Fe$/, '') } })}>
                    Usar el domicilio de la solicitud
                  </button>
                )}
              </div>
            </div>
            <Campo etiqueta="Referencia de ubicación" id="referencia" ayuda={`Texto libre, hasta ${LARGO_REFERENCIA} caracteres.`}>
              <input id="referencia" className="entrada" maxLength={LARGO_REFERENCIA} value={e.referenciaUbicacion} onChange={(v) => cambiar({ referenciaUbicacion: v.target.value })} />
            </Campo>
            <div className="campo">
              <label htmlFor="especie" className="obligatorio">
                Especie
              </label>
              <SelectorEspecie valor={e.especie} alElegir={(especie) => cambiar({ especie })} invalido={conError('especie')} />
            </div>
            <div className="grilla-2">
              <Campo etiqueta="Distancia a medianera / referencia (m)" id="distancia-medianera">
                <input id="distancia-medianera" className="entrada" inputMode="decimal" value={e.distanciaMedianeraReferencia} onChange={(v) => cambiar({ distanciaMedianeraReferencia: soloDecimal(v.target.value).slice(0, 6) })} />
              </Campo>
              <Campo etiqueta="Ejemplares al frente" id="cantidad-frente" obligatorio>
                <input id="cantidad-frente" className={`entrada${conError('cantidad') ? ' invalida' : ''}`} inputMode="numeric" value={e.cantidadFrente} onChange={(v) => cambiar({ cantidadFrente: soloEntero(v.target.value).slice(0, 3) })} />
              </Campo>
            </div>
          </>
        )}

        {/* ── Paso 2 · Diagnóstico ── */}
        {paso === 1 && (
          <>
            <fieldset className="seccion">
              <legend className="titulo-bloque">Bloque 1 — Nivel de daño en vereda</legend>
              <div className="opciones-fila" role="radiogroup" aria-label="Nivel de daño en vereda">
                {cat.nivelDanoVereda.map((n) => (
                  <label key={n} className="casilla">
                    <input type="radio" name="dano" checked={e.nivelDanoVereda === n} onChange={() => cambiar({ nivelDanoVereda: n })} />
                    {n}
                  </label>
                ))}
                {e.nivelDanoVereda && (
                  <button type="button" className="boton enlace" onClick={() => cambiar({ nivelDanoVereda: '' })}>
                    Quitar
                  </button>
                )}
              </div>
            </fieldset>
            <fieldset className={`seccion${e.esSinTrabajo ? ' deshabilitada' : ''}`}>
              <legend className="titulo-bloque">Bloque 2 — Extracción</legend>
              <label className={`casilla${e.esSinTrabajo ? ' deshabilitada' : ''}`}>
                <input
                  type="checkbox"
                  checked={e.esExtraccion}
                  disabled={e.esSinTrabajo}
                  onChange={(v) => cambiar({ esExtraccion: v.target.checked, ...(v.target.checked ? {} : { perimetroTronco: '', motivoExtraccion: '' }) })}
                />
                Extracción
              </label>
              {e.esSinTrabajo && <p className="ayuda">Deshabilitado: "Sin trabajo" está marcado (RF-61).</p>}
              {e.esExtraccion && (
                <>
                  <Campo etiqueta="Perímetro del tronco (m)" id="perimetro" obligatorio>
                    <input id="perimetro" className={`entrada${conError('perímetro') ? ' invalida' : ''}`} inputMode="decimal" value={e.perimetroTronco} onChange={(v) => cambiar({ perimetroTronco: soloDecimal(v.target.value).slice(0, 6) })} />
                  </Campo>
                  <Campo etiqueta="Motivo de extracción" id="motivo-extraccion" obligatorio>
                    <select id="motivo-extraccion" className={`entrada${conError('motivo de extracción') ? ' invalida' : ''}`} value={e.motivoExtraccion} onChange={(v) => cambiar({ motivoExtraccion: v.target.value })}>
                      <option value="">Elegí un motivo…</option>
                      {cat.motivosExtraccion.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </Campo>
                </>
              )}
            </fieldset>
            <fieldset className={`seccion${deshabilitarSinTrabajo ? ' deshabilitada' : ''}`}>
              <legend className="titulo-bloque">Bloque 5 — Sin trabajo</legend>
              <label className={`casilla${deshabilitarSinTrabajo ? ' deshabilitada' : ''}`}>
                <input
                  type="checkbox"
                  checked={e.esSinTrabajo}
                  disabled={deshabilitarSinTrabajo}
                  onChange={(v) => cambiar({ esSinTrabajo: v.target.checked, ...(v.target.checked ? {} : { motivoSinTrabajo: '' }) })}
                />
                Sin trabajo
              </label>
              {deshabilitarSinTrabajo && <p className="ayuda">Deshabilitado: hay una intervención marcada. "Sin trabajo" es excluyente (RF-61).</p>}
              {e.esSinTrabajo && (
                <Campo etiqueta="Motivo" id="motivo-sin-trabajo" obligatorio>
                  <select id="motivo-sin-trabajo" className={`entrada${conError('Sin trabajo') ? ' invalida' : ''}`} value={e.motivoSinTrabajo} onChange={(v) => cambiar({ motivoSinTrabajo: v.target.value })}>
                    <option value="">Elegí un motivo…</option>
                    {cat.motivosSinTrabajo.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </Campo>
              )}
            </fieldset>
          </>
        )}

        {/* ── Paso 3 · Intervención (wireframe 04) ── */}
        {paso === 2 && (
          <>
            {e.esExtraccion && (
              <div className="aviso error franja-extraccion" role="status">
                <b>⚠ Extracción marcada en el Paso 2</b>
                Los trabajos aéreos y subterráneos se deshabilitan: no corresponde podar o intervenir raíces de un ejemplar a extraer (RF-46).
              </div>
            )}
            {e.esSinTrabajo && (
              <div className="aviso error franja-extraccion" role="status">
                <b>⚠ "Sin trabajo" marcado en el Paso 2</b>
                Los trabajos aéreos y subterráneos se deshabilitan: "Sin trabajo" es excluyente (RF-61).
              </div>
            )}
            <fieldset className={`seccion${e.esExtraccion || e.esSinTrabajo ? ' deshabilitada' : ''}`} disabled={e.esExtraccion || e.esSinTrabajo}>
              <legend className="titulo-bloque">Bloque 3 — Trabajos en la parte subterránea</legend>
              {cat.trabajosSubterraneos.map((t) => {
                const marcado = e.subterraneos.includes(t);
                return (
                  <div key={t} className="trabajo-con-distancia">
                    <label className="casilla">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => cambiar({ subterraneos: marcado ? e.subterraneos.filter((x) => x !== t) : [...e.subterraneos, t], ...(t === CORTE_VERTICAL && marcado ? { distanciaBorde: '' } : {}) })}
                      />
                      {t}
                    </label>
                    {t === CORTE_VERTICAL && (
                      <input
                        className={`entrada distancia${conError('distancia al borde') ? ' invalida' : ''}`}
                        aria-label="Distancia al borde del árbol (m)"
                        placeholder="Distancia al borde (m)"
                        inputMode="decimal"
                        disabled={!marcado}
                        value={e.distanciaBorde}
                        onChange={(v) => cambiar({ distanciaBorde: soloDecimal(v.target.value).slice(0, 5) })}
                      />
                    )}
                  </div>
                );
              })}
              {(e.esExtraccion || e.esSinTrabajo) && <p className="nota-pie">Deshabilitado — ver aviso arriba</p>}
            </fieldset>
            <fieldset className={`seccion${e.esExtraccion || e.esSinTrabajo ? ' deshabilitada' : ''}`} disabled={e.esExtraccion || e.esSinTrabajo}>
              <legend className="titulo-bloque">Bloque 4 — Trabajos en la parte aérea</legend>
              {cat.trabajosAereos.map((t) => {
                const marcado = e.aereos.includes(t);
                return (
                  <label key={t} className="casilla">
                    <input type="checkbox" checked={marcado} onChange={() => cambiar({ aereos: marcado ? e.aereos.filter((x) => x !== t) : [...e.aereos, t] })} />
                    {t}
                  </label>
                );
              })}
            </fieldset>
            {(e.esExtraccion || e.esSinTrabajo) && (
              <p className="ayuda">Si destildás "{e.esExtraccion ? 'Extracción' : 'Sin trabajo'}" volviendo al Paso 2, estos bloques se reactivan y pueden completarse con selección múltiple.</p>
            )}
          </>
        )}

        {/* ── Paso 4 · Información adicional y fotografías ── */}
        {paso === 3 && (
          <>
            <div className="campo">
              <span className="rotulo obligatorio" id="rotulo-complejidad">
                Complejidad de la intervención
              </span>
              <div className={`segmentos${conError('complejidad') ? ' invalida' : ''}`} role="radiogroup" aria-labelledby="rotulo-complejidad">
                {cat.complejidad.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={e.complejidad === c} onClick={() => cambiar({ complejidad: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="seccion">
              {(
                [
                  ['urgente', 'Urgente'],
                  ['arbolFrenteGarage', 'Árbol frente a garage'],
                  ['mediaTension', 'Media tensión'],
                  ['deOficio', 'De oficio'],
                ] as const
              ).map(([k, texto]) => (
                <label key={k} className="casilla">
                  <input type="checkbox" checked={e[k]} onChange={(v) => cambiar({ [k]: v.target.checked })} />
                  {texto}
                </label>
              ))}
            </div>
            <Campo etiqueta="Plantar árboles" id="plantar">
              <select id="plantar" className="entrada" value={e.plantar} onChange={(v) => cambiar({ plantar: v.target.value })}>
                {cat.plantar.map((p) => (
                  <option key={p} value={p}>
                    {p === 'ninguna' ? 'Ninguna' : p}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="campo">
              <span className="rotulo obligatorio">Fotografías del ejemplar (mínimo 1)</span>
              <Fotos fotos={e.fotografias} alCambiar={(fotografias) => cambiar({ fotografias })} invalido={conError('fotografía')} />
            </div>
          </>
        )}

        {/* ── Paso 5 · Observaciones y firma ── */}
        {paso === 4 && (
          <>
            <div className="campo">
              <span className="rotulo obligatorio" id="rotulo-prioridad">
                Nivel de prioridad de la intervención
              </span>
              <span className="ayuda">Con qué urgencia hay que ejecutar lo dictaminado (no es la prioridad de la solicitud).</span>
              <div className={`segmentos${conError('prioridad') ? ' invalida' : ''}`} role="radiogroup" aria-labelledby="rotulo-prioridad">
                {cat.nivelPrioridad.map((p) => (
                  <button key={p} type="button" role="radio" aria-checked={e.nivelPrioridad === p} onClick={() => cambiar({ nivelPrioridad: p })}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <Campo etiqueta="Observaciones" id="observaciones" ayuda={`${e.observaciones.length}/${LARGO_OBSERVACIONES}`}>
              <textarea id="observaciones" className="entrada" maxLength={LARGO_OBSERVACIONES} value={e.observaciones} onChange={(v) => cambiar({ observaciones: v.target.value })} />
            </Campo>
            <section className="resumen" aria-label="Resumen del dictamen">
              <h3>Resumen</h3>
              <dl>
                <dt>Ejemplar</dt>
                <dd>
                  {e.especie?.nombreComun ?? '—'} · {e.ejemplar?.etiqueta ?? '—'} · {e.cantidadFrente} al frente
                </dd>
                <dt>Diagnóstico</dt>
                <dd>
                  Daño en vereda: {e.nivelDanoVereda || '—'}
                  {e.esExtraccion && ` · Extracción (${e.motivoExtraccion}, perímetro ${e.perimetroTronco} m)`}
                  {e.esSinTrabajo && ` · Sin trabajo (${e.motivoSinTrabajo})`}
                </dd>
                <dt>Intervención</dt>
                <dd>{[...e.subterraneos, ...e.aereos].join(', ') || (e.esExtraccion ? 'Extracción' : e.esSinTrabajo ? 'Sin trabajo' : '—')}</dd>
                <dt>Adicional</dt>
                <dd>
                  Complejidad {e.complejidad || '—'}
                  {e.urgente && ' · Urgente'}
                  {e.arbolFrenteGarage && ' · Frente a garage'}
                  {e.mediaTension && ' · Media tensión'}
                  {e.deOficio && ' · De oficio'} · Plantar: {e.plantar === 'ninguna' ? 'ninguna' : e.plantar} · {e.fotografias.length} foto(s)
                </dd>
              </dl>
            </section>
            {!conexion && (
              <Aviso tipo="advertencia" titulo="Sin señal">
                El dictamen se va a firmar en el captor y quedar cifrado, pendiente de sincronizar. Se envía solo cuando vuelva la señal (CU-10).
              </Aviso>
            )}
          </>
        )}

        <div className="pie-acciones">
          <button type="button" className="boton contorno mayus" disabled={paso === 0 || firmando} onClick={() => setPaso(paso - 1)}>
            Atrás
          </button>
          {paso < 4 ? (
            <button type="button" className="boton mayus" onClick={siguiente}>
              Siguiente
            </button>
          ) : (
            <button type="button" className="boton mayus" disabled={firmando || !!errorGuardado} onClick={alFirmar}>
              {firmando ? 'Firmando…' : 'Firmar'}
            </button>
          )}
        </div>
      </main>

      {pidiendoHuella && <ModalSegundoFactor alTerminar={(r) => void trasLaHuella(r)} />}
      {verAnterior && <DictamenAnterior dictamenes={anteriores} onCerrar={() => setVerAnterior(false)} />}
    </>
  );

  async function marcarEjemplar(lat: number, lng: number) {
    const provisorio = `Punto marcado en el mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    cambiar({ ejemplar: { lat, lng, etiqueta: navigator.onLine ? 'Buscando la dirección…' : provisorio } });
    if (!navigator.onLine) return;
    const r = await get<{ direccion: { etiqueta: string } | null }>(`/mapas/punto?lat=${lat}&lng=${lng}`).catch(() => null);
    cambiar({ ejemplar: { lat, lng, etiqueta: r?.direccion?.etiqueta ?? provisorio } });
  }
}

function Campo({ etiqueta, id, ayuda, obligatorio, children }: { etiqueta: string; id: string; ayuda?: string; obligatorio?: boolean; children: React.ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={id} className={obligatorio ? 'obligatorio' : undefined}>
        {etiqueta}
      </label>
      {children}
      {ayuda && <span className="ayuda">{ayuda}</span>}
    </div>
  );
}

interface DictamenCompletoVista {
  idDictamen: number;
  nombreUsuario: string;
  fechaEmision: string;
  especie: string;
  domicilioEjemplar: string;
  nivelDanoVereda: string | null;
  esExtraccion: boolean;
  motivoExtraccion: string | null;
  esSinTrabajo: boolean;
  motivoSinTrabajo: string | null;
  trabajosAereos: { tipoTrabajo: string }[];
  trabajosSubterraneos: { tipoTrabajo: string; distanciaBorde: number | null }[];
  complejidad: string;
  nivelPrioridad: string;
  observaciones: string | null;
}

/** CU-09: el dictamen anterior se consulta sin cargarlo en el formulario nuevo. */
function DictamenAnterior({ dictamenes, onCerrar }: { dictamenes: Solicitud['dictamenes']; onCerrar: () => void }) {
  const conexion = useConexion();
  const [completos, setCompletos] = useState<DictamenCompletoVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!conexion) return;
    Promise.all(dictamenes.map((d) => get<DictamenCompletoVista>(`/dictamenes/${d.idDictamen}`)))
      .then(setCompletos)
      .catch((e) => setError(mensajeDe(e)));
  }, [dictamenes, conexion]);
  return (
    <Modal titulo={dictamenes.length > 1 ? 'Dictámenes anteriores' : 'Dictamen anterior'} onCerrar={onCerrar}>
      {!conexion && <Aviso tipo="advertencia">La consulta del dictamen anterior requiere conexión. Podés seguir cargando el nuevo (CU-09 E2).</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}
      {conexion && !completos && !error && <Cargando />}
      {completos?.map((d) => (
        <div key={d.idDictamen} className="tarjeta anterior">
          <b>
            Dictamen N.° {d.idDictamen} · firmado por {d.nombreUsuario}
          </b>
          <div className="linea suave">{fechaHora(d.fechaEmision)}</div>
          <div className="linea">Especie: {d.especie} · {d.domicilioEjemplar}</div>
          <div className="linea">Daño en vereda: {d.nivelDanoVereda ?? '—'}</div>
          <div className="linea">
            Intervención:{' '}
            {d.esExtraccion
              ? `Extracción (${d.motivoExtraccion})`
              : d.esSinTrabajo
                ? `Sin trabajo (${d.motivoSinTrabajo})`
                : [...d.trabajosSubterraneos.map((t) => t.tipoTrabajo), ...d.trabajosAereos.map((t) => t.tipoTrabajo)].join(', ')}
          </div>
          <div className="linea">
            Complejidad {d.complejidad} · Prioridad {d.nivelPrioridad}
          </div>
          {d.observaciones && <div className="linea suave">"{d.observaciones}"</div>}
          <Link to={`/dictamenes/${d.idDictamen}`} className="boton enlace">
            Ver completo
          </Link>
        </div>
      ))}
      {!completos && dictamenes.map((d) => <p key={d.idDictamen} className="linea">{`${d.nombreUsuario} · ${fechaHora(d.fechaEmision)} · ${d.intervencion}`}</p>)}
      <div className="acciones-modal">
        <button className="boton" onClick={onCerrar}>
          Volver al formulario
        </button>
      </div>
      <p className="nota-pie">Estado de la solicitud: {textoEstado('PendienteRevision')}. Lo cargado en el formulario se conserva.</p>
    </Modal>
  );
}
