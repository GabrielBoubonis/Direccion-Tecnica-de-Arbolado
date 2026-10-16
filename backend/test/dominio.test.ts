// Pruebas de las reglas de negocio puras del dominio.
import { esquemaFormulario, reglasDelDictamen, type Formulario } from '../src/dominio/dictamen';
import { type DatosDeFirma, jsonCanonico, textoAFirmar } from '../src/dominio/firma';
import { sha256 } from '../src/modulos/firma';
import { puntoEnPoligono } from '../src/dominio/geometria';
import { armarRuta, armarRutaTormenta, franjaDeAntiguedad, type Candidata, type Matriz } from '../src/dominio/ruteo';
import { corteDelDia, diasHabilesDesde, fechaArgentina, fechaDeJornada, rutaVigente } from '../src/dominio/tiempo';
import { codigoVisibleDispositivo, generarNombreUsuario, reglasContrasenaIncumplidas } from '../src/dominio/usuarios';

describe('Usuarios (RF-07, RF-22, RF-60)', () => {
  test('[RF-22] el identificador es la inicial del nombre más 6 letras del apellido y un número, desde 0', () => {
    expect(generarNombreUsuario('Marta', 'Rossi', [])).toBe('mrossi0');
    expect(generarNombreUsuario('Carlos', 'Benítez', [])).toBe('cbenite0');
  });
  test('[RF-22][CU-02 E1] si el identificador se repite, el número sube', () => {
    expect(generarNombreUsuario('Mario', 'Rossi', ['mrossi0'])).toBe('mrossi1');
    expect(generarNombreUsuario('Mía', 'Rossi', ['mrossi0', 'mrossi1'])).toBe('mrossi2');
  });
  test('sin tildes, espacios ni mayúsculas', () => {
    expect(generarNombreUsuario('Ángel', 'De la Peña', [])).toBe('adelape0');
  });
  test('la contraseña exige 8 caracteres, mayúscula, minúscula, número y carácter especial', () => {
    expect(reglasContrasenaIncumplidas('Demo2026!')).toEqual([]);
    expect(reglasContrasenaIncumplidas('demo')).toEqual(['al menos 8 caracteres', 'una mayúscula', 'un número', 'un carácter especial']);
  });
  test('el código visible del captor es estable y tiene el formato XXXX-XXXX', () => {
    const c = codigoVisibleDispositivo('c3e75a20-1f48-47d9-9a6b-d8b2410f7e93');
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(codigoVisibleDispositivo('c3e75a20-1f48-47d9-9a6b-d8b2410f7e93')).toBe(c);
  });
});

describe('Firma digital (RF-22, RF-53)', () => {
  const datos: DatosDeFirma = {
    uuid: 'u',
    numeroSua: '48070',
    anio: 2026,
    nombreUsuario: 'mrossi0',
    fechaEmision: '2026-10-13T14:00:00.000Z',
    campos: { complejidad: 'Media', domicilioEjemplar: 'Av. Alberdi 2364' },
    trabajosAereos: ['Raleo y limpieza', 'Poda de formación'],
    trabajosSubterraneos: [],
    huellasFotos: ['abc'],
  };
  const hash = (d: DatosDeFirma) => sha256(textoAFirmar(d));
  test('el JSON canónico ordena las claves y no tiene espacios', () => {
    expect(jsonCanonico({ b: 1, a: { d: [1, 2], c: null } })).toBe('{"a":{"c":null,"d":[1,2]},"b":1}');
  });
  test('el mismo contenido da el mismo hash, sin importar el orden de claves ni de los trabajos', () => {
    const reordenado = { ...datos, campos: { domicilioEjemplar: 'Av. Alberdi 2364', complejidad: 'Media' }, trabajosAereos: ['Poda de formación', 'Raleo y limpieza'] };
    expect(hash(reordenado)).toBe(hash(datos));
    expect(hash(datos)).toMatch(/^[0-9a-f]{64}$/);
  });
  test('cualquier cambio en el contenido cambia el hash', () => {
    expect(hash({ ...datos, campos: { ...datos.campos, complejidad: 'Alta' } })).not.toBe(hash(datos));
    expect(hash({ ...datos, huellasFotos: ['abd'] })).not.toBe(hash(datos));
    expect(hash({ ...datos, fechaEmision: '2026-10-13T14:00:00.001Z' })).not.toBe(hash(datos));
  });
  test('los campos que no se cargaron entran como null, y los que no son del formulario no entran', () => {
    const texto = textoAFirmar({ ...datos, campos: { ...datos.campos, otro: 'x' } as DatosDeFirma['campos'] });
    expect(texto).toContain('"notaNumero":null');
    expect(texto).not.toContain('otro');
  });
});

