// Módulo 6 · Dashboard (CU-11; HU-11, HU-15; RF-35 a RF-37, RF-44), métricas en el momento
// (arquitectura §7.5) y requisitos no funcionales de carga y conservación (RNF-02, RNF-03, RNF-10).
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  app, cerrarBase, como, CONTRASENA, db, firmar, formularioValido, ingresar, reiniciarBase, sinSesion, subirFoto, type Sesion,
} from './entorno';

beforeAll(reiniciarBase);
afterAll(cerrarBase);

const cero = { derivadas: 0, dictaminadas: 0, sinDictaminar: 0 };
const resumen = (derivadas: number, dictaminadas: number) => ({ derivadas, dictaminadas, sinDictaminar: derivadas - dictaminadas });

/*
 * Valores esperados, calculados a mano con los datos de prueba (historial-derivaciones.json,
 * solicitudes-sua.csv, dictamenes-ejemplo.json y dictamenes-conflicto.json):
 *
 * Cada fila del historial es un evento de derivación. En 2026 hay 42: 40 derivaciones "Nueva" del 17/08
 * al 06/10 más las 2 re-derivaciones por vencimiento (50822 y 50892, ambas el 05/10). En 2025 hay 2:
 * las derivaciones originales de esas mismas dos solicitudes (11/11 y 12/11).
 *
 *   Agosto 2026:    4 derivadas (48070, 48179, 48194, 48321); las 4 tienen dictamen vigente emitido
 *                   entre su derivación y el fin del mes (19/08, 22/08, 27/08, 30/08)    -> 4 / 4 / 0.
 *   Septiembre 2026: 24 derivadas. Dictaminadas: 48388 (dictamen 04/09), 48480 (09/09) y 48495
 *                   (sus dos dictámenes en espera del 10/10 cuentan: "vigente o en espera")
 *                   -> 24 / 3 / 21.
 *   Octubre 2026:   14 derivadas: 4 normales (50038, 50108, 50122, 50156) + 2 re-derivaciones (50822 y
 *                   50892; sus dictámenes de 12/2025 son anteriores a la re-derivación del 05/10, así que
 *                   no la cuentan) + 8 de tormenta (50261, 50304, 50327, 50428, 50466, 50523, 50580,
 *                   50704). Ninguna dictaminada -> 14 / 0 / 14.
 *   Año 2026:       4 + 24 + 14 = 42 derivadas, 4 + 3 + 0 = 7 dictaminadas, 35 sin dictaminar.
 *   Tormenta:       las 8 solicitudes de tormenta se derivaron todas en octubre (01/10 al 06/10) y
 *                   ninguna está dictaminada -> octubre y año: 8 / 0 / 8; agosto y septiembre: 0.
 *   Sin tormenta:   2026 = 42 - 8 = 34 derivadas.
 *   Año 2025:       noviembre 2025 = 2 derivadas (50822 y 50892) con su dictamen del 03/12 y 04/12,
 *                   posteriores y anteriores a la siguiente derivación (05/10/2026) -> 2 / 2 / 0.
 */
const AGOSTO = resumen(4, 4);
const SEPTIEMBRE = resumen(24, 3);
const OCTUBRE = resumen(14, 0);
const ANIO_2026 = resumen(42, 7);
const TORMENTA_2026 = resumen(8, 0);

