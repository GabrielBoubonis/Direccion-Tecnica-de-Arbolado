// Solicitudes, rutas y protocolo por tormenta en el navegador (HU-03, HU-14, HU-04, HU-05, HU-12;
// CU-03, CU-04, CU-05, CU-12; WF-02, WF-03, WF-06; RNF-09), con los datos de prueba.
// Datos de prueba: 42 solicitudes = 34 en el listado general (6 Dictaminadas, 3 En revisión, el resto
// Pendientes) + 8 de tormenta. Las de tormenta nunca salen en el listado general.
import { expect, test, type Page } from '@playwright/test';
import { FOTO, ingresarYEsperar, interruptor, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

const TORMENTA = ['50261', '50304', '50327', '50428', '50466', '50523', '50580', '50704']; // de la más antigua a la más nueva
const CAPTURAS = 'resultados/capturas';

// ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

/** Cantidad que informa el resumen en vivo: "N solicitudes cumplen estos criterios". */
async function cumplen(page: Page) {
  const texto = await page.getByText(/solicitudes cumplen estos criterios/).textContent();
  return Number(texto!.match(/(\d+) solicitudes/)![1]);
}

/** Espera a que el resumen deje de decir "Calculando…" y a que se estabilice (el servidor responde con retraso de 300 ms). */
async function resumenEstable(page: Page) {
  await expect(page.getByText(/solicitudes cumplen estos criterios/)).toBeVisible();
  await page.waitForTimeout(700);
}

async function elegirCriterios(page: Page, c: { distrito?: string; cupos?: Partial<Record<'Alta' | 'Media' | 'Baja', number>>; modo?: 'a pie' | 'vehículo' }) {
  await page.goto('/rutas');
  await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
  if (c.distrito) await page.getByLabel('Distrito').selectOption(c.distrito);
  for (const [p, n] of Object.entries(c.cupos ?? {})) for (let i = 0; i < n!; i++) await page.getByRole('button', { name: `Más ${p}` }).click();
  if (c.modo) await page.getByRole('button', { name: c.modo === 'a pie' ? /A pie/ : /Vehículo/ }).click();
  await resumenEstable(page);
}

/** Genera una ruta completa con la interfaz, hasta ver "Ruta de hoy". */
async function generarRuta(page: Page, c: Parameters<typeof elegirCriterios>[1]) {
  await elegirCriterios(page, { modo: 'a pie', ...c });
  await page.getByRole('button', { name: 'Generar ruta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Ruta de hoy' })).toBeVisible();
}

const dato = (page: Page, rotulo: string) => page.locator('.cabecera-ruta > div', { hasText: rotulo }).locator('b');

