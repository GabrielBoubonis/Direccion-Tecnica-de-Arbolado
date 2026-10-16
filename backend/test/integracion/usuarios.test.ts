// Módulo 1 · Gestión de usuarios, captores y auditoría (CU-02, CU-16, CU-13; HU-02, HU-18, HU-13).
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { reglasContrasenaIncumplidas } from '../../src/dominio/usuarios';
import { app, cerrarBase, como, CONTRASENA, db, ingresar, reiniciarBase, sinSesion, type Sesion } from './entorno';

const GENERICO = 'Usuario o contraseña incorrectos.';
const CLAVE_VALIDA = 'Nueva2026!';
const CAPTOR_BLOQUEADO = { id: '6f2b1c7e-93aa-4d1b-8f10-2a7c9e4d5b11', codigo: 'K7M2-X9QD' };
const CAPTOR_REVOCADO = { id: 'a91d03f4-5be2-4c6a-b7d8-0e13f6a2c844', codigo: 'R3TB-44LN' };

interface Evento {
  idAuditoria: number;
  nombreUsuario: string;
  accion: string;
  entidadAfectada: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  fechaHora: string;
}

const intentar = (usuario: string, contrasena: string, idDispositivo: string = randomUUID()) =>
  sinSesion.post('/auth/login', { nombreUsuario: usuario, contrasena, idDispositivo });
const alta = (s: Sesion, cambios: Record<string, unknown> = {}) =>
  como(s).post('/usuarios', { nombre: 'Juan', apellido: 'Pérez', contrasena: CLAVE_VALIDA, rol: 'Lector', ...cambios });
const eventos = async (s: Sesion, consulta = '') => (await como(s).get(`/auditoria${consulta}`)).body.eventos as Evento[];

let admin: Sesion;

beforeAll(async () => {
  await reiniciarBase();
  admin = await ingresar('asuarez0');
});
afterAll(cerrarBase);

describe('Permisos: solo el Administrador gestiona usuarios (RF-06, RF-55, RF-60)', () => {
  test.each(['mrossi0', 'pgimene0', 'tmolina0'])('[RF-06][RF-55][RF-60] %s recibe 403 en usuarios, captores y auditoría', async (usuario) => {
    const s = await ingresar(usuario);
    const c = como(s);
    expect((await c.get('/usuarios')).status).toBe(403);
    expect((await alta(s)).status).toBe(403);
    expect((await c.patch('/usuarios/tmolina0', { rol: 'Jefe' })).status).toBe(403);
    expect((await c.post('/usuarios/tmolina0/baja')).status).toBe(403);
    expect((await c.post('/usuarios/tmolina0/reset-password')).status).toBe(403);
    expect((await c.post('/usuarios/tmolina0/revocar-captor')).status).toBe(403);
    expect((await c.get('/captores-admin/bloqueados')).status).toBe(403);
    expect((await c.post(`/captores-admin/${CAPTOR_BLOQUEADO.codigo}/desbloquear`)).status).toBe(403);
    expect((await c.get('/auditoria')).status).toBe(403);
  });

  test('[RF-06] sin sesión no se accede a la gestión de usuarios', async () => {
    expect((await sinSesion.get('/usuarios')).status).toBe(401);
  });

  test('[RF-06] ninguna acción denegada alteró el padrón ni dejó auditoría', async () => {
    expect(await db.usuario.count()).toBe(7);
    expect(await db.registroAuditoria.count()).toBe(0);
  });
});

