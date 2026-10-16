// Módulo 4 y 5 · Dictaminación, firma, sincronización y conflictos (CU-06 a CU-10, CU-15;
// HU-06 a HU-10, HU-12 c5, HU-14 c3, HU-16 c2, HU-17).
import { createHash, randomUUID } from 'node:crypto';
import { esquemaFormulario } from '../../src/dominio/dictamen';
import { camposDesdeFormulario, textoAFirmar } from '../../src/dominio/firma';
import { calcularHash } from '../../src/modulos/firma';
import { generarPdf } from '../../src/modulos/pdf';
import { cerrarBase, como, db, firmar, formularioValido, huellaSimulada, ingresar, reiniciarBase, type Sesion, simularCaida, subirFoto } from './entorno';

let operador: Sesion;
let otro: Sesion;
let jefe: Sesion;

beforeAll(async () => {
  await reiniciarBase();
  [operador, otro, jefe] = await Promise.all([ingresar('mrossi0'), ingresar('cbenite0'), ingresar('pgimene0')]);
});
afterAll(cerrarBase);

/** Texto de un PDF sin comprimir: une las cadenas hexadecimales de los operadores de texto (sin espacios). */
const textoDelPdf = (pdf: Buffer) =>
  [...pdf.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('').replace(/ /g, '');

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

/** Firma como lo hace el captor sin señal: con el mismo código del dominio que usa la interfaz. */
function firmaDelCaptor(nombreUsuario: string, numeroSua: string, anio: number, formulario: object, huellasFotos: string[]) {
  const uuid = randomUUID();
  const fechaEmision = new Date().toISOString();
  const f = esquemaFormulario.parse(formulario);
  const texto = textoAFirmar({ uuid, numeroSua, anio, nombreUsuario, fechaEmision, campos: camposDesdeFormulario(f), trabajosAereos: f.trabajosAereos, trabajosSubterraneos: f.trabajosSubterraneos, huellasFotos });
  return { uuid, fechaEmision, hashFirma: sha(texto) };
}

const sincronizar = (s: Sesion, cuerpo: object) => como(s).post('/sync/dictamenes', { segundoFactor: huellaSimulada, ...cuerpo });
const estadoDe = async (numeroSua: string, anio = 2026) => (await db.solicitud.findUniqueOrThrow({ where: { numeroSua_anio: { numeroSua, anio } } })).estado;

describe('Emitir dictamen con señal (CU-06, HU-06)', () => {
  test('[RF-20][RF-22][RF-23][RF-24][CU-06 normal][CU-06 5][CU-06 6][HU-06 c1][HU-06 c3][CU-07 normal] firma con hash, fecha y usuario, guarda, pasa a Dictaminada y envía al SUA sin datos internos', async () => {
    const foto = await subirFoto(operador);
    const r = await firmar(operador, '48509', 2026, formularioValido([foto.referencia]));
    expect(r.status).toBe(201);
    const d = await db.dictamen.findUniqueOrThrow({ where: { idDictamen: r.body.dictamen.idDictamen }, include: { trabajosAereos: true, trabajosSubterraneos: true, fotografias: true } });
    expect(d.hashFirma).toMatch(/^[0-9a-f]{64}$/);
    expect(d.nombreUsuario).toBe('mrossi0');
    expect(Math.abs(d.fechaEmision.getTime() - Date.now())).toBeLessThan(60_000);
    expect(await calcularHash(d)).toBe(d.hashFirma);
    expect(await estadoDe('48509')).toBe('Dictaminada');
    expect(d.estadoSincronizacion).toBe('Sincronizado');
    const enviado = await db.simSuaDatosComplementarios.findFirstOrThrow({ where: { numeroSua: '48509', anio: 2026 }, orderBy: { id: 'desc' } });
    const contenido = enviado.contenido as Record<string, unknown>;
    expect(contenido).toMatchObject({ solicitud: '48509-2026', autor: 'mrossi0', complejidad: 'Media', trabajosAereos: ['Raleo y limpieza'] });
    expect(contenido.fotografias).toHaveLength(1);
    expect(JSON.stringify(contenido)).not.toMatch(/hash|estadoSincronizacion/i);
    expect(r.body.pasos.map((p: { titulo: string }) => p.titulo)).toContain('Firma digital');
  });

  test('[RF-22] el identificador del firmante tiene el formato inicial + 6 letras del apellido + número', async () => {
    const d = await db.dictamen.findFirstOrThrow({ where: { numeroSua: '48509' } });
    expect(d.nombreUsuario).toMatch(/^[a-z][a-z]{1,6}\d*$/);
  });

  test('[RF-21][CU-06 3.1][HU-06 c2] dos envíos simultáneos para el mismo caso: se acepta el primero y se rechaza el segundo', async () => {
    const [f1, f2] = await Promise.all([subirFoto(operador), subirFoto(otro, 2)]);
    const [a, b] = await Promise.all([firmar(operador, '48609', 2026, formularioValido([f1.referencia])), firmar(otro, '48609', 2026, formularioValido([f2.referencia]))]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a.body.codigo, b.body.codigo]).toContain('YA_DICTAMINADA');
    expect(await db.dictamen.count({ where: { numeroSua: '48609', anio: 2026 } })).toBe(1);
  });

  test('[RF-20][CU-06 2.1] faltan datos obligatorios: se rechaza y se señala qué falta', async () => {
    const foto = await subirFoto(operador);
    const { complejidad: _c, nivelPrioridad: _p, ...incompleto } = formularioValido([foto.referencia]);
    const r = await firmar(operador, '48705', 2026, incompleto);
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toMatch(/complejidad/);
    expect(await estadoDe('48705')).toBe('Pendiente');
  });

  test('[RF-45][CU-06 2.3][HU-06 c5] sin fotografía no se puede firmar', async () => {
    const r = await firmar(operador, '48705', 2026, formularioValido([]));
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.detalle)).toMatch(/RF-45/);
  });

  test('[RF-46][CU-06 2.2][HU-06 c6] con Extracción no se aceptan trabajos aéreos ni subterráneos', async () => {
    const foto = await subirFoto(operador);
    const r = await firmar(operador, '48705', 2026, formularioValido([foto.referencia], { esExtraccion: true, perimetroTronco: 1.5, motivoExtraccion: 'Árbol muerto' }));
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.detalle)).toMatch(/RF-46/);
  });

  test('[RF-61][CU-06 2.4][HU-06 c9] "Sin trabajo" es excluyente, y sin ninguna intervención no se firma', async () => {
    const foto = await subirFoto(operador);
    const conSinTrabajo = await firmar(operador, '48705', 2026, formularioValido([foto.referencia], { esSinTrabajo: true, motivoSinTrabajo: 'El domicilio no existe' }));
    expect(conSinTrabajo.status).toBe(422);
    expect(JSON.stringify(conSinTrabajo.body.detalle)).toMatch(/RF-61/);
    const vacio = await firmar(operador, '48705', 2026, formularioValido([foto.referencia], { trabajosAereos: [] }));
    expect(vacio.status).toBe(422);
    expect(JSON.stringify(vacio.body.detalle)).toMatch(/RF-61/);
    const soloSinTrabajo = await firmar(operador, '48705', 2026, formularioValido([foto.referencia], { trabajosAereos: [], esSinTrabajo: true, motivoSinTrabajo: 'El domicilio no existe' }));
    expect(soloSinTrabajo.status).toBe(201);
  });

  test('[RF-56][HU-06 c7] valores fuera de las listas cerradas y números no enteros se rechazan', async () => {
    const foto = await subirFoto(operador);
    const casos: Record<string, unknown>[] = [
      { complejidad: 'Muy alta' },
      { nivelDanoVereda: 'Grave' },
      { trabajosAereos: ['Poda artística'] },
      { plantar: 'Maceta' },
      { nivelPrioridad: 'Urgentísima' },
      { notaNumero: 12.5 },
      { expedienteNumero: -3 },
      { idEspecie: 99999 },
      { trabajosSubterraneos: [{ tipoTrabajo: 'Agrandamiento de cazuela' }] },
    ];
    for (const cambio of casos) {
      const r = await firmar(operador, '48751', 2026, formularioValido([foto.referencia], cambio));
      expect([r.status, cambio]).toEqual([422, cambio]);
    }
  });

  test('[RF-56] el catálogo vigente: subterráneos sin "Agrandamiento de cazuela" y "Agrandar cazuela" en Plantar', async () => {
    const r = await como(operador).get('/catalogos');
    expect(r.body.trabajosSubterraneos).toEqual(['Corte vertical de raíces', 'Corte horizontal de raíces']);
    expect(r.body.plantar).toContain('Agrandar cazuela');
    expect(r.body.trabajosAereos).toHaveLength(12);
    expect(r.body.motivosExtraccion).toHaveLength(12);
    expect(r.body.motivosSinTrabajo).toHaveLength(6);
  });

  test('[RF-56][HU-06 c8] "Agregar especie": la incorpora normalizada, registra quién la agregó y rechaza duplicados sin distinguir mayúsculas ni tildes', async () => {
    const nueva = await como(operador).post('/especies', { nombreComun: 'ceibo  rosado' });
    expect(nueva.status).toBe(201);
    const e = await db.especie.findUniqueOrThrow({ where: { idEspecie: nueva.body.idEspecie } });
    expect(e.creadaPor).toBe('mrossi0');
    const dup = await como(otro).post('/especies', { nombreComun: 'CEIBO ROSADO' });
    expect(dup.status).toBe(409);
    const conTilde = await como(otro).post('/especies', { nombreComun: 'Fresno américano' });
    const existente = await como(otro).post('/especies', { nombreComun: 'Fresno americano' });
    expect([conTilde.status, existente.status]).toContain(409);
    const buscada = await como(operador).get('/especies?q=ceib');
    expect(buscada.body.especies.map((x: { nombreComun: string }) => x.nombreComun.toLowerCase())).toContain('ceibo rosado');
  });

  test('[RF-51][CU-06 3.2][CU-06 4.1][HU-06 c1] sin segundo factor verificado no se firma ni se guarda', async () => {
    const foto = await subirFoto(operador);
    const antes = await db.dictamen.count();
    const r = await como(operador).post('/dictamenes', { uuid: randomUUID(), numeroSua: '48751', anio: 2026, formulario: formularioValido([foto.referencia]), segundoFactor: { metodo: 'huella-simulada', verificado: false } });
    expect(r.status).toBe(401);
    expect(await db.dictamen.count()).toBe(antes);
    expect(await estadoDe('48751')).toBe('Pendiente');
  });

  test('[RF-25][CU-06 E2][CU-07 4.1][CU-07 E1][HU-10 c2] SUA caído: el dictamen queda firmado, pendiente de sincronizar, y se reintenta solo', async () => {
    const foto = await subirFoto(operador);
    await simularCaida('sua_caido', true);
    let id: number;
    try {
      const r = await firmar(operador, '48751', 2026, formularioValido([foto.referencia]));
      expect(r.status).toBe(201);
      id = r.body.dictamen.idDictamen;
      expect((await db.dictamen.findUniqueOrThrow({ where: { idDictamen: id } })).estadoSincronizacion).toBe('Pendiente de sincronizar');
      expect(await estadoDe('48751')).toBe('Dictaminada');
    } finally {
      await simularCaida('sua_caido', false);
    }
    const { tareasPeriodicas } = await import('../../src/modulos/tareas');
    await tareasPeriodicas(true);
    expect((await db.dictamen.findUniqueOrThrow({ where: { idDictamen: id! } })).estadoSincronizacion).toBe('Sincronizado');
  });

  test('[RF-29][HU-06 c4] el detalle que se usa para dictaminar no tiene datos personales del vecino', async () => {
    const r = await como(operador).get('/solicitudes/48840/2026');
    expect(Object.keys(r.body)).not.toEqual(expect.arrayContaining(['nombre', 'telefono', 'email', 'vecino']));
    expect(JSON.stringify(r.body)).not.toMatch(/tel[eé]fono|@|vecino/i);
  });

  test('[RF-43][HU-12 c5][CU-12 5] una solicitud de tormenta se dictamina con el mismo formulario, sin campos adicionales', async () => {
    const foto = await subirFoto(operador);
    const r = await firmar(operador, '50261', 2026, formularioValido([foto.referencia]));
    expect(r.status).toBe(201);
    expect(await estadoDe('50261')).toBe('Dictaminada');
  });

  test('[RF-17] al dictaminar se libera la reserva de la solicitud en la ruta', async () => {
    const ruta = await como(otro).post('/rutas', { modo: 'Vehiculo', cupos: { Media: 1, Baja: 1, Alta: 1 }, distrito: 'Noroeste' });
    expect(ruta.status).toBe(201);
    const reservada = await db.rutaSolicitud.findFirstOrThrow({ where: { idRuta: ruta.body.idRuta ?? ruta.body.ruta?.idRuta, liberada: false } });
    const foto = await subirFoto(otro);
    expect((await firmar(otro, reservada.numeroSua, reservada.anio, formularioValido([foto.referencia]))).status).toBe(201);
    const fila = await db.rutaSolicitud.findFirstOrThrow({ where: { numeroSua: reservada.numeroSua, anio: reservada.anio } });
    expect(fila.liberada).toBe(true);
  });
});

