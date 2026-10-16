// Dictamen y tablero (HU-06, HU-07, HU-08, HU-11, HU-15, HU-17; CU-06, CU-08, CU-09, CU-11, CU-15;
// RF-34 y wireframes 04, 04b, 05, 08 y 11). Con señal; lo de sin señal está en sin-senal.spec.ts.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { FOTO, ingresarYEsperar, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

// ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

/** Solicitud Pendiente, de Centro y con ubicación (sirve para armar un dictamen completo). */
const PENDIENTE = '48509';
const ANIO = 2026;

/** Abre el formulario de dictamen de una solicitud y espera a que cargue. */
async function abrirFormulario(page: Page, numero = PENDIENTE, anio = ANIO) {
  await page.goto(`/dictaminar/${numero}/${anio}`);
  await expect(page.getByText('Paso 1 de 5')).toBeVisible();
}

async function paso1(page: Page, opciones: { nota?: string } = {}) {
  if (opciones.nota) await page.getByLabel('Nota N.°').fill(opciones.nota);
  await page.getByRole('button', { name: 'Usar el domicilio de la solicitud' }).click();
  await page.locator('#especie').fill('fres');
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Paso 2 de 5')).toBeVisible();
}

/** Paso 2 sin extracción ni "sin trabajo" (solo el nivel de daño). */
async function paso2(page: Page) {
  await page.getByRole('radio', { name: 'Medio' }).check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Paso 3 de 5')).toBeVisible();
}

async function paso3(page: Page, trabajo = 'Raleo y limpieza') {
  await page.getByLabel(trabajo).check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Paso 4 de 5')).toBeVisible();
}

async function paso4(page: Page) {
  await page.getByRole('radio', { name: 'Media' }).click();
  await page.locator('input[type=file]').setInputFiles(FOTO);
  await expect(page.getByAltText('Fotografía 1 del ejemplar')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Paso 5 de 5')).toBeVisible();
}

async function paso5(page: Page, observaciones = 'Dictamen de prueba punta a punta') {
  await page.getByRole('radio', { name: 'Alta' }).click();
  await page.locator('#observaciones').fill(observaciones);
}

/** Completa el formulario (poda con raleo) y deja el cursor en el Paso 5, listo para firmar. */
async function completarHastaElPaso5(page: Page, observaciones?: string) {
  await paso1(page);
  await paso2(page);
  await paso3(page);
  await paso4(page);
  await paso5(page, observaciones);
}

const firmar = (page: Page) => page.getByRole('button', { name: 'Firmar' }).click();
const usarHuella = (page: Page) => page.getByRole('button', { name: /Usar huella/ }).click();

/** Completa y firma con señal; espera el resultado "Dictamen N.° X firmado". Devuelve el número. */
async function completarYFirmar(page: Page, observaciones?: string) {
  await completarHastaElPaso5(page, observaciones);
  await firmar(page);
  await usarHuella(page);
  const titulo = page.getByText(/Dictamen N\.° \d+ firmado/);
  await expect(titulo).toBeVisible();
  return Number(/N\.° (\d+)/.exec((await titulo.textContent())!)![1]);
}

/** Texto legible de un PDF de pdfkit: inflar cada flujo y juntar las cadenas hexadecimales del contenido. */
function textoDelPdf(pdf: Buffer): string {
  const s = pdf.toString('latin1');
  let salida = '';
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      const contenido = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      for (const h of contenido.matchAll(/<([0-9a-fA-F]+)>/g)) salida += Buffer.from(h[1], 'hex').toString('latin1');
      salida += '\n';
    } catch {
      /* flujo que no es texto (imagen) */
    }
  }
  return salida;
}

async function descargarPdf(page: Page, boton: Parameters<Page['getByRole']>) {
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole(...boton).click()]);
  const archivo = readFileSync((await descarga.path())!);
  return { archivo, nombre: descarga.suggestedFilename() };
}

/** Un contexto nuevo con el usuario ya ingresado. */
async function contextoDe(browser: Browser, usuario: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await ingresarYEsperar(page, usuario);
  return { context, page };
}

