// Módulo 4 · Dictaminación y firma (RF-20 a RF-29, RF-43, RF-45, RF-46, RF-51, RF-56, RF-59, RF-61,
// CU-06 a CU-09, CU-15).
import { type Dictamen, Prisma } from '@prisma/client';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, type Transaccion } from '../compartido/base-de-datos';
import { configuracion, ESQUEMA } from '../compartido/configuracion';
import { conflicto, ErrorNegocio, invalido, noEncontrado, prohibido, ServicioNoDisponible } from '../compartido/errores';
import { asincrono, autenticado, exigir, usuarioDe } from '../compartido/sesion';
import { esquemaFormulario, type Formulario, reglasDelDictamen } from '../dominio/dictamen';
import { camposDesdeFormulario, textoAFirmar } from '../dominio/firma';
import { autenticacionInstitucional, fotos, sua } from '../integraciones';
import { generarPdf } from './pdf';
import { calcularHash, datosComplementarios, datosDeFirma, type DictamenCompleto, huellasDeFotos, sha256 } from './firma';
import { liberarPorDictamen } from './reservas';

export const ESTADO_SINCRONIZADO = 'Sincronizado';
export const ESTADO_PENDIENTE_SUA = 'Pendiente de sincronizar';
/** Firmado sin señal y alterado antes de llegar: no se da por sincronizado (RF-53). */
export const ESTADO_INTEGRIDAD = 'Integridad no verificada';
/** Llegó sin señal cuando otro ingeniero ya había dictaminado: espera la elección de un Jefe (RF-59). */
export const ESTADO_EN_CONFLICTO = 'En espera de un Jefe';

/** Paso del acto de firma, para mostrarlo tal cual en pantalla. */
interface Paso {
  titulo: string;
  detalle: string;
  simulado: boolean;
  requisito: string;
  datos?: unknown;
}

const incluirTodo = {
  trabajosAereos: true,
  trabajosSubterraneos: true,
  fotografias: { orderBy: { orden: 'asc' } },
  especie: true,
} satisfies Prisma.DictamenInclude;

/** Envía al SUA los datos complementarios. Si falla, el dictamen queda pendiente y se reintenta (RF-25). */
export async function enviarAlSua(idDictamen: number): Promise<{ ok: boolean; acuse?: string; contenido: unknown }> {
  const d = await db.dictamen.findUniqueOrThrow({ where: { idDictamen }, include: incluirTodo });
  const contenido = datosComplementarios(d, d.especie.nombreComun);
  try {
    const { acuse } = await sua.enviarDatosComplementarios(d.numeroSua, d.anio, contenido);
    await db.dictamen.update({ where: { idDictamen }, data: { estadoSincronizacion: ESTADO_SINCRONIZADO, enviadoSuaEn: new Date() } });
    return { ok: true, acuse, contenido };
  } catch (e) {
    if (!(e instanceof ServicioNoDisponible)) throw e;
    await db.dictamen.update({ where: { idDictamen }, data: { estadoSincronizacion: ESTADO_PENDIENTE_SUA } });
    return { ok: false, contenido };
  }
}

/** Reintento automático de los envíos al SUA que quedaron pendientes (RF-25, RNF-17). */
export async function reintentarEnviosSua(limite = 10): Promise<{ enviados: number; suaDisponible: boolean }> {
  const pendientes = await db.dictamen.findMany({ where: { estadoSincronizacion: ESTADO_PENDIENTE_SUA, vigente: true }, take: limite, orderBy: { idDictamen: 'asc' } });
  let enviados = 0;
  for (const d of pendientes) {
    if (!(await enviarAlSua(d.idDictamen)).ok) return { enviados, suaDisponible: false };
    enviados++;
  }
  return { enviados, suaDisponible: true };
}

export const rutasDictamenes = Router();

// ── Fotografías ─────────────────────────────────────────────────────────────────────────────────

const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'] as const;