describe('Alta de usuarios (CU-02, HU-02 c1 y c2, RF-06, RF-07, RF-22)', () => {
  test('[CU-02 1] el Administrador ve el listado de usuarios con su rol', async () => {
    const r = await como(admin).get('/usuarios');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(7);
    const rossi = r.body.usuarios.find((u: { nombreUsuario: string }) => u.nombreUsuario === 'mrossi0');
    expect(rossi).toMatchObject({ rol: 'Operador', activo: true });
  });

  test('[CU-02 2][RF-22] el formulario de alta muestra el identificador que se va a generar (inicial + 6 letras del apellido + número; cbenite0 ya existe)', async () => {
    const r = await como(admin).get('/usuarios/identificador?nombre=Carlos&apellido=Benitez');
    expect(r.status).toBe(200);
    expect(r.body.nombreUsuario).toBe('cbenite1');
  });

  test('[CU-02 normal][CU-02 3][CU-02 4][RF-06][HU-02 c1] alta con contraseña válida: queda creado con el rol seleccionado y aparece en el listado', async () => {
    const r = await alta(admin, { nombre: 'Ana', apellido: 'Gómez', rol: 'Operador' });
    expect(r.status).toBe(201);
    expect(r.body).toEqual({ nombreUsuario: 'agomez0', rol: 'Operador' });
    const guardado = await db.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'agomez0' } });
    expect(guardado).toMatchObject({ rol: 'Operador', activo: true });
    const listado = await como(admin).get('/usuarios?pagina=1');
    expect(listado.body.usuarios.map((u: { nombreUsuario: string }) => u.nombreUsuario)).toContain('agomez0');
  });

  test.each(['Administrador', 'Jefe', 'Operador', 'Lector'])('[RF-06][HU-02 c1] se puede asignar el rol %s', async (rol) => {
    const r = await alta(admin, { nombre: 'Rol', apellido: `Prueba${rol}`, rol });
    expect(r.status).toBe(201);
    expect(r.body.rol).toBe(rol);
  });

  test('[RF-06] un rol fuera de los cuatro del sistema se rechaza', async () => {
    const r = await alta(admin, { nombre: 'Rol', apellido: 'Inventado', rol: 'Superusuario' });
    expect(r.status).toBe(422);
  });

  test('[RNF-05] la contraseña del usuario nuevo se guarda como hash bcrypt, nunca en texto plano', async () => {
    const u = await db.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'agomez0' } });
    expect(u.contrasenaHash).not.toContain(CLAVE_VALIDA);
    expect(bcrypt.getRounds(u.contrasenaHash)).toBe(12);
    expect(await bcrypt.compare(CLAVE_VALIDA, u.contrasenaHash)).toBe(true);
  });

  const reglas: Array<[string, string, RegExp]> = [
    ['con menos de 8 caracteres', 'Ab1!xyz', /8 caracteres/],
    ['sin mayúscula', 'nueva2026!', /mayúscula/],
    ['sin minúscula', 'NUEVA2026!', /minúscula/],
    ['sin número', 'NuevaClave!', /número/],
    ['sin carácter especial', 'Nueva2026a', /carácter especial/],
  ];
  test.each(reglas)('[RF-07][CU-02 3.1][HU-02 c2] contraseña %s: rechaza el alta e indica qué requisito falta', async (_regla, contrasena, mensaje) => {
    const antes = await db.usuario.count();
    const r = await alta(admin, { nombre: 'Regla', apellido: 'Contraseña', contrasena });
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(mensaje);
    expect(r.body.detalle.faltan).toHaveLength(1);
    expect(await db.usuario.count()).toBe(antes);
    expect(await db.usuario.findUnique({ where: { nombreUsuario: 'rcontra0' } })).toBeNull();
  });

  test('[RF-07][CU-02 3.1] una contraseña que incumple varias reglas las indica todas', async () => {
    const r = await alta(admin, { nombre: 'Varias', apellido: 'Reglas', contrasena: 'abc' });
    expect(r.status).toBe(422);
    expect(r.body.detalle.faltan).toHaveLength(4);
  });

  test('[RF-07] una contraseña con exactamente 8 caracteres y las cuatro clases se acepta', async () => {
    const r = await alta(admin, { nombre: 'Justo', apellido: 'Ocho', contrasena: 'Abcdef1!' });
    expect(r.status).toBe(201);
  });

  test('[RF-22] el identificador es la inicial del nombre más 6 letras del apellido, sin tildes ni espacios', async () => {
    const r = await alta(admin, { nombre: 'Ángela', apellido: 'Núñez de la Fuente' });
    expect(r.status).toBe(201);
    expect(r.body.nombreUsuario).toBe('anunezd0');
  });

  test('[RF-22] un apellido de menos de 6 letras se usa entero', async () => {
    const r = await alta(admin, { nombre: 'Luis', apellido: 'Paz' });
    expect(r.body.nombreUsuario).toBe('lpaz0');
  });

  test('[CU-02 E1][RF-22] si el identificador ya existe, agrega un número incremental', async () => {
    const primero = await alta(admin, { nombre: 'Marta', apellido: 'Salvatierra' });
    const segundo = await alta(admin, { nombre: 'Mónica', apellido: 'Salvatierra' });
    const tercero = await alta(admin, { nombre: 'Mirta', apellido: 'Salvatierra' });
    expect(primero.body.nombreUsuario).toBe('msalvat0');
    expect(segundo.body.nombreUsuario).toBe('msalvat1');
    expect(tercero.body.nombreUsuario).toBe('msalvat2');
    const vista = await como(admin).get('/usuarios/identificador?nombre=Matías&apellido=Salvatierra');
    expect(vista.body.nombreUsuario).toBe('msalvat3');
  });

  test('[CU-02 4.1][RF-54][HU-02 c5] el alta queda en auditoría con quién, qué y cuándo', async () => {
    const antes = Date.now();
    await alta(admin, { nombre: 'Audi', apellido: 'Torio', rol: 'Jefe' });
    const e = (await eventos(admin)).find((x) => x.entidadAfectada === 'atorio0');
    expect(e).toMatchObject({ nombreUsuario: 'asuarez0', accion: 'Alta de usuario', valorNuevo: 'Jefe' });
    expect(Math.abs(new Date(e!.fechaHora).getTime() - antes)).toBeLessThan(60_000);
  });

  test('[CU-02 fallo] un alta rechazada no deja evento de auditoría', async () => {
    const antes = await db.registroAuditoria.count();
    await alta(admin, { nombre: 'Sin', apellido: 'Auditar', contrasena: 'corta' });
    expect(await db.registroAuditoria.count()).toBe(antes);
  });
});