/** Pide algo a la API como el usuario que tiene la sesión abierta en la página. */
const api = (page: Page, metodo: string, ruta: string, cuerpo?: unknown) =>
  page.evaluate(
    async ([m, r, c]) => {
      const s = JSON.parse(localStorage.getItem('arbolado.sesion') ?? 'null');
      const res = await fetch(`/api${r}`, {
        method: m as string,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.acceso}` },
        body: c ? JSON.stringify(c) : undefined,
      });
      return { estado: res.status, cuerpo: await res.json().catch(() => null) };
    },
    [metodo, ruta, cuerpo] as const,
  );

const captura = (page: Page, nombre: string) => page.screenshot({ path: `resultados/capturas/${nombre}.png`, fullPage: true });

// ── HU-06 · CU-06: completar y firmar ───────────────────────────────────────────────────────────

test.describe('formulario del dictamen', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
  });

  test('[CU-06 normal][HU-06 c1][CU-06 3.2][RF-22][RF-51] se completa el formulario, pide la huella antes de firmar y firma con hash, fecha y usuario', async ({ page }) => {
    await abrirFormulario(page);
    // Paso 1 del CU-06: el formulario arranca en blanco, con los datos del caso a la vista.
    await expect(page.getByLabel('Nota N.°')).toHaveValue('');
    await expect(page.getByLabel('Distrito')).toHaveValue('Centro');
    await expect(page.getByLabel('SUA N.°')).toHaveValue(`${PENDIENTE}-${ANIO}`);
    await completarHastaElPaso5(page);
    // Al confirmar el envío no firma de inmediato: pide el segundo factor.
    await firmar(page);
    await expect(page.getByRole('dialog', { name: 'Verificá tu identidad' })).toBeVisible();
    await expect(page.getByText(/Dictamen N\.° \d+ firmado/)).toHaveCount(0);
    await usarHuella(page);
    await expect(page.getByText(/Dictamen N\.° \d+ firmado/)).toBeVisible();
    // Firma con hash, fecha y hora y usuario (HU-06 c1).
    await expect(page.getByText('Hash SHA-256:')).toBeVisible();
    await expect(page.locator('.datos-firma .mono').first()).toHaveText(/^[0-9a-f]{64}$/);
    await expect(page.locator('.datos-firma').first()).toContainText('Usuario: mrossi0');
    await expect(page.locator('.datos-firma').first()).toContainText(/Fecha y hora: \d/);
    // La solicitud queda Dictaminada (CU-06 postcondición).
    await page.goto(`/solicitudes/${PENDIENTE}/${ANIO}`);
    await expect(page.getByRole('heading', { name: `SUA ${PENDIENTE}-${ANIO}` })).toBeVisible();
    await expect(page.locator('.insignia')).toHaveText('Dictaminada');
    await expect(page.getByText('Firmó mrossi0')).toBeVisible();
  });

  test('[HU-06 c3][RF-24][CU-06 6] después de firmar se ve el paso a paso con el hash y lo que recibió el SUA, sin hash ni estado de sincronización', async ({ page }) => {
    await abrirFormulario(page);
    const id = await completarYFirmar(page, 'Observación que viaja al SUA');
    const pasos = page.locator('ol.traza > li');
    await expect(pasos.filter({ hasText: 'Firma digital' })).toContainText('Real');
    await expect(pasos.filter({ hasText: 'Guardado en la base del sistema' })).toContainText(`Dictamen N.° ${id}`);
    const envio = pasos.filter({ hasText: 'Envío al SUA' });
    await expect(envio).toContainText('Simulado');
    await envio.getByText('Ver lo que recibió el SUA').click();
    const recibido = (await envio.locator('pre.json').textContent())!;
    // Lo que recibe el SUA: los datos cargados, el autor y la fecha.
    expect(recibido).toContain('Observación que viaja al SUA');
    expect(recibido).toContain('mrossi0');
    expect(recibido).toMatch(/fotograf/i);
    expect(recibido).toMatch(/fecha/i);
    // Sin los datos internos del sistema (HU-06 c3).
    expect(recibido).not.toMatch(/hash/i);
    expect(recibido).not.toMatch(/sincroniz/i);
    expect(recibido).not.toMatch(/[0-9a-f]{64}/);
    await expect(envio).toContainText(/No se envían el hash ni el estado de sincronización/);
  });

  test('[HU-06 c4][CU-06 1] el formulario muestra solo lo técnico: ubicación y descripción del reclamo, sin nombre ni contacto del vecino', async ({ page }) => {
    await abrirFormulario(page);
    const cuerpo = page.locator('main');
    await expect(cuerpo).toContainText('Domicilio de la solicitud');
    await expect(cuerpo).not.toContainText(/vecino|solicitante|tel[eé]fono|e-?mail|correo|contacto/i);
    // "Descripción del reclamo": la pide HU-06 c4 en el formulario y CU-06 paso 1 ("junto al detalle técnico del caso").
    await expect(cuerpo).toContainText('Rama baja que obstaculiza el paso de vehículos altos.');
  });

  test('[CU-06 2.1][RF-20] al tocar Siguiente sin lo obligatorio se señalan los campos que faltan y no avanza', async ({ page }) => {
    await abrirFormulario(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 1 de 5')).toBeVisible();
    const alerta = page.getByRole('alert').filter({ hasText: 'Completá lo que falta' });
    await expect(alerta).toContainText('Marcá en el mapa el domicilio del ejemplar.');
    await expect(alerta).toContainText('Elegí la especie.');
    await expect(page.locator('#especie')).toHaveClass(/invalida/);
    await expect(page.getByText('Sin marcar todavía.')).toHaveClass(/error-campo/);
    // Los obligatorios llevan asterisco (diseño-ui, Paso 1).
    await expect(page.getByText('Domicilio del ejemplar', { exact: true })).toHaveClass(/obligatorio/);
    await expect(page.getByText('Especie', { exact: true })).toHaveClass(/obligatorio/);
    // Completado el paso 1 avanza; en el Paso 4 falta la complejidad y no deja pasar.
    await paso1(page);
    await paso2(page);
    await paso3(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 4 de 5')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Completá lo que falta' })).toContainText('Elegí la complejidad de la intervención.');
    await expect(page.getByRole('radiogroup', { name: 'Complejidad de la intervención' })).toHaveClass(/invalida/);
  });

  test('[HU-06 c6][RF-46][CU-06 2.2][WF-04] al marcar Extracción el Paso 3 muestra la franja roja y los trabajos deshabilitados; al desmarcarla se reactivan', async ({ page }) => {
    await abrirFormulario(page);
    await paso1(page);
    await page.getByLabel('Extracción', { exact: true }).check();
    // Con Extracción, el perímetro y el motivo son obligatorios.
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Con Extracción, el perímetro del tronco es obligatorio.')).toBeVisible();
    await page.getByLabel('Perímetro del tronco (m)').fill('1,2');
    await page.getByLabel('Motivo de extracción').selectOption('Árbol muerto');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();

    // Wireframe 04: encabezado, pasos, título, franja roja, Bloque 3, Bloque 4, nota al pie y botones.
    await expect(page.getByRole('heading', { name: 'Dictamen técnico', level: 1 })).toBeVisible();
    await expect(page.locator('.encabezado .subtitulo')).toHaveText(`SUA ${PENDIENTE}-${ANIO} · Paso 3 de 5`);
    await expect(page.locator('ol.pasos li')).toHaveText(['✓Datos', '✓Diagnóst.', '3Intervenc.', '4Adicional', '5Firma']);
    await expect(page.getByRole('heading', { name: 'Trabajos de intervención' })).toBeVisible();
    const franja = page.locator('.franja-extraccion');
    await expect(franja).toContainText('Extracción marcada en el Paso 2');
    await expect(franja).toContainText('no corresponde podar o intervenir raíces de un ejemplar a extraer (RF-46)');
    const textos = await page.locator('main legend, main .casilla, main .nota-pie, main .titulo-paso').allTextContents();
    expect(textos).toEqual([
      'Trabajos de intervención',
      'Bloque 3 — Trabajos en la parte subterránea',
      'Corte vertical de raíces',
      'Corte horizontal de raíces',
      'Deshabilitado — ver aviso arriba',
      'Bloque 4 — Trabajos en la parte aérea',
      ...[
        'Poda de formación',
        'Liberación de conductores eléctricos',
        'Liberación de tránsito peatonal',
        'Liberación de tránsito vehicular',
        'Despeje de espacio aéreo privado',
        'Despeje de luminarias',
        'Equilibrio del ejemplar',
        'Raleo y limpieza',
        'Elevación de copa',
        'Reducción de altura de copa',
        'Reducción volumétrica',
        'Eliminación de ramas peligro',
      ],
    ]);
    await expect(page.getByPlaceholder('Distancia al borde (m)')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Atrás' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeVisible();
    await expect(page.getByText('Si destildás "Extracción" volviendo al Paso 2, estos bloques se reactivan')).toBeVisible();
    // Todos los trabajos están deshabilitados.
    const casilleros = page.locator('fieldset.seccion input[type=checkbox]');
    expect(await casilleros.count()).toBe(14);
    for (const c of await casilleros.all()) await expect(c).toBeDisabled();
    await captura(page, 'wf04-paso3-extraccion');

    // Al desmarcar Extracción en el Paso 2 los trabajos se reactivan (y la franja desaparece).
    await page.getByRole('button', { name: 'Atrás' }).click();
    await page.getByLabel('Extracción', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
    await expect(franja).toHaveCount(0);
    for (const c of await casilleros.all()) await expect(c).toBeEnabled();
    await page.getByLabel('Poda de formación').check();
    await page.getByLabel('Corte horizontal de raíces').check();
    await expect(page.getByLabel('Poda de formación')).toBeChecked();
  });

  test('[HU-06 c5][CU-06 2.3][RF-45] sin ninguna fotografía no deja avanzar a firmar y pide cargar al menos una', async ({ page }) => {
    await abrirFormulario(page);
    await paso1(page);
    await paso2(page);
    await paso3(page);
    await page.getByRole('radio', { name: 'Media' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 4 de 5')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Completá lo que falta' })).toContainText('Cargá al menos una fotografía del ejemplar');
    await expect(page.locator('.agregar-foto')).toHaveClass(/invalida/);
    // Con una foto sí avanza, y la puede quitar: vuelve a faltar.
    await page.locator('input[type=file]').setInputFiles(FOTO);
    await expect(page.getByAltText('Fotografía 1 del ejemplar')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar fotografía 1' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 4 de 5')).toBeVisible();
    await expect(page.getByText('Cargá al menos una fotografía del ejemplar')).toBeVisible();
  });

  test('[HU-06 c9][CU-06 2.4][RF-61] "Sin trabajo" deshabilita Extracción y los trabajos, y a la inversa; sin ninguna intervención no deja firmar', async ({ page }) => {
    await abrirFormulario(page);
    await paso1(page);
    // Sin trabajo ⇒ Extracción deshabilitada.
    await page.getByLabel('Sin trabajo').check();
    await expect(page.getByLabel('Extracción', { exact: true })).toBeDisabled();
    await expect(page.getByText('Deshabilitado: "Sin trabajo" está marcado (RF-61).')).toBeVisible();
    // Con "Sin trabajo" también los trabajos del Paso 3 quedan deshabilitados.
    await page.getByLabel('Motivo').selectOption('El domicilio no existe');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
    await expect(page.locator('.franja-extraccion')).toContainText('"Sin trabajo" marcado en el Paso 2');
    await expect(page.getByLabel('Poda de formación')).toBeDisabled();
    await expect(page.getByLabel('Corte vertical de raíces')).toBeDisabled();
    // Al desmarcarlo se reactivan Extracción y los trabajos.
    await page.getByRole('button', { name: 'Atrás' }).click();
    await page.getByLabel('Sin trabajo').uncheck();
    await expect(page.getByLabel('Extracción', { exact: true })).toBeEnabled();
    // Sin ninguna intervención ni "Sin trabajo": no deja pasar y dice que el dictamen debe decir algo.
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Completá lo que falta' })).toContainText('El dictamen tiene que decir algo');
    // A la inversa: con un trabajo marcado, "Sin trabajo" queda deshabilitado (y se explica por qué).
    await page.getByLabel('Raleo y limpieza').check();
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.getByLabel('Sin trabajo')).toBeDisabled();
    await expect(page.getByText('"Sin trabajo" es excluyente (RF-61)')).toBeVisible();
  });

  test('[HU-06 c9][RF-61] un dictamen "Sin trabajo" con su motivo se firma', async ({ page }) => {
    await abrirFormulario(page);
    await paso1(page);
    await page.getByLabel('Sin trabajo').check();
    // Sin motivo no avanza.
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Con "Sin trabajo", elegí el motivo.')).toBeVisible();
    await page.getByLabel('Motivo').selectOption('Ejemplar extraído');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await paso4(page);
    await paso5(page);
    await expect(page.getByText('Sin trabajo (Ejemplar extraído)')).toBeVisible();
    await firmar(page);
    await usarHuella(page);
    await expect(page.getByText(/Dictamen N\.° \d+ firmado/)).toBeVisible();
  });

  test('[CU-06 3.2][WF-04b][HU-06 c1] al confirmar se muestra "Verificá tu identidad" con los textos del wireframe', async ({ page }) => {
    await abrirFormulario(page);
    await completarHastaElPaso5(page);
    await firmar(page);
    const modal = page.getByRole('dialog', { name: 'Verificá tu identidad' });
    await expect(modal).toBeVisible();
    // Wireframe 04b: candado, título, texto, botón principal, leyenda de WebAuthn y Cancelar; detrás, el Paso 5.
    await expect(modal.getByRole('heading', { name: 'Verificá tu identidad' })).toBeVisible();
    await expect(modal).toHaveText(/Para firmar este dictamen necesitamos\s*confirmar que sos vos \(RF-51\)\./);
    await expect(modal.getByRole('button', { name: /Usar huella \/ Face ID/ })).toBeVisible();
    await expect(modal.getByText('Verificación biométrica del dispositivo (WebAuthn)')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    // En la demo la huella es simulada y así se dice.
    await expect(modal).toContainText('Simulado en la demo');
    await expect(modal.getByRole('button', { name: 'Simular huella rechazada' })).toBeVisible();
    await expect(page.locator('.encabezado .subtitulo')).toHaveText(`SUA ${PENDIENTE}-${ANIO} · Paso 5 de 5`);
    await captura(page, 'wf04b-verificacion-identidad');
    // El orden del wireframe: botón principal, leyenda, Cancelar.
    const orden = await modal.locator('button, p.nota-webauthn').allTextContents();
    expect(orden[0]).toContain('Usar huella / Face ID');
    expect(orden.indexOf('Verificación biométrica del dispositivo (WebAuthn)')).toBeGreaterThan(0);
    expect(orden[orden.length - 1]).toBe('Cancelar');
  });

  test('[CU-06 4.1][HU-06 c1] al cancelar la verificación no se firma y los datos siguen cargados', async ({ page }) => {
    await abrirFormulario(page);
    await completarHastaElPaso5(page, 'Datos que no se pierden');
    await firmar(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Cancelaste la verificación: el dictamen no se firmó. Tus datos siguen cargados.')).toBeVisible();
    await expect(page.locator('#observaciones')).toHaveValue('Datos que no se pierden');
    await expect(page.getByRole('radio', { name: 'Alta' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/firmado/)).toHaveCount(0);
    // No hay dictamen guardado.
    await page.goto(`/solicitudes/${PENDIENTE}/${ANIO}`);
    await expect(page.getByText('Todavía no tiene dictámenes.')).toBeVisible();
    await expect(page.locator('.insignia')).toHaveText('Pendiente');
  });

  test('[CU-06 4.1][HU-06 c1] con "Simular huella rechazada" no se firma y los datos siguen cargados en el formulario', async ({ page }) => {
    await abrirFormulario(page);
    await completarHastaElPaso5(page, 'Sigue cargado');
    await firmar(page);
    await page.getByRole('button', { name: 'Simular huella rechazada' }).click();
    await expect(page.getByText('La huella no coincide: el dictamen no se firmó. Tus datos siguen cargados.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('#observaciones')).toHaveValue('Sigue cargado');
    // Los pasos anteriores conservan lo cargado.
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.getByAltText('Fotografía 1 del ejemplar')).toBeVisible();
    await page.getByRole('button', { name: 'Atrás' }).click();
    await expect(page.getByLabel('Raleo y limpieza')).toBeChecked();
    // Y se puede volver a intentar y firmar.
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await firmar(page);
    await usarHuella(page);
    await expect(page.getByText(/Dictamen N\.° \d+ firmado/)).toBeVisible();
  });

  test('[CU-06 3.1][HU-06 c2][RF-21] si otro ingeniero firmó antes, el segundo ve que el caso ya fue dictaminado y no se guarda el suyo', async ({ page, browser }) => {
    await abrirFormulario(page);
    await completarHastaElPaso5(page, 'Mi dictamen, que llega segundo');
    // Otro ingeniero, en otro navegador, firma antes el mismo caso.
    const { context, page: otro } = await contextoDe(browser, 'cbenite0');
    await abrirFormulario(otro);
    await completarYFirmar(otro, 'El que llegó primero');
    // Yo confirmo recién ahora.
    await firmar(page);
    await usarHuella(page);
    await expect(page.getByRole('alert').filter({ hasText: 'No se firmó' })).toContainText('Otro ingeniero ya firmó un dictamen para este caso: el tuyo no se guardó');
    await expect(page.getByText(/Dictamen N\.° \d+ firmado/)).toHaveCount(0);
    // Quedó un solo dictamen: el del otro.
    await page.goto(`/solicitudes/${PENDIENTE}/${ANIO}`);
    await expect(page.getByText(/^Dictamen N\.° \d+$/)).toHaveCount(1);
    await expect(page.getByText('Firmó cbenite0')).toBeVisible();
    await expect(page.getByText('Firmó mrossi0')).toHaveCount(0);
    // Y quien abre el formulario ahora ya no puede dictaminar.
    await abrirFormularioDictaminado(page);
    await context.close();
  });

  test('[CU-06 E3][RF-04] si la sesión vence en medio del formulario, al volver a ingresar se recupera lo cargado', async ({ page }) => {
    await abrirFormulario(page);
    await paso1(page, { nota: '4455' });
    await page.getByRole('radio', { name: 'Alto' }).check();
    await page.getByLabel('Extracción', { exact: true }).check();
    await page.getByLabel('Perímetro del tronco (m)').fill('0,9');
    await page.getByLabel('Motivo de extracción').selectOption('Obra pública');
    // El borrador se guarda cifrado en el captor a los instantes de cada cambio.
    await page.waitForTimeout(1500);
    // 30 minutos sin actividad (RF-04): se adelanta el reloj de la última interacción.
    await page.evaluate(() => localStorage.setItem('arbolado.actividad', String(Date.now() - 31 * 60_000)));
    await expect(page.getByText('Tu sesión se cerró por inactividad')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Usuario')).toBeVisible();
    // Vuelve a ingresar: la ruta y el formulario siguen donde estaban.
    await page.getByLabel('Usuario').fill('mrossi0');
    await page.getByLabel('Contraseña', { exact: true }).fill('Demo2026!');
    await page.getByRole('button', { name: /ingresar/i }).click();
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).first()).toBeVisible();
    // Se navega dentro de la app (sin recargar): la clave de datos del captor ya está abierta tras el ingreso.
    await page.evaluate(() => {
      history.pushState({}, '', '/dictaminar/48509/2026');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page.getByText('Paso 1 de 5')).toBeVisible();
    await expect(page.getByText('Recuperamos lo que habías cargado')).toBeVisible();
    await expect(page.getByLabel('Nota N.°')).toHaveValue('4455');
    await expect(page.getByText('📍')).toBeVisible();
    await expect(page.locator('.especie-elegida')).toContainText(/fres/i);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('radio', { name: 'Alto' })).toBeChecked();
    await expect(page.getByLabel('Extracción', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Perímetro del tronco (m)')).toHaveValue('0.9');
    await expect(page.getByLabel('Motivo de extracción')).toHaveValue('Obra pública');
  });

  test('[HU-06 c7][RF-56] solo Referencia de ubicación y Observaciones admiten texto libre; Nota y Expediente solo aceptan dígitos', async ({ page }) => {
    await abrirFormulario(page);
    // Paso 1: los datos de la solicitud son de solo lectura.
    for (const nombre of ['Distrito', 'SUA N.°', 'Fecha', 'Domicilio de la solicitud'])
      await expect(page.getByLabel(nombre, { exact: true })).toHaveAttribute('readonly', '');
    // Nota y Expediente: solo números enteros.
    await page.getByLabel('Nota N.°').fill('12ab-3,4.5 x');
    await expect(page.getByLabel('Nota N.°')).toHaveValue('12345');
    await page.getByLabel('Exp. N.°').fill('abc');
    await expect(page.getByLabel('Exp. N.°')).toHaveValue('');
    await page.getByLabel('Exp. N.°').fill('9-8/7');
    await expect(page.getByLabel('Exp. N.°')).toHaveValue('987');
    // Cantidad y distancias: numéricos.
    await page.getByLabel('Ejemplares al frente').fill('x7y');
    await expect(page.getByLabel('Ejemplares al frente')).toHaveValue('7');
    await page.getByLabel('Distancia a medianera / referencia (m)').fill('1,5m');
    await expect(page.getByLabel('Distancia a medianera / referencia (m)')).toHaveValue('1.5');
    // Referencia de ubicación: texto libre con largo máximo.
    await page.getByLabel('Referencia de ubicación').fill('Frente al kiosco, a 5 m de la esquina');
    await expect(page.getByLabel('Referencia de ubicación')).toHaveValue('Frente al kiosco, a 5 m de la esquina');
    expect(Number(await page.getByLabel('Referencia de ubicación').getAttribute('maxlength'))).toBeGreaterThan(0);
    // La especie no se escribe libremente: lo escrito sin elegir de la lista no alcanza.
    await page.getByRole('button', { name: 'Usar el domicilio de la solicitud' }).click();
    await page.locator('#especie').fill('zzz inventada');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Elegí la especie.')).toBeVisible();
    await page.locator('#especie').fill('fres');
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 2: ningún campo de texto, todo se elige.
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(3);
    await page.getByLabel('Extracción', { exact: true }).check();
    await expect(page.getByLabel('Motivo de extracción').locator('option')).toHaveCount(13); // 12 motivos + "Elegí un motivo…"
    await expect(page.getByLabel('Perímetro del tronco (m)')).toBeVisible();
    await page.getByLabel('Perímetro del tronco (m)').fill('1a,5');
    await expect(page.getByLabel('Perímetro del tronco (m)')).toHaveValue('1.5');
    await page.getByLabel('Extracción', { exact: true }).uncheck();
    await page.getByRole('radio', { name: 'Bajo' }).check();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 3: solo casilleros; el único campo es la distancia, numérica.
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await page.getByLabel('Corte vertical de raíces').check();
    await page.getByLabel('Distancia al borde del árbol (m)').fill('abc2,5');
    await expect(page.getByLabel('Distancia al borde del árbol (m)')).toHaveValue('2.5');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 4: botones de opción, casilleros, lista y fotos.
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveText(['Baja', 'Media', 'Alta', 'Máxima']);
    await expect(page.getByLabel('Plantar árboles').locator('option')).toHaveText(['Cazuela', 'Construir cazuela', 'Vereda jardín', 'Agrandar cazuela', 'Ninguna']);
    await expect(page.locator('.casilla')).toHaveText(['Urgente', 'Árbol frente a garage', 'Media tensión', 'De oficio']);
    await page.getByRole('radio', { name: 'Baja' }).click();
    await page.locator('input[type=file]').setInputFiles(FOTO);
    await expect(page.getByAltText('Fotografía 1 del ejemplar')).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    // Paso 5: la prioridad se elige; el único texto libre es Observaciones.
    await expect(page.getByRole('textbox')).toHaveCount(1);
    await expect(page.getByRole('textbox')).toHaveAttribute('id', 'observaciones');
    await expect(page.getByRole('radio')).toHaveText(['Alta', 'Media', 'Baja']);
    await page.locator('#observaciones').fill('Cualquier texto, con números 123 y símbolos #$%.');
    await expect(page.locator('#observaciones')).toHaveValue('Cualquier texto, con números 123 y símbolos #$%.');
  });

  test('[HU-06 c8][RF-56] "Agregar especie" incorpora la nueva al catálogo y la deja elegida; una repetida (otras mayúsculas o tildes) se rechaza', async ({ page }) => {
    await abrirFormulario(page);
    // Una especie que no está: se agrega y queda seleccionada.
    await page.locator('#especie').fill('Tipa Blanca de Prueba');
    await expect(page.getByText('No hay especies con ese nombre en el catálogo.')).toBeVisible();
    await page.getByRole('button', { name: /Agregar especie "Tipa Blanca de Prueba"/ }).click();
    await expect(page.locator('.especie-elegida')).toContainText(/Tipa blanca de prueba/i);
    // Quedó en el catálogo: al cambiar se puede volver a encontrar buscándola.
    await page.getByRole('button', { name: 'Cambiar' }).click();
    await page.locator('#especie').fill('tipa blanca');
    const nueva = page.getByRole('option').filter({ hasText: /Tipa blanca de prueba/i });
    await expect(nueva).toHaveCount(1);
    await nueva.click();
    await expect(page.locator('.especie-elegida')).toContainText(/Tipa blanca de prueba/i);

    // Una repetida con otras mayúsculas y sin tildes no se ofrece para agregar: se elige la existente.
    await page.getByRole('button', { name: 'Cambiar' }).click();
    await page.locator('#especie').fill('PLATANO');
    await expect(page.getByRole('option').first()).toContainText(/plátano/i);
    await expect(page.getByRole('button', { name: /Agregar especie/ })).toHaveCount(0);
    // El servidor también la rechaza, sin distinguir mayúsculas ni tildes (la API es la que garantiza el catálogo sin duplicados).
    const nombreExistente: string = (await api(page, 'GET', '/especies')).cuerpo.especies[0].nombreComun;
    for (const variante of [nombreExistente.toUpperCase(), nombreExistente.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()]) {
      const r = await api(page, 'POST', '/especies', { nombreComun: variante });
      expect(r.estado, `"${variante}" debería rechazarse`).toBe(409);
      expect(r.cuerpo.error?.codigo ?? r.cuerpo.codigo).toBe('ESPECIE_EXISTENTE');
    }
    // También la nueva recién agregada.
    expect((await api(page, 'POST', '/especies', { nombreComun: 'TIPA BLANCA DE PRUEBA' })).estado).toBe(409);
    // Una nueva distinta sí entra.
    expect((await api(page, 'POST', '/especies', { nombreComun: 'Otra especie nueva' })).estado).toBe(201);
  });
});

async function abrirFormularioDictaminado(page: Page) {
  await page.goto(`/dictaminar/${PENDIENTE}/${ANIO}`);
  await expect(page.getByText('El caso ya fue dictaminado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siguiente' })).toHaveCount(0);
}

// ── HU-07 · CU-08: descargar el PDF ─────────────────────────────────────────────────────────────

test.describe('PDF del dictamen', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
  });

  test('[HU-07 c1][HU-07 c2][HU-07 c3][CU-08 normal] el PDF se descarga desde el resultado de la firma, con el contenido completo y los datos de la firma', async ({ page }) => {
    await abrirFormulario(page);
    await completarHastaElPaso5(page, 'Observación para el PDF');
    await firmar(page);
    await usarHuella(page);
    const id = Number(/N\.° (\d+)/.exec((await page.getByText(/Dictamen N\.° \d+ firmado/).textContent())!)![1]);
    const hash = (await page.locator('.datos-firma .mono').first().textContent())!;
    const { archivo, nombre } = await descargarPdf(page, ['button', { name: /Descargar PDF/ }]);
    expect(archivo.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(nombre).toBe(`dictamen-${PENDIENTE}-${ANIO}-${id}.pdf`);
    const texto = textoDelPdf(archivo);
    // Contenido completo del dictamen (HU-07 c1).
    for (const parte of ['Dictamen Técnico de Arbolado', `Solicitud SUA ${PENDIENTE}-${ANIO}`, 'Raleo y limpieza', 'Observación para el PDF', 'Complejidad de la intervención', 'Media', 'FOTOGRAF'])
      expect(texto, parte).toContain(parte);
    // Datos de la firma: hash, fecha y hora, usuario (HU-07 c2).
    expect(texto).toContain('FIRMA DIGITAL');
    expect(texto).toContain(hash);
    expect(texto).toContain('mrossi0');
    expect(texto).toMatch(/Fecha y hora: \d{1,2}\/\d{1,2}\/\d{4}/);
  });

  test('[HU-07 c3][CU-08 normal] el PDF también se descarga desde el historial de una solicitud dictaminada y desde el detalle del dictamen', async ({ page }) => {
    await page.goto('/solicitudes/48070/2026');
    await expect(page.getByRole('heading', { name: 'Historial de dictámenes' })).toBeVisible();
    const { archivo, nombre } = await descargarPdf(page, ['button', { name: 'Descargar PDF del dictamen N.° 1' }]);
    expect(archivo.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(nombre).toBe('dictamen-48070-2026-1.pdf');
    const texto = textoDelPdf(archivo);
    expect(texto).toContain('Solicitud SUA 48070-2026');
    expect(texto).toContain('mrossi0');
    expect(texto).toMatch(/Hash SHA-256: [0-9a-f]{64}/);
    // Y desde el detalle del dictamen.
    await page.getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dictamen N.° 1' })).toBeVisible();
    const desdeDetalle = await descargarPdf(page, ['button', { name: 'Descargar PDF' }]);
    expect(desdeDetalle.archivo.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });

  test('[CU-08 E1][HU-07 c3] con varios dictámenes en el historial se puede descargar cualquiera, identificando a cuál corresponde', async ({ page }) => {
    await page.goto('/solicitudes/48495/2026');
    await expect(page.getByText(/^Dictamen N\.° \d+$/)).toHaveCount(2);
    for (const id of [9, 10]) {
      const { archivo, nombre } = await descargarPdf(page, ['button', { name: `Descargar PDF del dictamen N.° ${id}` }]);
      expect(archivo.subarray(0, 4).toString('latin1')).toBe('%PDF');
      expect(nombre).toBe(`dictamen-48495-2026-${id}.pdf`);
      expect(textoDelPdf(archivo)).toContain(`Dictamen N.° ${id}`);
    }
  });

  test('[CU-08 E2] si el documento no puede generarse se informa y el dictamen sigue accesible para reintentar', async ({ page }) => {
    await page.goto('/solicitudes/48070/2026');
    await page.route('**/api/dictamenes/1/pdf', (ruta) => ruta.fulfill({ status: 500, body: 'error' }));
    await page.getByRole('button', { name: 'Descargar PDF del dictamen N.° 1' }).click();
    await expect(page.getByRole('alert')).toContainText('No se pudo descargar el PDF del dictamen N.° 1');
    // El dictamen sigue disponible y se puede reintentar.
    await expect(page.getByText('Dictamen N.° 1', { exact: true })).toBeVisible();
    await page.unroute('**/api/dictamenes/1/pdf');
    const { archivo } = await descargarPdf(page, ['button', { name: 'Descargar PDF del dictamen N.° 1' }]);
    expect(archivo.subarray(0, 4).toString('latin1')).toBe('%PDF');
  });
});

// ── HU-08 · CU-09: dictamen anterior de un caso re-derivado ─────────────────────────────────────

test.describe('caso re-derivado (Pendiente-revisión)', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
  });

  test('[HU-08 c1][CU-09 normal][CU-06 1.1] el formulario del caso re-derivado arranca en blanco y ofrece "Ver dictamen anterior"', async ({ page }) => {
    await page.goto('/solicitudes/50822/2025');
    await expect(page.locator('.encabezado .subtitulo')).toHaveText('Pendiente-revisión');
    await expect(page.locator('.insignia')).toHaveText('En revisión');
    await page.getByRole('link', { name: 'Dictaminar', exact: true }).click();
    await expect(page.getByText('Paso 1 de 5')).toBeVisible();
    await expect(page.getByText('Caso re-derivado (Pendiente-revisión)')).toBeVisible();
    // En blanco: sin nada precargado del dictamen anterior.
    await expect(page.getByLabel('Nota N.°')).toHaveValue('');
    await expect(page.getByLabel('Exp. N.°')).toHaveValue('');
    await expect(page.getByLabel('Referencia de ubicación')).toHaveValue('');
    await expect(page.getByLabel('Ejemplares al frente')).toHaveValue('1');
    await expect(page.locator('.especie-elegida')).toHaveCount(0);
    await expect(page.getByText('Sin marcar todavía.')).toBeVisible();
    await expect(page.getByText('Recuperamos lo que habías cargado')).toHaveCount(0);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 1 de 5')).toBeVisible(); // nada cargado: no avanza
    await expect(page.getByRole('button', { name: 'Ver dictamen anterior' })).toBeVisible();
    // Un caso Pendiente común no ofrece la consulta.
    await abrirFormulario(page);
    await expect(page.getByRole('button', { name: 'Ver dictamen anterior' })).toHaveCount(0);
  });

  test('[HU-08 c2][CU-09 2][CU-09 3] "Ver dictamen anterior" muestra su contenido y quién lo firmó sin precargarlo, y al cerrarlo lo ya cargado sigue', async ({ page }) => {
    await abrirFormulario(page, '50822', 2025);
    await page.getByLabel('Nota N.°').fill('777');
    await page.getByLabel('Referencia de ubicación').fill('Referencia del nuevo dictamen');
    await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
    const modal = page.getByRole('dialog', { name: 'Dictamen anterior' });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Dictamen N.° 7');
    await expect(modal).toContainText('firmado por mrossi0');
    await expect(modal).toContainText(/Especie: /);
    await expect(modal).toContainText(/Daño en vereda: /);
    await expect(modal).toContainText(/Intervención: /);
    await expect(modal).toContainText(/Complejidad \w+ · Prioridad \w+/);
    await expect(modal).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    await expect(modal).toContainText('Lo cargado en el formulario se conserva.');
    await captura(page, 'cu09-dictamen-anterior');
    // Se cierra y el formulario sigue con lo que se había cargado.
    await modal.getByRole('button', { name: 'Volver al formulario' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Nota N.°')).toHaveValue('777');
    await expect(page.getByLabel('Referencia de ubicación')).toHaveValue('Referencia del nuevo dictamen');
    // También se cierra con Escape.
    await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Nota N.°')).toHaveValue('777');
    // Y el anterior no se precargó en ningún campo.
    await expect(page.getByLabel('Ejemplares al frente')).toHaveValue('1');
    await expect(page.locator('.especie-elegida')).toHaveCount(0);
  });

  test('[HU-08 c2][CU-09 2] desde el detalle de la solicitud también se consulta el dictamen anterior, de solo lectura', async ({ page }) => {
    await page.goto('/solicitudes/50822/2025');
    await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
    const modal = page.getByRole('dialog', { name: 'Dictamen anterior' });
    await expect(modal).toContainText('Solo lectura: no se precarga en el dictamen nuevo.');
    await expect(modal).toContainText('firmó mrossi0');
    await expect(modal.getByRole('heading', { name: '1 · Datos del ejemplar y ubicación' })).toBeVisible();
    await expect(modal.getByRole('heading', { name: '5 · Observaciones' })).toBeVisible();
    await modal.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('[HU-08 c3][CU-09 E1] el dictamen nuevo no sobrescribe al anterior: el historial conserva todos, con fecha y autor de cada uno', async ({ page, browser }) => {
    // Otro ingeniero dictamina el caso re-derivado.
    const { context, page: otro } = await contextoDe(browser, 'cbenite0');
    await abrirFormulario(otro, '50822', 2025);
    const idNuevo = await completarYFirmar(otro, 'Segundo dictamen del caso');
    await context.close();
    await page.goto('/solicitudes/50822/2025');
    await expect(page.locator('.insignia')).toHaveText('Dictaminada');
    // Los dos siguen en el historial: el anterior (N.° 7, de mrossi0) y el nuevo.
    await expect(page.getByText(/^Dictamen N\.° \d+$/)).toHaveCount(2);
    await expect(page.getByText('Dictamen N.° 7', { exact: true })).toBeVisible();
    await expect(page.getByText(`Dictamen N.° ${idNuevo}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/Firmó mrossi0/)).toBeVisible();
    await expect(page.getByText(/Firmó cbenite0/)).toBeVisible();
    await expect(page.locator('.registro').filter({ hasText: `N.° ${idNuevo}` })).toContainText('Vigente');
    // El anterior sigue abriéndose completo.
    await page.locator('.registro').filter({ hasText: 'N.° 7' }).getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dictamen N.° 7' })).toBeVisible();
    await expect(page.locator('dd', { hasText: /^mrossi0$/ })).toBeVisible();
    // Se vuelve a re-derivar: el caso vuelve a Pendiente-revisión y ahora hay más de un dictamen en el historial (CU-09 E1).
    expect((await api(page, 'POST', '/simulador/rederivacion', { numeroSua: '50822', anio: 2025 })).estado).toBe(201);
    await abrirFormulario(page, '50822', 2025);
    await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
    const modal = page.getByRole('dialog', { name: 'Dictámenes anteriores' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/^Dictamen N\.° \d+ · firmado por /)).toHaveCount(2);
    await expect(modal).toContainText('firmado por mrossi0');
    await expect(modal).toContainText('firmado por cbenite0');
    await expect(modal.getByText(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/)).toHaveCount(2);
  });
});

