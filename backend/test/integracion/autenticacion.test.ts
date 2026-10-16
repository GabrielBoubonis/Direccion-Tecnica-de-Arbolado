// Módulo 1 · Inicio de sesión, sesión y captores (CU-01, CU-16; HU-01, HU-09 c4, HU-18).
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cerrarBase, como, CONTRASENA, db, ingresar, reiniciarBase, simularCaida, sinSesion } from './entorno';

const GENERICO = 'Usuario o contraseña incorrectos.';
const intentar = (usuario: string, contrasena: string, idDispositivo = randomUUID()) =>
  sinSesion.post('/auth/login', { nombreUsuario: usuario, contrasena, idDispositivo });

beforeAll(reiniciarBase);
afterAll(cerrarBase);

describe('Ingreso (CU-01, HU-01)', () => {
  test('[RF-01][RF-02][CU-01 normal][HU-01 c1] usuario y contraseña válidos: valida con la Autenticación Institucional y entrega un JWT', async () => {
    const r = await intentar('mrossi0', CONTRASENA);
    expect(r.status).toBe(200);
    const datos = jwt.decode(r.body.acceso) as { nombreUsuario: string; rol: string };
    expect(datos).toMatchObject({ nombreUsuario: 'mrossi0', rol: 'Operador' });
    expect(r.body.pasos.map((p: { titulo: string }) => p.titulo)).toEqual(['Contraseña local', 'Autenticación Institucional']);
  });

  test('[CU-01 4] el menú corresponde al rol del usuario', async () => {
    const menus = await Promise.all(
      ['mrossi0', 'pgimene0', 'asuarez0', 'tmolina0'].map(async (u) => (await intentar(u, CONTRASENA)).body.menu.items),
    );
    expect(menus[0]).toEqual(['solicitudes', 'rutas', 'tormenta', 'perfil']);
    expect(menus[1]).toEqual(['solicitudes', 'rutas', 'tormenta', 'dashboard', 'perfil']);
    expect(menus[2]).toEqual(['usuarios', 'para-revisar', 'auditoria', 'dashboard', 'tormenta', 'perfil']);
    expect(menus[3]).toEqual(['dashboard', 'tormenta', 'perfil']);
  });

  test('[RF-50][CU-01 2.1][HU-01 c2] contraseña incorrecta: mensaje genérico', async () => {
    const r = await intentar('cbenite0', 'Equivocada1!');
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe(GENERICO);
  });

  test('[RF-03][RF-50][HU-01 c3] usuario que existe en la Autenticación Institucional pero no en el sistema: mismo mensaje', async () => {
    const r = await intentar('nmedina0', CONTRASENA);
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe(GENERICO);
  });

  test('[RF-50][CU-01 3.1] usuario no vigente en la Autenticación Institucional: mismo mensaje genérico', async () => {
    const r = await intentar('jdiaz0', CONTRASENA);
    expect(r.status).toBe(401);
    expect(r.body.mensaje).toBe(GENERICO);
  });

  test('[RF-50][CU-01 E1][RNF-19] si la Autenticación Institucional no responde: mensaje distinto y no cuenta como intento', async () => {
    const captor = randomUUID();
    await simularCaida('autenticacion_caida', true);
    try {
      for (let i = 0; i < 6; i++) {
        const r = await intentar('lfernan0', CONTRASENA, captor);
        expect(r.status).toBe(503);
        expect(r.body.mensaje).not.toBe(GENERICO);
        expect(r.body.mensaje).toMatch(/no está disponible/);
      }
    } finally {
      await simularCaida('autenticacion_caida', false);
    }
    const c = await db.dispositivo.findUniqueOrThrow({ where: { idDispositivo: captor } });
    expect(c.intentosFallidos).toBe(0);
    expect(c.estado).toBe('Activo');
  });
});

describe('Sesión (RF-04, RF-05, RNF-20)', () => {
  test('[RF-04][HU-01 c4][CU-01 E2] el token de acceso vence a los 30 minutos', async () => {
    const s = await ingresar('mrossi0');
    const { iat, exp } = jwt.decode(s.acceso) as { iat: number; exp: number };
    expect(exp - iat).toBe(30 * 60);
  });

  test('[RF-05] el token se renueva con el refresh token sin volver a ingresar credenciales', async () => {
    const s = await ingresar('mrossi0');
    const r = await sinSesion.post('/auth/refresh', { refresco: s.refresco });
    expect(r.status).toBe(200);
    expect(r.body.acceso).toBeTruthy();
    expect((await como({ ...s, acceso: r.body.acceso }).get('/auth/yo')).status).toBe(200);
  });

  test('[RNF-20] la renovación no pasa del tope de 7 días desde el primer ingreso', async () => {
    const s = await ingresar('mrossi0');
    const sesion = await db.sesionRefresco.findUniqueOrThrow({ where: { id: s.refresco } });
    expect(sesion.venceEn.getTime() - sesion.inicio.getTime()).toBe(7 * 86_400_000);
    await db.sesionRefresco.update({ where: { id: s.refresco }, data: { venceEn: new Date(Date.now() - 1000) } });
    expect((await sinSesion.post('/auth/refresh', { refresco: s.refresco })).status).toBe(401);
  });

  test('[RF-04] cerrar la sesión invalida el refresh token', async () => {
    const s = await ingresar('mrossi0');
    await sinSesion.post('/auth/logout', { refresco: s.refresco });
    expect((await sinSesion.post('/auth/refresh', { refresco: s.refresco })).status).toBe(401);
  });

  test('sin token no se accede a nada', async () => {
    expect((await sinSesion.get('/solicitudes')).status).toBe(401);
  });
});