describe('Dashboard (CU-11, HU-11, HU-15)', () => {
  let jefe: Sesion, admin: Sesion, lector: Sesion, operador: Sesion;
  beforeAll(async () => {
    [jefe, admin, lector, operador] = await Promise.all([ingresar('pgimene0'), ingresar('asuarez0'), ingresar('tmolina0'), ingresar('mrossi0')]);
  });
  const consultar = (s: Sesion, query = '') => como(s).get(`/dashboard${query}`);

  test('[CU-11 normal][CU-11 1][HU-11 c1][RF-35] el Jefe accede al dashboard: ve derivadas, dictaminadas y sin dictaminar del año en curso', async () => {
    const r = await consultar(jefe);
    expect(r.status).toBe(200);
    expect(r.body.anio).toBe(2026);
    expect(r.body.mes).toBeNull();
    expect(r.body.general).toEqual(ANIO_2026);
    expect(r.body.general.derivadas).toBe(r.body.general.dictaminadas + r.body.general.sinDictaminar);
  });

  test('[RF-35][CU-11 normal] el Administrador y el Lector también ven el dashboard, con los mismos números', async () => {
    for (const s of [admin, lector]) {
      const r = await consultar(s, '?anio=2026');
      expect(r.status).toBe(200);
      expect(r.body.general).toEqual(ANIO_2026);
    }
  });

  test('[CU-11 E2][RF-35] el Operador no tiene rol habilitado: recibe 403 y ninguna métrica', async () => {
    const r = await consultar(operador, '?anio=2026');
    expect(r.status).toBe(403);
    expect(r.body.general).toBeUndefined();
  });

  test('[CU-11 E2][RF-35] sin sesión tampoco se accede al dashboard', async () => {
    const r = await sinSesion.get('/dashboard?anio=2026');
    expect(r.status).toBe(401);
  });

  test('[CU-11 2][HU-11 c2][RF-36] filtrar por mes: agosto, septiembre y octubre de 2026 devuelven sus números', async () => {
    for (const [mes, esperado] of [[8, AGOSTO], [9, SEPTIEMBRE], [10, OCTUBRE]] as const) {
      const r = await consultar(jefe, `?anio=2026&mes=${mes}`);
      expect(r.status).toBe(200);
      expect(r.body.mes).toBe(mes);
      expect(r.body.general).toEqual(esperado);
    }
  });

  test('[CU-11 2][HU-11 c2][RF-36] filtrar por año: 2026 devuelve el año completo y 2025 solo lo derivado en 2025', async () => {
    const a2026 = await consultar(jefe, '?anio=2026');
    expect(a2026.body.general).toEqual(ANIO_2026);
    // La suma de los tres meses con datos es el total del año.
    expect(AGOSTO.derivadas + SEPTIEMBRE.derivadas + OCTUBRE.derivadas).toBe(a2026.body.general.derivadas);
    const a2025 = await consultar(jefe, '?anio=2025');
    expect(a2025.body.general).toEqual(resumen(2, 2));
    const nov2025 = await consultar(jefe, '?anio=2025&mes=11');
    expect(nov2025.body.general).toEqual(resumen(2, 2));
  });

  test('[CU-11 2.1][HU-11 c3][RF-37] la re-derivación por vencimiento es un evento independiente en el período en que ocurrió', async () => {
    // 50822 y 50892 se derivaron en noviembre de 2025 (ya dictaminadas) y se re-derivaron el 05/10/2026.
    const nov2025 = await consultar(jefe, '?anio=2025&mes=11');
    expect(nov2025.body.general).toEqual(resumen(2, 2));
    const oct2026 = await consultar(jefe, '?anio=2026&mes=10');
    // Octubre cuenta 4 normales + 2 re-derivaciones + 8 de tormenta = 14, aunque 2 ya estaban contadas en 2025.
    expect(oct2026.body.general.derivadas).toBe(14);
    // La re-derivación está sin dictaminar: el dictamen anterior no la cuenta como dictaminada.
    expect(oct2026.body.general.dictaminadas).toBe(0);
    // Dos eventos en el historial de la misma solicitud, uno en cada año.
    const eventos = await db.historialDerivacion.findMany({ where: { numeroSua: '50822' }, orderBy: { fechaDerivacion: 'asc' } });
    expect(eventos.map((e) => e.fechaDerivacion.getUTCFullYear())).toEqual([2025, 2026]);
  });

  test('[CU-11 3][HU-15 c2][RF-44] el desglose de tormenta muestra los mismos tres indicadores', async () => {
    const r = await consultar(jefe, '?anio=2026');
    expect(r.body.tormenta).toEqual(TORMENTA_2026);
    expect(Object.keys(r.body.tormenta).sort()).toEqual(Object.keys(r.body.general).sort());
  });

  test('[HU-15 c1][RF-44] las de tormenta están incluidas en el total general: general = sin tormenta + tormenta', async () => {
    const r = await consultar(jefe, '?anio=2026');
    // Sin tormenta: 42 - 8 = 34 derivadas (7 dictaminadas, 27 sin dictaminar). Tormenta: 8 / 0 / 8.
    const sinTormenta = { derivadas: 34, dictaminadas: 7, sinDictaminar: 27 };
    expect(r.body.general.derivadas).toBe(sinTormenta.derivadas + r.body.tormenta.derivadas);
    expect(r.body.general.dictaminadas).toBe(sinTormenta.dictaminadas + r.body.tormenta.dictaminadas);
    expect(r.body.general.sinDictaminar).toBe(sinTormenta.sinDictaminar + r.body.tormenta.sinDictaminar);
    // Verificación independiente en la base: eventos de 2026 de solicitudes que no son de tormenta.
    const noTormenta = await db.historialDerivacion.count({
      where: { fechaDerivacion: { gte: new Date('2026-01-01T00:00:00Z'), lt: new Date('2027-01-01T00:00:00Z') }, solicitud: { esTormenta: false } },
    });
    expect(noTormenta).toBe(sinTormenta.derivadas);
  });

  test('[HU-15 c3][RF-36][RF-44] el filtro por mes y año se aplica al total general y al desglose de tormenta', async () => {
    for (const [mes, general, tormenta] of [
      [8, AGOSTO, cero],
      [9, SEPTIEMBRE, cero],
      [10, OCTUBRE, TORMENTA_2026],
    ] as const) {
      const r = await consultar(jefe, `?anio=2026&mes=${mes}`);
      expect(r.body.general).toEqual(general);
      expect(r.body.tormenta).toEqual(tormenta);
    }
    const a2025 = await consultar(jefe, '?anio=2025');
    expect(a2025.body.tormenta).toEqual(cero);
  });

  test('[CU-11 2][RF-36] la evolución mensual del año suma el total y tiene los 12 meses', async () => {
    const r = await consultar(jefe, '?anio=2026');
    expect(r.body.evolucion).toHaveLength(12);
    const mes = (n: number) => r.body.evolucion[n - 1];
    expect(mes(8)).toEqual({ mes: 8, ...AGOSTO });
    expect(mes(9)).toEqual({ mes: 9, ...SEPTIEMBRE });
    expect(mes(10)).toEqual({ mes: 10, ...OCTUBRE });
    for (const n of [1, 2, 3, 4, 5, 6, 7, 11, 12]) expect(mes(n)).toEqual({ mes: n, ...cero });
  });

  test('[CU-11 E1][RF-36] un período sin datos devuelve todo en cero (general, tormenta y evolución)', async () => {
    for (const query of ['?anio=2027', '?anio=2026&mes=1', '?anio=2025&mes=12', '?anio=2024']) {
      const r = await consultar(jefe, query);
      expect(r.status).toBe(200);
      expect(r.body.general).toEqual(cero);
      expect(r.body.tormenta).toEqual(cero);
      // La evolución mensual es siempre la del año entero: en cero solo cuando el año no tiene datos.
      if (!query.includes('mes')) for (const m of r.body.evolucion) expect(m).toMatchObject(cero);
    }
    // El aviso "no hubo actividad en ese período" es de la interfaz: también va en la prueba de navegador.
  });
});