describe('PDF, historial y dictamen anterior (CU-08, CU-09, HU-07, HU-08)', () => {
  test('[RF-26][CU-08 normal][HU-07 c1][HU-07 c2] el PDF tiene el contenido y los datos de la firma', async () => {
    const d = await db.dictamen.findFirstOrThrow({ where: { numeroSua: '48509' } });
    const r = await como(operador).get(`/dictamenes/${d.idDictamen}/pdf`).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    const pdf = (r.body as Buffer).toString('latin1');
    expect(pdf.startsWith('%PDF')).toBe(true);
    expect(r.headers['content-disposition']).toContain(`dictamen-48509-2026-${d.idDictamen}.pdf`);
    // El contenido: se genera sin comprimir y se lee el texto de las cadenas del PDF.
    const completo = await db.dictamen.findUniqueOrThrow({ where: { idDictamen: d.idDictamen }, include: { especie: true, trabajosAereos: true, trabajosSubterraneos: true, fotografias: true } });
    const texto = textoDelPdf(await generarPdf(completo, { comprimir: false }));
    for (const esperado of [d.hashFirma, 'mrossi0', 'Hash SHA-256', 'Firmado por', 'Raleo y limpieza', 'Laprida 1350', '48509-2026'])
      expect(texto).toContain(esperado.replace(/ /g, ''));
  });

  test('[RF-27][HU-07 c3][HU-08 c3][CU-08 E1][CU-09 E1] el historial conserva todos los dictámenes del caso y cada uno se puede descargar', async () => {
    const r = await como(operador).get('/solicitudes/50822/2025');
    expect(r.body.estado).toBe('PendienteRevision');
    expect(r.body.dictamenes.length).toBeGreaterThanOrEqual(1);
    for (const d of r.body.dictamenes) expect((await como(operador).get(`/dictamenes/${d.idDictamen}/pdf`)).status).toBe(200);
  });

  test('[RF-28][CU-09 normal][CU-09 2][HU-08 c2] en Pendiente-revisión se consulta el dictamen anterior completo y su autor', async () => {
    const s = await como(operador).get('/solicitudes/50892/2025');
    const anterior = s.body.dictamenes.at(-1);
    const d = await como(operador).get(`/dictamenes/${anterior.idDictamen}`);
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ nombreUsuario: expect.any(String), complejidad: expect.any(String), hashFirma: expect.any(String) });
  });

  test('[RF-12][RF-27][HU-14 c3][HU-08 c1] dictaminar un caso re-derivado crea un dictamen nuevo sin pisar el anterior y la solicitud vuelve a Dictaminada', async () => {
    const antes = await db.dictamen.findMany({ where: { numeroSua: '50892', anio: 2025 } });
    const foto = await subirFoto(operador);
    expect((await firmar(operador, '50892', 2025, formularioValido([foto.referencia]))).status).toBe(201);
    const despues = await db.dictamen.findMany({ where: { numeroSua: '50892', anio: 2025 } });
    expect(despues).toHaveLength(antes.length + 1);
    for (const a of antes) expect(despues.find((x) => x.idDictamen === a.idDictamen)?.hashFirma).toBe(a.hashFirma);
    expect(await estadoDe('50892', 2025)).toBe('Dictaminada');
  });

  test('[RF-53] verificar la integridad de un dictamen guardado: el hash recalculado coincide', async () => {
    const d = await db.dictamen.findFirstOrThrow({ where: { numeroSua: '48509' } });
    const r = await como(operador).get(`/dictamenes/${d.idDictamen}/verificar`);
    expect(r.body.coincide).toBe(true);
  });
});