rutasDictamenes.post(
  '/fotos',
  autenticado,
  exigir('dictaminar'),
  asincrono(async (req, res) => {
    const { datos, tipoMime } = z.object({ datos: z.string().min(10), tipoMime: z.enum(TIPOS_FOTO) }).parse(req.body);
    const buffer = Buffer.from(datos, 'base64');
    if (buffer.length > 3 * 1024 * 1024) throw invalido('La fotografía supera los 3 MB.');
    const referencia = await fotos.guardar(buffer, tipoMime);
    res.status(201).json({ referencia, sha256: sha256(buffer), bytes: buffer.length });
  }),
);

/** Las imágenes se piden desde una etiqueta <img>, que no manda cabeceras: el token va en la URL. */
rutasDictamenes.get(
  '/fotos/:ref',
  asincrono(async (req, res) => {
    try {
      jwt.verify(String(req.query.t ?? ''), configuracion.jwtSecreto);
    } catch {
      throw new ErrorNegocio(401, 'SIN_SESION', 'Tenés que iniciar sesión.');
    }
    const f = await fotos.obtener(String(req.params.ref));
    if (!f) throw noEncontrado('La fotografía no existe.');
    res.setHeader('Content-Type', f.tipoMime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(f.datos);
  }),
);

// ── Firma ───────────────────────────────────────────────────────────────────────────────────────

const esquemaSegundoFactor = z.object({ metodo: z.literal('huella-simulada'), verificado: z.boolean() });

const esquemaFirma = z.object({
  uuid: z.string().uuid(),
  numeroSua: z.string().min(1),
  anio: z.number().int(),
  formulario: z.unknown(),
  segundoFactor: esquemaSegundoFactor,
});

/** Valida el formulario con las mismas reglas que la pantalla (RF-20, RF-45, RF-46, RF-56, RF-61). */
async function validarFormulario(formulario: unknown): Promise<Formulario> {
  const f = esquemaFormulario.parse(formulario);
  const fallas = reglasDelDictamen(f);
  if (fallas.length) throw invalido('El dictamen no cumple las reglas del formulario.', fallas);
  const especie = await db.especie.findUnique({ where: { idEspecie: f.idEspecie } });
  if (!especie?.activa) throw invalido('La especie elegida no está en el catálogo (RF-56).');
  for (const ref of f.fotografias) if (!(await fotos.obtener(ref))) throw invalido('Una de las fotografías no se cargó.');
  return f;
}

function borradorDesde(cuerpo: { uuid: string; numeroSua: string; anio: number }, f: Formulario, nombreUsuario: string, fechaEmision: Date): DictamenCompleto {
  return {
    uuid: cuerpo.uuid,
    numeroSua: cuerpo.numeroSua,
    anio: cuerpo.anio,
    nombreUsuario,
    fechaEmision,
    ...(camposDesdeFormulario(f) as Partial<Dictamen>),
    trabajosAereos: f.trabajosAereos.map((tipoTrabajo) => ({ tipoTrabajo })),
    trabajosSubterraneos: f.trabajosSubterraneos.map((t) => ({ tipoTrabajo: t.tipoTrabajo, distanciaBorde: t.distanciaBorde ?? null })),
    fotografias: f.fotografias.map((archivoReferencia, k) => ({ archivoReferencia, orden: k + 1 })),
  };
}

/** Crea el dictamen con sus filas hijas dentro de la transacción dada. */
function crearDictamen(tx: Transaccion, b: DictamenCompleto, extra: Partial<Prisma.DictamenUncheckedCreateInput> & { hashFirma: string }) {
  const { trabajosAereos, trabajosSubterraneos, fotografias, ...columnas } = b;
  return tx.dictamen.create({
    data: {
      ...(columnas as Prisma.DictamenUncheckedCreateInput),
      ...extra,
      trabajosAereos: { create: trabajosAereos },
      trabajosSubterraneos: { create: trabajosSubterraneos },
      fotografias: { create: fotografias },
    },
  });
}

// El nombre va calificado: con el pooler de Supabase no se puede confiar en el search_path de la sesión.
const SOLICITUD = Prisma.raw(`"${ESQUEMA}".solicitud`);

const bloquearSolicitud = (tx: Transaccion, numeroSua: string, anio: number) =>
  tx.$queryRaw`SELECT 1 FROM ${SOLICITUD} WHERE numero_sua = ${numeroSua} AND anio = ${anio} FOR UPDATE`;

rutasDictamenes.post(
  '/dictamenes',
  autenticado,
  exigir('dictaminar'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const cuerpo = esquemaFirma.parse(req.body);
    const pasos: Paso[] = [];

    // Idempotencia: un reintento con el mismo identificador no crea un segundo dictamen (§7.3).
    const previo = await db.dictamen.findUnique({ where: { uuid: cuerpo.uuid } });
    if (previo) {
      res.json({ dictamen: { idDictamen: previo.idDictamen, hashFirma: previo.hashFirma }, pasos: [], repetido: true });
      return;
    }

    pasos.push({
      titulo: 'Sesión del ingeniero',
      detalle: `Firma ${u.nombreUsuario}, con la sesión ya iniciada (rol ${u.rol}).`,
      simulado: false,
      requisito: 'RF-51',
    });

    // Segundo factor (RF-51). En el captor real lo resuelve WebAuthn con la huella; acá se simula.
    if (!cuerpo.segundoFactor.verificado)
      throw new ErrorNegocio(401, 'SEGUNDO_FACTOR', 'La verificación biométrica falló o se canceló. El dictamen no se firmó.');
    pasos.push({
      titulo: 'Verificación biométrica (segundo factor)',
      detalle: 'En el captor, WebAuthn pide la huella del ingeniero antes de firmar. En esta demo la huella se simula.',
      simulado: true,
      requisito: 'RF-51',
    });

    const vigencia = await autenticacionInstitucional.consultarVigencia(u.nombreUsuario).catch((e) => {
      if (e instanceof ServicioNoDisponible) throw new ErrorNegocio(503, 'AUTENTICACION_NO_DISPONIBLE', 'La Autenticación Institucional no responde. Intentá firmar en un rato.');
      throw e;
    });
    if (vigencia !== 'vigente') throw new ErrorNegocio(403, 'USUARIO_NO_VIGENTE', 'Tu usuario no está vigente en la Autenticación Institucional.');
    pasos.push({
      titulo: 'Autenticación Institucional',
      detalle: `Confirmó que ${u.nombreUsuario} sigue vigente (usuario + API key del sistema).`,
      simulado: true,
      requisito: 'RF-02',
    });

    // Validación del formulario: la misma que hace la pantalla, repetida en el servidor.
    const f = await validarFormulario(cuerpo.formulario);
    pasos.push({
      titulo: 'Validación del formulario',
      detalle: 'Listas cerradas, campos obligatorios, Extracción y "Sin trabajo" excluyentes, al menos una fotografía.',
      simulado: false,
      requisito: 'RF-45, RF-46, RF-56, RF-61',
    });

    // Firma digital: SHA-256 del JSON canónico, con fecha y hora y el usuario (RF-22).
    const borrador = borradorDesde(cuerpo, f, u.nombreUsuario, new Date());
    const texto = textoAFirmar(datosDeFirma(borrador, await huellasDeFotos(f.fotografias)));
    const hashFirma = sha256(texto);
    pasos.push({
      titulo: 'Firma digital',
      detalle: 'SHA-256 sobre el JSON canónico del dictamen (claves ordenadas, sin espacios), con fecha y hora y el usuario firmante. Las fotos entran en la firma por su propio SHA-256.',
      simulado: false,
      requisito: 'RF-22',
      datos: { hash: hashFirma, fechaHora: borrador.fechaEmision.toISOString(), usuario: u.nombreUsuario, contenidoCanonico: texto },
    });

    // Guardado atómico: se bloquea la fila de la solicitud para que dos envíos simultáneos no
    // generen dos dictámenes activos (RF-21): el segundo encuentra la solicitud ya dictaminada.
    const creado = await db.$transaction(async (tx) => {
      await bloquearSolicitud(tx, cuerpo.numeroSua, cuerpo.anio);
      const s = await tx.solicitud.findUnique({
        where: { numeroSua_anio: { numeroSua: cuerpo.numeroSua, anio: cuerpo.anio } },
        include: { dictamenes: { select: { vigente: true } } },
      });
      if (!s) throw noEncontrado('La solicitud no existe.');
      if (s.estado === 'Dictaminada') throw conflicto('YA_DICTAMINADA', 'Esta solicitud ya tiene un dictamen activo: otro ingeniero lo firmó antes (RF-21).');
      if (s.dictamenes.filter((x) => x.vigente === null).length > 1)
        throw conflicto('EN_CONFLICTO', 'La solicitud tiene dos dictámenes esperando que un Jefe elija el vigente.');
      const d = await crearDictamen(tx, borrador, { hashFirma, estadoSincronizacion: ESTADO_PENDIENTE_SUA });
      await tx.solicitud.update({ where: { numeroSua_anio: { numeroSua: s.numeroSua, anio: s.anio } }, data: { estado: 'Dictaminada' } });
      await liberarPorDictamen(tx, s.numeroSua, s.anio);
      return d;
    });
    pasos.push({
      titulo: 'Guardado en la base del sistema',
      detalle: `Dictamen N.° ${creado.idDictamen} guardado. La solicitud pasó a Dictaminada y se liberó su reserva en la ruta.`,
      simulado: false,
      requisito: 'RF-17, RF-21, RF-23',
    });

    const envio = await enviarAlSua(creado.idDictamen);
    pasos.push({
      titulo: 'Envío al SUA',
      detalle: envio.ok
        ? `El SUA recibió los datos complementarios (acuse ${envio.acuse}). No se envían el hash ni el estado de sincronización.`
        : 'El SUA no respondió: el dictamen quedó "pendiente de sincronizar" y el sistema reintenta solo.',
      simulado: true,
      requisito: envio.ok ? 'RF-24' : 'RF-24, RF-25',
      datos: { enviado: envio.contenido },
    });

    res.status(201).json({ dictamen: { idDictamen: creado.idDictamen, hashFirma }, pasos });
  }),
);

