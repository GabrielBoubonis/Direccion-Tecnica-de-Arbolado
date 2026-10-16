// Módulo 3 · Rutas de trabajo (CU-04, CU-05; HU-04, HU-05; RF-14 a RF-19, RF-47 a RF-49) y
// Módulo 7 · Protocolo por tormenta (CU-12; HU-12; RF-38, RF-40 a RF-42; RNF-14, RNF-15).
//
// No se prueban en el servidor, por ser de la interfaz o del dispositivo (van en la prueba de navegador):
//  - RF-19 / CU-04 E1 / CU-12 E1 / HU-04 c3: "sin conexión no se puede generar la ruta". El servidor
//    solo puede responder si lo alcanzan; el bloqueo y el aviso los hace la PWA.
//  - CU-04 1 y 2 (mostrar las opciones de criterios y el mapa para dibujar la zona), CU-05 2 (pedir
//    confirmación antes de restablecer) y CU-12 1 (animación del indicador): solo se prueba el dato.
import { distanciaMetros } from '../../src/dominio/geometria';
import { SEDE } from '../../src/dominio/sede';
import { columnaDeFecha, corteDelDia, fechaArgentina, fechaDeColumna } from '../../src/dominio/tiempo';
import { liberarVencidas } from '../../src/modulos/reservas';
import { cerrarBase, como, db, firmar, formularioValido, ingresar, reiniciarBase, simularCaida, sinSesion, subirFoto, type Sesion } from './entorno';

let mrossi: Sesion;
let cbenite: Sesion;
let lfernan: Sesion;
let pgimene: Sesion;
let asuarez: Sesion;
let tmolina: Sesion;
/** Verdadero si la prueba cambió solicitudes o dictámenes: hay que reiniciar la base entera. */
let sucio = false;

async function iniciarSesiones() {
  [mrossi, cbenite, lfernan, pgimene, asuarez, tmolina] = await Promise.all(
    ['mrossi0', 'cbenite0', 'lfernan0', 'pgimene0', 'asuarez0', 'tmolina0'].map((u) => ingresar(u)),
  );
}

beforeAll(async () => {
  await reiniciarBase();
  await iniciarSesiones();
});
afterAll(cerrarBase);
afterEach(async () => {
  await simularCaida('mapas_caido', false);
  if (sucio) {
    sucio = false;
    await reiniciarBase();
    await iniciarSesiones();
  } else {
    await db.rutaSolicitud.deleteMany();
    await db.ruta.deleteMany();
  }
});

// ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

type Parada = { numeroSua: string; anio: number; distrito: string; prioridad: string; estado: string; lat: number; lng: number; orden: number };
const id = (p: { numeroSua: string; anio: number }) => `${p.numeroSua}-${p.anio}`;
const paradas = (r: { body: { ruta: { paradas: Parada[] } } }) => r.body.ruta.paradas;
const idsDe = (r: { body: { ruta: { paradas: Parada[] } } }) => paradas(r).map(id);

const generar = (s: Sesion, cuerpo: object) => como(s).post('/rutas', { modo: 'Vehiculo', ...cuerpo });
const generarTormenta = (s: Sesion, cantidad: number) => como(s).post('/tormenta/rutas', { cantidad });

/** Solicitudes normales que hoy pueden entrar en una ruta: pendientes, sin conflicto y ubicadas. */
const candidatas = () =>
  db.solicitud.findMany({
    where: { esTormenta: false, estado: { in: ['Pendiente', 'PendienteRevision'] }, latitud: { not: null }, NOT: { dictamenes: { some: { vigente: null } } } },
    orderBy: [{ fechaUltimaDerivacion: 'asc' }, { numeroSua: 'asc' }],
  });
const reservasAbiertas = () => db.rutaSolicitud.findMany({ where: { liberada: false } });
const hace = (dias: number) => columnaDeFecha(fechaArgentina(new Date(Date.now() - dias * 86_400_000)));

/** Dictamina de verdad una solicitud (firma con el formulario normal) para liberar su reserva. */
async function dictaminar(s: Sesion, idSolicitud: string) {
  const [numero, anio] = idSolicitud.split('-');
  const foto = await subirFoto(s);
  const r = await firmar(s, numero, Number(anio), formularioValido([foto.referencia]));
  expect(r.status).toBe(201);
  sucio = true;
}

/** Orden de visita esperado: vecino más próximo partiendo de la sede (RF-48). */
function ordenEsperado(puntos: { id: string; lat: number; lng: number }[]): string[] {
  const restantes = [...puntos];
  const orden: string[] = [];
  let actual = { lat: SEDE.lat, lng: SEDE.lng };
  while (restantes.length) {
    let k = 0;
    restantes.forEach((p, j) => {
      if (distanciaMetros(actual, p) < distanciaMetros(actual, restantes[k])) k = j;
    });
    const [p] = restantes.splice(k, 1);
    orden.push(p.id);
    actual = p;
  }
  return orden;
}

/** Recorrido sede → visitas → sede con el mismo cálculo del servicio de mapas de prueba (desvío 1,3). */
function totalesEsperados(puntos: { lat: number; lng: number }[], velocidad: number) {
  const tramo = [SEDE, ...puntos, SEDE];
  let distancia = 0;
  let duracion = 0;
  for (let k = 0; k < tramo.length - 1; k++) {
    const m = Math.round(distanciaMetros(tramo[k], tramo[k + 1]) * 1.3);
    distancia += m;
    duracion += Math.round(m / velocidad);
  }
  return { distancia, duracion };
}

// ── CU-04 · Generar ruta ────────────────────────────────────────────────────────────────────────

