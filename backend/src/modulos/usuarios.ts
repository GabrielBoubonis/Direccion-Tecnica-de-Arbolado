// Módulo 1 · Gestión de usuarios y captores (RF-06 a RF-08, RF-52, RF-54, RF-60, CU-02, CU-16).
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../compartido/base-de-datos';
import { configuracion } from '../compartido/configuracion';
import { conflicto, invalido, noEncontrado } from '../compartido/errores';
import { asincrono, autenticado, exigir, usuarioDe } from '../compartido/sesion';
import { ROLES } from '../dominio/catalogos';
import { contrasenaTemporal, generarNombreUsuario, reglasContrasenaIncumplidas } from '../dominio/usuarios';
import { registrarAuditoria } from './auditoria';

export const rutasUsuarios = Router();
rutasUsuarios.use('/usuarios', autenticado, exigir('gestionarUsuarios'));

const POR_PAGINA = 30;

rutasUsuarios.get(
  '/usuarios',
  asincrono(async (req, res) => {
    const pagina = z.coerce.number().int().positive().default(1).parse(req.query.pagina);
    const [total, usuarios] = await Promise.all([
      db.usuario.count(),
      db.usuario.findMany({
        orderBy: [{ activo: 'desc' }, { nombreUsuario: 'asc' }],
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: { nombreUsuario: true, rol: true, activo: true, fechaAlta: true, dispositivos: { select: { codigoVisible: true, estado: true } } },
      }),
    ]);
    res.json({ total, pagina, porPagina: POR_PAGINA, usuarios });
  }),
);

/** Identificador que se generaría, para mostrarlo en el alta como campo de solo lectura. */
rutasUsuarios.get(
  '/usuarios/identificador',
  asincrono(async (req, res) => {
    const { nombre, apellido } = z.object({ nombre: z.string().trim().min(1), apellido: z.string().trim().min(1) }).parse(req.query);
    const existentes = (await db.usuario.findMany({ select: { nombreUsuario: true } })).map((u) => u.nombreUsuario);
    res.json({ nombreUsuario: generarNombreUsuario(nombre, apellido, existentes) });
  }),
);

rutasUsuarios.post(
  '/usuarios',
  asincrono(async (req, res) => {
    const actor = usuarioDe(req);
    const d = z
      .object({ nombre: z.string().trim().min(1).max(60), apellido: z.string().trim().min(1).max(60), contrasena: z.string(), rol: z.enum(ROLES) })
      .parse(req.body);
    const faltan = reglasContrasenaIncumplidas(d.contrasena);
    if (faltan.length) throw invalido(`La contraseña tiene que tener ${faltan.join(', ')}.`, { faltan });
    const hash = await bcrypt.hash(d.contrasena, configuracion.costoBcrypt);
    const creado = await db.$transaction(async (tx) => {
      const existentes = (await tx.usuario.findMany({ select: { nombreUsuario: true } })).map((u) => u.nombreUsuario);
      const nombreUsuario = generarNombreUsuario(d.nombre, d.apellido, existentes);
      const u = await tx.usuario.create({ data: { nombreUsuario, contrasenaHash: hash, rol: d.rol } });
      await registrarAuditoria(tx, { nombreUsuario: actor.nombreUsuario, accion: 'Alta de usuario', entidadAfectada: nombreUsuario, valorNuevo: d.rol });
      return u;
    });
    res.status(201).json({ nombreUsuario: creado.nombreUsuario, rol: creado.rol });
  }),
);

rutasUsuarios.patch(
  '/usuarios/:id',
  asincrono(async (req, res) => {
    const actor = usuarioDe(req);
    const { rol } = z.object({ rol: z.enum(ROLES) }).parse(req.body);
    const id = String(req.params.id);
    const actualizado = await db.$transaction(async (tx) => {
      const u = await tx.usuario.findUnique({ where: { nombreUsuario: id } });
      if (!u) throw noEncontrado('El usuario no existe.');
      if (!u.activo) throw conflicto('USUARIO_INACTIVO', 'No se puede cambiar el rol de un usuario dado de baja.');
      if (u.rol === rol) return u;
      if (id === actor.nombreUsuario) throw conflicto('PROPIO_ROL', 'No podés cambiar tu propio rol.');
      const nuevo = await tx.usuario.update({ where: { nombreUsuario: id }, data: { rol } });
      await registrarAuditoria(tx, { nombreUsuario: actor.nombreUsuario, accion: 'Cambio de rol', entidadAfectada: id, valorAnterior: u.rol, valorNuevo: rol });
      return nuevo;
    });
    res.json({ nombreUsuario: actualizado.nombreUsuario, rol: actualizado.rol });
  }),
);

