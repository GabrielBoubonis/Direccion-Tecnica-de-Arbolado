// Adaptadores SIMULADOS del SUA y de la Autenticación Institucional (arquitectura §3).
// Leen y escriben tablas propias de la simulación (prefijo sim_), nunca las del sistema.
import { db } from '../compartido/base-de-datos';
import { ServicioNoDisponible } from '../compartido/errores';
import type { ProveedorAutenticacion, ProveedorReclamos, RegistroSua } from './puertos';

export const INTERRUPTORES = {
  suaCaido: 'sua_caido',
  autenticacionCaida: 'autenticacion_caida',
  mapasCaido: 'mapas_caido',
} as const;

export async function interruptor(clave: string): Promise<boolean> {
  const fila = await db.simConfiguracion.findUnique({ where: { clave } });
  return fila?.valor === 'si';
}

export const autenticacionSimulada: ProveedorAutenticacion = {
  async consultarVigencia(nombreUsuario) {
    if (await interruptor(INTERRUPTORES.autenticacionCaida))
      throw new ServicioNoDisponible('Autenticación Institucional');
    const fila = await db.simUsuarioInstitucional.findUnique({ where: { nombreUsuario } });
    if (!fila) return 'inexistente';
    return fila.vigente ? 'vigente' : 'no-vigente';
  },
};

export const suaSimulado: ProveedorReclamos = {
  async consultarDerivaciones(filtro) {
    if (await interruptor(INTERRUPTORES.suaCaido)) throw new ServicioNoDisponible('SUA');
    const filas = await db.simSuaSolicitud.findMany({
      where: { leido: false, tipo: filtro.tipo, subtipo: filtro.subtipo, areaDerivada: filtro.areaDerivada },
      orderBy: { id: 'asc' },
    });
    return filas.map(
      (f): RegistroSua => ({
        idExterno: f.id,
        numeroSua: f.numeroSua,
        anio: f.anio,
        tipo: f.tipo,
        subtipo: f.subtipo,
        areaDerivada: f.areaDerivada,
        distrito: f.distrito,
        prioridad: f.prioridad,
        direccion: f.direccion,
        descripcionReclamo: f.descripcionReclamo,
        esTormenta: f.esTormenta,
        esRederivacion: f.esRederivacion,
        fechaDerivacion: f.fechaDerivacion.toISOString().slice(0, 10),
      }),
    );
  },
  async confirmarLectura(ids) {
    await db.simSuaSolicitud.updateMany({ where: { id: { in: ids } }, data: { leido: true } });
  },
  async enviarDatosComplementarios(numeroSua, anio, contenido) {
    if (await interruptor(INTERRUPTORES.suaCaido)) throw new ServicioNoDisponible('SUA');
    const fila = await db.simSuaDatosComplementarios.create({
      data: { numeroSua, anio, contenido: contenido as object },
    });
    return { acuse: `SUA-ACUSE-${String(fila.id).padStart(6, '0')}` };
  },
};