describe('Formulario del dictamen (RF-45, RF-46, RF-56, RF-61)', () => {
  const base = (cambios: Partial<Formulario> = {}): Formulario =>
    esquemaFormulario.parse({
      domicilioEjemplar: 'Av. Alberdi 2364',
      latitudEjemplar: -32.9,
      longitudEjemplar: -60.65,
      idEspecie: 15,
      complejidad: 'Baja',
      nivelPrioridad: 'Media',
      trabajosAereos: ['Poda de formación'],
      fotografias: ['foto:1'],
      ...cambios,
    });
  const reglas = (f: Formulario) => reglasDelDictamen(f).map((x) => x.regla);

  test('un dictamen completo no tiene incumplimientos', () => {
    expect(reglasDelDictamen(base())).toEqual([]);
  });
  test('sin fotografías no se puede firmar (RF-45)', () => {
    expect(reglas(base({ fotografias: [] }))).toContain('RF-45');
  });
  test('Extracción no admite trabajos aéreos ni subterráneos (RF-46)', () => {
    expect(reglas(base({ esExtraccion: true, perimetroTronco: 1.2, motivoExtraccion: 'Árbol muerto' }))).toContain('RF-46');
  });
  test('Extracción exige perímetro y motivo', () => {
    const f = reglasDelDictamen(base({ esExtraccion: true, trabajosAereos: [] }));
    expect(f.map((x) => x.campo)).toEqual(expect.arrayContaining(['perimetroTronco', 'motivoExtraccion']));
  });
  test('"Sin trabajo" es excluyente con Extracción y con los trabajos (RF-61)', () => {
    expect(reglas(base({ esSinTrabajo: true, motivoSinTrabajo: 'El domicilio no existe' }))).toContain('RF-61');
    expect(reglasDelDictamen(base({ esSinTrabajo: true, motivoSinTrabajo: 'El domicilio no existe', trabajosAereos: [] }))).toEqual([]);
  });
  test('sin ninguna intervención ni "Sin trabajo" no se puede firmar (RF-61)', () => {
    expect(reglas(base({ trabajosAereos: [] }))).toContain('RF-61');
  });
  test('el corte vertical de raíces lleva distancia; los otros subterráneos, no', () => {
    expect(reglas(base({ trabajosSubterraneos: [{ tipoTrabajo: 'Corte vertical de raíces' }] }))).toContain('RF-20');
    expect(reglas(base({ trabajosSubterraneos: [{ tipoTrabajo: 'Corte horizontal de raíces', distanciaBorde: 1 }] }))).toContain('RF-56');
  });
  test('el servidor rechaza valores fuera de las listas cerradas (RF-56)', () => {
    expect(() => base({ complejidad: 'Altísima' })).toThrow();
    expect(() => base({ trabajosAereos: ['Tala total'] })).toThrow();
    expect(() => base({ notaNumero: 12.5 })).toThrow();
    expect(() => base({ notaNumero: -3 })).toThrow();
  });
});