describe('Generar ruta de trabajo (CU-04, HU-04)', () => {
  test('[RF-14][RF-15][CU-04 normal][HU-04 c1] distrito + cantidad por prioridad: arma la ruta con esas solicitudes, la reserva y la devuelve ordenada', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 2, Media: 1 } });
    expect(r.status).toBe(201);
    const ps = paradas(r);
    expect(ps).toHaveLength(3);
    expect(ps.every((p) => p.distrito === 'Centro')).toBe(true);
    expect(ps.filter((p) => p.prioridad === 'Alta')).toHaveLength(2);
    expect(ps.filter((p) => p.prioridad === 'Media')).toHaveLength(1);
    expect(ps.map((p) => p.orden)).toEqual([1, 2, 3]);
    expect(r.body.ruta).toMatchObject({ tipo: 'Normal', estado: 'Activa', modo: 'Vehiculo', sede: { direccion: 'Moreno 2350, Rosario' } });
    expect(r.body.cupos).toEqual([
      { prioridad: 'Alta', pedidas: 2, incluidas: 2 },
      { prioridad: 'Media', pedidas: 1, incluidas: 1 },
    ]);
    // Postcondición: quedan reservadas a nombre del ingeniero.
    const reservas = await reservasAbiertas();
    expect(reservas.map(id).sort()).toEqual(idsDe(r).sort());
    const ruta = await db.ruta.findUniqueOrThrow({ where: { idRuta: r.body.ruta.idRuta } });
    expect(ruta.nombreUsuario).toBe('mrossi0');
    // Y la ruta activa la devuelve tal cual (CU-05 1).
    const activa = await como(mrossi).get('/rutas/activa');
    expect(activa.body.ruta.idRuta).toBe(r.body.ruta.idRuta);
  });

  test('[RF-14] solo Operador y Jefe generan rutas: Administrador y Lector reciben 403, sin sesión 401', async () => {
    expect((await generar(pgimene, { distrito: 'Sur', cupos: { Alta: 1 } })).status).toBe(201);
    expect((await generar(asuarez, { cupos: { Alta: 1 } })).status).toBe(403);
    expect((await generar(tmolina, { cupos: { Alta: 1 } })).status).toBe(403);
    expect((await sinSesion.post('/rutas', { modo: 'Vehiculo' })).status).toBe(401);
  });

  test('[CU-04 2.1][RF-15][HU-04 c4] sin distrito: considera todos los distritos y arma la ruta con el resto de los criterios', async () => {
    const altas = (await candidatas()).filter((s) => s.prioridad === 'Alta');
    const r = await generar(mrossi, { cupos: { Alta: 30 } });
    expect(r.status).toBe(201);
    expect(idsDe(r).sort()).toEqual(altas.map(id).sort());
    expect(new Set(paradas(r).map((p) => p.distrito)).size).toBeGreaterThan(3);
    expect(r.body.cupos).toEqual([{ prioridad: 'Alta', pedidas: 30, incluidas: altas.length }]);
  });

  test('[CU-04 2.2][RF-49][HU-04 c5] el modo de desplazamiento es obligatorio: sin modo o con uno inválido se rechaza y no se reserva nada', async () => {
    const sinModo = await como(mrossi).post('/rutas', { distrito: 'Centro', cupos: { Alta: 1 } });
    expect(sinModo.status).toBe(422);
    const invalido = await como(mrossi).post('/rutas', { modo: 'Bicicleta', cupos: { Alta: 1 } });
    expect(invalido.status).toBe(422);
    expect(await db.ruta.count()).toBe(0);
    expect(await reservasAbiertas()).toHaveLength(0);
  });

  test('[RF-15] la zona dibujada en el mapa filtra: una solicitud fuera del polígono no entra', async () => {
    const zona = [
      { lat: -32.96, lng: -60.65 },
      { lat: -32.96, lng: -60.63 },
      { lat: -32.94, lng: -60.63 },
      { lat: -32.94, lng: -60.65 },
    ];
    const dentro = (s: { latitud: number | null; longitud: number | null }) => s.latitud! >= -32.96 && s.latitud! <= -32.94 && s.longitud! >= -60.65 && s.longitud! <= -60.63;
    const todas = await candidatas();
    const esperadas = todas.filter(dentro).map(id).sort();
    expect(esperadas.length).toBeGreaterThan(3);
    expect(esperadas.length).toBeLessThan(todas.length);

    const r = await generar(mrossi, { zona });
    expect(r.status).toBe(201);
    expect(idsDe(r).sort()).toEqual(esperadas);
    // 48840 (Av. Alberdi 5337) cae fuera del polígono.
    expect(idsDe(r)).not.toContain('48840-2026');
    expect(paradas(r).every((p) => p.lat >= -32.96 && p.lat <= -32.94 && p.lng >= -60.65 && p.lng <= -60.63)).toBe(true);
  });

  test('[RF-15] se pueden combinar distrito, cantidad por prioridad y zona; y la vista previa cuenta lo que cumple, lo que entraría y lo que no tiene ubicación', async () => {
    const zona = [
      { lat: -32.96, lng: -60.65 },
      { lat: -32.96, lng: -60.63 },
      { lat: -32.94, lng: -60.63 },
      { lat: -32.94, lng: -60.65 },
    ];
    const centro = (await candidatas()).filter((s) => s.distrito === 'Centro');
    const altas = centro.filter((s) => s.prioridad === 'Alta').length;
    const medias = centro.filter((s) => s.prioridad === 'Media').length;

    const previa = await como(mrossi).post('/rutas/vista-previa', { distrito: 'Centro', cupos: { Alta: 2, Media: 1 }, modo: 'Vehiculo' });
    expect(previa.status).toBe(200);
    expect(previa.body.cumplen).toBe(centro.length);
    expect(previa.body.porPrioridad).toMatchObject({ Alta: altas, Media: medias });
    expect(previa.body.entrarian).toBe(Math.min(2, altas) + Math.min(1, medias));
    expect(previa.body.sinUbicar).toBe(1); // "Pasaje sin nombre s/n" es de Centro

    const combinada = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 1, Baja: 1 }, zona });
    expect(combinada.status).toBe(201);
    expect(paradas(combinada).map((p) => p.prioridad).sort()).toEqual(['Alta', 'Baja']);
    expect(paradas(combinada).every((p) => p.distrito === 'Centro' && p.lat >= -32.96 && p.lat <= -32.94)).toBe(true);
  });

  test('[RF-62] una solicitud sin ubicar ("Pasaje sin nombre s/n") nunca entra en una ruta', async () => {
    const sinUbicar = await db.solicitud.findFirstOrThrow({ where: { direccion: { startsWith: 'Pasaje sin nombre' } } });
    expect(sinUbicar.latitud).toBeNull();
    const r = await generar(mrossi, {});
    expect(r.status).toBe(201);
    expect(idsDe(r)).not.toContain(id(sinUbicar));
    expect(await db.rutaSolicitud.count({ where: { numeroSua: sinUbicar.numeroSua, anio: sinUbicar.anio } })).toBe(0);
    // Sigue pendiente y consultable.
    const detalle = await como(mrossi).get(`/solicitudes/${sinUbicar.numeroSua}/${sinUbicar.anio}`);
    expect(detalle.status).toBe(200);
  });

  test('[RF-62] ni las dictaminadas, ni la que espera elección del Jefe (conflicto) ni las de tormenta entran en una ruta normal', async () => {
    const r = await generar(mrossi, {});
    expect(r.status).toBe(201);
    const esperadas = (await candidatas()).map(id).sort();
    expect(idsDe(r).sort()).toEqual(esperadas);
    expect(esperadas).toHaveLength(26);
    expect(idsDe(r)).not.toContain('48495-2026');
    expect(paradas(r).every((p) => p.estado !== 'Dictaminada')).toBe(true);
    const tormenta = await db.solicitud.findMany({ where: { esTormenta: true } });
    for (const t of tormenta) expect(idsDe(r)).not.toContain(id(t));
  });

  test('[CU-04 3][RF-16][HU-04 c2] excluye las solicitudes que ya están en la ruta activa de otro ingeniero', async () => {
    const primera = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 2 } });
    expect(primera.status).toBe(201);
    const segunda = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 4 } });
    expect(segunda.status).toBe(201);
    for (const x of idsDe(primera)) expect(idsDe(segunda)).not.toContain(x);
    expect(idsDe(segunda)).toHaveLength(2); // Centro tiene 4 Alta; 2 ya estaban reservadas
    expect(segunda.body.cupos).toEqual([{ prioridad: 'Alta', pedidas: 4, incluidas: 2 }]);
    // La vista previa del segundo tampoco las cuenta.
    const previa = await como(lfernan).post('/rutas/vista-previa', { distrito: 'Centro', cupos: { Alta: 4 }, modo: 'Vehiculo' });
    expect(previa.body.porPrioridad.Alta).toBe(0);
  });

  test('[CU-04 E2] sin solicitudes que cumplan los criterios: informa que no se encontraron casos y no genera ruta', async () => {
    // En Sur no hay ninguna de prioridad Baja.
    const r = await generar(mrossi, { distrito: 'Sur', cupos: { Baja: 3 } });
    expect(r.status).toBe(422);
    expect(r.body.codigo).toBe('SIN_CANDIDATAS');
    expect(r.body.mensaje).toMatch(/no se encontraron/i);
    expect(await db.ruta.count()).toBe(0);
    // Y se pueden modificar los criterios y volver a intentar (postcondición de fallo: todo sigue disponible).
    expect((await generar(mrossi, { distrito: 'Sur', cupos: { Alta: 1 } })).status).toBe(201);
  });

  test('[CU-04 E3] todas las que cumplen están reservadas por otros ingenieros: informa la situación y no genera ruta', async () => {
    const mia = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 10 } });
    expect(mia.status).toBe(201);
    expect(idsDe(mia)).toHaveLength(4);
    const r = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 10 } });
    expect(r.status).toBe(422);
    expect(await db.ruta.count({ where: { nombreUsuario: 'cbenite0' } })).toBe(0);
    // La documentación pide informar que están reservadas y sugerir ampliar los criterios.
    expect(r.body.mensaje).toMatch(/reserv/i);
  });

  test('[CU-04 3.1][RF-47][HU-04 c6] más candidatas que cupo: entra la más antigua y, dentro de la franja de 2 días, la que queda más cerca', async () => {
    // Fechas controladas (todas las Baja con ubicación): una vieja y lejana, dos en la misma franja
    // de antigüedad, y el resto de la franja más nueva.
    const A = '49786-2026'; // Oeste, hace 20 días: franja 10
    const B = '49126-2026'; // Centro, hace 4 días: franja 2
    const C = '50108-2026'; // Sudoeste, hace 5 días: franja 2
    const baja = (await candidatas()).filter((s) => s.prioridad === 'Baja');
    expect(baja).toHaveLength(8);
    const fechas: Record<string, number> = { [A]: 20, [B]: 4, [C]: 5 };
    for (const s of baja) await db.solicitud.update({ where: { numeroSua_anio: { numeroSua: s.numeroSua, anio: s.anio } }, data: { fechaUltimaDerivacion: hace(fechas[id(s)] ?? 1) } });
    sucio = true;

    const punto = (x: string) => {
      const s = baja.find((b) => id(b) === x)!;
      return { lat: s.latitud!, lng: s.longitud! };
    };
    const distMin = (x: string) => Math.min(distanciaMetros(punto(x), SEDE), distanciaMetros(punto(x), punto(A)));
    const masCercana = distMin(B) < distMin(C) ? B : C;
    expect(Math.abs(distMin(B) - distMin(C))).toBeGreaterThan(300); // la diferencia es clara, la prueba no es frágil

    const r = await generar(mrossi, { cupos: { Baja: 2 } });
    expect(r.status).toBe(201);
    expect(idsDe(r).sort()).toEqual([A, masCercana].sort());
    expect(r.body.cupos).toEqual([{ prioridad: 'Baja', pedidas: 2, incluidas: 2 }]);
  });

  test('[CU-04 3.1][RF-47] mismo cupo con todas en la misma franja: se prefiere lo más cercano a la sede, no el orden de llegada', async () => {
    // 49599, 49786, 49932 y 50108 (Oeste/Sudoeste, lejos) vs 49126 y 49331 (Centro, cerca de la sede)
    // llegan el mismo día: desempata la distancia.
    const baja = (await candidatas()).filter((s) => s.prioridad === 'Baja');
    for (const s of baja) await db.solicitud.update({ where: { numeroSua_anio: { numeroSua: s.numeroSua, anio: s.anio } }, data: { fechaUltimaDerivacion: hace(1) } });
    sucio = true;
    const porDistancia = [...baja].sort((a, b) => distanciaMetros(SEDE, { lat: a.latitud!, lng: a.longitud! }) - distanciaMetros(SEDE, { lat: b.latitud!, lng: b.longitud! }));
    const r = await generar(mrossi, { cupos: { Baja: 1 } });
    expect(idsDe(r)).toEqual([id(porDistancia[0])]);
  });

  test('[CU-04 4][RF-48][HU-04 c6] el orden de visita parte de la sede y recorre siempre la más próxima; los totales incluyen el regreso a la sede', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', modo: 'Caminando' });
    expect(r.status).toBe(201);
    const ps = paradas(r);
    expect(ps.length).toBeGreaterThan(5);
    expect(idsDe(r)).toEqual(ordenEsperado(ps.map((p) => ({ id: id(p), lat: p.lat, lng: p.lng }))));
    expect(r.body.ruta.ordenOptimizado).toBe(true);
    expect(r.body.aviso).toBeNull();
    const esperado = totalesEsperados(ps, 1.25);
    expect(r.body.ruta.distanciaTotalM).toBe(esperado.distancia);
    expect(r.body.ruta.duracionTotalS).toBe(esperado.duracion);
    expect(r.body.ruta.geometria[0]).toEqual([SEDE.lat, SEDE.lng]); // el trazado parte de la sede
  });

  test('[RF-49][HU-04 c5] a pie y en vehículo dan distinto tiempo para las mismas solicitudes; la distancia es la misma', async () => {
    const aPie = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 }, modo: 'Caminando' });
    expect(aPie.status).toBe(201);
    expect((await como(mrossi).post(`/rutas/${aPie.body.ruta.idRuta}/restablecer`)).status).toBe(200);
    const enAuto = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 }, modo: 'Vehiculo' });
    expect(enAuto.status).toBe(201);
    expect(idsDe(enAuto).sort()).toEqual(idsDe(aPie).sort());
    expect(aPie.body.ruta.modo).toBe('Caminando');
    expect(enAuto.body.ruta.modo).toBe('Vehiculo');
    expect(aPie.body.ruta.distanciaTotalM).toBe(enAuto.body.ruta.distanciaTotalM);
    expect(aPie.body.ruta.duracionTotalS).toBeGreaterThan(enAuto.body.ruta.duracionTotalS * 3);
    expect(enAuto.body.ruta.duracionTotalS).toBe(totalesEsperados(paradas(enAuto), 6.9).duracion);
    expect(aPie.body.ruta.duracionTotalS).toBe(totalesEsperados(paradas(aPie), 1.25).duracion);
  });

  test('[CU-04 3][arquitectura §7.3] un ingeniero con ruta activa no puede generar otra hasta restablecer', async () => {
    expect((await generar(mrossi, { distrito: 'Sur', cupos: { Alta: 1 } })).status).toBe(201);
    const otra = await generar(mrossi, { distrito: 'Norte', cupos: { Alta: 1 } });
    expect(otra.status).toBe(409);
    expect(otra.body.codigo).toBe('RUTA_ACTIVA');
  });
});