// ── Sincronización de lo firmado sin señal (RF-31 a RF-33, RF-53, CU-07, CU-10) ─────────────────

const esquemaSincronizacion = esquemaFirma.extend({
  /** Fecha y hora en que el ingeniero firmó en el captor, sin señal. */
  fechaEmision: z.string().datetime({ offset: true }),
  /** Hash calculado en el captor al firmar. */
  hashFirma: z.string().regex(/^[0-9a-f]{64}$/),
});

rutasDictamenes.post(
  '/sync/dictamenes',
  autenticado,
  exigir('dictaminar'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    const cuerpo = esquemaSincronizacion.parse(req.body);

    // El UUID generado al firmar es la clave de idempotencia: un reintento no duplica (§7.2).
    const previo = await db.dictamen.findUnique({ where: { uuid: cuerpo.uuid } });
    if (previo) {
      if (previo.estadoSincronizacion === ESTADO_INTEGRIDAD)
        throw conflicto('INTEGRIDAD_NO_VERIFICADA', 'El dictamen ya fue rechazado por integridad no verificada.');
      res.json({ idDictamen: previo.idDictamen, repetido: true });
      return;
    }
    if (!cuerpo.segundoFactor.verificado)
      throw new ErrorNegocio(422, 'SEGUNDO_FACTOR', 'El dictamen llegó sin la verificación biométrica: no está firmado.');

    const f = await validarFormulario(cuerpo.formulario);
    const borrador = borradorDesde(cuerpo, f, u.nombreUsuario, new Date(cuerpo.fechaEmision));
    const recalculado = sha256(textoAFirmar(datosDeFirma(borrador, await huellasDeFotos(f.fotografias))));

    // RF-53: si el contenido no es el que se firmó, no se da por sincronizado.
    if (recalculado !== cuerpo.hashFirma) {
      await db.$transaction(async (tx) => {
        const d = await crearDictamen(tx, borrador, {
          hashFirma: cuerpo.hashFirma,
          vigente: false,
          firmadoSinConexion: true,
          estadoSincronizacion: ESTADO_INTEGRIDAD,
        });
        await tx.casoRevision.create({
          data: {
            tipo: 'IntegridadNoVerificada',
            referenciaSolicitud: `${cuerpo.numeroSua}-${cuerpo.anio}`,
            idDictamen: d.idDictamen,
            motivo: `El hash recalculado (${recalculado.slice(0, 12)}…) no coincide con el de la firma (${cuerpo.hashFirma.slice(0, 12)}…). Dictamen firmado por ${u.nombreUsuario} sin conexión.`,
          },
        });
      });
      throw conflicto('INTEGRIDAD_NO_VERIFICADA', 'El contenido del dictamen no coincide con el que se firmó. Quedó para revisión del Administrador (RF-53).');
    }

    // RF-21 y CU-10 E5: si otro ingeniero ya lo dictaminó, no se descarta: queda para un Jefe.
    const resultado = await db.$transaction(async (tx) => {
      await bloquearSolicitud(tx, cuerpo.numeroSua, cuerpo.anio);
      const s = await tx.solicitud.findUnique({
        where: { numeroSua_anio: { numeroSua: cuerpo.numeroSua, anio: cuerpo.anio } },
        include: { dictamenes: { select: { idDictamen: true, vigente: true } } },
      });
      if (!s) throw noEncontrado('La solicitud no existe.');
      const vigentes = s.dictamenes.filter((x) => x.vigente === true);
      const enEspera = s.dictamenes.filter((x) => x.vigente === null);
      const hayConflicto = s.estado === 'Dictaminada' || enEspera.length > 1;
      const d = await crearDictamen(tx, borrador, {
        hashFirma: cuerpo.hashFirma,
        firmadoSinConexion: true,
        vigente: hayConflicto ? null : true,
        estadoSincronizacion: hayConflicto ? ESTADO_EN_CONFLICTO : ESTADO_PENDIENTE_SUA,
      });
      if (hayConflicto) {
        if (s.estado === 'Dictaminada')
          await tx.dictamen.updateMany({ where: { idDictamen: { in: vigentes.map((x) => x.idDictamen) } }, data: { vigente: null } });
        await tx.solicitud.update({ where: { numeroSua_anio: { numeroSua: s.numeroSua, anio: s.anio } }, data: { estado: 'PendienteRevision' } });
      } else {
        await tx.solicitud.update({ where: { numeroSua_anio: { numeroSua: s.numeroSua, anio: s.anio } }, data: { estado: 'Dictaminada' } });
      }
      await liberarPorDictamen(tx, s.numeroSua, s.anio);
      return { d, hayConflicto };
    });

    const envio = resultado.hayConflicto ? null : await enviarAlSua(resultado.d.idDictamen);
    res.status(201).json({
      idDictamen: resultado.d.idDictamen,
      estadoSolicitud: resultado.hayConflicto ? 'PendienteRevision' : 'Dictaminada',
      enviadoAlSua: envio?.ok ?? false,
      mensaje: resultado.hayConflicto
        ? 'Otro ingeniero ya había dictaminado este caso: los dos dictámenes quedan para que un Jefe elija el vigente (CU-15).'
        : envio?.ok
          ? 'Sincronizado y enviado al SUA.'
          : 'Sincronizado. El SUA no respondió: el sistema reintenta el envío solo.',
    });
  }),
);