describe('Cambio de rol (RF-06, RF-54, HU-02 c5)', () => {
  test('[RF-06][RF-54][HU-02 c5] el cambio de rol se aplica y queda auditado con el valor anterior y el nuevo', async () => {
    const r = await como(admin).patch('/usuarios/jdiaz0', { rol: 'Jefe' });
    expect(r.status).toBe(200);
    expect(r.body.rol).toBe('Jefe');
    expect((await db.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'jdiaz0' } })).rol).toBe('Jefe');
    const e = (await eventos(admin, '?accion=Cambio%20de%20rol'))[0];
    expect(e).toMatchObject({ nombreUsuario: 'asuarez0', accion: 'Cambio de rol', entidadAfectada: 'jdiaz0', valorAnterior: 'Operador', valorNuevo: 'Jefe' });
  });

  test('[RF-06] el nuevo rol rige desde la petición siguiente del usuario', async () => {
    const s = await ingresar('tmolina0');
    expect((await como(s).get('/usuarios')).status).toBe(403);
    await como(admin).patch('/usuarios/tmolina0', { rol: 'Administrador' });
    expect((await como(s).get('/usuarios')).status).toBe(200);
    await como(admin).patch('/usuarios/tmolina0', { rol: 'Lector' });
    expect((await como(s).get('/usuarios')).status).toBe(403);
  });

  test('[RF-06] un usuario inexistente da 404 y un rol inválido 422', async () => {
    expect((await como(admin).patch('/usuarios/fantasma', { rol: 'Jefe' })).status).toBe(404);
    expect((await como(admin).patch('/usuarios/jdiaz0', { rol: 'Rey' })).status).toBe(422);
  });

  test('[RF-06] el Administrador no puede cambiarse el rol a sí mismo', async () => {
    const r = await como(admin).patch('/usuarios/asuarez0', { rol: 'Lector' });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('PROPIO_ROL');
  });
});

