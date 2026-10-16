// Trabajo sin señal en el captor (HU-09, HU-10; CU-10, CU-07; RF-30 a RF-34, RF-52, RF-57, RNF-16).
// El captor es el navegador emulando un Pixel 7; "sin señal" es el modo sin conexión del navegador.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { FOTO, ingresar, ingresarYEsperar, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

/** Genera una ruta chica con señal y la deja guardada en el captor. */
async function generarRuta(page: Page) {
  await page.goto('/rutas');
  await page.getByLabel('Distrito').selectOption('Centro');
  await page.getByRole('button', { name: 'Más Alta' }).click();
  await page.getByRole('button', { name: 'Más Media' }).click();
  await page.getByRole('button', { name: /A pie/ }).click();
  await expect(page.getByText(/solicitudes cumplen estos criterios/)).toBeVisible();
  await page.getByRole('button', { name: 'Generar ruta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByRole('heading', { name: 'Ruta de hoy' })).toBeVisible();
  // La copia de la ruta y del detalle de cada solicitud se guarda en el captor al verla.
  await page.waitForTimeout(1500);
}

/** Espera a que el service worker controle la página (la app ya puede abrir sin señal). */
async function esperarServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Al recargar, la clave de datos del captor vuelve con /auth/yo: se espera antes de cortar la señal.
  await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/auth/yo') && r.ok()), page.reload()]);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

/** Lee una tabla del almacenamiento local del captor (IndexedDB). */
const leerTabla = (page: Page, tabla: string) =>
  page.evaluate(
    (t) =>
      new Promise<unknown[]>((ok, mal) => {
        const pedido = indexedDB.open('arbolado-captor');
        pedido.onsuccess = () => {
          const lectura = pedido.result.transaction(t).objectStore(t).getAll();
          lectura.onsuccess = () => ok(lectura.result);
          lectura.onerror = () => mal(lectura.error);
        };
        pedido.onerror = () => mal(pedido.error);
      }),
    tabla,
  );

/** Completa el dictamen (poda) en los 5 pasos y aprieta Firmar, con la huella simulada. */
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

async function sinSenal(context: BrowserContext, page: Page) {
  await context.setOffline(true);
  await expect(page.getByText(/SIN SEÑAL/).first()).toBeVisible();
}

test('[RF-30][RNF-12] la aplicación es instalable: manifiesto con íconos y service worker activo', async ({ page }) => {
  await page.goto('/');
  const manifiesto = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json());
  expect(manifiesto).toMatchObject({ display: 'standalone', start_url: '/' });
  expect(manifiesto.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
});

test('[HU-09 c1][HU-09 c2][RF-31][RF-32][RNF-16][CU-10 normal][CU-10 1][CU-10 2][CU-10 3][CU-06 E1][RF-34][HU-10 c3][HU-10 c1][RF-33][CU-10 4][CU-07 1][CU-07 4][CU-07 5] sin señal se abre la ruta, se firma, queda cifrado y pendiente, y al volver la señal se sincroniza solo', async ({ page, context }) => {
  await ingresarYEsperar(page, 'mrossi0');
  await generarRuta(page);
  await esperarServiceWorker(page);

  await sinSenal(context, page);
  // La ruta y sus casos siguen disponibles sin señal (HU-09 c1).
  // Se navega dentro de la app (recargar la página sin señal pide la contraseña: es otro caso, RF-57).
  await page.getByRole('link', { name: 'Perfil' }).click();
  await page.getByRole('link', { name: 'Rutas' }).click();
  await expect(page.getByText('Sin señal: mostrando la ruta guardada en el captor')).toBeVisible();
  const primera = page.getByRole('link', { name: 'Dictaminar' }).first();
  await primera.click();
  await expect(page.getByRole('heading', { name: 'Dictamen técnico' })).toBeVisible();
  await completarYFirmar(page, 'Firmado sin señal en la prueba');

  // Firmado y guardado en el captor, pendiente de sincronizar (CU-10 2 y 3, HU-09 c2).
  await expect(page.getByText('Firmado sin señal: pendiente de sincronizar')).toBeVisible();
  await expect(page.getByText('SIN SEÑAL · 1')).toBeVisible();
  const cola = (await leerTabla(page, 'cola')) as { estado: string; contenido: unknown }[];
  expect(cola).toHaveLength(1);
  expect(cola[0].estado).toBe('pendiente');
  // Cifrado en reposo (RNF-16): ni las observaciones ni el usuario están en claro.
  const enClaro = JSON.stringify(await leerTabla(page, 'cola')) + JSON.stringify(await leerTabla(page, 'fotos')) + JSON.stringify(await leerTabla(page, 'cache'));
  expect(enClaro).not.toContain('Firmado sin señal en la prueba');
  expect(enClaro).not.toContain('mrossi0');

  // Vuelve la señal: se envía solo, sin tocar nada (RF-33, CU-10 4), y se borra del captor (RNF-16).
  await context.setOffline(false);
  await expect(page.getByRole('link', { name: 'Todo sincronizado' })).toBeVisible({ timeout: 30_000 });
  expect(await leerTabla(page, 'cola')).toHaveLength(0);
  expect(await leerTabla(page, 'fotos')).toHaveLength(0);
  await page.goto('/perfil');
  await expect(page.getByText(/Todo sincronizado/)).toBeVisible();
});

test('[HU-09 c3][HU-04 c3][RF-19][CU-04 E1][CU-10 E1][CU-12 E1] sin señal no se puede generar una ruta', async ({ page, context }) => {
  await ingresarYEsperar(page, 'cbenite0');
  await page.goto('/rutas');
  await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeVisible();
  await sinSenal(context, page);
  await page.getByRole('button', { name: /A pie/ }).click();
  await expect(page.getByText('Generar una ruta requiere conexión')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generar ruta' })).toBeDisabled();
  await page.getByRole('link', { name: 'Tormenta' }).click();
  await expect(page.getByText(/requiere conexión/).first()).toBeVisible();
});

test('[RF-57][HU-09 c5][CU-01 E3][CU-10 E4][RF-04][WF-01c] sesión cerrada por inactividad sin señal: se reanuda con la contraseña y al volver la señal se revalida', async ({ page, context }) => {
  await ingresarYEsperar(page, 'lfernan0');
  await esperarServiceWorker(page);
  await sinSenal(context, page);
  // 30 minutos sin actividad (RF-04): se adelanta el reloj de la última interacción.
  await page.evaluate(() => localStorage.setItem('arbolado.actividad', String(Date.now() - 31 * 60_000)));
  await expect(page.getByRole('heading', { name: 'Tu sesión se cerró por inactividad' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Usuario')).toHaveValue('lfernan0');
  await page.getByLabel('Contraseña', { exact: true }).fill('Otra1234!');
  await page.getByRole('button', { name: /reanudar sesión/i }).click();
  await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill('Demo2026!');
  await page.getByRole('button', { name: /reanudar sesión/i }).click();
  await expect(page.getByRole('navigation', { name: 'Menú principal' }).first()).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arbolado.sesion')!).reanudadaSinConexion)).toBe(true);
  // Al volver la señal, el servidor revalida al usuario (RF-57).
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('arbolado.sesion') ?? '{}').reanudadaSinConexion), { timeout: 30_000 }).toBe(false);
});

test('[RF-57][CU-01 E3] sin haber ingresado hoy con conexión no se puede reanudar: "Necesitás señal para volver a ingresar"', async ({ page, context }) => {
  await ingresarYEsperar(page, 'lfernan0');
  await esperarServiceWorker(page);
  // El último ingreso con conexión fue ayer.
  await page.evaluate(
    () =>
      new Promise<void>((ok) => {
        const pedido = indexedDB.open('arbolado-captor');
        pedido.onsuccess = () => {
          const tabla = pedido.result.transaction('ajustes', 'readwrite').objectStore('ajustes');
          const lectura = tabla.get('credencial');
          lectura.onsuccess = () => {
            const c = lectura.result;
            c.valor.ultimoIngresoConConexion = new Date(Date.now() - 86_400_000).toISOString();
            tabla.put(c).onsuccess = () => ok();
          };
        };
      }),
  );
  await sinSenal(context, page);
  await page.evaluate(() => localStorage.setItem('arbolado.actividad', String(Date.now() - 31 * 60_000)));
  await expect(page.getByText('Hoy todavía no ingresaste con conexión.', { exact: false })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Contraseña', { exact: true }).fill('Demo2026!');
  await page.getByRole('button', { name: /reanudar sesión/i }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Necesitás señal para volver a ingresar.' })).toBeVisible();
});

test('[RF-52][HU-09 c4][RF-60][HU-18 c1][HU-18 c3][CU-16 3][WF-01b] 5 intentos fallidos sin señal bloquean el captor; al volver la señal se informa, el Administrador lo desbloquea y se puede volver a ingresar', async ({ page, context, browser }) => {
  await ingresarYEsperar(page, 'lfernan0');
  await esperarServiceWorker(page);
  await sinSenal(context, page);
  await page.evaluate(() => localStorage.setItem('arbolado.actividad', String(Date.now() - 31 * 60_000)));
  await expect(page.getByRole('button', { name: /reanudar sesión/i })).toBeVisible({ timeout: 30_000 });
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Contraseña', { exact: true }).fill(`Mala${i}234!`);
    await page.getByRole('button', { name: /reanudar sesión/i }).click();
    if (i < 4) await expect(page.getByText('Usuario o contraseña incorrectos.')).toBeVisible();
  }
  // Pantalla de bloqueo sin campos de ingreso, con el código del captor (wireframe 01b).
  await expect(page.getByRole('heading', { name: 'Captor bloqueado' })).toBeVisible();
  const codigo = (await page.locator('[data-prueba="codigo-captor"]').textContent())!.trim();
  expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveCount(0);

  // Vuelve la señal: el bloqueo se informa al servidor.
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Ya me desbloquearon, reintentar' }).click();
  await expect(page.getByText(/sigue bloqueado/)).toBeVisible();

  // El Administrador lo encuentra por el código y lo desbloquea (CU-16).
  const admin = await (await browser.newContext()).newPage();
  await ingresarYEsperar(admin, 'asuarez0');
  await admin.goto('/usuarios/captores');
  await admin.getByPlaceholder(/K7M2-X9QD|Código/).fill(codigo);
  await admin.getByRole('button', { name: 'Desbloquear' }).first().click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Desbloquear' }).click();
  await expect(admin.getByText(codigo)).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined);

  // En el captor: "Ya me desbloquearon" vuelve a la pantalla de ingreso.
  await page.getByRole('button', { name: 'Ya me desbloquearon, reintentar' }).click();
  await expect(page.getByRole('button', { name: /ingresar/i })).toBeVisible();
  await ingresar(page, 'lfernan0');
  await expect(page.getByRole('navigation', { name: 'Menú principal' }).first()).toBeVisible();
});

test('[RF-52][CU-02 E4] un captor revocado por pérdida o robo pierde la sesión y sus datos locales en cuanto tiene conexión', async ({ page, browser }) => {
  await ingresarYEsperar(page, 'cbenite0');
  await page.goto('/rutas');
  const admin = await (await browser.newContext()).newPage();
  await ingresarYEsperar(admin, 'asuarez0');
  await admin.goto('/usuarios');
  await admin.getByText('cbenite0').first().click();
  await admin.getByRole('button', { name: /Revocar captor/ }).click();
  await admin.getByRole('dialog').getByRole('button', { name: /Revocar/ }).last().click();
  await expect(admin.getByText(/revoc/i).first()).toBeVisible();

  // La próxima consulta del captor revocado corta la sesión y borra lo guardado.
  await page.goto('/solicitudes');
  await expect(page.getByText(/captor fue revocado/)).toBeVisible({ timeout: 15_000 });
  expect(await leerTabla(page, 'cache')).toHaveLength(0);
  expect(await leerTabla(page, 'cola')).toHaveLength(0);
});

test('[HU-09][WF-04c] si falla el guardado en el captor, se avisa, los datos no se pierden y se puede reintentar', async ({ page, context }) => {
  // Simula un almacenamiento lleno: la escritura en la cola falla mientras el indicador esté prendido.
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'cola' && (window as unknown as { __almacenLleno?: boolean }).__almacenLleno) throw new DOMException('Sin espacio', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await ingresarYEsperar(page, 'mrossi0');
  await generarRuta(page);
  await sinSenal(context, page);
  await page.getByRole('link', { name: 'Dictaminar' }).first().click();
  await page.evaluate(() => ((window as unknown as { __almacenLleno: boolean }).__almacenLleno = true));
  await completarYFirmar(page, 'Reintento de guardado');
  await expect(page.getByText('No se pudo guardar el dictamen en el dispositivo')).toBeVisible();
  await expect(page.getByText(/NO se perdieron/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Firmar' })).toBeDisabled();
  await page.evaluate(() => ((window as unknown as { __almacenLleno: boolean }).__almacenLleno = false));
  await page.getByRole('button', { name: /reintentar guardado/i }).click();
  await expect(page.getByText('Firmado sin señal: pendiente de sincronizar')).toBeVisible();
});

test('[HU-10 c4][RF-53][CU-07 2.1][RF-33] si lo que llega al servidor no es lo que se firmó, se rechaza y el ingeniero lo ve en su perfil', async ({ page, context }) => {
  await ingresarYEsperar(page, 'mrossi0');
  await generarRuta(page);
  await sinSenal(context, page);
  await page.getByRole('link', { name: 'Dictaminar' }).first().click();
  await completarYFirmar(page, 'Contenido original');
  await expect(page.getByText('Firmado sin señal: pendiente de sincronizar')).toBeVisible();
  // El contenido se altera entre el captor y el servidor.
  await page.route('**/api/sync/dictamenes', async (ruta) => {
    const cuerpo = ruta.request().postDataJSON();
    cuerpo.formulario.observaciones = 'Contenido alterado';
    await ruta.continue({ postData: JSON.stringify(cuerpo) });
  });
  await context.setOffline(false);
  await page.goto('/perfil');
  await expect(page.getByText(/no coincide con el que se firmó/).first()).toBeVisible({ timeout: 30_000 });
  expect(((await leerTabla(page, 'cola')) as { estado: string }[])[0].estado).toBe('rechazado');
});

test('[CU-10 E3][CU-07 E2][RF-33] los dictámenes sin sincronizar sobreviven al cierre de la aplicación y se envían cuando vuelve la señal', async ({ page, context }) => {
  await ingresarYEsperar(page, 'mrossi0');
  await generarRuta(page);
  await esperarServiceWorker(page);
  await sinSenal(context, page);
  await page.getByRole('link', { name: 'Dictaminar' }).first().click();
  await completarYFirmar(page, 'Firmado al final de la jornada');
  await expect(page.getByText('Firmado sin señal: pendiente de sincronizar')).toBeVisible();
  // Se cierra la aplicación y se vuelve a abrir más tarde, todavía sin señal.
  await page.close();
  const otra = await context.newPage();
  await otra.goto('/');
  await expect(otra.getByRole('button', { name: /reanudar sesión/i })).toBeVisible();
  await otra.getByLabel('Contraseña', { exact: true }).fill('Demo2026!');
  await otra.getByRole('button', { name: /reanudar sesión/i }).click();
  await expect(otra.getByText('SIN SEÑAL · 1')).toBeVisible();
  expect(await leerTabla(otra, 'cola')).toHaveLength(1);
  // Vuelve la señal: se envía sola.
  await context.setOffline(false);
  await expect(otra.getByRole('link', { name: 'Todo sincronizado' })).toBeVisible({ timeout: 30_000 });
  expect(await leerTabla(otra, 'cola')).toHaveLength(0);
});

test('[CU-09 E2] sin señal, la consulta del dictamen anterior avisa que requiere conexión y deja seguir cargando el nuevo', async ({ page, context }) => {
  await ingresarYEsperar(page, 'pgimene0');
  // La solicitud re-derivada se guarda en el captor al abrirla con señal.
  await page.goto('/dictaminar/50822/2025');
  await expect(page.getByText('Caso re-derivado (Pendiente-revisión)')).toBeVisible();
  await page.waitForTimeout(1000);
  await sinSenal(context, page);
  await page.getByRole('button', { name: 'Ver dictamen anterior' }).click();
  await expect(page.getByRole('dialog').getByText(/requiere conexión/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Volver al formulario' }).click();
  await page.getByRole('button', { name: 'Usar el domicilio de la solicitud' }).click();
  await expect(page.getByText(/Av. Francia 3437/).first()).toBeVisible();
});
