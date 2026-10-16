// Módulo 2 · Lectura y consulta de solicitudes del SUA (CU-03, CU-14; HU-03, HU-14, HU-16).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { FILTRO_SUA } from '../../src/dominio/catalogos';
import { sua } from '../../src/integraciones';
import { esperaTrasFallos } from '../../src/modulos/tareas';
import { app, cerrarBase, como, db, firmar, formularioValido, ingresar, reiniciarBase, simularCaida, sinSesion, subirFoto, type Sesion } from './entorno';

type Cliente = ReturnType<typeof como>;
interface FilaSolicitud {
  numeroSua: string;
  anio: number;
  estado: string;
  sinUbicar: boolean;
  direccion: string;
  distrito: string;
  reservadaPor: string | null;
  [clave: string]: unknown;
}

const DATOS = join(__dirname, '../../../datos-prueba');

/** Las 42 solicitudes del CSV con el estado que debe mostrar el sistema (columna estado_esperado_en_sistema). */
const CSV = readFileSync(join(DATOS, 'solicitudes-sua.csv'), 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((linea) => {
    const celdas = linea.split(',');
    const estado = celdas[celdas.length - 1].trim();
    return {
      id: `${celdas[0]}-${celdas[1]}`,
      numeroSua: celdas[0],
      anio: Number(celdas[1]),
      esTormenta: celdas[celdas.length - 4] === 'True',
      estado: estado === 'Pendiente-revisión' ? 'PendienteRevision' : estado,
    };
  });
const CSV_GENERAL = CSV.filter((s) => !s.esTormenta);
const CSV_TORMENTA = CSV.filter((s) => s.esTormenta);
const idDe = (s: { numeroSua: string; anio: number }) => `${s.numeroSua}-${s.anio}`;

// Datos del vecino que el sistema no debe mostrar nunca (RF-29, RNF-08). `nombreUsuario` es del ingeniero.
const CLAVE_PERSONAL = /vecino|tel[eé]fono|celular|contacto|mail|dni|nombreCompleto|^nombre$|apellido/i;
function clavesPersonales(valor: unknown, ruta = ''): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v) => clavesPersonales(v, ruta));
  if (valor && typeof valor === 'object')
    return Object.entries(valor).flatMap(([k, v]) => (CLAVE_PERSONAL.test(k) ? [`${ruta}.${k}`] : []).concat(clavesPersonales(v, `${ruta}.${k}`)));
  return [];
}

let operador: Sesion;
let operador2: Sesion;
let jefe: Sesion;
let admin: Sesion;
let lector: Sesion;
let nuevaSua = 91000;

/** Todas las páginas del listado general. */
async function listado(c: Cliente, consulta = ''): Promise<{ total: number; sua: Record<string, unknown>; solicitudes: FilaSolicitud[] }> {
  const primera = await c.get(`/solicitudes?pagina=1${consulta}`);
  expect(primera.status).toBe(200);
  const solicitudes: FilaSolicitud[] = [...primera.body.solicitudes];
  for (let p = 2; solicitudes.length < primera.body.total; p++) {
    const r = await c.get(`/solicitudes?pagina=${p}${consulta}`);
    expect(r.status).toBe(200);
    solicitudes.push(...r.body.solicitudes);
  }
  return { total: primera.body.total, sua: primera.body.sua, solicitudes };
}

/** Un registro derivado por el SUA que cumple el esquema y el filtro. Pasa a ser una solicitud nueva. */
function registroSua(cambios: Record<string, unknown> = {}) {
  return {
    numeroSua: String(nuevaSua++),
    anio: 2026,
    ...FILTRO_SUA,
    distrito: 'Centro',
    prioridad: 'Media',
    direccion: 'Mendoza 1100, Rosario, Santa Fe',
    descripcionReclamo: 'Rama baja que obstaculiza el paso.',
    esTormenta: false,
    esRederivacion: false,
    fechaDerivacion: new Date('2026-10-12T00:00:00Z'),
    ...cambios,
  };
}

/**
 * Fuerza en el acto la lectura del SUA (en producción corre sola cada tanto). El simulador agrega
 * además una derivación nueva; devuelve su número y el resultado de la lectura.
 */
async function leerAhora() {
  const r = await como(operador).post('/simulador/derivacion', { distrito: 'Sur', prioridad: 'Baja', direccion: 'San Martín 2400', descripcion: 'Disparo de la lectura.' });
  expect(r.status).toBe(201);
  return r.body as { numeroSua: string; anio: number; lectura: { nuevas: number; rederivadas: number; rechazadas: number; suaDisponible: boolean } };
}

/** Descarta la ruta activa del ingeniero para dejar libres sus solicitudes. */
async function restablecerRuta(s: Sesion) {
  const activa = await como(s).get('/rutas/activa');
  const id = activa.body.ruta?.idRuta;
  if (id) expect((await como(s).post(`/rutas/${id}/restablecer`)).status).toBe(200);
}