describe('Restablecer contraseña (CU-02 E2, RF-08, HU-02 c3)', () => {
  test('[CU-02 E2][RF-08][HU-02 c3] genera una contraseña nueva que cumple las reglas y deja sin efecto la anterior', async () => {
    const r = await como(admin).post('/usuarios/pgimene0/reset-password');
    expect(r.status).toBe(200);
    const temporal = r.body.contrasenaTemporal as string;
    expect(temporal).not.toBe(CONTRASENA);
    expect(reglasContrasenaIncumplidas(temporal)).toEqual([]);

    const vieja = await intentar('pgimene0', CONTRASENA);
    expect(vieja.status).toBe(401);
    expect(vieja.body.mensaje).toBe(GENERICO);
    const nueva = await intentar('pgimene0', temporal);
    expect(nueva.status).toBe(200);
    expect(nueva.body.usuario).toMatchObject({ nombreUsuario: 'pgimene0', rol: 'Jefe' });
  });

  test('[RF-08] cada blanqueo genera una contraseña distinta', async () => {
    const a = await como(admin).post('/usuarios/lfernan0/reset-password');
    const b = await como(admin).post('/usuarios/lfernan0/reset-password');
    expect(a.body.contrasenaTemporal).not.toBe(b.body.contrasenaTemporal);
    // Se devuelve la contraseña original para que las demás pruebas puedan seguir ingresando.
    await db.usuario.update({ where: { nombreUsuario: 'lfernan0' }, data: { contrasenaHash: await bcrypt.hash(CONTRASENA, 12) } });
  });

  test('[RF-08] un usuario inexistente da 404', async () => {
    expect((await como(admin).post('/usuarios/fantasma/reset-password')).status).toBe(404);
  });
});

describe('Baja de usuarios (CU-02 E3, HU-02 c4, RF-06)', () => {
  test('[CU-02 E3][HU-02 c4][RF-06] la baja con sesión activa le impide seguir operando y le niega el siguiente ingreso', async () => {
    const s = await ingresar('tmolina0');
    expect((await como(s).get('/auth/yo')).status).toBe(200);

    const r = await como(admin).post('/usuarios/tmolina0/baja');
    expect(r.status).toBe(200);
    expect((await db.usuario.findUniqueOrThrow({ where: { nombreUsuario: 'tmolina0' } })).activo).toBe(false);

    const sigue = await como(s).get('/auth/yo');
    expect(sigue.status).toBe(401);
    expect(sigue.body.codigo).toBe('USUARIO_INACTIVO');
    expect((await sinSesion.post('/auth/refresh', { refresco: s.refresco })).status).toBe(401);

    const ingreso = await intentar('tmolina0', CONTRASENA);
    expect(ingreso.status).toBe(401);
    expect(ingreso.body.mensaje).toBe(GENERICO);
  });

  test('[RF-06] la baja es lógica: el usuario sigue en el padrón (puede tener dictámenes firmados)', async () => {
    expect(await db.usuario.findUnique({ where: { nombreUsuario: 'tmolina0' } })).not.toBeNull();
    const fila = (await como(admin).get('/usuarios')).body.usuarios.find((u: { nombreUsuario: string }) => u.nombreUsuario === 'tmolina0');
    expect(fila.activo).toBe(false);
  });

  test('[RF-54][HU-02 c5] la baja queda en auditoría', async () => {
    const e = (await eventos(admin, '?accion=Baja%20de%20usuario'))[0];
    expect(e).toMatchObject({ nombreUsuario: 'asuarez0', accion: 'Baja de usuario', entidadAfectada: 'tmolina0', valorAnterior: 'Lector' });
  });

  test('[RF-06] no se puede dar de baja dos veces, ni a un inexistente, ni a uno mismo; y no se cambia el rol de un usuario de baja', async () => {
    expect((await como(admin).post('/usuarios/tmolina0/baja')).body.codigo).toBe('YA_INACTIVO');
    expect((await como(admin).post('/usuarios/fantasma/baja')).status).toBe(404);
    expect((await como(admin).post('/usuarios/asuarez0/baja')).body.codigo).toBe('PROPIA_BAJA');
    expect((await como(admin).patch('/usuarios/tmolina0', { rol: 'Jefe' })).body.codigo).toBe('USUARIO_INACTIVO');
  });
});