describe('Métricas en el momento (arquitectura §7.5)', () => {
  test('[CU-11 1][HU-11 c1][RF-35] después de dictaminar una solicitud, la consulta siguiente ya la cuenta, sin esperar', async () => {
    await reiniciarBase();
    const [jefe, operador] = await Promise.all([ingresar('pgimene0'), ingresar('mrossi0')]);
    const antes = await como(jefe).get('/dashboard?anio=2026&mes=10');
    expect(antes.body.general).toEqual(OCTUBRE);
    expect(antes.body.tormenta).toEqual(TORMENTA_2026);

    const foto = await subirFoto(operador);
    // 50038 es una solicitud normal derivada el 01/10; 50261 es de tormenta, derivada el 01/10.
    const normal = await firmar(operador, '50038', 2026, formularioValido([foto.referencia]));
    expect(normal.status).toBe(201);
    const despuesNormal = await como(jefe).get('/dashboard?anio=2026&mes=10');
    expect(despuesNormal.body.general).toEqual(resumen(14, 1));
    expect(despuesNormal.body.tormenta).toEqual(TORMENTA_2026);

    const tormenta = await firmar(operador, '50261', 2026, formularioValido([foto.referencia]));
    expect(tormenta.status).toBe(201);
    const despuesTormenta = await como(jefe).get('/dashboard?anio=2026&mes=10');
    expect(despuesTormenta.body.general).toEqual(resumen(14, 2));
    expect(despuesTormenta.body.tormenta).toEqual(resumen(8, 1));
    const anual = await como(jefe).get('/dashboard?anio=2026');
    expect(anual.body.general).toEqual(resumen(42, 9));
    expect(anual.body.tormenta).toEqual(resumen(8, 1));
  });
});