describe('Bloqueo del captor y límite del servidor (RF-52, RF-60, RNF-19)', () => {
  test('[RF-52][HU-09 c4][HU-18 c1] a los 5 intentos fallidos seguidos el captor se bloquea y muestra su código', async () => {
    const captor = randomUUID();
    for (let i = 0; i < 4; i++) expect((await intentar('lfernan0', 'Mala123!', captor)).status).toBe(401);
    const quinto = await intentar('lfernan0', 'Mala123!', captor);
    expect(quinto.status).toBe(423);
    expect(quinto.body.detalle.codigoVisible).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    // Bloqueado, ni siquiera la contraseña correcta entra.
    expect((await intentar('lfernan0', CONTRASENA, captor)).status).toBe(423);
  });

  test('[RF-52][RF-57] el captor que se bloqueó sin señal lo informa al volver la conexión y queda bloqueado en el servidor', async () => {
    const captor = randomUUID();
    const r = await sinSesion.post(`/captores/${captor}/bloqueo-local`);
    expect(r.body.estado).toBe('Bloqueado');
    expect((await db.dispositivo.findUniqueOrThrow({ where: { idDispositivo: captor } })).estado).toBe('Bloqueado');
  });

  test('[RNF-19] el servidor corta a los 10 intentos fallidos en 15 minutos por IP y usuario, también para usuarios inexistentes', async () => {
    for (let i = 0; i < 10; i++) await intentar('noexiste9', 'Mala123!');
    const r = await intentar('noexiste9', 'Mala123!');
    expect(r.status).toBe(429);
  });
});

describe('Reanudar sin señal: revalidación al volver la conexión (RF-57)', () => {
  test('[RF-57][CU-01 E3] con el usuario vigente, la revalidación devuelve un acceso nuevo', async () => {
    const s = await ingresar('cbenite0');
    const r = await sinSesion.post('/auth/revalidar', { refresco: s.refresco });
    expect(r.status).toBe(200);
    expect(r.body.acceso).toBeTruthy();
  });

  test('[RF-57][CU-01 E3] si el usuario ya no está vigente, se cierra la sesión', async () => {
    const s = await ingresar('cbenite0');
    await db.simUsuarioInstitucional.update({ where: { nombreUsuario: 'cbenite0' }, data: { vigente: false } });
    try {
      const r = await sinSesion.post('/auth/revalidar', { refresco: s.refresco });
      expect(r.status).toBe(401);
      expect(r.body.codigo).toBe('USUARIO_NO_VIGENTE');
      expect((await sinSesion.post('/auth/refresh', { refresco: s.refresco })).status).toBe(401);
    } finally {
      await db.simUsuarioInstitucional.update({ where: { nombreUsuario: 'cbenite0' }, data: { vigente: true } });
    }
  });

  test('[RF-57][RNF-16] el captor recibe su clave de datos con la sesión, y no la recibe si está revocado', async () => {
    const s = await ingresar('mrossi0');
    expect(Buffer.from(s.claveDatos!, 'base64')).toHaveLength(32);
    const yo = await como(s).get('/auth/yo');
    expect(yo.body.captor.claveDatos).toBe(s.claveDatos);
  });
});

describe('Contraseñas (RNF-05, RNF-06)', () => {
  test('[RNF-05] las contraseñas se guardan con bcrypt de costo 12, nunca en texto plano', async () => {
    const usuarios = await db.usuario.findMany();
    for (const u of usuarios) {
      expect(u.contrasenaHash).not.toContain(CONTRASENA);
      expect(bcrypt.getRounds(u.contrasenaHash)).toBe(12);
    }
  });

  test('[RNF-06] la consulta a la Autenticación Institucional no recibe la contraseña', async () => {
    const { autenticacionInstitucional } = await import('../../src/integraciones');
    const espia = jest.spyOn(autenticacionInstitucional, 'consultarVigencia');
    await intentar('mrossi0', CONTRASENA);
    expect(espia).toHaveBeenCalledWith('mrossi0');
    expect(JSON.stringify(espia.mock.calls)).not.toContain(CONTRASENA);
    espia.mockRestore();
  });
});

describe('Cabeceras de seguridad (RNF-21)', () => {
  test('[RNF-21] toda respuesta lleva CSP, HSTS y X-Frame-Options', async () => {
    const r = await sinSesion.get('/salud');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(r.headers['x-frame-options']).toBe('DENY');
  });
});