describe('Revocación de captor (CU-02 E4, RF-52, RF-54)', () => {
  let s: Sesion;
  beforeAll(async () => {
    s = await ingresar('cbenite0');
  });

  test('[CU-02 E4][RF-52] antes de revocar, el captor entrega su clave de datos', async () => {
    const yo = await como(s).get('/auth/yo');
    expect(yo.status).toBe(200);
    expect(s.claveDatos).toBeTruthy();
    expect(yo.body.captor.claveDatos).toBe(s.claveDatos);
  });

  test('[CU-02 E4][RF-52][RF-54] el Administrador revoca los captores del usuario y queda auditado', async () => {
    const r = await como(admin).post('/usuarios/cbenite0/revocar-captor');
    expect(r.status).toBe(200);
    expect(r.body.revocados).toContain(s.codigoVisible);
    const c = await db.dispositivo.findUniqueOrThrow({ where: { idDispositivo: s.idDispositivo } });
    expect(c.estado).toBe('Revocado');
    expect(c.fechaRevocacion).not.toBeNull();
    expect(c.claveDatos).toBeNull();
    const e = (await eventos(admin, '?accion=Revocaci%C3%B3n%20de%20captor')).find((x) => x.entidadAfectada.startsWith(s.codigoVisible));
    expect(e).toMatchObject({ nombreUsuario: 'asuarez0', accion: 'Revocación de captor', valorAnterior: 'Activo', valorNuevo: 'Revocado' });
    expect(e!.entidadAfectada).toContain('cbenite0');
  });

  test('[RF-52][CU-02 E4] la sesión del captor revocado se corta de inmediato con el código CAPTOR_REVOCADO', async () => {
    const r = await como(s).get('/auth/yo');
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('CAPTOR_REVOCADO');
    expect((await como(s).get('/solicitudes')).body.codigo).toBe('CAPTOR_REVOCADO');
    expect((await sinSesion.post('/auth/refresh', { refresco: s.refresco })).status).toBe(401);
  });

  test('[RF-52] GET /auth/yo del captor revocado ya no entrega claveDatos', async () => {
    const r = await como(s).get('/auth/yo');
    expect(r.body.captor?.claveDatos ?? null).toBeNull();
    expect(JSON.stringify(r.body)).not.toContain(s.claveDatos!);
  });

  test('[RF-52] el captor revocado no puede volver a ingresar, ni con la contraseña correcta', async () => {
    const r = await intentar('cbenite0', CONTRASENA, s.idDispositivo);
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('CAPTOR_REVOCADO');
  });

  test('[RF-52] el captor revocado de los datos de prueba (R3TB-44LN) tampoco ingresa', async () => {
    const r = await intentar('cbenite0', CONTRASENA, CAPTOR_REVOCADO.id);
    expect(r.status).toBe(401);
    expect(r.body.codigo).toBe('CAPTOR_REVOCADO');
  });

  test('[RF-52] el usuario puede ingresar desde otro captor que no esté revocado', async () => {
    const r = await intentar('cbenite0', CONTRASENA);
    expect(r.status).toBe(200);
  });

  test('[RF-52] revocar a un usuario sin captores activos da un conflicto claro', async () => {
    const r = await como(admin).post('/usuarios/jdiaz0/revocar-captor');
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('SIN_CAPTORES');
  });
});