/** "47 min" / "1 h 5 min" a minutos. */
function minutos(t: string) {
  const h = t.match(/(\d+) h/);
  const m = t.match(/(\d+) min/);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/** Las paradas de la ruta (SUA-año) en el orden de visita. En celular salen las tarjetas; en escritorio, la tabla. */
async function paradas(page: Page) {
  const celdas = page.locator('.lista.solo-celular .tarjeta.parada a:has(b), table.solo-escritorio tbody tr td:nth-child(2) a').locator('visible=true');
  const textos = (await celdas.allTextContents()).map((t) => t.replace('SUA ', '').trim());
  return textos;
}

async function sinDesborde(page: Page) {
  const [ancho, vista] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(ancho, 'la página no debe tener scroll horizontal').toBeLessThanOrEqual(vista);
}

/** Dictamen (poda) completo hasta Firmar con la huella simulada, con señal. */
async function completarYFirmar(page: Page, observaciones: string) {
  await page.getByRole('button', { name: 'Usar el domicilio de la solicitud' }).click();
  await page.locator('#especie').fill('fres');
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Raleo y limpieza').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('radio', { name: 'Media' }).click();
  await page.locator('input[type=file]').setInputFiles(FOTO);
  await expect(page.getByAltText('Fotografía 1 del ejemplar')).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('radio', { name: 'Alta' }).click();
  await page.locator('#observaciones').fill(observaciones);
  await page.getByRole('button', { name: 'Firmar' }).click();
  await page.getByRole('button', { name: /Usar huella/ }).click();
}

/** Total del listado general según el encabezado "Mostrando 1–30 de N solicitudes". */
async function totalListado(page: Page) {
  const t = await page.getByText(/Mostrando \d+–\d+ de \d+ solicitudes/).textContent();
  return Number(t!.match(/de (\d+)/)![1]);
}

const tarjeta = (page: Page, sua: string) => page.getByRole('link', { name: new RegExp(`SUA ${sua}`) });

// ── Listado de solicitudes (HU-03, HU-14, CU-03) ─────────────────────────────────────────────────

test.describe('listado de solicitudes en el celular', () => {
  test('[HU-03 c1][HU-03 c2][CU-03 normal][CU-03 2.2][HU-12 c1][RF-39] el listado muestra solo los reclamos de arbolado con su SUA-Año y estado, y deja afuera los de tormenta', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Solicitudes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
    // 34 en total (42 menos las 8 de tormenta), 30 por página.
    await expect(page.getByText('Mostrando 1–30 de 34 solicitudes')).toBeVisible();
    // Cada solicitud muestra Número de SUA-Año y su estado.
    await expect(tarjeta(page, '48509-2026')).toContainText('Pendiente');
    await expect(tarjeta(page, '48509-2026')).toContainText('Prioridad Media');
    await expect(page.locator('.tarjeta').filter({ hasText: 'Dictaminada' }).first()).toBeVisible();
    await expect(page.locator('.tarjeta').filter({ hasText: 'En revisión' }).first()).toBeVisible();
    // Ninguna de tormenta aparece en el listado general, ni en ninguna página (2.2).
    for (const sua of TORMENTA) await expect(tarjeta(page, sua)).toHaveCount(0);
    await page.getByLabel('Buscar por número de SUA').fill('50261');
    await expect(page.getByText('Ninguna solicitud coincide con esa búsqueda.')).toBeVisible();
  });

  test('[HU-03 c3][RF-13] Operador y Jefe ven las mismas pendientes y en revisión, sin restringirse a un ingeniero, incluso las que están en la ruta de otro', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Sur' }); // 3 solicitudes quedan reservadas por mrossi0
    await page.goto('/solicitudes');
    await page.getByRole('tab', { name: 'Pendientes' }).click();
    await expect.poll(() => totalListado(page)).toBe(25);
    const jefe = await (await browser.newContext()).newPage();
    await ingresarYEsperar(jefe, 'pgimene0');
    await jefe.goto('/solicitudes');
    await jefe.getByRole('tab', { name: 'Pendientes' }).click();
    await expect.poll(() => totalListado(jefe)).toBe(25);
    for (const sua of ['49659', '50017', '50038']) await expect(tarjeta(jefe, sua)).toBeVisible();
    await jefe.getByRole('tab', { name: 'En revisión' }).click();
    await expect(tarjeta(jefe, '48495')).toBeVisible();
    await expect(tarjeta(jefe, '50822')).toBeVisible();
    // Otro Operador ve lo mismo (no hay "mis solicitudes").
    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await otro.goto('/solicitudes');
    await otro.getByRole('tab', { name: 'Pendientes' }).click();
    await expect.poll(() => totalListado(otro)).toBe(25);
  });

  test('[CU-03 normal][RF-10][HU-14 c2] pestañas Todas, Pendientes y En revisión filtran por estado', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'En revisión' }).click();
    await expect(page.getByText('Mostrando 1–3 de 3 solicitudes')).toBeVisible();
    for (const t of await page.locator('.tarjeta').all()) await expect(t).toContainText('En revisión');
    await page.getByRole('tab', { name: 'Pendientes' }).click();
    await expect(page.getByText(/Mostrando 1–\d+ de \d+ solicitudes/)).toBeVisible();
    for (const t of await page.locator('.tarjeta').all()) await expect(t).toContainText('Pendiente');
    await expect(page.locator('.tarjeta').filter({ hasText: 'Dictaminada' })).toHaveCount(0);
    await expect(page.locator('.tarjeta').filter({ hasText: 'En revisión' })).toHaveCount(0);
    expect(await totalListado(page)).toBe(34 - 6 - 3);
  });

  test('[CU-03 normal][RF-10][RF-11] el buscador filtra por número de SUA y el filtro de año acota por año', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.getByText(/Mostrando 1–30 de 34/)).toBeVisible();
    await page.getByLabel('Buscar por número de SUA').fill('4849');
    await expect(page.getByText('Mostrando 1–1 de 1 solicitudes')).toBeVisible();
    await expect(tarjeta(page, '48495-2026')).toBeVisible();
    await page.getByLabel('Buscar por número de SUA').fill('');
    // Año: 2025 solo tiene las 2 re-derivadas.
    await page.getByLabel('Año').selectOption('2025');
    await expect(page.getByText('Mostrando 1–2 de 2 solicitudes')).toBeVisible();
    await expect(tarjeta(page, '50822-2025')).toContainText('En revisión');
    await page.getByLabel('Año').selectOption('2026');
    await expect(page.getByText(/Mostrando 1–30 de 32 solicitudes/)).toBeVisible();
  });

  test('[WF-02][CU-03 normal] paginación de a 30: "Mostrando 1–30 de 34", página 2 con las 4 restantes', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.getByText('Mostrando 1–30 de 34 solicitudes')).toBeVisible();
    await expect(page.locator('.tarjeta')).toHaveCount(30);
    const pag = page.getByRole('navigation', { name: 'Páginas' });
    await expect(pag.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    await pag.getByRole('button', { name: '2' }).click();
    await expect(page.getByText('Mostrando 31–34 de 34 solicitudes')).toBeVisible();
    await expect(page.locator('.tarjeta')).toHaveCount(4);
    await pag.getByRole('button', { name: 'Página anterior' }).click();
    await expect(page.getByText('Mostrando 1–30 de 34 solicitudes')).toBeVisible();
    // Al cambiar de filtro vuelve a la primera página.
    await pag.getByRole('button', { name: '2' }).click();
    await page.getByRole('tab', { name: 'Pendientes' }).click();
    await expect(page.getByText(/Mostrando 1–/)).toBeVisible();
  });

  test('[CU-03 E2][HU-03 c1] sin solicitudes para el filtro, el listado vacío trae un mensaje aclaratorio', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await page.getByRole('tab', { name: 'Pendientes' }).click();
    await page.getByLabel('Año').selectOption('2025'); // las de 2025 están En revisión: ninguna pendiente
    await expect(page.getByText('No hay solicitudes para mostrar con este filtro. Cuando el SUA derive nuevas, van a aparecer acá.')).toBeVisible();
    await expect(page.locator('.tarjeta')).toHaveCount(0);
  });

  test('[CU-03 3][RF-26][RF-29] el detalle muestra la ubicación y la descripción técnica, sin datos del vecino', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await tarjeta(page, '48509-2026').click();
    await expect(page.getByRole('heading', { name: 'SUA 48509-2026' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Detalle técnico' })).toBeVisible();
    const detalle = page.locator('.bloque-dictamen').first();
    await expect(detalle).toContainText('Laprida 1350');
    await expect(detalle).toContainText('Centro');
    await expect(detalle).toContainText('Media');
    await expect(detalle).toContainText('Rama baja que obstaculiza el paso de vehículos altos.');
    await expect(page.getByRole('heading', { name: 'Ubicación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historial de derivaciones' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dictaminar', exact: true })).toBeVisible();
    const texto = (await page.locator('main').innerText()).toLowerCase();
    for (const prohibido of ['vecino', 'teléfono', 'telefono', 'mail', 'correo', 'dni', 'reclamante', 'solicitante', 'apellido'])
      expect(texto, `el detalle no debe mostrar datos del vecino (${prohibido})`).not.toContain(prohibido);
    // El servidor tampoco los manda.
    const crudo = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('arbolado.sesion')!);
      return (await fetch('/api/solicitudes/48509/2026', { headers: { Authorization: `Bearer ${s.acceso}` } })).text();
    });
    expect(crudo).not.toMatch(/vecino|telefono|email|dni|solicitante/i);
  });

  test('[HU-03 c4][CU-03 E3][RF-62] una solicitud que no se pudo ubicar sale igual en el listado con la marca "Sin ubicar" y se puede dictaminar desde ahí', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await page.getByRole('tab', { name: 'Pendientes' }).click();
    const sin = tarjeta(page, '50156-2026');
    await expect(sin).toBeVisible();
    await expect(sin).toContainText('Pasaje sin nombre s/n');
    await expect(sin).toContainText('Sin ubicar en el mapa');
    await sin.click();
    await expect(page.getByText('Sin ubicar: el sistema reintenta solo cada hora.')).toBeVisible();
    await page.getByRole('link', { name: 'Dictaminar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dictamen técnico' })).toBeVisible();
    // Fuera del armado automático: el resumen de la ruta lo informa.
    await page.goto('/rutas');
    await page.getByRole('button', { name: /A pie/ }).click();
    await expect(page.getByText(/1 sin ubicar en el mapa quedan afuera/)).toBeVisible();
  });

  test('[HU-14 c2][RF-12] una solicitud En revisión se distingue de las pendientes y conserva su historial de derivaciones y de dictámenes', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await page.getByLabel('Año').selectOption('2026');
    await expect(tarjeta(page, '48509-2026')).not.toContainText('En revisión');
    await page.getByLabel('Año').selectOption('2025');
    const rev = tarjeta(page, '50822-2025');
    await expect(rev).toContainText('En revisión');
    await rev.click();
    await expect(page.getByRole('heading', { name: 'SUA 50822-2025' })).toBeVisible();
    await expect(page.locator('.encabezado .subtitulo')).toHaveText('Pendiente-revisión');
    // Historial de derivaciones: la original y la re-derivación.
    const derivaciones = page.locator('section', { has: page.getByRole('heading', { name: 'Historial de derivaciones' }) }).locator('.registro');
    await expect(derivaciones).toHaveCount(2);
    // Historial de dictámenes: el anterior sigue ahí, y se puede ver aparte.
    const dictamenes = page.locator('section', { has: page.getByRole('heading', { name: 'Historial de dictámenes' }) });
    await expect(dictamenes.locator('.registro')).toHaveCount(1);
    await expect(dictamenes.locator('.registro')).toContainText('Dictamen N.°');
    await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
    await expect(page.getByRole('dialog')).toContainText('Solo lectura');
  });

  test('[RNF-09][WF-02] en el celular el listado no tiene scroll horizontal, usa tarjetas y la barra inferior del rol', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.locator('.tarjeta').first()).toBeVisible();
    await sinDesborde(page);
    await expect(page.locator('table.solo-escritorio')).toBeHidden();
    const barra = page.getByRole('navigation', { name: 'Menú principal' });
    await expect(barra.getByRole('link')).toHaveText([/Solicitudes/, /Rutas/, /Tormenta/, /Perfil/]);
    await sinDesborde(page);
    await page.screenshot({ path: `${CAPTURAS}/wf-02-celular.png`, fullPage: true });
  });

  test('[WF-02] conformidad con el wireframe 02: título, indicador de sincronización, pestañas, buscador, año, tarjetas, resumen y paginación', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.getByRole('heading', { name: 'Solicitudes' })).toBeVisible();
    await expect(page.locator('.encabezado').getByRole('link', { name: 'Todo sincronizado' })).toBeVisible();
    await expect(page.getByRole('tab')).toHaveText(['Todas', 'Pendientes', 'En revisión']);
    await expect(page.getByPlaceholder('Buscar por número de SUA…')).toBeVisible();
    await expect(page.getByLabel('Año')).toBeVisible();
    // La tarjeta: SUA N-Año, insignia de estado, dirección — Distrito, descripción, prioridad.
    const t = tarjeta(page, '48509-2026');
    await expect(t).toContainText(/SUA 48509-2026\s*Pendiente/);
    await expect(t).toContainText('Laprida 1350 — Distrito Centro');
    await expect(t).toContainText('Rama baja que obstaculiza');
    await expect(t).toContainText('Prioridad Media');
    await expect(page.getByText('Mostrando 1–30 de 34 solicitudes')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Páginas' }).getByRole('button')).toHaveText(['‹', '1', '2', '›']);
    // Barra inferior con el indicador de tormenta (punto rojo con la cantidad).
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('status', { name: /8 solicitudes de tormenta/ })).toBeVisible();
    await page.screenshot({ path: `${CAPTURAS}/wf-02.png`, fullPage: true });
  });
});

