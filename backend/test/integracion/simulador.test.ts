// Simulador externo, solo demo: volver la base al estado inicial de los datos de prueba sin redesplegar.
// No verifica un requisito de la especificación: es una herramienta para presentar la demo.
import { cerrarBase, como, db, ingresar, reiniciarBase } from './entorno';

beforeAll(reiniciarBase);
afterAll(cerrarBase);

describe('Simulador · volver la demo al estado inicial', () => {
  test('solo el Administrador puede hacerlo', async () => {
    for (const usuario of ['mrossi0', 'pgimene0', 'tmolina0']) {
      const r = await como(await ingresar(usuario)).post('/simulador/reiniciar');
      expect(r.status).toBe(403);
    }
  });

  test('deshace lo hecho en la demo y deja los datos de prueba como al desplegar', async () => {
    const admin = await ingresar('asuarez0');
    const antes = { solicitudes: await db.solicitud.count(), dictamenes: await db.dictamen.count(), usuarios: await db.usuario.count() };

    // Algo hecho durante la demo: un reclamo nuevo del SUA y un usuario dado de baja.
    const derivada = await como(admin).post('/simulador/derivacion', { distrito: 'Sur', prioridad: 'Baja', direccion: 'San Martín 2400', descripcion: 'Durante la demo.' });
    expect(derivada.status).toBe(201);
    await db.usuario.update({ where: { nombreUsuario: 'tmolina0' }, data: { activo: false } });
    expect(await db.solicitud.count()).toBe(antes.solicitudes + 1);

    const r = await como(admin).post('/simulador/reiniciar');
    expect(r.status).toBe(200);
    expect(await db.solicitud.count()).toBe(antes.solicitudes);
    expect(await db.dictamen.count()).toBe(antes.dictamenes);
    expect(await db.usuario.count()).toBe(antes.usuarios);
    expect((await db.usuario.findUnique({ where: { nombreUsuario: 'tmolina0' } }))?.activo).toBe(true);

    // Las sesiones anteriores ya no se pueden renovar, y se vuelve a ingresar con los datos de prueba.
    expect(await db.sesionRefresco.count()).toBe(0);
    expect((await como(await ingresar('mrossi0')).get('/solicitudes')).status).toBe(200);
  });
});