describe('Desbloqueo de captor (CU-16, HU-18, RF-60, RF-54)', () => {
  test('[CU-16 1][HU-18 c2][RF-60] el Administrador busca el captor bloqueado por el código de su pantalla y ve usuario y fecha', async () => {
    const r = await como(admin).get(`/captores-admin/bloqueados?codigo=${CAPTOR_BLOQUEADO.codigo}`);
    expect(r.status).toBe(200);
    expect(r.body.captores).toHaveLength(1);
    expect(r.body.captores[0]).toMatchObject({ codigoVisible: 'K7M2-X9QD', nombreUsuario: 'mrossi0', estado: 'Bloqueado' });
    expect(new Date(r.body.captores[0].fechaBloqueo).toISOString()).toBe('2026-10-12T11:15:00.000Z');
  });

  test('[CU-16 1][RF-60] sin código, el listado trae solo los captores bloqueados; el código se acepta en minúsculas', async () => {
    const r = await como(admin).get('/captores-admin/bloqueados');
    expect(r.body.captores.map((c: { codigoVisible: string }) => c.codigoVisible)).toEqual(['K7M2-X9QD']);
    const min = await como(admin).get('/captores-admin/bloqueados?codigo=k7m2-x9qd');
    expect(min.body.captores).toHaveLength(1);
  });

  test('[HU-18 c1][RF-52] mientras está bloqueado, el ingeniero no puede ingresar desde ese captor y ve el código', async () => {
    const r = await intentar('mrossi0', CONTRASENA, CAPTOR_BLOQUEADO.id);
    expect(r.status).toBe(423);
    expect(r.body.detalle.codigoVisible).toBe(CAPTOR_BLOQUEADO.codigo);
  });

  test('[CU-16 E1] un código que no corresponde a ningún captor bloqueado: informa y permite corregirlo', async () => {
    const busqueda = await como(admin).get('/captores-admin/bloqueados?codigo=ZZZZ-9999');
    expect(busqueda.status).toBe(200);
    expect(busqueda.body.captores).toEqual([]);
    const r = await como(admin).post('/captores-admin/ZZZZ-9999/desbloquear');
    expect(r.status).toBe(404);
    expect(r.body.mensaje).toMatch(/No hay ningún captor/);
    expect((await db.dispositivo.findUniqueOrThrow({ where: { idDispositivo: CAPTOR_BLOQUEADO.id } })).estado).toBe('Bloqueado');
  });

  test('[CU-16 E1] un captor activo tampoco es desbloqueable', async () => {
    const r = await como(admin).post('/captores-admin/M5HW-2PZA/desbloquear');
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('NO_BLOQUEADO');
  });

  test('[CU-16 E2] el captor revocado no se desbloquea y se indica que fue revocado', async () => {
    const busqueda = await como(admin).get(`/captores-admin/bloqueados?codigo=${CAPTOR_REVOCADO.codigo}`);
    expect(busqueda.body.captores[0]).toMatchObject({ codigoVisible: 'R3TB-44LN', estado: 'Revocado' });
    const r = await como(admin).post(`/captores-admin/${CAPTOR_REVOCADO.codigo}/desbloquear`);
    expect(r.status).toBe(409);
    expect(r.body.mensaje).toMatch(/Revocado/);
    expect((await db.dispositivo.findUniqueOrThrow({ where: { idDispositivo: CAPTOR_REVOCADO.id } })).estado).toBe('Revocado');
    const ingreso = await intentar('cbenite0', CONTRASENA, CAPTOR_REVOCADO.id);
    expect(ingreso.body.codigo).toBe('CAPTOR_REVOCADO');
  });

  test('[CU-16 normal][CU-16 2][CU-16 3][HU-18 c2][HU-18 c3][RF-60] tras el desbloqueo el ingeniero puede ingresar desde ese captor', async () => {
    const antes = Date.now();
    const r = await como(admin).post(`/captores-admin/${CAPTOR_BLOQUEADO.codigo}/desbloquear`);
    expect(r.status).toBe(200);
    expect(r.body.captor).toMatchObject({ estado: 'Activo', intentosFallidos: 0, desbloqueadoPor: 'asuarez0' });
    expect(new Date(r.body.captor.fechaDesbloqueo).getTime()).toBeGreaterThanOrEqual(antes - 1000);

    const ingreso = await intentar('mrossi0', CONTRASENA, CAPTOR_BLOQUEADO.id);
    expect(ingreso.status).toBe(200);
    expect(ingreso.body.captor.idDispositivo).toBe(CAPTOR_BLOQUEADO.id);
    expect((await como(admin).get('/captores-admin/bloqueados')).body.captores).toEqual([]);
  });

  test('[CU-16 2][HU-18 c4][RF-54][RF-60] el desbloqueo queda en auditoría: quién, cuándo y qué captor', async () => {
    const e = (await eventos(admin, '?accion=Desbloqueo%20de%20captor'))[0];
    expect(e).toMatchObject({
      nombreUsuario: 'asuarez0',
      accion: 'Desbloqueo de captor',
      entidadAfectada: 'K7M2-X9QD (mrossi0)',
      valorAnterior: 'Bloqueado',
      valorNuevo: 'Activo',
    });
    expect(Math.abs(new Date(e.fechaHora).getTime() - Date.now())).toBeLessThan(120_000);
  });

  test('[CU-16 fallo] ya desbloqueado, no se puede volver a desbloquear', async () => {
    const r = await como(admin).post(`/captores-admin/${CAPTOR_BLOQUEADO.codigo}/desbloquear`);
    expect(r.status).toBe(409);
  });

  test('[HU-18 c1][HU-18 c2][RF-60] un captor que se bloquea por 5 intentos fallidos se encuentra y se desbloquea por su código', async () => {
    const captor = randomUUID();
    for (let i = 0; i < 4; i++) await intentar('lfernan0', 'Mala123!', captor);
    const quinto = await intentar('lfernan0', 'Mala123!', captor);
    const codigo = quinto.body.detalle.codigoVisible as string;
    const busqueda = await como(admin).get(`/captores-admin/bloqueados?codigo=${codigo}`);
    expect(busqueda.body.captores[0].idDispositivo).toBe(captor);
    expect((await como(admin).post(`/captores-admin/${codigo}/desbloquear`)).status).toBe(200);
    expect((await intentar('lfernan0', CONTRASENA, captor)).status).toBe(200);
  });
});