// ── Consulta, verificación, PDF ─────────────────────────────────────────────────────────────────

async function dictamenCompleto(idDictamen: number) {
  const d = await db.dictamen.findUnique({ where: { idDictamen }, include: incluirTodo });
  if (!d) throw noEncontrado('El dictamen no existe.');
  return d;
}

rutasDictamenes.get(
  '/dictamenes/:id',
  autenticado,
  exigir('verDictamenes'),
  asincrono(async (req, res) => {
    const d = await dictamenCompleto(z.coerce.number().int().parse(req.params.id));
    res.json({ ...d, especie: d.especie.nombreComun });
  }),
);

/** Recalcula el hash sobre lo guardado y lo compara con el de la firma (RF-53). */
rutasDictamenes.get(
  '/dictamenes/:id/verificar',
  autenticado,
  exigir('verDictamenes'),
  asincrono(async (req, res) => {
    const d = await dictamenCompleto(z.coerce.number().int().parse(req.params.id));
    const recalculado = await calcularHash(d);
    res.json({ hashFirma: d.hashFirma, recalculado, coincide: recalculado === d.hashFirma });
  }),
);

rutasDictamenes.get(
  '/dictamenes/:id/pdf',
  autenticado,
  exigir('verDictamenes'),
  asincrono(async (req, res) => {
    const d = await dictamenCompleto(z.coerce.number().int().parse(req.params.id));
    const pdf = await generarPdf(d);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dictamen-${d.numeroSua}-${d.anio}-${d.idDictamen}.pdf"`);
    res.send(pdf);
  }),
);