// ── RNF-14 · Servicio de mapas caído ────────────────────────────────────────────────────────────

describe('Servicio de mapas caído (RNF-14, arquitectura §5.5)', () => {
  test('[RNF-14][RF-47][RF-48] con el servicio de mapas caído la ruta se arma solo por antigüedad y el orden queda marcado como no optimizado', async () => {
    await simularCaida('mapas_caido', true);
    const r = await generar(mrossi, { cupos: { Baja: 3 }, modo: 'Caminando' });
    expect(r.status).toBe(201);
    // Las tres Baja más antiguas disponibles, en ese orden: 48609 (03/09), 48840 (08/09), 49126 (11/09).
    expect(idsDe(r)).toEqual(['48609-2026', '48840-2026', '49126-2026']);
    expect(r.body.ruta.ordenOptimizado).toBe(false);
    expect(r.body.ruta.distanciaTotalM).toBeNull();
    expect(r.body.ruta.duracionTotalS).toBeNull();
    expect(r.body.ruta.geometria).toBeNull();
    expect(r.body.aviso).toMatch(/sin optimizar/);
    const ruta = await db.ruta.findUniqueOrThrow({ where: { idRuta: r.body.ruta.idRuta } });
    expect(ruta.ordenOptimizado).toBe(false);
  });

  test('[RNF-14] con el servicio de mapas funcionando, la ruta lleva distancia, tiempo y trazado, para ambos modos', async () => {
    for (const modo of ['Caminando', 'Vehiculo']) {
      const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 2 }, modo });
      expect(r.status).toBe(201);
      expect(r.body.ruta.ordenOptimizado).toBe(true);
      expect(r.body.ruta.distanciaTotalM).toBeGreaterThan(0);
      expect(r.body.ruta.duracionTotalS).toBeGreaterThan(0);
      expect(r.body.ruta.geometria.length).toBe(3); // sede + 2 paradas
      expect((await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`)).status).toBe(200);
    }
  });

  test('[RNF-14][CU-12 4] la ruta de tormenta tampoco se cae con el servicio de mapas caído: queda por antigüedad y sin optimizar', async () => {
    await simularCaida('mapas_caido', true);
    const r = await generarTormenta(mrossi, 3);
    expect(r.status).toBe(201);
    expect(idsDe(r)).toEqual(['50261-2026', '50304-2026', '50327-2026']);
    expect(r.body.ruta.ordenOptimizado).toBe(false);
    expect(r.body.aviso).toMatch(/sin optimizar/);
  });
});

// ── Concurrencia ────────────────────────────────────────────────────────────────────────────────

describe('Concurrencia (arquitectura §7.3, Slicing parte B fila 1)', () => {
  test('[RF-16][RF-17] dos ingenieros que confirman a la vez rutas con las mismas candidatas no comparten ninguna solicitud', async () => {
    for (let ronda = 0; ronda < 3; ronda++) {
      const [a, b] = await Promise.all([
        generar(mrossi, { cupos: { Alta: 5, Media: 5 } }),
        generar(cbenite, { cupos: { Alta: 5, Media: 5 } }),
      ]);
      expect([a.status, b.status].every((s) => [201, 409, 422].includes(s))).toBe(true);
      expect([a.status, b.status]).toContain(201);
      const mias = a.status === 201 ? idsDe(a) : [];
      const suyas = b.status === 201 ? idsDe(b) : [];
      for (const x of mias) expect(suyas).not.toContain(x);
      // En la base, ninguna solicitud con dos reservas abiertas.
      const abiertas = (await reservasAbiertas()).map(id);
      expect(new Set(abiertas).size).toBe(abiertas.length);
      expect(abiertas.length).toBe(mias.length + suyas.length);
      // El que perdió la carrera recibe un conflicto claro, no un error del servidor.
      for (const p of [a, b]) if (p.status === 409) expect(p.body.codigo).toBe('RESERVA_TOMADA');
      await db.rutaSolicitud.deleteMany();
      await db.ruta.deleteMany();
    }
  });

  test('[RF-16][RF-42] la misma carrera con rutas de tormenta: ninguna solicitud queda en dos rutas', async () => {
    const [a, b, c] = await Promise.all([generarTormenta(mrossi, 5), generarTormenta(cbenite, 5), generarTormenta(lfernan, 5)]);
    const exitosas = [a, b, c].filter((r) => r.status === 201);
    expect(exitosas.length).toBeGreaterThanOrEqual(1);
    for (const r of [a, b, c]) expect([201, 409, 422]).toContain(r.status);
    const todas = exitosas.flatMap(idsDe);
    expect(new Set(todas).size).toBe(todas.length);
    const abiertas = (await reservasAbiertas()).map(id);
    expect(new Set(abiertas).size).toBe(abiertas.length);
  });
});

// ── CU-05 · Restablecer ─────────────────────────────────────────────────────────────────────────

describe('Restablecer ruta de trabajo (CU-05, HU-05)', () => {
  test('[RF-17][RF-18][CU-05 normal][CU-05 1][CU-05 3][CU-05 4][HU-05 c1] restablecer descarta la ruta y libera sus solicitudes para otras rutas', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 } });
    expect(r.status).toBe(201);
    // Paso 1: la ruta activa muestra las solicitudes y su estado.
    const activa = await como(mrossi).get('/rutas/activa');
    expect(activa.body.ruta.paradas).toHaveLength(3);
    expect(activa.body.ruta.paradas.every((p: { estado: string; liberada: boolean }) => p.estado === 'Pendiente' && !p.liberada)).toBe(true);
    // Otro ingeniero no las puede tomar mientras tanto.
    const bloqueado = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 3 } });
    expect(idsDe(bloqueado)).toHaveLength(1);
    await como(cbenite).post(`/rutas/${bloqueado.body.ruta.idRuta}/restablecer`);

    // Paso 3: restablecer.
    const res = await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`);
    expect(res.status).toBe(200);
    expect(res.body.liberadas).toBe(3);
    const ruta = await db.ruta.findUniqueOrThrow({ where: { idRuta: r.body.ruta.idRuta } });
    expect(ruta.estado).toBe('Restablecida');
    const lib = await db.rutaSolicitud.findMany({ where: { idRuta: r.body.ruta.idRuta } });
    expect(lib.every((x) => x.liberada && x.motivoLiberacion === 'Restablecer' && x.fechaLiberacion)).toBe(true);
    expect((await como(mrossi).get('/rutas/activa')).body.ruta).toBeNull();

    // Quedan disponibles para cualquier ingeniero...
    const otro = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 3 } });
    expect(otro.status).toBe(201);
    expect(idsDe(otro)).toHaveLength(3);
    // ...y paso 4: el propio usuario puede armar una nueva.
    await como(cbenite).post(`/rutas/${otro.body.ruta.idRuta}/restablecer`);
    expect((await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 } })).status).toBe(201);
  });

  test('[RF-18] solo se puede restablecer la ruta propia y una sola vez', async () => {
    const r = await generar(mrossi, { distrito: 'Sur', cupos: { Alta: 1 } });
    expect((await como(cbenite).post(`/rutas/${r.body.ruta.idRuta}/restablecer`)).status).toBe(403);
    expect((await como(tmolina).post(`/rutas/${r.body.ruta.idRuta}/restablecer`)).status).toBe(403);
    expect((await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`)).status).toBe(200);
    const otraVez = await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`);
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.codigo).toBe('YA_RESTABLECIDA');
    expect((await como(mrossi).post('/rutas/99999/restablecer')).status).toBe(404);
  });

  test('[RF-17][CU-05 3][HU-05 c2] al dictaminar una solicitud de la ruta se libera sola; al restablecer solo se liberan las no dictaminadas y la dictaminada no vuelve a estar disponible', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 } });
    const [primera, ...resto] = idsDe(r);
    await dictaminar(mrossi, primera);

    const liberada = await db.rutaSolicitud.findFirstOrThrow({ where: { numeroSua: primera.split('-')[0], anio: Number(primera.split('-')[1]) } });
    expect(liberada.liberada).toBe(true);
    expect(liberada.motivoLiberacion).toBe('Dictaminada');
    // La ruta activa la sigue mostrando, ahora como dictaminada.
    const activa = await como(mrossi).get('/rutas/activa');
    const dePrimera = activa.body.ruta.paradas.find((p: Parada) => id(p) === primera);
    expect(dePrimera.estado).toBe('Dictaminada');

    const res = await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`);
    expect(res.body.liberadas).toBe(2);
    expect((await reservasAbiertas())).toHaveLength(0);
    const nueva = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 10 } });
    expect(idsDe(nueva)).not.toContain(primera);
    for (const x of resto) expect(idsDe(nueva)).toContain(x);
  });

  test('[RF-17][CU-05 E1][HU-05 c3] a las 18:00 del día de la ruta se liberan solas las no dictaminadas', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 } });
    const ruta = await db.ruta.findUniqueOrThrow({ where: { idRuta: r.body.ruta.idRuta } });
    const corte = corteDelDia(fechaDeColumna(ruta.fecha));
    expect(r.body.ruta.venceEn).toBe(corte.toISOString());

    // Un minuto antes del corte siguen reservadas; un minuto después, no.
    expect(await liberarVencidas(new Date(corte.getTime() - 60_000))).toBe(0);
    expect(await reservasAbiertas()).toHaveLength(3);
    expect(await liberarVencidas(new Date(corte.getTime() + 60_000))).toBe(3);
    const lib = await db.rutaSolicitud.findMany({ where: { idRuta: ruta.idRuta } });
    expect(lib.every((x) => x.liberada && x.motivoLiberacion === 'Corte de las 18:00')).toBe(true);
    expect(lib.every((x) => x.fechaLiberacion!.getTime() === corte.getTime())).toBe(true);
  });

  test('[RF-17][CU-05 E1][HU-05 c3] una ruta de un día anterior ya no está activa: se consulta y sus solicitudes quedan disponibles para otro ingeniero', async () => {
    const r = await generar(mrossi, { distrito: 'Centro', cupos: { Alta: 3 } });
    // Se lleva la fecha de la ruta al pasado.
    await db.ruta.update({ where: { idRuta: r.body.ruta.idRuta }, data: { fecha: hace(1) } });

    const activa = await como(mrossi).get('/rutas/activa');
    expect(activa.status).toBe(200);
    expect(activa.body.ruta).toBeNull();
    const lib = await db.rutaSolicitud.findMany({ where: { idRuta: r.body.ruta.idRuta } });
    expect(lib).toHaveLength(3);
    expect(lib.every((x) => x.liberada && x.motivoLiberacion === 'Corte de las 18:00')).toBe(true);

    // Otro ingeniero (y el mismo) pueden tomarlas.
    const otro = await generar(cbenite, { distrito: 'Centro', cupos: { Alta: 3 } });
    expect(otro.status).toBe(201);
    expect(idsDe(otro)).toHaveLength(3);
  });

  test('[RF-17][CU-05 E1] las dictaminadas antes del corte no se vuelven a liberar ni cambian de estado', async () => {
    const r = await generar(mrossi, { distrito: 'Sur', cupos: { Alta: 1, Media: 1 } });
    const [primera] = idsDe(r);
    await dictaminar(mrossi, primera);
    await db.ruta.update({ where: { idRuta: r.body.ruta.idRuta }, data: { fecha: hace(1) } });
    await como(mrossi).get('/rutas/activa');
    const filas = await db.rutaSolicitud.findMany({ where: { idRuta: r.body.ruta.idRuta } });
    const dictaminada = filas.find((f) => `${f.numeroSua}-${f.anio}` === primera)!;
    expect(dictaminada.motivoLiberacion).toBe('Dictaminada');
    expect(filas.filter((f) => f.motivoLiberacion === 'Corte de las 18:00')).toHaveLength(1);
    expect((await db.solicitud.findUniqueOrThrow({ where: { numeroSua_anio: { numeroSua: dictaminada.numeroSua, anio: dictaminada.anio } } })).estado).toBe('Dictaminada');
  });

  test('[CU-05 E2] restablecer una ruta en la que ya se dictaminó todo: no hay nada para liberar y se puede generar una ruta nueva', async () => {
    const r = await generar(mrossi, { distrito: 'Sur', cupos: { Alta: 1 } });
    expect(idsDe(r)).toHaveLength(1);
    await dictaminar(mrossi, idsDe(r)[0]);
    const res = await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`);
    expect(res.status).toBe(200);
    expect(res.body.liberadas).toBe(0); // la interfaz informa "no hay solicitudes para liberar"
    const nueva = await generar(mrossi, { distrito: 'Sur', cupos: { Media: 1 } });
    expect(nueva.status).toBe(201);
  });
});