// ── HU-17 · CU-15: dictámenes en conflicto (Jefe) ───────────────────────────────────────────────

test.describe('dictámenes en conflicto', () => {
  const CONFLICTO = '/solicitudes/48495/2026/conflicto';

  test('[HU-17 c1][HU-17 c2][CU-15 1] dos dictámenes para el mismo caso: la solicitud queda en Pendiente-revisión, el Jefe ve ambos con autor, fecha y contenido, y el Operador solo ve que se espera la elección', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.goto('/solicitudes/48495/2026');
    await expect(page.locator('.insignia')).toHaveText('En revisión');
    await expect(page.getByText(/^Dictamen N\.° \d+$/)).toHaveCount(2);
    await expect(page.getByText('Dos dictámenes en espera')).toBeVisible();
    await expect(page.getByText('En espera', { exact: true })).toHaveCount(2);
    // No se puede dictaminar de nuevo.
    await expect(page.getByRole('link', { name: 'Dictaminar', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Elegir el dictamen vigente' }).click();
    await expect(page.getByRole('heading', { name: 'Dictámenes en conflicto', level: 1 })).toBeVisible();
    const tarjetas = page.locator('.conflicto-tarjeta');
    await expect(tarjetas).toHaveCount(2);
    await expect(tarjetas.nth(0)).toContainText(/Firmado por mrossi0 · \d{2}\/\d{2}\/\d{4}/);
    await expect(tarjetas.nth(0)).toContainText('Intervención: Extracción · Con riesgo de caída por inclinación');
    await expect(tarjetas.nth(0)).toContainText('Prioridad: Alta');
    await expect(tarjetas.nth(1)).toContainText('Firmado por cbenite0');
    await expect(tarjetas.nth(1)).toContainText('Intervención: Reducción de altura de copa');
    await expect(tarjetas.nth(1)).toContainText('Prioridad: Media');
    // Cada uno se abre completo.
    await tarjetas.nth(1).getByRole('link', { name: 'Ver completo' }).click();
    await expect(page.getByRole('heading', { name: 'Dictamen N.° 10' })).toBeVisible();
    await expect(page.getByText('Este dictamen está en espera')).toBeVisible();
    // Un Operador ve el aviso, pero no puede elegir.
    const { context, page: operador } = await contextoDe(browser, 'mrossi0');
    await operador.goto('/solicitudes/48495/2026');
    await expect(operador.getByText('Esperando que un Jefe elija el dictamen vigente')).toBeVisible();
    await expect(operador.getByRole('link', { name: 'Elegir el dictamen vigente' })).toHaveCount(0);
    await context.close();
  });

  test('[HU-17 c3][HU-17 c4][CU-15 normal][WF-11] el Jefe elige uno, confirma en el modal y ese queda vigente, el otro no vigente y la solicitud vuelve a Dictaminada, con quién eligió y cuándo', async ({ page }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.goto(CONFLICTO);
    // Wireframe 11: encabezado, caso y estado, ayuda, dos tarjetas, Confirmar deshabilitado hasta elegir.
    await expect(page.getByRole('heading', { name: 'Dictámenes en conflicto', level: 1 })).toBeVisible();
    await expect(page.locator('.conflicto-caso')).toHaveText('SUA 48495-2026 · Pendiente-revisión');
    await expect(page.getByText('Dos dictámenes firmados para el mismo caso. Elegí cuál queda vigente.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Dictamen [AB]$/ })).toHaveText(['Dictamen A', 'Dictamen B']);
    const lineas = await page.locator('.conflicto-tarjeta').first().locator('.linea').allTextContents();
    // Mismo orden que el wireframe 11: firmante y fecha, intervención, prioridad.
    expect(lineas.map((l) => l.split(/[:·]/)[0].trim())).toEqual(['Firmado por mrossi0', 'Intervención', 'Prioridad']);
    await expect(page.getByRole('radio', { name: 'Dejar vigente este dictamen' })).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await captura(page, 'wf11-conflicto');
    // Elige el B y se abre el modal.
    await page.locator('.conflicto-tarjeta').nth(1).getByRole('radio').check();
    await expect(page.locator('.conflicto-tarjeta').nth(1)).toHaveClass(/seleccionada/);
    await page.getByRole('button', { name: 'Confirmar' }).click();
    const modal = page.getByRole('dialog', { name: 'Confirmar elección' });
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Queda vigente el Dictamen B.');
    await expect(modal).toContainText('El Dictamen A queda en el historial como no vigente.');
    await expect(modal).toContainText('Se registra quién eligió, la fecha y la hora (RF-59).');
    await expect(modal.getByRole('button')).toHaveText(['Cancelar', 'Confirmar']);
    await captura(page, 'wf11-conflicto-modal');
    await modal.getByRole('button', { name: 'Confirmar' }).click();
    const hecho = page.getByText(/Quedó vigente el Dictamen B\. Eligió pgimene0 el \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}\./);
    await expect(hecho).toBeVisible();
    await page.getByRole('link', { name: 'Volver a la solicitud' }).click();
    // La solicitud vuelve a Dictaminada; uno vigente y el otro no vigente, ambos en el historial.
    await expect(page.locator('.insignia')).toHaveText('Dictaminada');
    await expect(page.getByText(/^Dictamen N\.° \d+$/)).toHaveCount(2);
    await expect(page.locator('.registro').filter({ hasText: 'N.° 10' })).toContainText('Vigente');
    await expect(page.locator('.registro').filter({ hasText: 'N.° 9' })).toContainText('No vigente');
    await expect(page.getByText('Dos dictámenes en espera')).toHaveCount(0);
    // Queda registrado quién eligió y cuándo (HU-17 c4).
    await page.locator('.registro').filter({ hasText: 'N.° 9' }).getByRole('button', { name: 'Ver', exact: true }).click();
    await expect(page.getByText(/pgimene0 eligió otro dictamen para este caso el \d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}\./)).toBeVisible();
    await expect(page.getByText(/Se conserva en el historial\./)).toBeVisible();
  });

  test('[CU-15 E1][HU-17 c1] si el Jefe cancela el modal o cierra la pantalla sin confirmar, no cambia nada y ambos dictámenes siguen sin resolver', async ({ page }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.goto(CONFLICTO);
    await page.locator('.conflicto-tarjeta').first().getByRole('radio').check();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Elección registrada')).toHaveCount(0);
    // Cierra la pantalla (flecha de volver) sin confirmar.
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.locator('.insignia')).toHaveText('En revisión');
    await expect(page.getByText('En espera', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Dos dictámenes en espera')).toBeVisible();
    await expect(page.getByText('No vigente')).toHaveCount(0);
  });

  test('[CU-15 E2][HU-17 c3] si otro Jefe resolvió el conflicto mientras tanto, se informa que el caso ya fue resuelto y se muestra el dictamen vigente', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.goto(CONFLICTO);
    await page.locator('.conflicto-tarjeta').first().getByRole('radio').check();
    // Un segundo Jefe resuelve primero, en otro navegador, y elige el otro dictamen.
    const { context, page: otroJefe } = await contextoDe(browser, 'pgimene0');
    await otroJefe.goto(CONFLICTO);
    await otroJefe.locator('.conflicto-tarjeta').nth(1).getByRole('radio').check();
    await otroJefe.getByRole('button', { name: 'Confirmar' }).click();
    await otroJefe.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(otroJefe.getByText('Elección registrada')).toBeVisible();
    await context.close();
    // El primero confirma ahora.
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Otro Jefe ya resolvió este caso. Se muestra el dictamen que quedó vigente.')).toBeVisible();
    await expect(page.getByText('Este caso ya está resuelto')).toBeVisible();
    await expect(page.getByText(/El dictamen vigente es el de cbenite0, elegido el \d{2}\/\d{2}\/\d{4}/)).toBeVisible();
    await page.getByRole('link', { name: 'Ver dictamen vigente' }).click();
    await expect(page.getByRole('heading', { name: 'Dictamen N.° 10' })).toBeVisible();
  });

  test('[CU-15 E2][HU-17 c3] abrir la pantalla de un caso ya resuelto muestra el dictamen vigente y no deja volver a elegir', async ({ page }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.goto(CONFLICTO);
    await page.locator('.conflicto-tarjeta').first().getByRole('radio').check();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByText('Elección registrada')).toBeVisible();
    await page.goto(CONFLICTO);
    await expect(page.getByText('Este caso ya está resuelto')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar' })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
  });
});

// ── HU-11 · HU-15 · CU-11: dashboard ────────────────────────────────────────────────────────────

/** Lee los tres indicadores de la pestaña visible. */
async function indicadores(page: Page) {
  const valor = async (clase: string) => Number(await page.locator(`.dash-kpi.${clase} .valor`).textContent());
  return [await valor('derivadas'), await valor('dictaminadas'), await valor('sin')];
}

async function elegirPeriodo(page: Page, periodo: string) {
  if ((await page.getByLabel('Período').inputValue()) === periodo) return;
  const respuesta = page.waitForResponse((r) => r.url().includes('/api/dashboard') && r.ok());
  await page.getByLabel('Período').selectOption(periodo);
  await respuesta;
  await expect(page.getByLabel('Período')).toHaveValue(periodo);
}

test.describe('dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'pgimene0');
    await page.getByRole('navigation', { name: 'Menú principal' }).first().getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.locator('.dash-kpi.derivadas .valor')).toBeVisible();
  });

  test('[HU-11 c1][CU-11 normal][WF-05] el dashboard muestra derivadas, dictaminadas y sin dictaminar, con las pestañas General y Tormenta', async ({ page }) => {
    // Wireframe 05: título, selector de período, pestañas, tres tarjetas, evolución mensual, nota y menú.
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Período')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['General', '⛈ Tormenta']);
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.rotulo-kpi')).toHaveText(['Solicitudes derivadas', 'Dictaminadas', 'Sin dictaminar']);
    await expect(page.getByRole('heading', { name: 'Evolución mensual' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Evolución mensual/ })).toBeVisible();
    await expect(page.getByText('Cada re-derivación por vencimiento se cuenta como evento independiente.')).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'Menú principal' }).first();
    await expect(menu.getByRole('link')).toHaveText([/Solicitudes/, /Rutas/, /Tormenta/, /Dashboard/, /Perfil/]);
    await expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveClass(/activo/);
    // Los números salen de los datos: tres números que cierran (derivadas = dictaminadas + sin dictaminar).
    const [d, di, s] = await indicadores(page);
    expect(d).toBe(di + s);
    await captura(page, 'wf05-dashboard');
  });

  test('[HU-11 c2][CU-11 2] se filtra por mes y por año', async ({ page }) => {
    await elegirPeriodo(page, '2026-8');
    expect(await indicadores(page)).toEqual([4, 4, 0]);
    await elegirPeriodo(page, '2026-9');
    expect(await indicadores(page)).toEqual([24, 3, 21]);
    await elegirPeriodo(page, '2026-10');
    expect(await indicadores(page)).toEqual([14, 0, 14]);
    await elegirPeriodo(page, '2026-0');
    expect(await indicadores(page)).toEqual([42, 7, 35]);
    // El selector ofrece los meses y el año completo.
    await expect(page.getByLabel('Período').locator('option[value="2026-0"]')).toHaveText('Año 2026 completo');
    await expect(page.getByLabel('Período').locator('option[value="2026-9"]')).toHaveText('Sep 2026');
  });

  test('[HU-11 c3][CU-11 2.1] la re-derivación por vencimiento se cuenta como evento independiente en el período en que ocurrió', async ({ page }) => {
    // Octubre 2026: 4 solicitudes comunes + 8 de tormenta + las 2 re-derivadas (casos ya contados en 2025).
    await elegirPeriodo(page, '2026-10');
    expect((await indicadores(page))[0]).toBe(14);
    await expect(page.getByText('Cada re-derivación por vencimiento se cuenta como evento independiente.')).toBeVisible();
    // En 2025 esos casos ya habían contado su derivación original.
    await elegirPeriodo(page, '2025-0');
    expect((await indicadores(page))[0]).toBe(2);
    // El total de 2026 incluye las re-derivaciones aunque el caso sea el mismo.
    await elegirPeriodo(page, '2026-0');
    expect((await indicadores(page))[0]).toBe(42);
  });

  test('[HU-15 c1][HU-15 c2][CU-11 3] las solicitudes de tormenta suman a las generales y tienen su desglose con los mismos tres indicadores', async ({ page }) => {
    await elegirPeriodo(page, '2026-10');
    const general = await indicadores(page);
    expect(general).toEqual([14, 0, 14]);
    await page.getByRole('tab', { name: /Tormenta/ }).click();
    await expect(page.getByRole('tab', { name: /Tormenta/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.rotulo-kpi')).toHaveText(['Solicitudes de tormenta derivadas', 'Dictaminadas', 'Sin dictaminar']);
    const tormenta = await indicadores(page);
    expect(tormenta).toEqual([8, 0, 8]);
    // Están incluidas en el total general.
    expect(tormenta[0]).toBeLessThanOrEqual(general[0]);
    expect(tormenta[2]).toBeLessThanOrEqual(general[2]);
  });

  test('[HU-15 c3][CU-11 2] el filtro por mes y por año se aplica a las métricas generales y al desglose de tormenta, y se conserva al cambiar de pestaña', async ({ page }) => {
    await elegirPeriodo(page, '2026-10');
    await page.getByRole('tab', { name: /Tormenta/ }).click();
    expect(await indicadores(page)).toEqual([8, 0, 8]);
    // Septiembre: sin tormenta; el filtro cambia también el desglose.
    await elegirPeriodo(page, '2026-9');
    expect(await indicadores(page)).toEqual([0, 0, 0]);
    await page.getByRole('tab', { name: 'General' }).click();
    await expect(page.getByLabel('Período')).toHaveValue('2026-9');
    expect(await indicadores(page)).toEqual([24, 3, 21]);
    // Año completo: tormenta 8, general 42.
    await elegirPeriodo(page, '2026-0');
    expect(await indicadores(page)).toEqual([42, 7, 35]);
    await page.getByRole('tab', { name: /Tormenta/ }).click();
    expect(await indicadores(page)).toEqual([8, 0, 8]);
  });

  test('[CU-11 E1] un período sin datos muestra las métricas en cero y aclara que no hubo actividad', async ({ page }) => {
    await elegirPeriodo(page, '2026-1');
    expect(await indicadores(page)).toEqual([0, 0, 0]);
    await expect(page.getByText('No hubo actividad en este período')).toBeVisible();
    await page.getByRole('tab', { name: /Tormenta/ }).click();
    expect(await indicadores(page)).toEqual([0, 0, 0]);
    await expect(page.getByText('No hubo actividad en este período')).toBeVisible();
    // Un período con datos no muestra el aviso.
    await page.getByRole('tab', { name: 'General' }).click();
    await elegirPeriodo(page, '2026-9');
    await expect(page.getByText('No hubo actividad en este período')).toHaveCount(0);
  });

  test('[CU-11 normal] el Administrador y el Lector también ven el dashboard', async ({ browser }) => {
    for (const usuario of ['asuarez0', 'tmolina0']) {
      const { context, page } = await contextoDe(browser, usuario);
      await page.getByRole('navigation', { name: 'Menú principal' }).first().getByRole('link', { name: 'Dashboard' }).click();
      await expect(page.locator('.dash-kpi.derivadas .valor')).toBeVisible();
      await elegirPeriodo(page, '2026-9');
      expect(await indicadores(page), usuario).toEqual([24, 3, 21]);
      await context.close();
    }
  });
});

test('[CU-11 E2][HU-11 c1] el Operador no ve Dashboard en el menú y /dashboard no le muestra métricas', async ({ page }) => {
  await ingresarYEsperar(page, 'mrossi0');
  const menu = page.getByRole('navigation', { name: 'Menú principal' }).first();
  await expect(menu.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await expect(menu.getByRole('link', { name: 'Solicitudes', exact: true })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.locator('.dash-kpi')).toHaveCount(0);
  await expect(page.getByText('Solicitudes derivadas')).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  // El servidor también le niega el acceso.
  expect((await api(page, 'GET', '/dashboard?anio=2026')).estado).toBe(403);
});

// ── RF-34 · HU-10 c3 · WF-08: indicador de sincronización con señal y perfil ────────────────────

test.describe('sincronización con señal y perfil', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
  });

  test('[RF-34][HU-10 c3] con señal y sin dictámenes pendientes el indicador del encabezado dice "sync" y el Perfil "Todo sincronizado"', async ({ page }) => {
    await expect(page.locator('.encabezado .sync')).toContainText('sync');
    await expect(page.getByRole('link', { name: 'Todo sincronizado' })).toBeVisible();
    await expect(page.getByText('SIN SEÑAL')).toHaveCount(0);
    await page.getByRole('link', { name: 'Todo sincronizado' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByText('✓ Todo sincronizado')).toBeVisible();
    await expect(page.getByText('0 dictámenes pendientes de enviar')).toBeVisible();
    // También después de firmar con señal: nada queda pendiente.
    await abrirFormulario(page);
    await completarYFirmar(page);
    await expect(page.getByRole('link', { name: 'Todo sincronizado' })).toBeVisible();
    await page.goto('/perfil');
    await expect(page.getByText('0 dictámenes pendientes de enviar')).toBeVisible();
  });

  test('[WF-08][RF-34] el Perfil muestra el usuario y su rol, el estado de sincronización, la ruta, "Acerca de" y "Cerrar sesión"', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Menú principal' }).first().getByRole('link', { name: 'Perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible();
    // Avatar con las iniciales, usuario y rol.
    await expect(page.locator('.perfil-avatar')).toHaveText('MR');
    await expect(page.getByRole('heading', { name: 'mrossi0', level: 2 })).toBeVisible();
    await expect(page.locator('.perfil-cabecera .etiqueta')).toHaveText('Operador');
    // Orden del wireframe: sincronización, ruta activa, acerca de, cerrar sesión.
    await expect(page.locator('.perfil-sync .aviso.exito')).toContainText('✓ Todo sincronizado');
    await expect(page.locator('.perfil-sync')).toContainText('0 dictámenes pendientes de enviar');
    const opciones = await page.locator('.perfil-opcion').allTextContents();
    expect(opciones[0]).toContain('Ruta activa de hoy');
    expect(opciones[1]).toContain('Acerca de / versión 1.0.0');
    await page.getByRole('button', { name: /Acerca de/ }).click();
    await expect(page.getByText('Sistema de Dictaminación Técnica de Arbolado Público')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    // Menú inferior del Operador: Solicitudes, Rutas, Tormenta, Perfil.
    const menu = page.getByRole('navigation', { name: 'Menú principal' }).first();
    await expect(menu.getByRole('link')).toHaveText([/Solicitudes/, /Rutas/, /Tormenta/, /Perfil/]);
    await expect(menu.getByRole('link', { name: 'Perfil' })).toHaveClass(/activo/);
    await captura(page, 'wf08-perfil');
    // Cerrar sesión vuelve a la pantalla de ingreso.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('button', { name: /ingresar/i })).toBeVisible();
  });
});