test.describe('listado de solicitudes en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('[RNF-09][WF-02][CU-03 normal] en escritorio el listado es una tabla con menú lateral y se abre el detalle con un clic en la fila', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/solicitudes');
    await expect(page.locator('thead th')).toHaveText(['SUA', 'Estado', 'Dirección', 'Distrito', 'Prioridad', 'Derivada el']);
    await expect(page.locator('.lista-tarjetas.solo-celular')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).first().getByRole('link', { name: /Solicitudes/ })).toBeVisible();
    await sinDesborde(page);
    await page.screenshot({ path: `${CAPTURAS}/wf-02-escritorio.png`, fullPage: true });
    await page.getByRole('row', { name: /48070-2026/ }).click();
    await expect(page).toHaveURL(/\/solicitudes\/48070\/2026$/);
    await sinDesborde(page);
  });
});

// ── Generar ruta (HU-04, CU-04) ───────────────────────────────────────────────────────────────────

test.describe('generar ruta', () => {
  test('[HU-04 c1][HU-04 c5][CU-04 normal][CU-04 2.2][RF-49] sin modo de desplazamiento el botón está deshabilitado; con modo, el modal repite el modo y al confirmar se arma la ruta con distancia y tiempo', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
    await resumenEstable(page);
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeDisabled();
    await expect(page.getByText('Elegí el modo de desplazamiento para habilitar el botón.')).toBeVisible();
    await page.getByLabel('Distrito').selectOption('Centro');
    await page.getByRole('button', { name: 'Más Alta' }).click();
    await page.getByRole('button', { name: 'Más Media' }).click();
    await resumenEstable(page);
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeDisabled(); // sigue sin modo
    await page.getByRole('button', { name: /A pie/ }).click();
    await expect(page.getByRole('button', { name: /A pie/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeEnabled();
    await page.getByRole('button', { name: 'Generar ruta' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Confirmar ruta' })).toBeVisible();
    await expect(modal).toContainText(/Se reservarán \d+ solicitudes para tu ruta de (hoy|mañana), a pie\./);
    const entrarian = Number((await modal.textContent())!.match(/Se reservarán (\d+) solicitudes/)![1]);
    expect(entrarian).toBeGreaterThan(0);
    await expect(modal).toContainText('Ninguna estará disponible para otros ingenieros.');
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Generar ruta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Ruta de hoy' })).toBeVisible();
    await expect(page.locator('.encabezado .subtitulo')).toContainText('a pie');
    await expect(dato(page, 'Solicitudes')).toHaveText(String(entrarian));
    await expect(dato(page, 'Modo')).toHaveText('a pie');
    await expect(dato(page, 'Distancia est.')).toHaveText(/\d+(\.\d)? (km|m)$/);
    await expect(dato(page, 'Tiempo est.')).toHaveText(/\d+ (h \d+ )?min$/);
    for (const s of await paradas(page)) expect(s).toMatch(/^\d+-2026$/);
  });

  test('[HU-04 c5][CU-04 4][RF-49] el tiempo del recorrido cambia con el modo: en vehículo tarda menos que a pie, sobre las mismas solicitudes', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Centro', cupos: { Alta: 3, Media: 2 }, modo: 'a pie' });
    const aPie = { tiempo: minutos((await dato(page, 'Tiempo est.').textContent())!), solicitudes: await paradas(page) };
    expect(aPie.solicitudes.length).toBe(5);
    await page.getByRole('button', { name: /Restablecer/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
    await generarRuta(page, { distrito: 'Centro', cupos: { Alta: 3, Media: 2 }, modo: 'vehículo' });
    await expect(page.locator('.encabezado .subtitulo')).toContainText('en vehículo');
    const vehiculo = { tiempo: minutos((await dato(page, 'Tiempo est.').textContent())!), solicitudes: await paradas(page) };
    expect([...vehiculo.solicitudes].sort()).toEqual([...aPie.solicitudes].sort());
    expect(vehiculo.tiempo).toBeLessThan(aPie.tiempo);
  });

  test('[HU-04 c4][CU-04 2.1] sin elegir distrito igual se arma la ruta con el resto de los criterios', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await expect(page.getByLabel('Distrito')).toHaveValue('');
    await expect(page.getByLabel('Distrito').locator('option:checked')).toHaveText('Sin filtrar por distrito');
    await page.getByRole('button', { name: 'Más Alta' }).click();
    await page.getByRole('button', { name: 'Más Alta' }).click();
    await page.getByRole('button', { name: /Vehículo/ }).click();
    await resumenEstable(page);
    await page.getByRole('button', { name: 'Generar ruta' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Ruta de hoy' })).toBeVisible();
    await expect(dato(page, 'Solicitudes')).toHaveText('2');
    // Las dos son de prioridad Alta, de cualquier distrito.
    const filas = page.locator('.lista.solo-celular .tarjeta.parada');
    await expect(filas).toHaveCount(2);
    for (const f of await filas.all()) await expect(f).toContainText('Prioridad Alta');
  });

  test('[HU-04 c6][RF-47][RF-48][CU-04 3.1][CU-04 4] con más candidatas que el cupo se prefieren las más antiguas y se ordena la visita desde la sede', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { cupos: { Alta: 3 }, modo: 'a pie' });
    const orden = await paradas(page);
    expect(orden).toHaveLength(3);
    // La Alta pendiente más antigua (48705, 04/09; 48321 ya está dictaminada y 48495 En revisión) tiene que estar adentro.
    expect(orden).toContain('48705-2026');
    await expect(page.getByText('Orden de visita optimizado.')).toBeVisible();
    await expect(page.getByText(/Parte de la sede de Parques y Paseos/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Orden de visita' })).toBeVisible();
    const numeros = await page.locator('.lista.solo-celular .tarjeta.parada .orden').allTextContents();
    expect(numeros).toEqual(['1', '2', '3']);
    // Distancia y tiempo del recorrido completo informados.
    await expect(dato(page, 'Distancia est.')).not.toHaveText('—');
    await expect(dato(page, 'Tiempo est.')).not.toHaveText('—');
  });

  test('[HU-04 c2][CU-04 3][CU-04 E3] lo que ya está en la ruta de otro ingeniero no aparece disponible; si todas las que cumplen están reservadas, se informa y se sugiere ampliar', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    const sin = await (async () => {
      await page.goto('/rutas');
      await page.getByRole('button', { name: /A pie/ }).click();
      await resumenEstable(page);
      return cumplen(page);
    })();
    await generarRuta(page, { distrito: 'Sur' }); // las 3 pendientes de Sur
    const mias = await paradas(page);
    expect(mias.sort()).toEqual(['49659-2026', '50017-2026', '50038-2026']);

    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await otro.goto('/rutas');
    await otro.getByRole('button', { name: /A pie/ }).click();
    await resumenEstable(otro);
    // HU-04 c2: sin las 3 reservadas.
    expect(await cumplen(otro)).toBe(sin - 3);
    // E3: todas las de Sur están reservadas.
    await otro.getByLabel('Distrito').selectOption('Sur');
    await otro.waitForTimeout(700);
    await expect(otro.getByText(/Las 3 solicitudes que cumplen estos criterios ya están reservadas en rutas de otros ingenieros. Ampliá los criterios./)).toBeVisible();
    await expect(otro.getByRole('button', { name: 'Generar ruta' })).toBeDisabled();
    // Ampliando (sin distrito) se arma una ruta que no tiene ninguna de las de mrossi0.
    await otro.getByLabel('Distrito').selectOption('');
    await otro.getByRole('button', { name: 'Más Alta' }).click();
    await otro.getByRole('button', { name: 'Más Alta' }).click();
    await otro.getByRole('button', { name: 'Más Alta' }).click();
    await otro.waitForTimeout(700);
    await otro.getByRole('button', { name: 'Generar ruta' }).click();
    await otro.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(otro.getByRole('heading', { name: 'Ruta de hoy' })).toBeVisible();
    for (const s of await paradas(otro)) expect(mias).not.toContain(s);
  });

  test('[CU-04 E2] si ninguna solicitud cumple los criterios se informa, el botón queda deshabilitado y se pueden modificar los criterios', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await elegirCriterios(page, { distrito: 'Sur', cupos: { Baja: 1 }, modo: 'a pie' }); // en Sur no hay Baja pendientes
    await expect(page.getByText('No se encontraron solicitudes con estos criterios: modificalos.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeDisabled();
    await page.getByRole('button', { name: 'Menos Baja' }).click();
    await page.waitForTimeout(700);
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeEnabled();
  });

  test('[HU-04 c1][CU-04 normal][RF-15] la zona dibujada en el mapa (3 puntos) cambia el resumen y se puede borrar', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await page.getByRole('button', { name: /A pie/ }).click();
    await resumenEstable(page);
    const todas = await cumplen(page);
    await expect(page.getByText('Tocá el mapa para dibujar una zona (mínimo 3 puntos).')).toBeVisible();
    const mapa = page.locator('.leaflet-container').first();
    await mapa.scrollIntoViewIfNeeded();
    const caja = (await mapa.boundingBox())!;
    const c = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
    await page.mouse.click(c.x - 25, c.y - 20);
    await expect(page.getByText('1 punto(s): faltan 2 para cerrar la zona.')).toBeVisible();
    await page.mouse.click(c.x + 25, c.y - 20);
    await expect(page.getByText('2 punto(s): faltan 1 para cerrar la zona.')).toBeVisible();
    await page.mouse.click(c.x, c.y + 25);
    await expect(page.getByText('Zona de 3 puntos.')).toBeVisible();
    await page.waitForTimeout(800);
    const zona = await cumplen(page);
    expect(zona, 'con una zona chica el resumen tiene que bajar').toBeLessThan(todas);
    await page.screenshot({ path: `${CAPTURAS}/wf-03-zona.png`, fullPage: true });
    await page.getByRole('button', { name: 'Borrar zona' }).click();
    await expect(page.getByText('Tocá el mapa para dibujar una zona (mínimo 3 puntos).')).toBeVisible();
    await page.waitForTimeout(800);
    expect(await cumplen(page)).toBe(todas);
  });

  test('[WF-03] conformidad con el wireframe 03: encabezado con volver, secciones Distrito, Cantidad por prioridad, Zona en el mapa y Modo, resumen, botón y modal', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible();
    await expect(page.locator('.encabezado').getByRole('link', { name: 'Todo sincronizado' })).toBeVisible();
    await expect(page.getByText('Combiná los criterios que necesites. El modo de desplazamiento es obligatorio.')).toBeVisible();
    const titulos = await page.locator('.titulo-seccion').allInnerTexts();
    expect(titulos.map((t) => t.replace(/\s+/g, ' ').trim())).toEqual(['Distrito opcional', 'Cantidad por prioridad', 'Zona en el mapa opcional', 'Modo de desplazamiento obligatorio']);
    await expect(page.getByLabel('Distrito').locator('option:checked')).toHaveText('Sin filtrar por distrito');
    await expect(page.locator('.rotulo-prioridad')).toHaveText(['Alta', 'Media', 'Baja']);
    await expect(page.getByRole('status', { name: 'Cantidad de prioridad Alta' })).toHaveText('0');
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /A pie/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Vehículo/ })).toBeVisible();
    await expect(page.getByText(/solicitudes cumplen estos criterios/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeVisible();
    await page.getByRole('button', { name: 'Más Alta' }).click();
    await page.getByRole('button', { name: /A pie/ }).click();
    await resumenEstable(page);
    await page.getByRole('button', { name: 'Generar ruta' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Confirmar ruta' })).toBeVisible();
    await expect(modal.getByRole('button')).toHaveText(['Cancelar', 'Confirmar']);
    await page.screenshot({ path: `${CAPTURAS}/wf-03.png`, fullPage: true });
  });

  test('[RNF-09][WF-03] el formulario de generar ruta y la ruta de hoy se usan en 412 px sin scroll horizontal', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await resumenEstable(page);
    await sinDesborde(page);
    await generarRuta(page, { distrito: 'Centro', cupos: { Alta: 2 } });
    await sinDesborde(page);
    await page.screenshot({ path: `${CAPTURAS}/ruta-hoy-celular.png`, fullPage: true });
  });
});

test.describe('generar ruta en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('[RNF-09][WF-03] en escritorio la ruta de hoy se muestra como tabla con orden, SUA, dirección, distrito, prioridad, estado y acciones', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/rutas');
    await sinDesborde(page);
    await generarRuta(page, { distrito: 'Centro', cupos: { Alta: 2 } });
    await expect(page.locator('thead th')).toHaveText(['Orden', 'SUA', 'Dirección', 'Distrito', 'Prioridad', 'Estado', 'Acciones']);
    await sinDesborde(page);
    await page.screenshot({ path: `${CAPTURAS}/ruta-hoy-escritorio.png`, fullPage: true });
  });
});