describe('Dictaminar sin conexión y sincronizar (CU-10, CU-07, HU-09, HU-10)', () => {
  test('[RF-31][RF-32][RF-33][CU-10 normal][CU-10 4][CU-07 2][CU-07 3][HU-10 c1] lo firmado en el captor llega, el servidor verifica el hash y lo da por sincronizado', async () => {
    const foto = await subirFoto(operador, 3);
    const formulario = formularioValido([foto.referencia], { trabajosAereos: ['Despeje de luminarias'], trabajosSubterraneos: [{ tipoTrabajo: 'Corte vertical de raíces', distanciaBorde: 0.6 }] });
    const firma = firmaDelCaptor('mrossi0', '49014', 2026, formulario, [foto.sha256]);
    const r = await sincronizar(operador, { ...firma, numeroSua: '49014', anio: 2026, formulario });
    expect(r.status).toBe(201);
    const d = await db.dictamen.findUniqueOrThrow({ where: { uuid: firma.uuid }, include: { trabajosAereos: true, trabajosSubterraneos: true, fotografias: true } });
    expect(d.hashFirma).toBe(firma.hashFirma);
    expect(d.fechaEmision.toISOString()).toBe(firma.fechaEmision);
    expect(d.firmadoSinConexion).toBe(true);
    expect(await calcularHash(d)).toBe(firma.hashFirma);
    expect(d.estadoSincronizacion).toBe('Sincronizado');
    expect(await estadoDe('49014')).toBe('Dictaminada');
  });

  test('[CU-10 E2][CU-07 E2] un reintento del mismo dictamen (se cortó la señal antes del acuse) no lo duplica', async () => {
    const foto = await subirFoto(operador);
    const formulario = formularioValido([foto.referencia]);
    const firma = firmaDelCaptor('mrossi0', '49126', 2026, formulario, [foto.sha256]);
    const cuerpo = { ...firma, numeroSua: '49126', anio: 2026, formulario };
    const [a, b] = [await sincronizar(operador, cuerpo), await sincronizar(operador, cuerpo)];
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.repetido).toBe(true);
    expect(await db.dictamen.count({ where: { uuid: firma.uuid } })).toBe(1);
  });

  test('[RF-53][CU-07 2.1][CU-07 E3][HU-10 c4][HU-16 c2][RF-58] si el contenido cambió después de firmar: se rechaza, queda como "integridad no verificada" y va a "Para revisar"', async () => {
    const foto = await subirFoto(operador);
    const formulario = formularioValido([foto.referencia]);
    const firma = firmaDelCaptor('mrossi0', '49233', 2026, formulario, [foto.sha256]);
    const alterado = { ...formulario, observaciones: 'Contenido modificado después de firmar.' };
    const r = await sincronizar(operador, { ...firma, numeroSua: '49233', anio: 2026, formulario: alterado });
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('INTEGRIDAD_NO_VERIFICADA');
    const d = await db.dictamen.findUniqueOrThrow({ where: { uuid: firma.uuid } });
    expect(d.estadoSincronizacion).toBe('Integridad no verificada');
    expect(d.vigente).toBe(false);
    expect(await estadoDe('49233')).toBe('Pendiente');
    const admin = await ingresar('asuarez0');
    const casos = (await como(admin).get('/revision')).body.casos;
    expect(casos.find((c: { idDictamen: number }) => c.idDictamen === d.idDictamen)).toMatchObject({ tipo: 'IntegridadNoVerificada', referenciaSolicitud: '49233-2026', firmadoPor: 'mrossi0' });
    // RF-33: el rechazo es explícito y estable: el reintento recibe la misma respuesta.
    expect((await sincronizar(operador, { ...firma, numeroSua: '49233', anio: 2026, formulario: alterado })).status).toBe(409);
  });

  test('[RF-53] una foto cambiada después de firmar también se detecta', async () => {
    const [foto, otraFoto] = [await subirFoto(operador, 1), await subirFoto(operador, 2)];
    const formulario = formularioValido([foto.referencia]);
    const firma = firmaDelCaptor('mrossi0', '49331', 2026, formulario, [foto.sha256]);
    const r = await sincronizar(operador, { ...firma, numeroSua: '49331', anio: 2026, formulario: { ...formulario, fotografias: [otraFoto.referencia] } });
    expect(r.status).toBe(409);
  });

  test('[RF-59][RF-21][CU-10 E5][HU-17 c1] si otro ingeniero ya lo dictaminó, el que llega sin señal no se descarta: los dos quedan y la solicitud pasa a Pendiente-revisión', async () => {
    const [f1, f2] = await Promise.all([subirFoto(otro), subirFoto(operador)]);
    expect((await firmar(otro, '49387', 2026, formularioValido([f1.referencia]))).status).toBe(201);
    const formulario = formularioValido([f2.referencia], { trabajosAereos: [], esExtraccion: true, perimetroTronco: 2.1, motivoExtraccion: 'Árbol muerto' });
    const firma = firmaDelCaptor('mrossi0', '49387', 2026, formulario, [f2.sha256]);
    const r = await sincronizar(operador, { ...firma, numeroSua: '49387', anio: 2026, formulario });
    expect(r.status).toBe(201);
    expect(r.body.estadoSolicitud).toBe('PendienteRevision');
    const ds = await db.dictamen.findMany({ where: { numeroSua: '49387', anio: 2026 } });
    expect(ds).toHaveLength(2);
    expect(ds.every((d) => d.vigente === null)).toBe(true);
    expect(await estadoDe('49387')).toBe('PendienteRevision');
  });
});