// ── CU-12 · Protocolo por tormenta ──────────────────────────────────────────────────────────────

const TORMENTA = ['50261-2026', '50304-2026', '50327-2026', '50428-2026', '50466-2026', '50523-2026', '50580-2026', '50704-2026'];

describe('Protocolo por tormenta (CU-12, HU-12)', () => {
  test('[RF-38][CU-12 2][HU-12 c1] las solicitudes de tormenta aparecen solo en el protocolo y no en el listado general', async () => {
    const tormenta = await como(mrossi).get('/tormenta');
    expect(tormenta.status).toBe(200);
    expect(tormenta.body.pendientes.map(id)).toEqual(TORMENTA); // más antiguas primero
    expect(tormenta.body.dictaminadas).toEqual([]);
    const general = [...(await como(mrossi).get('/solicitudes?pagina=1')).body.solicitudes, ...(await como(mrossi).get('/solicitudes?pagina=2')).body.solicitudes];
    expect(general.length).toBeGreaterThan(30);
    for (const t of TORMENTA) expect(general.map(id)).not.toContain(t);
  });

  test('[RF-38] los cuatro roles ven la sección; sin sesión no', async () => {
    for (const s of [mrossi, pgimene, asuarez, tmolina]) expect((await como(s).get('/tormenta')).status).toBe(200);
    expect((await sinSesion.get('/tormenta')).status).toBe(401);
  });

  test('[CU-12 2.1][RF-41] Administrador y Lector solo consultan: generar una ruta de tormenta les da 403', async () => {
    expect((await generarTormenta(asuarez, 3)).status).toBe(403);
    expect((await generarTormenta(tmolina, 3)).status).toBe(403);
    expect(await db.ruta.count()).toBe(0);
  });

  test('[CU-12 normal][CU-12 3][CU-12 4][RF-41][HU-12 c3] indicando la cantidad se arma la ruta con las solicitudes más antiguas y se reservan', async () => {
    const r = await generarTormenta(mrossi, 5);
    expect(r.status).toBe(201);
    // Fechas repetidas (dos por día): a igual fecha, por número.
    expect(idsDe(r).sort()).toEqual(TORMENTA.slice(0, 5));
    expect(r.body.ruta).toMatchObject({ tipo: 'Tormenta', estado: 'Activa', modo: 'Caminando' });
    expect(r.body.aviso).toBeNull();
    const ruta = await db.ruta.findUniqueOrThrow({ where: { idRuta: r.body.ruta.idRuta } });
    expect(ruta.tipo).toBe('Tormenta');
    expect((await reservasAbiertas()).map(id).sort()).toEqual(TORMENTA.slice(0, 5));
  });

  test('[CU-12 3][RF-42][HU-12 c4] las de tormenta reservadas no las toma otro ingeniero: el segundo recibe las que quedan', async () => {
    const primera = await generarTormenta(mrossi, 5);
    expect(primera.status).toBe(201);
    const lista = await como(cbenite).get('/tormenta');
    expect(lista.body.pendientes.filter((s: { reservadaPor: string | null }) => s.reservadaPor === 'mrossi0')).toHaveLength(5);
    const segunda = await generarTormenta(cbenite, 5);
    expect(segunda.status).toBe(201);
    for (const x of idsDe(primera)) expect(idsDe(segunda)).not.toContain(x);
    expect(idsDe(segunda).sort()).toEqual(TORMENTA.slice(5)); // quedaban 3
  });

  test('[CU-12 E2] se pide más de lo disponible: arma la ruta con todas las disponibles e informa la cantidad efectivamente incluida', async () => {
    const r = await generarTormenta(mrossi, 20);
    expect(r.status).toBe(201);
    expect(idsDe(r).sort()).toEqual(TORMENTA);
    expect(r.body.aviso).toMatch(/Pediste 20/);
    expect(r.body.aviso).toMatch(/solo hay 8/);
    // Ahora no queda ninguna: el siguiente recibe un mensaje claro.
    const otra = await generarTormenta(cbenite, 3);
    expect(otra.status).toBe(422);
    expect(otra.body.codigo).toBe('SIN_CANDIDATAS');
  });

  test('[CU-12 3][RF-41] la cantidad debe ser un entero positivo', async () => {
    expect((await generarTormenta(mrossi, 0)).status).toBe(422);
    expect((await como(mrossi).post('/tormenta/rutas', { cantidad: 'cinco' })).status).toBe(422);
    expect((await como(mrossi).post('/tormenta/rutas', {})).status).toBe(422);
  });

  test('[RF-40][CU-12 1][HU-12 c2] con solicitudes de tormenta pendientes el indicador da cuántas son', async () => {
    for (const s of [mrossi, pgimene, asuarez, tmolina]) {
      const r = await como(s).get('/tormenta/indicador');
      expect(r.status).toBe(200);
      expect(r.body.pendientes).toBe(8);
    }
    expect((await sinSesion.get('/tormenta/indicador')).status).toBe(401);
    // Reservarlas en una ruta no las hace dejar de estar pendientes.
    await generarTormenta(mrossi, 3);
    expect((await como(tmolina).get('/tormenta/indicador')).body.pendientes).toBe(8);
  });

  test('[RF-40][CU-12 E3] sin solicitudes de tormenta pendientes: el apartado queda vacío y el indicador da 0', async () => {
    await db.solicitud.updateMany({ where: { esTormenta: true }, data: { estado: 'Dictaminada' } });
    sucio = true;
    expect((await como(mrossi).get('/tormenta/indicador')).body.pendientes).toBe(0);
    const lista = await como(mrossi).get('/tormenta');
    expect(lista.body.pendientes).toEqual([]);
    expect(lista.body.dictaminadas).toHaveLength(8);
    const r = await generarTormenta(mrossi, 3);
    expect(r.status).toBe(422);
  });

  test('[RF-42][CU-12 3][HU-12 c4] una de tormenta reservada no se puede tomar desde una ruta normal ni desde la ruta de tormenta de otro, ni a la fuerza en la base', async () => {
    const mia = await generarTormenta(mrossi, 2);
    expect(mia.status).toBe(201);
    // Ruta normal: nunca trae solicitudes de tormenta.
    const normal = await generar(cbenite, {});
    expect(normal.status).toBe(201);
    for (const x of TORMENTA) expect(idsDe(normal)).not.toContain(x);
    await como(cbenite).post(`/rutas/${normal.body.ruta.idRuta}/restablecer`);
    // Ruta de tormenta de otro.
    const suya = await generarTormenta(lfernan, 8);
    expect(suya.status).toBe(201);
    for (const x of idsDe(mia)) expect(idsDe(suya)).not.toContain(x);
    expect(idsDe(suya)).toHaveLength(6);
    // Y la base misma lo impide: solo una reserva abierta por solicitud, sea de la ruta que sea.
    const intruso = await db.ruta.create({ data: { nombreUsuario: 'cbenite0', fecha: columnaDeFecha(fechaArgentina()), tipo: 'Normal', modoDesplazamiento: 'Vehiculo', criterios: {} } });
    const [numeroSua, anio] = idsDe(mia)[0].split('-');
    await expect(db.rutaSolicitud.create({ data: { idRuta: intruso.idRuta, numeroSua, anio: Number(anio), orden: 1 } })).rejects.toThrow();
  });

  test('[RF-42][RF-17][RF-18][HU-12 c4] la ruta de tormenta se libera igual que una normal: al restablecer, al dictaminar y a las 18:00', async () => {
    const r = await generarTormenta(mrossi, 5);
    const [primera] = idsDe(r);
    // Al dictaminar (mismo formulario de siempre: HU-12 c5 va en dictámenes).
    await dictaminar(mrossi, primera);
    const dictam = await db.rutaSolicitud.findFirstOrThrow({ where: { idRuta: r.body.ruta.idRuta, numeroSua: primera.split('-')[0] } });
    expect(dictam.motivoLiberacion).toBe('Dictaminada');
    // Al restablecer.
    const res = await como(mrossi).post(`/rutas/${r.body.ruta.idRuta}/restablecer`);
    expect(res.body.liberadas).toBe(4);
    const otra = await generarTormenta(cbenite, 8);
    expect(idsDe(otra).sort()).toEqual(TORMENTA.filter((t) => t !== primera));
    // A las 18:00.
    const corte = corteDelDia(fechaDeColumna((await db.ruta.findUniqueOrThrow({ where: { idRuta: otra.body.ruta.idRuta } })).fecha));
    expect(await liberarVencidas(new Date(corte.getTime() + 60_000))).toBe(7);
    const tercera = await generarTormenta(lfernan, 8);
    expect(idsDe(tercera)).toHaveLength(7);
  });
});