// ── Carga: ingenieros simultáneos ───────────────────────────────────────────────────────────────

const medir = async <T>(f: () => PromiseLike<T>) => {
  const t0 = performance.now();
  const r = await f();
  return { r, ms: performance.now() - t0 };
};

/** Deja la base inicial y devuelve 7 ingenieros con sesión: 3 Operadores y 1 Jefe de los datos de prueba, más 3 Operadores nuevos. */
async function prepararIngenieros(): Promise<Sesion[]> {
  await reiniciarBase();
  const admin = await ingresar('asuarez0');
  const nuevos: string[] = [];
  for (const [nombre, apellido] of [['Ana', 'Prueba'], ['Bruno', 'Carga'], ['Carla', 'Simultanea']]) {
    const alta = await como(admin).post('/usuarios', { nombre, apellido, contrasena: CONTRASENA, rol: 'Operador' });
    if (alta.status !== 201) throw new Error(`No se pudo crear el usuario: ${JSON.stringify(alta.body)}`);
    const ins = await como(admin).post('/simulador/institucional', { nombreUsuario: alta.body.nombreUsuario, vigente: true });
    if (ins.status !== 200) throw new Error('No se pudo dar de alta en la Autenticación Institucional.');
    nuevos.push(alta.body.nombreUsuario);
  }
  return Promise.all([...['mrossi0', 'cbenite0', 'lfernan0', 'pgimene0'], ...nuevos].map((u) => ingresar(u)));
}