describe('Auditoría inmutable (RF-54, HU-02 c5, HU-13 c3)', () => {
  test('[RF-54][HU-02 c5][HU-13 c3] un UPDATE directo sobre el registro de auditoría falla', async () => {
    const e = await db.registroAuditoria.findFirstOrThrow();
    await expect(db.$executeRawUnsafe(`UPDATE registro_auditoria SET accion = 'Otra' WHERE id_auditoria = ${e.idAuditoria}`)).rejects.toThrow(
      /no se puede modificar ni borrar/,
    );
    await expect(db.$executeRawUnsafe(`UPDATE registro_auditoria SET nombre_usuario = 'mrossi0'`)).rejects.toThrow();
    expect((await db.registroAuditoria.findUniqueOrThrow({ where: { idAuditoria: e.idAuditoria } })).accion).toBe(e.accion);
  });

  test('[RF-54][HU-02 c5][HU-13 c3] un DELETE directo sobre el registro de auditoría falla', async () => {
    const antes = await db.registroAuditoria.count();
    await expect(db.$executeRawUnsafe('DELETE FROM registro_auditoria')).rejects.toThrow(/no se puede modificar ni borrar/);
    expect(await db.registroAuditoria.count()).toBe(antes);
  });

  test('[HU-13 c3][HU-02 c5] la aplicación no expone ninguna ruta para editar o borrar eventos', async () => {
    const e = await db.registroAuditoria.findFirstOrThrow();
    const auth = { Authorization: `Bearer ${admin.acceso}` };
    for (const metodo of ['put', 'patch', 'delete', 'post'] as const) {
      const r = await request(app)[metodo](`/api/auditoria/${e.idAuditoria}`).set(auth);
      expect(r.status).toBe(404);
    }
    expect((await request(app).delete('/api/auditoria').set(auth)).status).toBe(404);
    expect((await request(app).post('/api/auditoria').set(auth)).status).toBe(404);
  });
});

