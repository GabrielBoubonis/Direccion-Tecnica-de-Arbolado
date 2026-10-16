// Carga los datos de prueba ficticios de datos-prueba/ (ver datos-prueba/README-datos-prueba.md).
// Vacía la base y la deja en el estado inicial de la demo. La usan `npm run db:seed`, la preparación de
// la base en el despliegue, el Simulador externo ("Volver la demo al estado inicial") y las pruebas.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { db } from '../compartido/base-de-datos';
import { configuracion, ESQUEMA } from '../compartido/configuracion';
import { normalizarTexto } from '../dominio/usuarios';
import { columnaDeFecha } from '../dominio/tiempo';
import { mapas } from '../integraciones';
import { esDireccionDePrueba, mapasDePrueba } from '../integraciones/mapas-de-prueba';
import { calcularHash, type DictamenCompleto } from './firma';

const DATOS = join(__dirname, '../../../datos-prueba');
const leer = <T>(archivo: string): T => JSON.parse(readFileSync(join(DATOS, archivo), 'utf8')) as T;

interface SolicitudSua {
  numero_sua: string;
  anio: number;
  tipo: string;
  subtipo: string;
  area_derivada: string;
  distrito: string;
  prioridad: string;
  direccion: string;
  descripcion_reclamo: string;
  es_tormenta: boolean;
  es_rederivacion: boolean;
  fecha_derivacion: string;
}

interface DictamenPrueba {
  id_dictamen: number;
  numero_sua: string;
  anio: number;
  nombre_usuario: string;
  nota_numero: number | null;
  expediente_numero: number | null;
  fecha_emision: string;
  domicilio_ejemplar: string;
  referencia_ubicacion: string | null;
  id_especie: number;
  distancia_medianera_referencia: number | null;
  cantidad_frente: number;
  nivel_dano_vereda: string | null;
  es_extraccion: boolean;
  perimetro_tronco: number | null;
  motivo_extraccion: string | null;
  es_sin_trabajo: boolean;
  motivo_sin_trabajo: string | null;
  complejidad: string;
  urgente: boolean;
  arbol_frente_garage: boolean;
  media_tension: boolean;
  de_oficio: boolean;
  plantar: string | null;
  nivel_prioridad: string;
  observaciones: string | null;
  trabajos_aereos: { tipo_trabajo: string }[];
  trabajos_subterraneos: { tipo_trabajo: string; distancia_borde?: number | null }[];
  fotografias: { archivo_referencia: string; orden: number }[];
  vigente: boolean | null;
}

/** Estado esperado de cada solicitud según la columna estado_esperado_en_sistema del CSV. */
function estadosEsperados(): Map<string, 'Pendiente' | 'Dictaminada' | 'PendienteRevision'> {
  const lineas = readFileSync(join(DATOS, 'solicitudes-sua.csv'), 'utf8').trim().split(/\r?\n/).slice(1);
  const mapa = new Map<string, 'Pendiente' | 'Dictaminada' | 'PendienteRevision'>();
  for (const l of lineas) {
    const celdas = l.split(',');
    const estado = celdas[celdas.length - 1].trim();
    mapa.set(`${celdas[0]}-${celdas[1]}`, estado === 'Pendiente-revisión' ? 'PendienteRevision' : (estado as 'Pendiente' | 'Dictaminada'));
  }
  return mapa;
}