describe('Dictámenes en conflicto (CU-15, HU-17)', () => {
  test('[RF-59][CU-15 normal][CU-15 1][HU-17 c2] el Jefe ve los dos dictámenes con autor, fecha y contenido', async () => {
    const r = await como(jefe).get('/dictamenes/conflicto/48495/2026');
    expect(r.body.resuelto).toBe(false);
    expect(r.body.dictamenes).toHaveLength(2);
    for (const d of r.body.dictamenes) expect(d).toMatchObject({ nombreUsuario: expect.any(String), fechaEmision: expect.any(String), complejidad: expect.any(String) });
    expect(r.body.dictamenes.some((d: { firmadoSinConexion: boolean }) => d.firmadoSinConexion)).toBe(true);
  });

  test('[RF-59] solo un Jefe elige el vigente', async () => {
    const r = await como(jefe).get('/dictamenes/conflicto/48495/2026');
    const elegido = r.body.dictamenes[0].idDictamen;
    expect((await como(operador).post(`/dictamenes/${elegido}/vigente`)).status).toBe(403);
  });

  test('[RF-59][CU-15 2][HU-17 c3][HU-17 c4] al elegir: uno vigente, el otro no vigente en el historial, la solicitud vuelve a Dictaminada y queda quién eligió y cuándo', async () => {
    const r = await como(jefe).get('/dictamenes/conflicto/48495/2026');
    const [a, b] = r.body.dictamenes;
    const eleccion = await como(jefe).post(`/dictamenes/${a.idDictamen}/vigente`);
    expect(eleccion.status).toBe(200);
    expect(eleccion.body.elegidoPor).toBe('pgimene0');
    const [da, db2] = await Promise.all([db.dictamen.findUniqueOrThrow({ where: { idDictamen: a.idDictamen } }), db.dictamen.findUniqueOrThrow({ where: { idDictamen: b.idDictamen } })]);
    expect([da.vigente, db2.vigente]).toEqual([true, false]);
    expect(da.vigenteElegidoPor).toBe('pgimene0');
    expect(da.vigenteElegidoEn).toBeInstanceOf(Date);
    expect(await estadoDe('48495')).toBe('Dictaminada');
  });

  test('[CU-15 E2] si otro Jefe ya lo resolvió, se informa y se indica el vigente', async () => {
    const d = await db.dictamen.findFirstOrThrow({ where: { numeroSua: '48495', vigente: false } });
    const r = await como(jefe).post(`/dictamenes/${d.idDictamen}/vigente`);
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('YA_RESUELTO');
    expect(r.body.detalle.vigente).toEqual(expect.any(Number));
  });

  test('[CU-15 E1] mientras nadie elige, ambos dictámenes siguen sin resolver', async () => {
    const r = await como(jefe).get('/dictamenes/conflicto/49387/2026');
    expect(r.body.resuelto).toBe(false);
    expect(await estadoDe('49387')).toBe('PendienteRevision');
  });

  test('[RF-24][RF-59] el dictamen elegido que llegó sin señal se envía al SUA recién al elegirlo', async () => {
    const r = await como(jefe).get('/dictamenes/conflicto/49387/2026');
    const sinSenal = r.body.dictamenes.find((d: { firmadoSinConexion: boolean }) => d.firmadoSinConexion);
    const antes = await db.simSuaDatosComplementarios.count({ where: { numeroSua: '49387' } });
    expect((await como(jefe).post(`/dictamenes/${sinSenal.idDictamen}/vigente`)).status).toBe(200);
    expect(await db.simSuaDatosComplementarios.count({ where: { numeroSua: '49387' } })).toBe(antes + 1);
    expect((await db.dictamen.findUniqueOrThrow({ where: { idDictamen: sinSenal.idDictamen } })).estadoSincronizacion).toBe('Sincronizado');
  });
});
