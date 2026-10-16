// Puertos hacia los sistemas externos. El núcleo del sistema solo conoce estas interfaces;
// cambiar a los servicios reales es cambiar el adaptador, sin tocar los módulos (arquitectura §3).
import type { Punto } from '../dominio/geometria';
import type { Matriz } from '../dominio/ruteo';

/** Autenticación Institucional: valida usuario + API key propia del sistema (RF-02, RNF-06). */
export interface ProveedorAutenticacion {
  /** Lanza ServicioNoDisponible si el servicio no responde (RF-50). */
  consultarVigencia(nombreUsuario: string): Promise<'vigente' | 'no-vigente' | 'inexistente'>;
}

/** Registro tal como llega del SUA, antes de validarlo (RNF-18). */
export interface RegistroSua {
  idExterno: number;
  numeroSua: unknown;
  anio: unknown;
  tipo: unknown;
  subtipo: unknown;
  areaDerivada: unknown;
  distrito: unknown;
  prioridad: unknown;
  direccion: unknown;
  descripcionReclamo: unknown;
  esTormenta: unknown;
  esRederivacion: unknown;
  fechaDerivacion: unknown;
}

/** SUA: lectura de solicitudes derivadas (RF-09) y envío de los datos complementarios (RF-24). */
export interface ProveedorReclamos {
  /** Derivaciones nuevas que cumplen el filtro de RF-09. Lanza ServicioNoDisponible si el SUA cae. */
  consultarDerivaciones(filtro: { tipo: string; subtipo: string; areaDerivada: string }): Promise<RegistroSua[]>;
  confirmarLectura(idsExternos: number[]): Promise<void>;
  /** Lanza ServicioNoDisponible si el SUA cae (RF-25). */
  enviarDatosComplementarios(numeroSua: string, anio: number, contenido: unknown): Promise<{ acuse: string }>;
}

/** Servicio de mapas (RNF-14). */
export interface ServicioMapas {
  readonly disponible: boolean;
  /** Coordenadas de una dirección, o null si es ambigua. Lanza ServicioNoDisponible si no responde. */
  geocodificar(direccion: string): Promise<(Punto & { etiqueta: string }) | null>;
  /** Dirección de un punto del mapa (domicilio del ejemplar, RF-56). */
  geocodificarInverso(p: Punto): Promise<{ etiqueta: string; calle: string | null; numero: string | null } | null>;
  matriz(puntos: Punto[], modo: 'Caminando' | 'Vehiculo'): Promise<Matriz>;
  /** Trazado del recorrido para dibujarlo en el mapa (lista de [lat, lng]). */
  trazado(puntos: Punto[], modo: 'Caminando' | 'Vehiculo'): Promise<[number, number][]>;
}

/** Almacenamiento de las fotografías del dictamen. */
export interface AlmacenFotos {
  guardar(datos: Buffer, tipoMime: string): Promise<string>;
  obtener(referencia: string): Promise<{ datos: Buffer; tipoMime: string } | null>;
}