// ── Restablecer (HU-05, CU-05) ───────────────────────────────────────────────────────────────────

test.describe('restablecer ruta', () => {
  test('[HU-05 c1][CU-05 normal][CU-05 1][CU-05 2][CU-05 3][CU-05 4] Restablecer pide confirmación advirtiendo que se descarta la ruta completa, libera las solicitudes y ofrece generar otra', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Sur' });
    // CU-05 1: la ruta muestra sus solicitudes.
    expect(await paradas(page)).toHaveLength(3);
    await expect(page.getByText('Las solicitudes sin dictaminar se liberan solas a las 18:00 (RF-17).')).toBeVisible();
    // CU-05 2: confirmación que advierte.
    await page.getByRole('button', { name: /Restablecer/ }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Restablecer la ruta' })).toBeVisible();
    await expect(modal).toContainText('Se descarta la ruta completa y se liberan las 3 solicitudes sin dictaminar');
    await expect(modal).toContainText('Los dictámenes ya firmados no cambian.');
    // Cancelar deja la ruta como estaba.
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await paradas(page)).toHaveLength(3);
    // CU-05 3 y 4: confirma, se libera y se ofrece generar una ruta nueva.
    await page.getByRole('button', { name: /Restablecer/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeVisible();
    // Disponibles para otros ingenieros otra vez.
    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await elegirCriterios(otro, { distrito: 'Sur', modo: 'a pie' });
    expect(await cumplen(otro)).toBe(3);
  });

  test('[HU-05 c2][CU-05 1][HU-05 c1] lo ya dictaminado queda marcado en la ruta y no vuelve como disponible al restablecer', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Sur' });
    const primera = (await paradas(page))[0];
    const [numero, anio] = primera.split('-');
    await page.locator('.lista.solo-celular .tarjeta.parada').first().getByRole('link', { name: 'Dictaminar' }).click();
    await expect(page).toHaveURL(new RegExp(`/dictaminar/${numero}/${anio}`));
    await completarYFirmar(page, 'Dictamen previo al restablecer');
    await expect(page.getByText(/Dictamen firmado|Firmado|firmado/).first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/rutas');
    const tarj = page.locator('.tarjeta.parada').filter({ hasText: `SUA ${primera}` });
    await expect(tarj).toContainText('Dictaminada');
    await expect(tarj).toContainText('Ya dictaminada');
    await expect(tarj.getByRole('link', { name: 'Dictaminar' })).toHaveCount(0);
    // La confirmación cuenta solo las que faltan.
    await page.getByRole('button', { name: /Restablecer/ }).click();
    await expect(page.getByRole('dialog')).toContainText('se liberan las 2 solicitudes sin dictaminar');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
    // Disponibles: las 2 sin dictaminar, no la dictaminada.
    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await elegirCriterios(otro, { distrito: 'Sur', modo: 'a pie' });
    expect(await cumplen(otro)).toBe(2);
    await otro.goto('/solicitudes');
    await expect(tarjeta(otro, primera)).toContainText('Dictaminada');
  });

  test('[CU-05 E2] restablecer una ruta con todo dictaminado informa que no hay solicitudes para liberar y permite generar otra', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Sur', cupos: { Alta: 1 } }); // una sola: 50017
    expect(await paradas(page)).toEqual(['50017-2026']);
    await page.locator('.lista.solo-celular .tarjeta.parada').first().getByRole('link', { name: 'Dictaminar' }).click();
    await completarYFirmar(page, 'Única de la ruta');
    await expect(page.getByText(/firmado/i).first()).toBeVisible({ timeout: 20_000 });
    await page.goto('/rutas');
    await expect(page.locator('.tarjeta.parada')).toContainText('Ya dictaminada');
    await page.getByRole('button', { name: /Restablecer/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Todas las solicitudes de esta ruta ya están dictaminadas: no hay nada para liberar.');
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('heading', { name: 'Generar ruta' })).toBeVisible();
  });

  test('[HU-05 c3][CU-05 E1] la ruta avisa que las solicitudes sin dictaminar se liberan solas a las 18:00 (el corte en sí está verificado en el servidor)', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await generarRuta(page, { distrito: 'Sur' });
    await expect(page.getByText('Las solicitudes sin dictaminar se liberan solas a las 18:00 (RF-17).')).toBeVisible();
  });
});