/** Baja lógica: el usuario no se borra, porque puede haber firmado dictámenes (modelo de datos). */
rutasUsuarios.post(
  '/usuarios/:id/baja',
  asincrono(async (req, res) => {
    const actor = usuarioDe(req);
    const id = String(req.params.id);
    if (id === actor.nombreUsuario) throw conflicto('PROPIA_BAJA', 'No podés darte de baja a vos mismo.');
    await db.$transaction(async (tx) => {
      const u = await tx.usuario.findUnique({ where: { nombreUsuario: id } });
      if (!u) throw noEncontrado('El usuario no existe.');
      if (!u.activo) throw conflicto('YA_INACTIVO', 'El usuario ya estaba dado de baja.');
      await tx.usuario.update({ where: { nombreUsuario: id }, data: { activo: false } });
      await tx.sesionRefresco.updateMany({ where: { nombreUsuario: id }, data: { revocada: true } });
      await registrarAuditoria(tx, { nombreUsuario: actor.nombreUsuario, accion: 'Baja de usuario', entidadAfectada: id, valorAnterior: u.rol });
    });
    res.json({ ok: true });
  }),
);

/** Blanqueo: se genera una contraseña temporal y se muestra una sola vez al Administrador (RF-08). */
rutasUsuarios.post(
  '/usuarios/:id/reset-password',
  asincrono(async (req, res) => {
    const id = String(req.params.id);
    const u = await db.usuario.findUnique({ where: { nombreUsuario: id } });
    if (!u) throw noEncontrado('El usuario no existe.');
    const temporal = contrasenaTemporal();
    await db.usuario.update({ where: { nombreUsuario: id }, data: { contrasenaHash: await bcrypt.hash(temporal, configuracion.costoBcrypt) } });
    res.json({ contrasenaTemporal: temporal });
  }),
);

/** Revoca los captores del usuario (RF-52): su sesión se corta en la próxima petición. */
rutasUsuarios.post(
  '/usuarios/:id/revocar-captor',
  asincrono(async (req, res) => {
    const actor = usuarioDe(req);
    const id = String(req.params.id);
    const revocados = await db.$transaction(async (tx) => {
      const captores = await tx.dispositivo.findMany({ where: { nombreUsuario: id, estado: { not: 'Revocado' } } });
      if (!captores.length) throw conflicto('SIN_CAPTORES', 'El usuario no tiene captores activos para revocar.');
      for (const c of captores) {
        await tx.dispositivo.update({ where: { idDispositivo: c.idDispositivo }, data: { estado: 'Revocado', fechaRevocacion: new Date(), claveDatos: null } });
        await registrarAuditoria(tx, {
          nombreUsuario: actor.nombreUsuario,
          accion: 'Revocación de captor',
          entidadAfectada: `${c.codigoVisible} (${id})`,
          valorAnterior: c.estado,
          valorNuevo: 'Revocado',
        });
      }
      await tx.sesionRefresco.updateMany({ where: { nombreUsuario: id }, data: { revocada: true } });
      return captores.map((c) => c.codigoVisible);
    });
    res.json({ revocados });
  }),
);

export const rutasCaptores = Router();
rutasCaptores.use('/captores-admin', autenticado, exigir('gestionarCaptores'));

/** Captores bloqueados, con búsqueda por el código que muestra su pantalla (RF-60, CU-16). */
rutasCaptores.get(
  '/captores-admin/bloqueados',
  asincrono(async (req, res) => {
    const codigo = z.string().trim().toUpperCase().optional().parse(req.query.codigo);
    const captores = await db.dispositivo.findMany({
      // Sin código, los bloqueados. Al buscar un código también aparece el revocado, para decir que no se puede desbloquear (CU-16 E2).
      where: codigo ? { codigoVisible: { contains: codigo }, estado: { in: ['Bloqueado', 'Revocado'] } } : { estado: 'Bloqueado' },
      orderBy: [{ estado: 'asc' }, { fechaBloqueo: 'desc' }],
    });
    res.json({ captores });
  }),
);

rutasCaptores.post(
  '/captores-admin/:codigo/desbloquear',
  asincrono(async (req, res) => {
    const actor = usuarioDe(req);
    const codigo = String(req.params.codigo).toUpperCase();
    const captor = await db.$transaction(async (tx) => {
      const c = await tx.dispositivo.findUnique({ where: { codigoVisible: codigo } });
      if (!c) throw noEncontrado('No hay ningún captor con ese código.');
      if (c.estado !== 'Bloqueado') throw conflicto('NO_BLOQUEADO', `El captor ${codigo} no está bloqueado (estado: ${c.estado}).`);
      const nuevo = await tx.dispositivo.update({
        where: { codigoVisible: codigo },
        data: { estado: 'Activo', intentosFallidos: 0, fechaDesbloqueo: new Date(), desbloqueadoPor: actor.nombreUsuario },
      });
      await registrarAuditoria(tx, {
        nombreUsuario: actor.nombreUsuario,
        accion: 'Desbloqueo de captor',
        entidadAfectada: `${codigo}${c.nombreUsuario ? ` (${c.nombreUsuario})` : ''}`,
        valorAnterior: 'Bloqueado',
        valorNuevo: 'Activo',
      });
      return nuevo;
    });
    res.json({ captor });
  }),
);