async function vaciar() {
  const tablas = [
    'caso_revision', 'fotografia', 'trabajo_aereo', 'trabajo_subterraneo', 'ruta_solicitud', 'ruta', 'dictamen',
    'historial_derivacion', 'solicitud', 'especie', 'archivo_foto', 'registro_auditoria', 'dispositivo',
    'sesion_refresco', 'intento_login', 'usuario', 'sim_sua_solicitud', 'sim_sua_datos_complementarios',
    'sim_usuario_institucional', 'sim_configuracion', 'estado_tarea',
  ];
  await db.$executeRawUnsafe(`TRUNCATE ${tablas.map((t) => `"${ESQUEMA}"."${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Deja la base en el estado inicial de la demo. La usan `npm run db:seed` y las pruebas de integración. */
export async function cargarDatosDePrueba(registrar: (texto: string) => void = console.log) {
  const console = { log: registrar };
  console.log('Vaciando la base…');
  await vaciar();

  // Autenticación Institucional simulada.
  const institucionales = leer<{ nombre_usuario: string; nombre_completo: string; vigente: boolean }[]>('usuarios-institucionales.json');
  await db.simUsuarioInstitucional.createMany({
    data: institucionales.map((u) => ({ nombreUsuario: u.nombre_usuario, nombreCompleto: u.nombre_completo, vigente: u.vigente })),
  });

  // Usuarios del sistema: la contraseña de demostración se guarda solo hasheada (RNF-05).
  const usuarios = leer<{ nombre_usuario: string; password_demo: string; rol: 'Lector' | 'Operador' | 'Jefe' | 'Administrador'; activo: boolean; fecha_alta: string }[]>('usuarios-sistema.json');
  for (const u of usuarios)
    await db.usuario.create({
      data: {
        nombreUsuario: u.nombre_usuario,
        contrasenaHash: await bcrypt.hash(u.password_demo, configuracion.costoBcrypt),
        rol: u.rol,
        activo: u.activo,
        fechaAlta: columnaDeFecha(u.fecha_alta),
      },
    });
  console.log(`${usuarios.length} usuarios y ${institucionales.length} usuarios institucionales.`);

  const especies = leer<{ id_especie: number; nombre_comun: string; nombre_cientifico: string | null; activa: boolean }[]>('especies.json');
  await db.especie.createMany({
    data: especies.map((e) => ({
      idEspecie: e.id_especie,
      nombreComun: e.nombre_comun,
      nombreNormalizado: normalizarTexto(e.nombre_comun),
      nombreCientifico: e.nombre_cientifico,
      activa: e.activa,
    })),
  });
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${ESQUEMA}".especie', 'id_especie'), (SELECT MAX(id_especie) FROM "${ESQUEMA}".especie))`);

  // Base simulada del SUA, ya leída por el sistema.
  const sua = leer<SolicitudSua[]>('solicitudes-sua.json');
  await db.simSuaSolicitud.createMany({
    data: sua.map((s) => ({
      numeroSua: s.numero_sua,
      anio: s.anio,
      tipo: s.tipo,
      subtipo: s.subtipo,
      areaDerivada: s.area_derivada,
      distrito: s.distrito,
      prioridad: s.prioridad,
      direccion: s.direccion,
      descripcionReclamo: s.descripcion_reclamo,
      esTormenta: s.es_tormenta,
      esRederivacion: s.es_rederivacion,
      fechaDerivacion: columnaDeFecha(s.fecha_derivacion),
      leido: true,
    })),
  });

  // Solicitudes del sistema, geocodificadas una sola vez (Decisión 9). Las direcciones de los datos de
  // prueba usan sus coordenadas fijas aunque haya clave de OpenRouteService, para que la demo arranque
  // siempre igual; OpenRouteService ubica las que se deriven después y calcula las rutas.
  const estados = estadosEsperados();
  let ubicadas = 0;
  for (const s of sua) {
    let lat: number | null = null;
    let lng: number | null = null;
    let geoError: string | null = null;
    try {
      const p = await (esDireccionDePrueba(s.direccion) ? mapasDePrueba : mapas).geocodificar(s.direccion);
      if (p) ({ lat, lng } = p);
      else geoError = 'Dirección ambigua: no se pudo ubicar con precisión.';
    } catch {
      geoError = 'El servicio de mapas no respondió.';
    }
    if (lat != null) ubicadas++;
    await db.solicitud.create({
      data: {
        numeroSua: s.numero_sua,
        anio: s.anio,
        distrito: s.distrito,
        prioridad: s.prioridad,
        direccion: s.direccion,
        descripcionReclamo: s.descripcion_reclamo,
        esTormenta: s.es_tormenta,
        fechaUltimaDerivacion: columnaDeFecha(s.fecha_derivacion),
        estado: estados.get(`${s.numero_sua}-${s.anio}`) ?? 'Pendiente',
        latitud: lat,
        longitud: lng,
        geoError,
        geoIntentos: 1,
        geoUltimoIntento: new Date(),
      },
    });
  }
  console.log(`${sua.length} solicitudes (${ubicadas} ubicadas en el mapa).`);

  const historial = leer<{ numero_sua: string; anio: number; fecha_derivacion: string; motivo: string }[]>('historial-derivaciones.json');
  await db.historialDerivacion.createMany({
    data: historial.map((h) => ({ numeroSua: h.numero_sua, anio: h.anio, fechaDerivacion: columnaDeFecha(h.fecha_derivacion), motivo: h.motivo })),
  });

  // Fotografías de relleno.
  for (const n of [1, 2, 3])
    await db.archivoFoto.create({
      data: { id: `prueba-${n}`, tipoMime: 'image/jpeg', datos: readFileSync(join(DATOS, 'fotos', `foto-prueba-${n}.jpg`)) },
    });

  // Dictámenes ya firmados: el hash se calcula con el mismo algoritmo que usa el sistema al firmar.
  const ejemplo = leer<DictamenPrueba[]>('dictamenes-ejemplo.json');
  const conflicto = leer<{ dictamenes: DictamenPrueba[] }>('dictamenes-conflicto.json').dictamenes;
  for (const d of [...ejemplo, ...conflicto]) {
    const s = await db.solicitud.findUniqueOrThrow({ where: { numeroSua_anio: { numeroSua: d.numero_sua, anio: d.anio } } });
    const borrador: DictamenCompleto = {
      uuid: randomUUID(),
      numeroSua: d.numero_sua,
      anio: d.anio,
      nombreUsuario: d.nombre_usuario,
      fechaEmision: new Date(`${d.fecha_emision}T11:00:00-03:00`),
      notaNumero: d.nota_numero,
      expedienteNumero: d.expediente_numero,
      domicilioEjemplar: d.domicilio_ejemplar,
      // Los datos de prueba no traen el punto del ejemplar: se usa el de la solicitud.
      latitudEjemplar: s.latitud ?? -32.9468,
      longitudEjemplar: s.longitud ?? -60.6393,
      referenciaUbicacion: d.referencia_ubicacion,
      distanciaMedianeraReferencia: d.distancia_medianera_referencia,
      idEspecie: d.id_especie,
      cantidadFrente: d.cantidad_frente,
      nivelDanoVereda: d.nivel_dano_vereda,
      esExtraccion: d.es_extraccion,
      perimetroTronco: d.perimetro_tronco,
      motivoExtraccion: d.motivo_extraccion,
      esSinTrabajo: d.es_sin_trabajo,
      motivoSinTrabajo: d.motivo_sin_trabajo,
      complejidad: d.complejidad,
      urgente: d.urgente,
      arbolFrenteGarage: d.arbol_frente_garage,
      mediaTension: d.media_tension,
      deOficio: d.de_oficio,
      plantar: d.plantar,
      nivelPrioridad: d.nivel_prioridad,
      observaciones: d.observaciones,
      trabajosAereos: d.trabajos_aereos.map((t) => ({ tipoTrabajo: t.tipo_trabajo })),
      trabajosSubterraneos: d.trabajos_subterraneos.map((t) => ({ tipoTrabajo: t.tipo_trabajo, distanciaBorde: t.distancia_borde ?? null })),
      fotografias: d.fotografias.map((f) => ({ archivoReferencia: `foto:prueba-${f.archivo_referencia.match(/(\d)\.jpg$/)?.[1] ?? '1'}`, orden: f.orden })),
    };
    const { trabajosAereos, trabajosSubterraneos, fotografias, ...columnas } = borrador;
    await db.dictamen.create({
      data: {
        ...(columnas as Prisma.DictamenUncheckedCreateInput),
        hashFirma: await calcularHash(borrador),
        vigente: d.vigente,
        firmadoSinConexion: /sin conexión/i.test(d.observaciones ?? ''),
        estadoSincronizacion: 'Sincronizado',
        enviadoSuaEn: borrador.fechaEmision,
        trabajosAereos: { create: trabajosAereos },
        trabajosSubterraneos: { create: trabajosSubterraneos },
        fotografias: { create: fotografias },
      },
    });
  }
  // La 48495 queda en Pendiente-revisión hasta que un Jefe elige el dictamen vigente (RF-59).
  for (const d of conflicto)
    await db.solicitud.update({ where: { numeroSua_anio: { numeroSua: d.numero_sua, anio: d.anio } }, data: { estado: 'PendienteRevision' } });
  console.log(`${ejemplo.length + conflicto.length} dictámenes firmados (${conflicto.length} en conflicto).`);

  const dispositivos = leer<{ id_dispositivo: string; codigo_visible: string; nombre_usuario: string; estado: 'Activo' | 'Bloqueado' | 'Revocado'; fecha_bloqueo: string | null }[]>('dispositivos.json');
  await db.dispositivo.createMany({
    data: dispositivos.map((d) => ({
      idDispositivo: d.id_dispositivo,
      codigoVisible: d.codigo_visible,
      nombreUsuario: d.nombre_usuario,
      estado: d.estado,
      intentosFallidos: d.estado === 'Bloqueado' ? 5 : 0,
      fechaBloqueo: d.fecha_bloqueo ? new Date(d.fecha_bloqueo) : null,
      fechaRevocacion: d.estado === 'Revocado' ? new Date('2026-10-12T10:00:00-03:00') : null,
    })),
  });

  const casos = leer<{ tipo: string; referencia_solicitud: string; motivo: string; fecha_hora: string }[]>('casos-revision.json');
  await db.casoRevision.createMany({
    data: casos.map((c) => ({
      tipo: c.tipo === 'Integridad no verificada' ? 'IntegridadNoVerificada' : 'DatosInvalidosSua',
      referenciaSolicitud: c.referencia_solicitud,
      motivo: c.motivo,
      fechaHora: new Date(c.fecha_hora),
    })),
  });

  await db.simConfiguracion.createMany({
    data: [
      { clave: 'sua_caido', valor: 'no' },
      { clave: 'autenticacion_caida', valor: 'no' },
      { clave: 'mapas_caido', valor: 'no' },
    ],
  });
  console.log('Listo: la base quedó en el estado inicial de la demo.');
}