// ── Protocolo por tormenta (HU-12, CU-12) ────────────────────────────────────────────────────────

test.describe('protocolo por tormenta', () => {
  test('[HU-12 c1][HU-12 c2][CU-12 1][CU-12 2][RF-38][RF-39][RF-40] las 8 de tormenta están solo en el protocolo, ordenadas de la más antigua, con el indicador animado y la cantidad en el menú', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    const indicador = page.getByRole('navigation', { name: 'Menú principal' }).getByRole('status', { name: '8 solicitudes de tormenta sin dictaminar' });
    await expect(indicador).toHaveText('8');
    // Indicador visual animado (latido), salvo que el usuario pida reducir el movimiento.
    expect(await indicador.evaluate((e) => getComputedStyle(e).animationName)).toBe('latido');
    expect(await indicador.evaluate((e) => getComputedStyle(e).animationIterationCount)).toBe('infinite');
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /Tormenta/ }).click();
    await expect(page.getByRole('heading', { name: /Protocolo por tormenta/ })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '8 solicitudes de emergencia climática sin dictaminar' })).toBeVisible();
    const tarjetas = page.locator('.tarjeta.tormenta');
    await expect(tarjetas).toHaveCount(8);
    const ids = (await tarjetas.locator('b').allTextContents()).map((t) => t.replace('SUA ', '').split('-')[0]);
    expect(ids).toEqual(TORMENTA);
    for (const t of await tarjetas.all()) await expect(t).toContainText('Tormenta');
    await expect(tarjetas.first()).toContainText(/Derivada hace \d+ días? hábiles?/);
    await expect(page.getByText('(ordenadas: más antiguas primero)')).toBeVisible();
    // No están en el listado general (HU-12 c1).
    await page.goto('/solicitudes');
    for (const sua of TORMENTA) await expect(tarjeta(page, sua)).toHaveCount(0);
  });

  test('[HU-12 c3][HU-12 c4][CU-12 normal][CU-12 3][CU-12 4][RF-41][RF-42] al pedir 5 se arma la ruta con las 5 más antiguas y quedan reservadas: otro ingeniero solo ve libres las 3 restantes', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await page.getByRole('button', { name: 'Generar ruta de tormenta' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Ruta de tormenta' })).toBeVisible();
    await expect(modal.getByLabel('¿Cuántas solicitudes atendés hoy?')).toHaveValue('10');
    await modal.getByLabel('¿Cuántas solicitudes atendés hoy?').fill('5');
    await modal.getByRole('button', { name: 'Generar' }).click();
    await expect(page.getByRole('heading', { name: 'Ruta de tormenta' })).toBeVisible();
    await expect(page).toHaveURL(/\/rutas$/);
    expect((await paradas(page)).map((s) => s.split('-')[0]).sort()).toEqual(TORMENTA.slice(0, 5));
    await expect(dato(page, 'Solicitudes')).toHaveText('5');

    // Otro ingeniero: las 5 figuran en la ruta de mrossi0; no puede reservarlas (HU-12 c4).
    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await otro.goto('/tormenta');
    await expect(otro.locator('.tarjeta.tormenta')).toHaveCount(8);
    await expect(otro.locator('.etiqueta.violeta:visible')).toHaveCount(5);
    await expect(otro.locator('.etiqueta.violeta:visible').first()).toHaveText('En la ruta de mrossi0');
    await otro.getByRole('button', { name: 'Generar ruta de tormenta' }).click();
    await otro.getByLabel('¿Cuántas solicitudes atendés hoy?').fill('20');
    await expect(otro.getByText('Hay 3 disponibles: la ruta se arma con todas.')).toBeVisible();
    await otro.getByRole('dialog').getByRole('button', { name: 'Generar' }).click();
    await expect(otro.getByRole('dialog')).toContainText('Pediste 20, pero solo hay 3 disponibles: la ruta se armó con todas.');
    await otro.getByRole('button', { name: 'Ver mi ruta' }).click();
    expect((await paradas(otro)).map((s) => s.split('-')[0]).sort()).toEqual(TORMENTA.slice(5));
  });

  test('[HU-12 c4][CU-05 3] una solicitud de tormenta liberada con Restablecer vuelve a quedar disponible para otro ingeniero', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await page.getByRole('button', { name: 'Generar ruta de tormenta' }).click();
    await page.getByLabel('¿Cuántas solicitudes atendés hoy?').fill('2');
    await page.getByRole('dialog').getByRole('button', { name: 'Generar' }).click();
    await expect(page.getByRole('heading', { name: 'Ruta de tormenta' })).toBeVisible();
    await page.getByRole('button', { name: /Restablecer/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
    const otro = await (await browser.newContext()).newPage();
    await ingresarYEsperar(otro, 'cbenite0');
    await otro.goto('/tormenta');
    await expect(otro.locator('.tarjeta.tormenta')).toHaveCount(8);
    await expect(otro.locator('.etiqueta.violeta:visible')).toHaveCount(0);
  });

  test('[CU-12 E2][HU-12 c3] pedir 20 cuando hay 8 arma la ruta con las 8 e informa cuántas se incluyeron', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await page.getByRole('button', { name: 'Generar ruta de tormenta' }).click();
    await page.getByLabel('¿Cuántas solicitudes atendés hoy?').fill('20');
    await expect(page.getByText('Hay 8 disponibles: la ruta se arma con todas.')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Generar' }).click();
    const aviso = page.getByRole('dialog');
    await expect(aviso).toContainText('Pediste 20, pero solo hay 8 disponibles: la ruta se armó con todas.');
    await aviso.getByRole('button', { name: 'Ver mi ruta' }).click();
    await expect(page.getByRole('heading', { name: 'Ruta de tormenta' })).toBeVisible();
    await expect(dato(page, 'Solicitudes')).toHaveText('8');
  });

  test('[HU-12 c5][CU-12 5] el dictamen de una solicitud de tormenta usa el mismo formulario que cualquier otro, sin campos adicionales', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    const campos = () => page.locator('main').locator('input, select, textarea, button').evaluateAll((els) => els.map((e) => (e.textContent || e.getAttribute('aria-label') || e.getAttribute('id') || e.getAttribute('type') || '').trim()));
    await page.goto('/dictaminar/48509/2026');
    await expect(page.getByRole('heading', { name: 'Dictamen técnico' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar el domicilio de la solicitud' })).toBeVisible();
    const normal = await campos();
    await page.goto('/dictaminar/50261/2026');
    await expect(page.getByRole('heading', { name: 'Dictamen técnico' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar el domicilio de la solicitud' })).toBeVisible();
    const tormenta = await campos();
    expect(tormenta).toEqual(normal);
    // Ningún campo ni rótulo propio de tormenta (la descripción del reclamo puede nombrarla).
    await expect(page.locator('main').locator('label, legend, .rotulo, .titulo-bloque').filter({ hasText: /tormenta/i })).toHaveCount(0);
  });

  test('[CU-12 2.1][HU-12 c1] Lector y Administrador ven la sección de tormenta solo para consulta, sin el botón de generar', async ({ page, browser }) => {
    await ingresarYEsperar(page, 'tmolina0');
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /Tormenta/ }).click();
    await expect(page.getByRole('heading', { name: /Protocolo por tormenta/ })).toBeVisible();
    await expect(page.locator('.tarjeta.tormenta')).toHaveCount(8);
    await expect(page.getByRole('button', { name: /Generar ruta/ })).toHaveCount(0);
    const admin = await (await browser.newContext()).newPage();
    await ingresarYEsperar(admin, 'asuarez0');
    await admin.goto('/tormenta');
    await expect(admin.getByRole('heading', { name: /Protocolo por tormenta/ })).toBeVisible();
    await expect(admin.locator('.tarjeta.tormenta')).toHaveCount(8);
    await expect(admin.getByRole('button', { name: /Generar ruta/ })).toHaveCount(0);
    // El Jefe sí puede generar.
    const jefe = await (await browser.newContext()).newPage();
    await ingresarYEsperar(jefe, 'pgimene0');
    await jefe.goto('/tormenta');
    await expect(jefe.getByRole('button', { name: 'Generar ruta de tormenta' })).toBeEnabled();
  });

  test('[CU-12 E3] sin solicitudes de tormenta pendientes el apartado queda vacío y no se muestra el indicador (respuesta del servidor simulada: vacía)', async ({ page }) => {
    await page.route('**/api/tormenta', (r) => r.fulfill({ json: { pendientes: [], dictaminadas: [] } }));
    await page.route('**/api/tormenta/indicador', (r) => r.fulfill({ json: { pendientes: 0 } }));
    await ingresarYEsperar(page, 'mrossi0');
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('status')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: /Tormenta/ }).click();
    await expect(page.getByText('No hay solicitudes de tormenta pendientes.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'emergencia climática' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Generar ruta de tormenta' })).toBeDisabled();
  });

  test('[WF-06] conformidad con el wireframe 06: encabezado de emergencia, franja de alerta, tarjetas con insignia TORMENTA y antigüedad, pie y modal de cantidad', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await expect(page.getByRole('heading', { name: '⛈ Protocolo por tormenta' })).toBeVisible();
    await expect(page.locator('.encabezado').getByRole('link', { name: 'Todo sincronizado' })).toBeVisible();
    const franja = page.getByRole('status').filter({ hasText: 'solicitudes de emergencia climática sin dictaminar' });
    await expect(franja).toHaveText('⚠ 8 solicitudes de emergencia climática sin dictaminar');
    const primera = page.locator('.tarjeta.tormenta').first();
    await expect(primera).toContainText('SUA 50261-2026');
    await expect(primera.locator('.insignia.tormenta')).toHaveText('Tormenta');
    await expect(primera).toContainText('Av. Alberdi 1587 — Distrito Norte');
    await expect(primera).toContainText(/Derivada hace \d+ días? hábiles?/);
    await expect(page.getByText('(ordenadas: más antiguas primero)')).toBeVisible();
    await page.getByRole('button', { name: 'Generar ruta de tormenta' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'Ruta de tormenta' })).toBeVisible();
    await expect(modal.getByText('¿Cuántas solicitudes atendés hoy?')).toBeVisible();
    await expect(modal.getByRole('textbox')).toHaveValue('10');
    await expect(modal.getByRole('button')).toHaveText(['Cancelar', 'Generar']);
    await page.screenshot({ path: `${CAPTURAS}/wf-06.png`, fullPage: true });
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('[RNF-09][WF-06] el protocolo por tormenta se usa en 412 px sin scroll horizontal, con el menú inferior y el punto de tormenta', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await expect(page.locator('.tarjeta.tormenta').first()).toBeVisible();
    await sinDesborde(page);
    await expect(page.locator('table.solo-escritorio')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('status', { name: /8 solicitudes de tormenta/ })).toBeVisible();
  });
});