describe('RNF-02 · 7 ingenieros a la vez', () => {
  const DISTRITOS = ['Centro', 'Norte', 'Oeste', 'Noroeste', 'Sudoeste', 'Sur'];
  let ingenieros: Sesion[];
  let fotos: string[];
  beforeAll(async () => {
    ingenieros = await prepararIngenieros();
    fotos = await Promise.all(ingenieros.map(async (s) => (await subirFoto(s)).referencia));
  });

  test('[RNF-02] 7 ingenieros listan, generan rutas y firman en paralelo: respuestas correctas y ninguna tarda más de 2 s', async () => {
    expect(ingenieros).toHaveLength(7);
    const tiempos: number[] = [];
    const registrar = <T extends { ms: number }>(m: T) => (tiempos.push(m.ms), m);
    const base = await como(ingenieros[3]).get('/solicitudes?pestania=pendientes');
    const totalPendientes = base.body.total;
    expect(totalPendientes).toBeGreaterThan(20);

    // 1) Los 7 consultan el listado a la vez.
    const listados = (await Promise.all(ingenieros.map((s) => medir(() => como(s).get('/solicitudes?pestania=pendientes'))))).map(registrar);
    for (const { r } of listados) {
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(totalPendientes);
      expect(r.body.solicitudes.length).toBeGreaterThan(0);
    }

    // 2) Los 7 generan su ruta a la vez: seis por distrito y el séptimo una de tormenta, sin solaparse.
    const rutas = (
      await Promise.all(
        ingenieros.map((s, i) =>
          medir(() =>
            i < DISTRITOS.length
              ? como(s).post('/rutas', { distrito: DISTRITOS[i], cupos: {}, modo: 'Vehiculo' })
              : como(s).post('/tormenta/rutas', { cantidad: 2 }),
          ),
        ),
      )
    ).map(registrar);
    const reservadas = new Set<string>();
    rutas.forEach(({ r }, i) => {
      expect(r.status).toBe(201);
      const paradas = r.body.ruta.paradas as { numeroSua: string; anio: number; distrito: string }[];
      expect(paradas.length).toBeGreaterThan(0);
      if (i < DISTRITOS.length) for (const p of paradas) expect(p.distrito).toBe(DISTRITOS[i]);
      else expect(paradas).toHaveLength(2);
      for (const p of paradas) {
        expect(reservadas.has(`${p.numeroSua}-${p.anio}`)).toBe(false);
        reservadas.add(`${p.numeroSua}-${p.anio}`);
      }
    });

    // 3) Los 7 firman a la vez el primer caso de su ruta, mientras siguen consultando el listado.
    const primeras = rutas.map(({ r }) => r.body.ruta.paradas[0] as { numeroSua: string; anio: number });
    const resultados = (
      await Promise.all(
        ingenieros.map((s, i) => Promise.all([medir(() => firmar(s, primeras[i].numeroSua, primeras[i].anio, formularioValido([fotos[i]]))), medir(() => como(s).get('/solicitudes'))])),
      )
    ).map(([firma, listado]) => (registrar(firma), registrar(listado), { firma, listado }));
    for (const [i, { firma, listado }] of resultados.entries()) {
      expect(firma.r.status).toBe(201);
      expect(listado.r.status).toBe(200);
      const id = firma.r.body.dictamen.idDictamen;
      const verificado = await como(ingenieros[i]).get(`/dictamenes/${id}/verificar`);
      expect(verificado.body.coincide).toBe(true);
      const s = await db.solicitud.findUniqueOrThrow({ where: { numeroSua_anio: { numeroSua: primeras[i].numeroSua, anio: primeras[i].anio } } });
      expect(s.estado).toBe('Dictaminada');
    }
    expect(await db.dictamen.count({ where: { fechaEmision: { gte: new Date(Date.now() - 600_000) } } })).toBe(7);

    expect(tiempos).toHaveLength(7 * 4);
    expect(Math.max(...tiempos)).toBeLessThan(2000);
  });
});