describe('Consultar auditoría (CU-13, HU-13, RF-55)', () => {
  const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    // Un evento antiguo de otro usuario, para probar los filtros por usuario y por fechas.
    await db.registroAuditoria.create({
      data: {
        nombreUsuario: 'pgimene0',
        accion: 'Alta de usuario',
        entidadAfectada: 'historico1',
        valorNuevo: 'Lector',
        fechaHora: new Date('2020-06-15T15:00:00Z'),
      },
    });
    // Relleno para que el historial pase de una página.
    await db.registroAuditoria.createMany({
      data: [1, 2, 3].map((n) => ({
        nombreUsuario: 'tmolina0',
        accion: 'Cambio de rol',
        entidadAfectada: `relleno${n}`,
        fechaHora: new Date(`2020-07-0${n}T15:00:00Z`),
      })),
    });
  });

  test('[CU-13 normal][CU-13 1][HU-13 c1][RF-55] el listado muestra usuario, acción y fecha y hora, los más recientes primero', async () => {
    const r = await como(admin).get('/auditoria');
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThan(10);
    const lista = r.body.eventos as Evento[];
    for (const e of lista) {
      expect(e.nombreUsuario).toBeTruthy();
      expect(e.accion).toBeTruthy();
      expect(Number.isNaN(new Date(e.fechaHora).getTime())).toBe(false);
    }
    const tiempos = lista.map((e) => new Date(e.fechaHora).getTime());
    expect(tiempos).toEqual([...tiempos].sort((a, b) => b - a));
    // El último en pasar fue el desbloqueo del captor bloqueado por intentos fallidos.
    expect(lista[0].accion).toBe('Desbloqueo de captor');
    expect(r.body.acciones).toEqual(['Alta de usuario', 'Baja de usuario', 'Cambio de rol', 'Desbloqueo de captor', 'Revocación de captor']);
  });

  test('[HU-13 c1] el historial se pagina de a 20 eventos', async () => {
    const p1 = await como(admin).get('/auditoria?pagina=1');
    expect(p1.body.porPagina).toBe(20);
    expect(p1.body.eventos).toHaveLength(20);
    const p2 = await como(admin).get('/auditoria?pagina=2');
    expect(p2.body.eventos.length).toBeGreaterThan(0);
    expect(p2.body.eventos[0].idAuditoria).not.toBe(p1.body.eventos[0].idAuditoria);
  });

  test('[CU-13 2][HU-13 c2][RF-55] filtro por usuario', async () => {
    const r = await como(admin).get('/auditoria?usuario=pgimene0');
    expect(r.body.total).toBe(1);
    expect(r.body.eventos[0]).toMatchObject({ nombreUsuario: 'pgimene0', entidadAfectada: 'historico1' });
    const admins = await como(admin).get('/auditoria?usuario=asuarez0');
    expect(admins.body.eventos.every((e: Evento) => e.nombreUsuario === 'asuarez0')).toBe(true);
    expect(admins.body.total).toBe((await como(admin).get('/auditoria')).body.total - 4);
  });

  test('[CU-13 2][HU-13 c2][RF-55] filtro por tipo de acción', async () => {
    for (const accion of ['Alta de usuario', 'Baja de usuario', 'Cambio de rol', 'Desbloqueo de captor', 'Revocación de captor']) {
      const r = await como(admin).get(`/auditoria?accion=${encodeURIComponent(accion)}`);
      expect(r.body.total).toBeGreaterThan(0);
      expect(r.body.eventos.every((e: Evento) => e.accion === accion)).toBe(true);
    }
  });

  test('[HU-13 c2] una acción que no existe se rechaza', async () => {
    expect((await como(admin).get('/auditoria?accion=Inventada')).status).toBe(422);
  });

  test('[CU-13 2][HU-13 c2][RF-55] filtro por rango de fechas, con los dos extremos incluidos', async () => {
    const antiguo = await como(admin).get('/auditoria?desde=2020-06-15&hasta=2020-06-15');
    expect(antiguo.body.total).toBe(1);
    expect(antiguo.body.eventos[0].entidadAfectada).toBe('historico1');
    const reciente = await como(admin).get(`/auditoria?desde=${hoy}&hasta=${hoy}`);
    expect(reciente.body.total).toBeGreaterThan(10);
    expect(reciente.body.eventos.every((e: Evento) => e.entidadAfectada !== 'historico1')).toBe(true);
    const soloDesde = await como(admin).get('/auditoria?desde=2020-06-16');
    expect(soloDesde.body.eventos.every((e: Evento) => e.entidadAfectada !== 'historico1')).toBe(true);
    const soloHasta = await como(admin).get('/auditoria?hasta=2020-06-15');
    expect(soloHasta.body.total).toBe(1);
  });

  test('[CU-13 2][HU-13 c2] los tres filtros se combinan', async () => {
    const r = await como(admin).get(`/auditoria?usuario=asuarez0&accion=Baja%20de%20usuario&desde=${hoy}&hasta=${hoy}`);
    expect(r.body.total).toBe(1);
    expect(r.body.eventos[0]).toMatchObject({ entidadAfectada: 'tmolina0' });
    const vacio = await como(admin).get('/auditoria?usuario=pgimene0&accion=Baja%20de%20usuario');
    expect(vacio.body.total).toBe(0);
  });

  test('[CU-13 E1] sin eventos que cumplan el filtro: listado vacío', async () => {
    const r = await como(admin).get('/auditoria?desde=2019-01-01&hasta=2019-12-31');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(0);
    expect(r.body.eventos).toEqual([]);
  });

  test('[CU-13 E2] rango de fechas inválido (desde posterior a hasta): no aplica el filtro e informa', async () => {
    const r = await como(admin).get('/auditoria?desde=2026-10-10&hasta=2026-10-01');
    expect(r.status).toBe(422);
    expect(r.body.mensaje).toMatch(/fecha de inicio/);
    expect(r.body.eventos).toBeUndefined();
  });

  test('[CU-13 E2] un formato de fecha inválido también se rechaza', async () => {
    expect((await como(admin).get('/auditoria?desde=15-06-2020')).status).toBe(422);
  });
});