test.describe('protocolo por tormenta en escritorio', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('[RNF-09][WF-06] en escritorio el protocolo por tormenta es una tabla y el indicador aparece en el menú lateral', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/tormenta');
    await expect(page.locator('thead th')).toHaveText(['Solicitud', 'Dirección', 'Distrito', 'Antigüedad', 'Ruta']);
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).first().getByRole('status', { name: /8 solicitudes de tormenta/ })).toBeVisible();
    await sinDesborde(page);
    await page.screenshot({ path: `${CAPTURAS}/wf-06-escritorio.png`, fullPage: true });
  });
});

// ── SUA caído (CU-03 E1): va al final porque la lectura del SUA se reintenta con espera creciente ──

test('[CU-03 E1][RNF-17] con el SUA caído se avisa que no se pueden obtener las solicitudes nuevas, lo ya guardado sigue visible y se puede reintentar', async ({ page }) => {
  await ingresarYEsperar(page, 'mrossi0');
  await interruptor(page, 'sua_caido', true);
  try {
    // La lectura periódica del SUA corre como mucho una vez por minuto: se recarga hasta que lo detecte.
    await expect(async () => {
      await page.goto('/solicitudes');
      await expect(page.getByText('No se pueden obtener las solicitudes nuevas del SUA en este momento')).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect(page.getByText('Se muestran las solicitudes ya guardadas.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
    // Lo guardado sigue visible.
    await expect(page.getByText(/Mostrando 1–30 de 34 solicitudes/)).toBeVisible();
    await expect(tarjeta(page, '48070-2026')).toBeVisible();
    await sinDesborde(page);
  } finally {
    await interruptor(page, 'sua_caido', false);
  }
});