describe('RNF-03 · 70 dictámenes en un día', () => {
  test('[RNF-03] 7 ingenieros firman 10 dictámenes cada uno: todos quedan guardados y enviados al SUA, sin errores y con menos de 1 s por firma de media', async () => {
    const ingenieros = await prepararIngenieros();
    const fotos = await Promise.all(ingenieros.map(async (s) => (await subirFoto(s)).referencia));
    // 70 solicitudes nuevas, directo en la base (60001 a 60070).
    const hoy = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const numeros = Array.from({ length: 70 }, (_, k) => String(60001 + k));
    await db.solicitud.createMany({
      data: numeros.map((numeroSua) => ({
        numeroSua,
        anio: 2026,
        distrito: 'Centro',
        prioridad: 'Media',
        direccion: 'Laprida 1350, Rosario, Santa Fe',
        latitud: -32.954036,
        longitud: -60.635901,
        descripcionReclamo: 'Solicitud de la prueba de carga.',
        fechaUltimaDerivacion: hoy,
      })),
    });

    // Cada ingeniero firma sus 10, uno detrás del otro; los 7 trabajan a la vez.
    const porIngeniero = await Promise.all(
      ingenieros.map(async (s, i) => {
        const salidas = [];
        for (const numeroSua of numeros.slice(i * 10, i * 10 + 10))
          salidas.push(await medir(() => firmar(s, numeroSua, 2026, formularioValido([fotos[i]], { notaNumero: 2000 + Number(numeroSua) - 60000 }), randomUUID())));
        return salidas;
      }),
    );
    const todas = porIngeniero.flat();
    expect(todas).toHaveLength(70);
    for (const { r } of todas) {
      expect(r.status).toBe(201);
      const envio = r.body.pasos.find((p: { titulo: string }) => p.titulo === 'Envío al SUA');
      expect(envio.detalle).toMatch(/acuse SUA-ACUSE-/);
    }
    const media = todas.reduce((t, x) => t + x.ms, 0) / todas.length;
    expect(media).toBeLessThan(1000);

    // Quedan guardados y enviados al SUA simulado.
    const rango = { numeroSua: { in: numeros }, anio: 2026 };
    expect(await db.dictamen.count({ where: rango })).toBe(70);
    expect(await db.dictamen.count({ where: { ...rango, estadoSincronizacion: 'Sincronizado', enviadoSuaEn: { not: null } } })).toBe(70);
    expect(await db.solicitud.count({ where: { ...rango, estado: 'Dictaminada' } })).toBe(70);
    expect(await db.simSuaDatosComplementarios.count({ where: { numeroSua: { in: numeros }, anio: 2026 } })).toBe(70);
    const porUsuario = await db.dictamen.groupBy({ by: ['nombreUsuario'], where: rango, _count: true });
    expect(porUsuario).toHaveLength(7);
    for (const g of porUsuario) expect(g._count).toBe(10);
    // Ninguna firma quedó con el contenido alterado.
    const ids = todas.map((x) => x.r.body.dictamen.idDictamen as number);
    const verificaciones = await Promise.all(ids.map((id) => como(ingenieros[0]).get(`/dictamenes/${id}/verificar`)));
    for (const v of verificaciones) expect(v.body.coincide).toBe(true);
  });
});

describe('RNF-10 · los dictámenes se conservan', () => {
  test('[RNF-10] no existe ningún endpoint que borre dictámenes: DELETE responde 404 y el contenido sigue igual', async () => {
    await reiniciarBase();
    const jefe = await ingresar('pgimene0');
    const antes = await Promise.all([1, 2, 3, 8].map((id) => como(jefe).get(`/dictamenes/${id}`)));
    for (const r of antes) expect(r.status).toBe(200);
    const cantidad = await db.dictamen.count();
    expect(cantidad).toBe(10); // 8 de ejemplo + 2 del conflicto de la 48495

    const borrar = (ruta: string) => request(app).delete(`/api${ruta}`).set('Authorization', `Bearer ${jefe.acceso}`);
    const intentos = ['/dictamenes/1', '/dictamenes/2', '/dictamenes', '/dictamenes/1/pdf', '/dictamenes/conflicto/48495/2026', '/dictamenes/1/vigente'];
    for (const ruta of intentos) expect((await borrar(ruta)).status).toBe(404);
    // Tampoco sin sesión, ni con otros métodos de escritura.
    expect((await request(app).delete('/api/dictamenes/1')).status).toBe(404);
    expect((await request(app).put('/api/dictamenes/1').set('Authorization', `Bearer ${jefe.acceso}`).send({})).status).toBe(404);
    expect((await request(app).patch('/api/dictamenes/1').set('Authorization', `Bearer ${jefe.acceso}`).send({})).status).toBe(404);

    expect(await db.dictamen.count()).toBe(cantidad);
    const despues = await Promise.all([1, 2, 3, 8].map((id) => como(jefe).get(`/dictamenes/${id}`)));
    despues.forEach((r, i) => expect(r.body).toEqual(antes[i].body));
    for (const id of [1, 2, 3, 8]) expect((await como(jefe).get(`/dictamenes/${id}/verificar`)).body.coincide).toBe(true);
  });
});