// ── RNF-15 · 100 solicitudes de tormenta ────────────────────────────────────────────────────────

describe('Capacidad: 100 solicitudes de tormenta (RNF-15)', () => {
  /** Deja exactamente 100 solicitudes de tormenta pendientes y ubicadas (se cargan 92 y se suman las 8 de los datos). */
  async function cargarCien() {
    const base = await db.solicitud.findMany({ where: { esTormenta: false, latitud: { not: null } }, take: 26 });
    await db.solicitud.createMany({
      data: Array.from({ length: 92 }, (_, i) => {
        const p = base[i % base.length];
        return {
          numeroSua: `T${String(i + 1).padStart(4, '0')}`,
          anio: 2026,
          distrito: p.distrito,
          prioridad: 'Alta',
          direccion: `Carga RNF-15 n.° ${i + 1}`,
          latitud: p.latitud! + ((i % 7) - 3) * 0.002,
          longitud: p.longitud! + ((i % 5) - 2) * 0.002,
          descripcionReclamo: 'Solicitud de tormenta cargada para la prueba de capacidad.',
          esTormenta: true,
          fechaUltimaDerivacion: hace(1 + (i % 12)),
        };
      }),
    });
    sucio = true;
    expect(await db.solicitud.count({ where: { esTormenta: true, estado: 'Pendiente' } })).toBe(100);
  }

  test('[RNF-15][RF-41][RF-42] las 100 se reparten en rutas de tormenta entre los ingenieros sin que ninguna quede en dos rutas, y cada ruta tarda menos de 2 segundos', async () => {
    await cargarCien();
    expect((await como(mrossi).get('/tormenta/indicador')).body.pendientes).toBe(100);
    const ingenieros = [mrossi, cbenite, lfernan, pgimene];
    const todas: string[] = [];
    for (const [k, s] of ingenieros.entries()) {
      const t0 = Date.now();
      const r = await generarTormenta(s, 25);
      const ms = Date.now() - t0;
      expect(r.status).toBe(201);
      expect(ms).toBeLessThan(2000);
      expect(idsDe(r)).toHaveLength(25);
      expect(r.body.ruta.ordenOptimizado).toBe(true);
      expect(r.body.aviso).toBeNull();
      todas.push(...idsDe(r));
      expect(await db.ruta.count({ where: { tipo: 'Tormenta' } })).toBe(k + 1);
    }
    expect(todas).toHaveLength(100);
    expect(new Set(todas).size).toBe(100);
    const abiertas = (await reservasAbiertas()).map(id);
    expect(abiertas).toHaveLength(100);
    expect(new Set(abiertas).size).toBe(100);
    // Todas las pendientes quedaron repartidas: ya no queda ninguna para otro ingeniero.
    expect((await generarTormenta(tmolina, 1)).status).toBe(403);
    const lista = await como(mrossi).get('/tormenta');
    expect(lista.body.pendientes.every((s: { reservadaPor: string | null }) => s.reservadaPor !== null)).toBe(true);
  });

  test('[RNF-15] una sola ruta con las 100 se arma en menos de 2 segundos', async () => {
    await cargarCien();
    const t0 = Date.now();
    const r = await generarTormenta(mrossi, 100);
    const ms = Date.now() - t0;
    expect(r.status).toBe(201);
    expect(ms).toBeLessThan(2000);
    expect(new Set(idsDe(r)).size).toBe(100);
    expect(r.body.aviso).toBeNull();
  });

  test('[RNF-15][RF-16] las 100 pedidas a la vez por varios ingenieros: nunca hay una solicitud en dos rutas', async () => {
    await cargarCien();
    const resultados = await Promise.all([mrossi, cbenite, lfernan, pgimene].map((s) => generarTormenta(s, 30)));
    for (const r of resultados) expect([201, 409]).toContain(r.status);
    const todas = resultados.filter((r) => r.status === 201).flatMap(idsDe);
    expect(todas.length).toBeGreaterThan(0);
    expect(new Set(todas).size).toBe(todas.length);
    const abiertas = (await reservasAbiertas()).map(id);
    expect(new Set(abiertas).size).toBe(abiertas.length);
  });
});