describe('Rutas (RF-15, RF-41, RF-47, RF-48)', () => {
  const hoy = '2026-10-13';
  const c = (id: string, fecha: string, prioridad: string, lng: number): Candidata => ({ id, fechaDerivacion: fecha, prioridad, lat: -32.95, lng });
  // Puntos sobre una línea: la distancia es la diferencia de longitud. La sede está en 0.
  const matrizLineal = (cs: Candidata[]): Matriz => {
    const xs = [0, ...cs.map((x) => x.lng)];
    const m = xs.map((a) => xs.map((b) => Math.abs(a - b) * 1000));
    return { distancias: m, duraciones: m.map((f) => f.map((v) => v / 1.4)) };
  };

  test('las franjas de antigüedad son de 2 días corridos contados desde hoy', () => {
    expect(franjaDeAntiguedad('2026-10-13', hoy)).toBe(0);
    expect(franjaDeAntiguedad('2026-10-12', hoy)).toBe(0);
    expect(franjaDeAntiguedad('2026-10-11', hoy)).toBe(1);
  });
  test('con más candidatas que cupo, entran primero las más antiguas', () => {
    const cs = [c('nueva', '2026-10-12', 'Alta', 1), c('vieja', '2026-09-01', 'Alta', 9), c('media', '2026-10-01', 'Alta', 2)];
    const r = armarRuta(cs, { Alta: 2 }, matrizLineal(cs), hoy);
    expect(new Set(r.orden)).toEqual(new Set(['vieja', 'media']));
  });
  test('dentro de la misma franja desempata el recorrido más corto', () => {
    const cs = [c('lejos', '2026-10-01', 'Media', 50), c('cerca', '2026-10-01', 'Media', 2)];
    expect(armarRuta(cs, { Media: 1 }, matrizLineal(cs), hoy).orden).toEqual(['cerca']);
  });
  test('la ruta suma las cantidades pedidas por prioridad e informa lo que faltó', () => {
    const cs = [c('a1', '2026-10-01', 'Alta', 1), c('m1', '2026-10-01', 'Media', 2), c('m2', '2026-10-02', 'Media', 3)];
    const r = armarRuta(cs, { Alta: 3, Media: 1 }, matrizLineal(cs), hoy);
    expect(r.orden).toHaveLength(2);
    expect(r.cupos).toEqual([
      { prioridad: 'Alta', pedidas: 3, incluidas: 1 },
      { prioridad: 'Media', pedidas: 1, incluidas: 1 },
    ]);
  });
  test('sin cantidades pedidas entran todas las candidatas', () => {
    const cs = [c('a', '2026-10-01', 'Alta', 1), c('b', '2026-10-01', 'Baja', 2)];
    expect(armarRuta(cs, {}, matrizLineal(cs), hoy).orden).toHaveLength(2);
  });
  test('el orden de visita parte de la sede y va al vecino más próximo (RF-48)', () => {
    const cs = [c('x3', '2026-10-01', 'Alta', 3), c('x1', '2026-10-01', 'Alta', 1), c('x2', '2026-10-01', 'Alta', 2)];
    const r = armarRuta(cs, {}, matrizLineal(cs), hoy);
    expect(r.orden).toEqual(['x1', 'x2', 'x3']);
    expect(r.distanciaTotalM).toBe(6000); // ida hasta x3 y vuelta a la sede
  });
  test('sin servicio de mapas se elige solo por antigüedad y el orden queda sin optimizar', () => {
    const cs = [c('nueva', '2026-10-12', 'Alta', 1), c('vieja', '2026-09-01', 'Alta', 9)];
    const r = armarRuta(cs, { Alta: 1 }, null, hoy);
    expect(r).toMatchObject({ orden: ['vieja'], ordenOptimizado: false, distanciaTotalM: null });
  });
  test('la ruta de tormenta toma solo la cantidad pedida, las más antiguas primero (RF-41)', () => {
    const cs = [c('t3', '2026-10-05', 'Alta', 1), c('t1', '2026-10-01', 'Baja', 5), c('t2', '2026-10-03', 'Media', 2)];
    const r = armarRutaTormenta(cs, 2, matrizLineal(cs));
    expect(new Set(r.orden)).toEqual(new Set(['t1', 't2']));
    expect(r.cupos[0]).toEqual({ prioridad: 'Tormenta', pedidas: 2, incluidas: 2 });
  });
});

describe('Tiempo (RF-17)', () => {
  test('la fecha y la hora se toman en Argentina', () => {
    expect(fechaArgentina(new Date('2026-10-14T02:00:00Z'))).toBe('2026-10-13');
  });
  test('la reserva vence a las 18:00 hs del día de la ruta', () => {
    expect(corteDelDia('2026-10-13').toISOString()).toBe('2026-10-13T21:00:00.000Z');
    expect(rutaVigente('2026-10-13', new Date('2026-10-13T20:59:00Z'))).toBe(true);
    expect(rutaVigente('2026-10-13', new Date('2026-10-13T21:00:00Z'))).toBe(false);
  });
  test('una ruta generada después de las 18:00 es para la jornada siguiente', () => {
    expect(fechaDeJornada(new Date('2026-10-13T20:00:00Z'))).toBe('2026-10-13');
    expect(fechaDeJornada(new Date('2026-10-13T22:30:00Z'))).toBe('2026-10-14');
  });
  test('los días hábiles son de lunes a sábado', () => {
    // Del sábado 10/10 al martes 13/10: domingo no cuenta, lunes y martes sí.
    expect(diasHabilesDesde('2026-10-10', '2026-10-13')).toBe(2);
  });
});

describe('Zona dibujada en el mapa (RF-15)', () => {
  const cuadrado = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 },
  ];
  test('un punto adentro y uno afuera', () => {
    expect(puntoEnPoligono({ lat: 5, lng: 5 }, cuadrado)).toBe(true);
    expect(puntoEnPoligono({ lat: 15, lng: 5 }, cuadrado)).toBe(false);
  });
});