const unaHoraAtras = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000);

beforeAll(async () => {
  await reiniciarBase();
  [operador, operador2, jefe, admin, lector] = await Promise.all(['mrossi0', 'cbenite0', 'pgimene0', 'asuarez0', 'tmolina0'].map((u) => ingresar(u)));
});
afterAll(cerrarBase);

describe('Consulta de solicitudes (CU-03, HU-03)', () => {
  // Tiene que ser la primera consulta del archivo: la lectura del SUA al abrir el listado corre
  // como mucho una vez por minuto, y esta es la que la dispara.
  test('[CU-03 normal][CU-03 1][CU-03 2][RF-09][RF-10] al abrir el listado el sistema consulta al SUA e incorpora lo que derivó, identificado por Número de SUA - Año', async () => {
    const reg = registroSua({ numeroSua: '90100' });
    await db.simSuaSolicitud.create({ data: reg });
    const { solicitudes, sua: lectura } = await listado(como(operador));
    const nueva = solicitudes.find((s) => idDe(s) === '90100-2026');
    expect(nueva).toMatchObject({ numeroSua: '90100', anio: 2026, estado: 'Pendiente', distrito: 'Centro' });
    expect(lectura).toMatchObject({ suaDisponible: true, nuevas: 1 });
    expect((await db.simSuaSolicitud.findFirstOrThrow({ where: { numeroSua: '90100' } })).leido).toBe(true);
  });

  test('[RF-11][HU-03 c2] cada solicitud del listado muestra su identificador y su estado: Pendiente, Dictaminada o Pendiente-revisión', async () => {
    const { solicitudes } = await listado(como(operador));
    for (const s of solicitudes) {
      expect(typeof s.numeroSua).toBe('string');
      expect(typeof s.anio).toBe('number');
      expect(['Pendiente', 'Dictaminada', 'PendienteRevision']).toContain(s.estado);
    }
  });

  test('[RF-11][RF-12][HU-03 c2] los estados coinciden con la columna estado_esperado_en_sistema del CSV: 6 Dictaminada, 3 Pendiente-revisión y el resto Pendiente', async () => {
    const { solicitudes } = await listado(como(operador));
    const esperado = (e: string) => CSV_GENERAL.filter((s) => s.estado === e).length;
    expect(esperado('Dictaminada')).toBe(6);
    expect(esperado('PendienteRevision')).toBe(3); // las 2 re-derivadas y la 48495 con dos dictámenes
    for (const c of CSV_GENERAL) expect(solicitudes.find((s) => idDe(s) === c.id)?.estado).toBe(c.estado);
    for (const e of ['Dictaminada', 'PendienteRevision', 'Pendiente'])
      expect(solicitudes.filter((s) => CSV_GENERAL.some((c) => c.id === idDe(s) && c.estado === e))).toHaveLength(esperado(e));
    // Las pestañas filtran por estado.
    const pend = await listado(como(operador), '&pestania=pendientes');
    const rev = await listado(como(operador), '&pestania=revision');
    expect(pend.solicitudes.every((s) => s.estado === 'Pendiente')).toBe(true);
    expect(pend.solicitudes.filter((s) => CSV_GENERAL.some((c) => c.id === idDe(s)))).toHaveLength(esperado('Pendiente'));
    expect(rev.solicitudes.map(idDe).sort()).toEqual(CSV_GENERAL.filter((s) => s.estado === 'PendienteRevision').map((s) => s.id).sort());
  });

  test('[RF-10][RF-11] las 42 solicitudes de los datos de prueba se identifican de forma única y el estado guardado es el esperado', async () => {
    const filas = await db.solicitud.findMany({ where: { numeroSua: { in: CSV.map((s) => s.numeroSua) } } });
    expect(CSV).toHaveLength(42);
    expect(new Set(CSV.map((s) => s.id)).size).toBe(42);
    expect(filas).toHaveLength(42);
    for (const c of CSV) expect(filas.find((f) => idDe(f) === c.id)?.estado).toBe(c.estado);
  });

  test('[RF-10] el mismo Número de SUA en otro año es otra solicitud, y una lectura repetida del mismo registro no la duplica', async () => {
    await db.simSuaSolicitud.createMany({
      data: [registroSua({ numeroSua: '90200', anio: 2025, fechaDerivacion: new Date('2026-10-12T00:00:00Z') }), registroSua({ numeroSua: '90200', anio: 2026 })],
    });
    await leerAhora();
    expect(await db.solicitud.count({ where: { numeroSua: '90200' } })).toBe(2);
    await leerAhora();
    expect(await db.solicitud.count({ where: { numeroSua: '90200' } })).toBe(2);
  });

  test('[RF-09][HU-03 c1] solo entran reclamos de arbolado derivados a Parques y Paseos - Dirección Técnica: un registro de otro tipo, subtipo o área no entra', async () => {
    await db.simSuaSolicitud.createMany({
      data: [
        registroSua({ numeroSua: '90301', tipo: 'sugerencia' }),
        registroSua({ numeroSua: '90302', subtipo: 'bache en la calzada' }),
        registroSua({ numeroSua: '90303', areaDerivada: 'Tránsito - Dirección de Obras' }),
        registroSua({ numeroSua: '90304' }),
      ],
    });
    // La consulta lleva el filtro como parámetro: el SUA solo devuelve lo que coincide.
    const devueltos = await sua.consultarDerivaciones(FILTRO_SUA);
    const numeros = devueltos.map((r) => r.numeroSua);
    expect(numeros).toContain('90304');
    expect(numeros).not.toEqual(expect.arrayContaining(['90301']));
    expect(numeros).not.toContain('90302');
    expect(numeros).not.toContain('90303');
    for (const r of devueltos) expect(r).toMatchObject(FILTRO_SUA);
    await leerAhora();
    const guardadas = await db.solicitud.findMany({ where: { numeroSua: { in: ['90301', '90302', '90303', '90304'] } } });
    expect(guardadas.map((s) => s.numeroSua)).toEqual(['90304']);
    const { solicitudes } = await listado(como(operador));
    expect(solicitudes.map((s) => s.numeroSua)).not.toEqual(expect.arrayContaining(['90301']));
    expect(solicitudes.find((s) => s.numeroSua === '90304')).toBeDefined();
  });

  test('[RF-13][HU-03 c3] Operador y Jefe ven el mismo listado completo, sin restricción de asignación a un ingeniero', async () => {
    const [a, b, c] = await Promise.all([listado(como(operador)), listado(como(operador2)), listado(como(jefe))]);
    expect(a.total).toBeGreaterThanOrEqual(CSV_GENERAL.length);
    expect(b.solicitudes.map(idDe)).toEqual(a.solicitudes.map(idDe));
    expect(c.solicitudes.map(idDe)).toEqual(a.solicitudes.map(idDe));
    // Todas las pendientes y pendientes-revisión, cualquiera sea su distrito.
    const pendientes = a.solicitudes.filter((s) => s.estado !== 'Dictaminada');
    expect(pendientes.length).toBeGreaterThanOrEqual(CSV_GENERAL.filter((s) => s.estado !== 'Dictaminada').length);
    expect(new Set(pendientes.map((s) => s.distrito)).size).toBeGreaterThanOrEqual(6);
  });

  test('[RF-13] el Lector y el Administrador no tienen el listado de solicitudes: 403; sin sesión: 401', async () => {
    for (const s of [lector, admin]) {
      expect((await como(s).get('/solicitudes')).status).toBe(403);
      expect((await como(s).get('/solicitudes/48509/2026')).status).toBe(403);
    }
    expect((await sinSesion.get('/solicitudes')).status).toBe(401);
  });

  test('[RF-39][CU-03 2.2] las 8 solicitudes de tormenta no aparecen en el listado general ni en sus pestañas', async () => {
    expect(CSV_TORMENTA).toHaveLength(8);
    for (const consulta of ['', '&pestania=pendientes', '&pestania=revision']) {
      const { solicitudes } = await listado(como(operador), consulta);
      for (const t of CSV_TORMENTA) expect(solicitudes.find((s) => idDe(s) === t.id)).toBeUndefined();
    }
    const filas = await db.solicitud.findMany({ where: { esTormenta: true } });
    expect(filas.map(idDe).sort()).toEqual(CSV_TORMENTA.map((s) => s.id).sort());
  });

  test('[CU-03 3][RF-29][RNF-08][HU-03 c2] el detalle muestra el caso técnico sin datos personales del vecino', async () => {
    const r = await como(operador).get('/solicitudes/48509/2026');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ numeroSua: '48509', anio: 2026, estado: 'Pendiente', distrito: 'Centro', prioridad: 'Media', esTormenta: false, sinUbicar: false });
    expect(r.body.direccion).toBe('Laprida 1350, Rosario, Santa Fe');
    expect(r.body.descripcion).toBeTruthy();
    expect(typeof r.body.lat).toBe('number');
    expect(clavesPersonales(r.body)).toEqual([]);
    expect((await como(operador).get('/solicitudes/00000/2026')).status).toBe(404);
  });

  test('[RF-29][RNF-08] ninguna respuesta de solicitudes (listado, pestañas y detalle de todas las del CSV) lleva nombre ni contacto del vecino', async () => {
    const hallados: string[] = [];
    for (const consulta of ['', '&pestania=pendientes', '&pestania=revision', '&anio=2025'])
      hallados.push(...clavesPersonales((await listado(como(jefe), consulta)).solicitudes));
    for (const c of CSV) hallados.push(...clavesPersonales((await como(jefe).get(`/solicitudes/${c.numeroSua}/${c.anio}`)).body));
    expect(hallados).toEqual([]);
  });

  test('[RNF-08] la base propia no almacena nombre ni contacto del vecino: la solicitud solo guarda ubicación y descripción', async () => {
    const columnas = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'arbolado' AND table_name IN ('solicitud', 'historial_derivacion', 'sim_sua_solicitud')`;
    expect(columnas.length).toBeGreaterThan(10);
    expect(columnas.filter((c) => /vecino|telefono|celular|contacto|mail|dni|apellido|^nombre/i.test(c.column_name))).toEqual([]);
  });
});

describe('Re-derivación (RF-12, CU-03 2.1, HU-14)', () => {
  beforeAll(reiniciarBase);

  test('[RF-12][CU-03 2.1][HU-14 c2] las 2 solicitudes re-derivadas de los datos de prueba se muestran como Pendiente-revisión y conservan su historial', async () => {
    for (const numero of ['50822', '50892']) {
      const r = await como(operador).get(`/solicitudes/${numero}/2025`);
      expect(r.body.estado).toBe('PendienteRevision');
      expect(r.body.derivaciones.length).toBeGreaterThanOrEqual(2);
      expect(r.body.derivaciones.some((d: { motivo: string }) => /Re-derivaci/.test(d.motivo))).toBe(true);
      expect(r.body.dictamenes).toHaveLength(1); // el dictamen anterior sigue ahí
      expect(r.body.dictamenes[0].vigente).toBe(true);
    }
    const { solicitudes } = await listado(como(operador), '&pestania=revision');
    expect(solicitudes.filter((s) => ['50822', '50892'].includes(s.numeroSua))).toHaveLength(2);
  });

  test('[RF-12][CU-03 2.1][HU-14 c1][HU-14 c2][HU-14 c3] una solicitud ya dictaminada que se re-deriva queda Pendiente-revisión (no nueva) con su historial, y al dictaminarla vuelve a Dictaminada', async () => {
    const antes = await como(operador).get('/solicitudes/48179/2026');
    expect(antes.body.estado).toBe('Dictaminada');
    expect(antes.body.dictamenes).toHaveLength(1);
    const totalAntes = (await listado(como(operador))).total;

    const re = await como(jefe).post('/simulador/rederivacion', { numeroSua: '48179', anio: 2026 });
    expect(re.status).toBe(201);
    expect(re.body.lectura).toMatchObject({ rederivadas: 1, nuevas: 0, rechazadas: 0 });

    const durante = await como(operador).get('/solicitudes/48179/2026');
    expect(durante.body.estado).toBe('PendienteRevision');
    expect(durante.body.derivaciones.length).toBe(antes.body.derivaciones.length + 1);
    expect(durante.body.dictamenes).toEqual(antes.body.dictamenes); // el historial de dictámenes se conserva
    const { total, solicitudes } = await listado(como(operador));
    expect(total).toBe(totalAntes); // no se duplicó como solicitud nueva
    expect(solicitudes.find((s) => idDe(s) === '48179-2026')?.estado).toBe('PendienteRevision');

    const foto = await subirFoto(operador);
    const firma = await firmar(operador, '48179', 2026, formularioValido([foto.referencia], { notaNumero: 1301 }));
    expect(firma.status).toBe(201);
    const despues = await como(operador).get('/solicitudes/48179/2026');
    expect(despues.body.estado).toBe('Dictaminada');
    expect(despues.body.dictamenes).toHaveLength(2); // el anterior y el nuevo
    expect(despues.body.derivaciones.length).toBe(durante.body.derivaciones.length);
  });

  test('[RF-12] una solicitud pendiente que se re-deriva sigue Pendiente (todavía no tuvo dictamen)', async () => {
    const r = await como(operador).post('/simulador/rederivacion', { numeroSua: '49014', anio: 2026 });
    expect(r.status).toBe(201);
    expect((await como(operador).get('/solicitudes/49014/2026')).body.estado).toBe('Pendiente');
  });
});

describe('Lista vacía (CU-03 E2)', () => {
  beforeAll(reiniciarBase);
  afterAll(reiniciarBase);

  test('[CU-03 E2] sin solicitudes pendientes el listado viene vacío (el mensaje aclaratorio también va en la prueba de navegador)', async () => {
    await db.solicitud.updateMany({ data: { estado: 'Dictaminada' } });
    for (const pestania of ['pendientes', 'revision']) {
      const r = await como(operador).get(`/solicitudes?pestania=${pestania}`);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ total: 0, solicitudes: [] });
    }
  });
});

describe('Solicitud sin ubicar (CU-03 E3, RF-62, HU-03 c4)', () => {
  beforeAll(reiniciarBase);

  test('[CU-03 E3][HU-03 c4] la solicitud con dirección no ubicable aparece igual en el listado, marcada como sin ubicar', async () => {
    const { solicitudes } = await listado(como(operador));
    const s = solicitudes.find((x) => idDe(x) === '50156-2026');
    expect(s).toMatchObject({ estado: 'Pendiente', sinUbicar: true });
    const d = await como(operador).get('/solicitudes/50156/2026');
    expect(d.body).toMatchObject({ sinUbicar: true, lat: null, lng: null });
    expect(d.body.geoError).toBeTruthy();
  });

  test('[CU-03 E3][RF-62] queda fuera del armado automático de rutas', async () => {
    const criterios = { modo: 'Vehiculo', distrito: 'Centro' };
    const previa = await como(operador).post('/rutas/vista-previa', criterios);
    expect(previa.status).toBe(200);
    expect(previa.body.sinUbicar).toBeGreaterThanOrEqual(1);
    expect(previa.body.puntos.map((p: { id: string }) => p.id)).not.toContain('50156-2026');
    const ruta = await como(operador).post('/rutas', { ...criterios, cupos: { Alta: 50, Media: 50, Baja: 50 } });
    expect(ruta.status).toBe(201);
    expect(JSON.stringify(ruta.body.ruta)).not.toContain('50156');
    expect(await db.rutaSolicitud.count({ where: { numeroSua: '50156' } })).toBe(0);
    await restablecerRuta(operador);
  });

  test('[RF-62][CU-03 E3] nadie la corrige a mano: no hay endpoint para cargar o corregir coordenadas', async () => {
    const coordenadas = { lat: -32.95, lng: -60.64, latitud: -32.95, longitud: -60.64 };
    for (const ruta of ['/solicitudes/50156/2026', '/solicitudes/50156/2026/ubicacion', '/solicitudes/50156/2026/coordenadas', '/solicitudes/50156/2026/ubicar']) {
      for (const s of [operador, jefe, admin]) {
        const c = como(s);
        expect((await c.post(ruta, coordenadas)).status).toBe(404);
        expect((await c.patch(ruta, coordenadas)).status).toBe(404);
      }
    }
    expect((await db.solicitud.findFirstOrThrow({ where: { numeroSua: '50156' } })).latitud).toBeNull();
  });

  test('[RF-62] el reintento es cada hora: con el último intento de hace menos de una hora no se reintenta; con más de una hora y mapas disponible, se ubica sola', async () => {
    // Se deriva una solicitud mientras el servicio de mapas no responde: nace sin ubicar.
    await simularCaida('mapas_caido', true);
    const nueva = await leerAhora();
    expect(nueva.lectura.nuevas).toBe(1);
    const clave = { numeroSua_anio: { numeroSua: nueva.numeroSua, anio: nueva.anio } };
    const sinUbicar = await db.solicitud.findUniqueOrThrow({ where: clave });
    expect(sinUbicar.latitud).toBeNull();
    expect(sinUbicar.geoError).toMatch(/mapas/i);
    expect(sinUbicar.geoIntentos).toBe(1);
    expect((await como(operador).get(`/solicitudes/${nueva.numeroSua}/${nueva.anio}`)).body.sinUbicar).toBe(true);

    // Vuelve el servicio de mapas, pero el último intento fue hace media hora: todavía no toca.
    await simularCaida('mapas_caido', false);
    await db.solicitud.update({ where: clave, data: { geoUltimoIntento: new Date(Date.now() - 30 * 60 * 1000) } });
    await leerAhora();
    const aunSin = await db.solicitud.findUniqueOrThrow({ where: clave });
    expect(aunSin.latitud).toBeNull();
    expect(aunSin.geoIntentos).toBe(1);

    // Pasó más de una hora: el sistema la ubica solo.
    await db.solicitud.update({ where: clave, data: { geoUltimoIntento: unaHoraAtras(2) } });
    await leerAhora();
    const ubicada = await db.solicitud.findUniqueOrThrow({ where: clave });
    expect(ubicada.latitud).not.toBeNull();
    expect(ubicada.longitud).not.toBeNull();
    expect(ubicada.geoError).toBeNull();
    expect(ubicada.geoIntentos).toBe(2);
    const detalle = await como(operador).get(`/solicitudes/${nueva.numeroSua}/${nueva.anio}`);
    expect(detalle.body.sinUbicar).toBe(false);
  });

  test('[RF-62] si la dirección sigue siendo ambigua, el reintento horario se repite sin intervención y la solicitud sigue disponible', async () => {
    const clave = { numeroSua_anio: { numeroSua: '50156', anio: 2026 } };
    const antes = await db.solicitud.findUniqueOrThrow({ where: clave });
    await db.solicitud.update({ where: clave, data: { geoUltimoIntento: unaHoraAtras(3) } });
    await leerAhora();
    const despues = await db.solicitud.findUniqueOrThrow({ where: clave });
    expect(despues.geoIntentos).toBe(antes.geoIntentos + 1);
    expect(despues.geoUltimoIntento!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(despues.latitud).toBeNull();
    expect(despues.estado).toBe('Pendiente');
  });

  test('[CU-03 E3][HU-03 c4] la solicitud sin ubicar se puede dictaminar entrando directo desde el listado', async () => {
    const foto = await subirFoto(operador2);
    const r = await firmar(operador2, '50156', 2026, formularioValido([foto.referencia], { notaNumero: 1302, domicilioEjemplar: 'Pasaje sin nombre s/n, Rosario' }));
    expect(r.status).toBe(201);
    const d = await como(operador).get('/solicitudes/50156/2026');
    expect(d.body.estado).toBe('Dictaminada');
    expect(d.body.sinUbicar).toBe(true);
  });
});

describe('SUA caído (CU-03 E1, RNF-17)', () => {
  beforeAll(reiniciarBase);
  afterAll(async () => {
    await simularCaida('sua_caido', false);
  });

  test('[RNF-17] la espera entre intentos crece: 1, 2, 4, 8, 16 y como máximo 32 minutos', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map((f) => esperaTrasFallos(f) / 60_000)).toEqual([1, 2, 4, 8, 16, 32, 32, 32]);
    expect(esperaTrasFallos(0)).toBe(60_000);
  });

  test('[CU-03 E1][RNF-17] con el SUA caído el sistema informa que no pudo leer y sigue mostrando lo que ya tenía guardado', async () => {
    await db.simSuaSolicitud.create({ data: registroSua({ numeroSua: '90400' }) });
    await simularCaida('sua_caido', true);
    const total = await db.solicitud.count();
    const lectura = await como(operador).post('/simulador/derivacion', { distrito: 'Norte', prioridad: 'Alta', direccion: 'Av. Alberdi 1450', descripcion: 'Durante la caída.' });
    expect(lectura.status).toBe(201);
    expect(lectura.body.lectura).toMatchObject({ suaDisponible: false, nuevas: 0 });

    const r = await como(operador).get('/solicitudes');
    expect(r.status).toBe(200);
    expect(r.body.sua).toMatchObject({ suaDisponible: false });
    expect(r.body.total).toBe(CSV_GENERAL.length);
    expect(await db.solicitud.count()).toBe(total); // nada nuevo entró
    expect((await como(operador).get('/solicitudes/48509/2026')).status).toBe(200);
  });

  test('[RNF-17] tras la falla el reintento queda agendado con espera creciente y no se vuelve a golpear al SUA antes de tiempo', async () => {
    const e1 = await db.estadoTarea.findUniqueOrThrow({ where: { clave: 'lectura_sua' } });
    expect(e1.fallos).toBe(1);
    const espera1 = e1.proximoIntento.getTime() - Date.now();
    expect(espera1).toBeGreaterThan(esperaTrasFallos(1) - 5_000);
    expect(espera1).toBeLessThanOrEqual(esperaTrasFallos(1));

    // Antes de que venza la espera no hay un nuevo intento: los fallos no suben.
    await leerAhora();
    expect((await db.estadoTarea.findUniqueOrThrow({ where: { clave: 'lectura_sua' } })).fallos).toBe(1);

    // Vence la espera, el SUA sigue caído: segundo fallo, espera del doble.
    await db.estadoTarea.update({ where: { clave: 'lectura_sua' }, data: { proximoIntento: new Date(Date.now() - 1000) } });
    await leerAhora();
    const e2 = await db.estadoTarea.findUniqueOrThrow({ where: { clave: 'lectura_sua' } });
    expect(e2.fallos).toBe(2);
    const espera2 = e2.proximoIntento.getTime() - Date.now();
    expect(espera2).toBeGreaterThan(esperaTrasFallos(2) - 5_000);
    expect(espera2).toBeLessThanOrEqual(esperaTrasFallos(2));

    await db.estadoTarea.update({ where: { clave: 'lectura_sua' }, data: { proximoIntento: new Date(Date.now() - 1000) } });
    await leerAhora();
    const e3 = await db.estadoTarea.findUniqueOrThrow({ where: { clave: 'lectura_sua' } });
    expect(e3.fallos).toBe(3);
    expect(e3.proximoIntento.getTime() - Date.now()).toBeGreaterThan(esperaTrasFallos(3) - 5_000);
  });

  test('[RNF-17] lo que no depende del SUA sigue funcionando: consultar solicitudes guardadas y armar rutas', async () => {
    const lista = await listado(como(operador));
    expect(lista.total).toBe(CSV_GENERAL.length);
    expect((await como(jefe).get('/solicitudes/49014/2026')).status).toBe(200);
    expect((await como(operador).post('/rutas/vista-previa', { modo: 'Caminando', distrito: 'Centro' })).body.cumplen).toBeGreaterThan(0);
    const ruta = await como(operador).post('/rutas', { modo: 'Caminando', distrito: 'Centro', cupos: { Alta: 2 } });
    expect(ruta.status).toBe(201);
    await restablecerRuta(operador);
  });

  test('[RNF-17][CU-03 E1] cuando el SUA vuelve se lee lo que había quedado sin leer', async () => {
    expect((await db.simSuaSolicitud.findFirstOrThrow({ where: { numeroSua: '90400' } })).leido).toBe(false);
    await simularCaida('sua_caido', false);
    const r = await leerAhora();
    expect(r.lectura.suaDisponible).toBe(true);
    expect(r.lectura.nuevas).toBeGreaterThanOrEqual(2); // la que quedó pendiente y la del disparo
    expect(await db.solicitud.findFirst({ where: { numeroSua: '90400', anio: 2026 } })).not.toBeNull();
    expect((await db.simSuaSolicitud.findFirstOrThrow({ where: { numeroSua: '90400' } })).leido).toBe(true);
    expect(await db.estadoTarea.findUniqueOrThrow({ where: { clave: 'lectura_sua' } })).toMatchObject({ fallos: 0 });
    expect((await como(operador).get('/solicitudes')).body.sua.suaDisponible).toBe(true);
  });
});

describe('Datos inválidos del SUA (RNF-18, RF-58, CU-14, HU-16)', () => {
  beforeAll(reiniciarBase);

  const referencia = (r: { numeroSua: string; anio: unknown }) => `${r.numeroSua}-${String(r.anio)}`;

  test('[RNF-18][RF-58][HU-16 c3] un registro con distrito fuera de la lista, número no numérico o prioridad inválida no se guarda y queda en "Para revisar"', async () => {
    const invalidos = [
      registroSua({ numeroSua: '90501', distrito: 'Zona Franca' }),
      registroSua({ numeroSua: 'ABC-12' }),
      registroSua({ numeroSua: '90503', prioridad: 'Urgentísima' }),
      registroSua({ numeroSua: '90504', fechaDerivacion: new Date('2026-10-12T00:00:00Z'), direccion: '\u0001<>\u0007' }),
    ];
    await db.simSuaSolicitud.createMany({ data: invalidos });
    const solicitudesAntes = await db.solicitud.count();
    const r = await leerAhora();
    expect(r.lectura.rechazadas).toBe(4);
    expect(await db.solicitud.count()).toBe(solicitudesAntes + 1); // solo la del disparo
    expect(await db.solicitud.count({ where: { numeroSua: { in: ['90501', 'ABC-12', '90503', '90504'] } } })).toBe(0);

    const casos = await db.casoRevision.findMany({ where: { referenciaSolicitud: { in: invalidos.map(referencia) } } });
    expect(casos).toHaveLength(4);
    for (const c of casos) expect(c.tipo).toBe('DatosInvalidosSua');
    const motivo = (n: string) => casos.find((c) => c.referenciaSolicitud === `${n}-2026`)!.motivo;
    expect(motivo('90501')).toMatch(/distrito/);
    expect(motivo('ABC-12')).toMatch(/número de SUA/);
    expect(motivo('90503')).toMatch(/prioridad/);
    expect(motivo('90504')).toMatch(/direcci/);

    // El Administrador los ve en "Para revisar".
    const lista = await como(admin).get('/revision?tipo=DatosInvalidosSua');
    expect(lista.status).toBe(200);
    for (const n of ['90501', 'ABC-12', '90503', '90504']) expect(lista.body.casos.some((c: { referenciaSolicitud: string }) => c.referenciaSolicitud === `${n}-2026`)).toBe(true);
  });

  test('[RNF-18] los textos con caracteres de control o etiquetas <script> se guardan saneados: no queda ningún carácter de control ni de marcado', async () => {
    await db.simSuaSolicitud.create({
      data: registroSua({
        numeroSua: '90601',
        direccion: 'Mendoza\u0001 1100\u0007, Rosario, Santa Fe',
        descripcionReclamo: '<script>alert("x")</script>Rama\u001b baja\u007f sobre la vereda.',
      }),
    });
    const r = await leerAhora();
    expect(r.lectura.rechazadas).toBe(0);
    const s = await db.solicitud.findFirstOrThrow({ where: { numeroSua: '90601' } });
    for (const texto of [s.direccion, s.descripcionReclamo]) {
      // eslint-disable-next-line no-control-regex -- justamente se verifica que no queden caracteres de control
      expect(texto).not.toMatch(/[\u0000-\u001f\u007f<>]/);
    }
    expect(s.descripcionReclamo).not.toContain('<script');
    expect(s.descripcionReclamo).toContain('Rama baja');
    expect(s.direccion).toBe('Mendoza 1100, Rosario, Santa Fe');
    const detalle = await como(operador).get('/solicitudes/90601/2026');
    // eslint-disable-next-line no-control-regex -- justamente se verifica que no queden caracteres de control
    expect(JSON.stringify(detalle.body)).not.toMatch(/<script|<\/|[\u0000-\u001f]/);
  });

  test('[RNF-18] un texto que no tiene nada rescatable después de sanearlo se rechaza y queda en "Para revisar"', async () => {
    await db.simSuaSolicitud.create({ data: registroSua({ numeroSua: '90701', descripcionReclamo: '<><>\u0002\u0001' }) });
    const r = await leerAhora();
    expect(r.lectura.rechazadas).toBe(1);
    expect(await db.solicitud.count({ where: { numeroSua: '90701' } })).toBe(0);
    expect(await db.casoRevision.count({ where: { referenciaSolicitud: '90701-2026', tipo: 'DatosInvalidosSua' } })).toBe(1);
  });
});

describe('"Para revisar" (CU-14, HU-16, RF-58)', () => {
  beforeAll(reiniciarBase);
  afterAll(reiniciarBase);

  test('[RF-58][CU-14 normal][CU-14 1][HU-16 c1][HU-16 c3] el Administrador ve los 2 casos de los datos de prueba con tipo, solicitud, fecha y motivo, los más recientes primero', async () => {
    const r = await como(admin).get('/revision');
    expect(r.status).toBe(200);
    expect(r.body.casos).toHaveLength(2);
    const [primero, segundo] = r.body.casos;
    expect(primero).toMatchObject({ tipo: 'IntegridadNoVerificada', referenciaSolicitud: '48070-2026' });
    expect(segundo).toMatchObject({ tipo: 'DatosInvalidosSua', referenciaSolicitud: '5521-2026' });
    expect(segundo.motivo).toContain('Zona Franca');
    for (const c of r.body.casos) {
      expect(c.motivo).toBeTruthy();
      expect(Number.isNaN(Date.parse(c.fechaHora))).toBe(false);
    }
    expect(Date.parse(primero.fechaHora)).toBeGreaterThan(Date.parse(segundo.fechaHora));
    const soloSua = await como(admin).get('/revision?tipo=DatosInvalidosSua');
    expect(soloSua.body.casos.map((c: { referenciaSolicitud: string }) => c.referenciaSolicitud)).toEqual(['5521-2026']);
    const soloIntegridad = await como(admin).get('/revision?tipo=IntegridadNoVerificada');
    expect(soloIntegridad.body.casos.map((c: { referenciaSolicitud: string }) => c.referenciaSolicitud)).toEqual(['48070-2026']);
  });

  test('[RF-58][HU-16 c3] un registro inválido nuevo del SUA aparece en la lista como "datos inválidos del SUA", arriba de los demás', async () => {
    const r = await como(operador).post('/simulador/registro-invalido');
    expect(r.status).toBe(201);
    expect(r.body.lectura.rechazadas).toBe(1);
    const lista = await como(admin).get('/revision');
    expect(lista.body.casos).toHaveLength(3);
    expect(lista.body.casos[0]).toMatchObject({ tipo: 'DatosInvalidosSua' });
    expect(lista.body.casos[0].motivo).toMatch(/distrito/);
    // La solicitud rechazada no se guardó como solicitud del sistema.
    expect(await db.solicitud.count({ where: { numeroSua: lista.body.casos[0].referenciaSolicitud.split('-')[0] } })).toBe(0);
  });

  test('[CU-14 2][HU-16 c4] el detalle es de solo lectura: cada caso trae lo necesario (autor y fecha de firma si es un dictamen) y no hay endpoints para editar, descartar ni borrar', async () => {
    const lista = await como(admin).get('/revision');
    for (const c of lista.body.casos) {
      expect(c).toHaveProperty('motivo');
      expect(c).toHaveProperty('firmadoPor');
      expect(c).toHaveProperty('firmadoEn');
    }
    const id = lista.body.casos[0].idCaso;
    const c = como(admin);
    for (const ruta of ['/revision', `/revision/${id}`, `/revision/${id}/descartar`, `/revision/${id}/resolver`]) {
      expect((await c.post(ruta, { motivo: 'x' })).status).toBe(404);
      expect((await c.patch(ruta, { motivo: 'x' })).status).toBe(404);
    }
    const crudo = (m: 'put' | 'delete', ruta: string) => request(app)[m](`/api${ruta}`).set('Authorization', `Bearer ${admin.acceso}`).send({});
    expect((await crudo('put', `/revision/${id}`)).status).toBe(404);
    expect((await crudo('delete', `/revision/${id}`)).status).toBe(404);
    expect((await crudo('delete', '/revision')).status).toBe(404);
    expect(await db.casoRevision.count()).toBe(3);
  });

  test('[RF-58][CU-14 1] solo el Administrador ve "Para revisar": Lector, Operador y Jefe reciben 403 y sin sesión, 401', async () => {
    for (const s of [lector, operador, jefe]) expect((await como(s).get('/revision')).status).toBe(403);
    expect((await sinSesion.get('/revision')).status).toBe(401);
  });

  test('[CU-14 E1] sin casos para revisar la lista viene vacía (el mensaje "No hay casos para revisar" va en la prueba de navegador)', async () => {
    await db.casoRevision.deleteMany();
    const r = await como(admin).get('/revision');
    expect(r.status).toBe(200);
    expect(r.body.casos).toEqual([]);
  });
});