// ── Dictámenes en conflicto (RF-59, CU-15) ──────────────────────────────────────────────────────

rutasDictamenes.get(
  '/dictamenes/conflicto/:numero/:anio',
  autenticado,
  exigir('verDictamenes'),
  asincrono(async (req, res) => {
    const numeroSua = String(req.params.numero);
    const anio = z.coerce.number().int().parse(req.params.anio);
    const dictamenes = await db.dictamen.findMany({
      where: { numeroSua, anio, OR: [{ vigente: null }, { vigenteElegidoEn: { not: null } }, { vigente: false }] },
      include: incluirTodo,
      orderBy: { fechaEmision: 'asc' },
    });
    const enEspera = dictamenes.filter((d) => d.vigente === null);
    res.json({
      resuelto: enEspera.length < 2,
      dictamenes: (enEspera.length >= 2 ? enEspera : dictamenes).map((d) => ({ ...d, especie: d.especie.nombreComun })),
    });
  }),
);

rutasDictamenes.post(
  '/dictamenes/:id/vigente',
  autenticado,
  exigir('resolverConflicto'),
  asincrono(async (req, res) => {
    const u = usuarioDe(req);
    if (u.rol !== 'Jefe') throw prohibido('Solo un Jefe elige cuál dictamen queda vigente.');
    const idDictamen = z.coerce.number().int().parse(req.params.id);
    const resultado = await db.$transaction(async (tx) => {
      const elegido = await tx.dictamen.findUnique({ where: { idDictamen } });
      if (!elegido) throw noEncontrado('El dictamen no existe.');
      await tx.$queryRaw`SELECT 1 FROM ${SOLICITUD} WHERE numero_sua = ${elegido.numeroSua} AND anio = ${elegido.anio} FOR UPDATE`;
      const enEspera = await tx.dictamen.findMany({ where: { numeroSua: elegido.numeroSua, anio: elegido.anio, vigente: null } });
      if (enEspera.length < 2 || elegido.vigente !== null) {
        const vigente = await tx.dictamen.findFirst({ where: { numeroSua: elegido.numeroSua, anio: elegido.anio, vigente: true } });
        throw conflicto('YA_RESUELTO', 'Otro Jefe ya resolvió este caso.', { vigente: vigente?.idDictamen ?? null });
      }
      const ahora = new Date();
      for (const d of enEspera)
        await tx.dictamen.update({
          where: { idDictamen: d.idDictamen },
          data: { vigente: d.idDictamen === idDictamen, vigenteElegidoPor: u.nombreUsuario, vigenteElegidoEn: ahora },
        });
      await tx.solicitud.update({ where: { numeroSua_anio: { numeroSua: elegido.numeroSua, anio: elegido.anio } }, data: { estado: 'Dictaminada' } });
      if (elegido.estadoSincronizacion === ESTADO_EN_CONFLICTO)
        await tx.dictamen.update({ where: { idDictamen }, data: { estadoSincronizacion: ESTADO_PENDIENTE_SUA } });
      return { vigente: idDictamen, elegidoPor: u.nombreUsuario, elegidoEn: ahora.toISOString() };
    });
    // El dictamen elegido que llegó sin señal recién ahora se manda al SUA (RF-24).
    const elegido = await db.dictamen.findUniqueOrThrow({ where: { idDictamen } });
    if (elegido.estadoSincronizacion === ESTADO_PENDIENTE_SUA) await enviarAlSua(idDictamen);
    res.json(resultado);
  }),
);
