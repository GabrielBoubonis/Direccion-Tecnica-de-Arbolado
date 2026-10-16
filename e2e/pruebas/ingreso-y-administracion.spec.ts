// Ingreso y administración (HU-01, HU-02, HU-13, HU-16, HU-18; CU-01, CU-02, CU-13, CU-14, CU-16;
// RF-01 a RF-08, RF-50, RF-52, RF-54, RF-55, RF-58, RF-60, RNF-09; wireframes WF-01, WF-07, WF-07b, WF-09, WF-10).
// El captor es el navegador emulando un Pixel 7; el escritorio se prueba con un viewport de 1280 px.
import { randomUUID } from 'node:crypto';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { CONTRASENA, ingresar, ingresarYEsperar, interruptor, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

const PUERTO_WEB = Number(process.env.PUERTO_WEB ?? 4173);
const PUERTO_API = Number(process.env.PUERTO_API ?? 3100);
const API = `http://localhost:${PUERTO_API}/api`;
const GENERICO = 'Usuario o contraseña incorrectos.';
const SERVICIO_CAIDO = /servicio de autenticación no está disponible/i;

// ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────

const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });

/** Nombres de los ítems del menú visible, sin ícono ni contador. */
const itemsDelMenu = async (page: Page) => (await menu(page).getByRole('link').allInnerTexts()).map((t) => t.replace(/[^\p{L} ]/gu, '').trim());

/** Una sesión de navegador independiente (otro usuario, otro captor). */
async function otraSesion(browser: Browser) {
  const context = await browser.newContext({ baseURL: `http://localhost:${PUERTO_WEB}`, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
  return { context, page: await context.newPage() };
}

/** Sesión por la API (sin pantalla), para preparar eventos de auditoría con otros usuarios. */
async function accesoApi(usuario: string, contrasena = CONTRASENA) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena, idDispositivo: randomUUID() }),
  });
  if (!r.ok) throw new Error(`No se pudo ingresar como ${usuario}: ${r.status}`);
  return ((await r.json()) as { acceso: string }).acceso;
}
async function llamar(acceso: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acceso}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => null) };
}
async function exigirOk(acceso: string, metodo: string, ruta: string, cuerpo?: unknown) {
  const r = await llamar(acceso, metodo, ruta, cuerpo);
  if (r.estado >= 300) throw new Error(`${metodo} ${ruta} devolvió ${r.estado}: ${JSON.stringify(r.cuerpo)}`);
}

/** Llama a la API con la sesión que tiene abierta la página. */
const apiDePagina = (page: Page, metodo: string, ruta: string) =>
  page.evaluate(
    async ([m, r]) => {
      const s = JSON.parse(localStorage.getItem('arbolado.sesion') ?? 'null');
      const res = await fetch(`/api${r}`, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.acceso}` }, body: m === 'GET' ? undefined : '{}' });
      return { estado: res.status, cuerpo: (await res.json().catch(() => null)) as { mensaje?: string; message?: string; error?: string } | null };
    },
    [metodo, ruta] as const,
  );

/** Deja 5 eventos de auditoría de dos administradores (el segundo es pgimene0, ascendido por asuarez0). */
async function sembrarAuditoria(extraCambiosDeRol = 0) {
  const admin = await accesoApi('asuarez0');
  await exigirOk(admin, 'POST', '/usuarios', { nombre: 'Ana', apellido: 'Torres', contrasena: 'Clave2026!', rol: 'Operador' });
  await exigirOk(admin, 'PATCH', '/usuarios/pgimene0', { rol: 'Administrador' });
  const otro = await accesoApi('pgimene0');
  await exigirOk(otro, 'POST', '/usuarios/lfernan0/revocar-captor');
  await exigirOk(otro, 'POST', '/usuarios/lfernan0/baja');
  await exigirOk(otro, 'POST', '/captores-admin/K7M2-X9QD/desbloquear');
  for (let i = 0; i < extraCambiosDeRol; i++) await exigirOk(admin, 'PATCH', '/usuarios/mrossi0', { rol: i % 2 === 0 ? 'Jefe' : 'Operador' });
}

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const enDias = (n: number) => new Date(Date.now() + n * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

/** Verifica que los elementos aparecen en ese orden (de arriba abajo, o de izquierda a derecha). */
async function enOrden(locators: Locator[], eje: 'y' | 'x' = 'y') {
  let anterior = -Infinity;
  for (const l of locators) {
    const caja = await l.first().boundingBox();
    expect(caja, `no se ve ${l}`).not.toBeNull();
    expect(caja![eje]).toBeGreaterThanOrEqual(anterior - 1);
    anterior = caja![eje];
  }
}

const sinDesborde = (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

const botonesDeEdicion = (page: Page) => page.getByRole('main').getByRole('button', { name: /^(editar|eliminar|borrar|descartar|modificar)/i });

async function abrirAlta(page: Page) {
  await page.goto('/usuarios');
  await page.getByRole('button', { name: '+ Nuevo' }).click();
  return page.getByRole('dialog', { name: 'Nuevo usuario' });
}
async function llenarAlta(alta: Locator, datos: { nombre: string; apellido: string; contrasena: string; rol?: string }) {
  await alta.getByLabel('Nombre', { exact: true }).fill(datos.nombre);
  await alta.getByLabel('Apellido').fill(datos.apellido);
  await alta.getByLabel('Contraseña', { exact: true }).fill(datos.contrasena);
  if (datos.rol) await alta.getByLabel('Rol', { exact: true }).selectOption(datos.rol);
}
const fichaDe = async (page: Page, usuario: string) => {
  await page.getByRole('button', { name: `Abrir ficha de ${usuario}` }).click();
  return page.getByRole('dialog', { name: `Ficha de ${usuario}` });
};
const eventosDeAuditoria = (page: Page) => page.locator('.tarjeta.evento');

// ═══ HU-01 · CU-01 · Inicio de sesión ═══════════════════════════════════════════════════════════

test.describe('Inicio de sesión', () => {
  test('[HU-01 c1][CU-01 normal][RF-01] con usuario y contraseña válidos se accede y se recibe un token', async ({ page }) => {
    await page.goto('/');
    // CU-01 1: el sistema muestra el formulario de usuario y contraseña.
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible();
    await ingresar(page, 'asuarez0');
    await expect(menu(page)).toBeVisible();
    await expect(page).toHaveURL(/\/usuarios$/); // CU-01 4: menú e inicio del rol
    const sesion = await page.evaluate(() => JSON.parse(localStorage.getItem('arbolado.sesion') ?? 'null'));
    expect(sesion.acceso.split('.')).toHaveLength(3); // JWT
  });

  const ROLES: [string, string, string[]][] = [
    ['mrossi0', 'Operador', ['Solicitudes', 'Rutas', 'Tormenta', 'Perfil']],
    ['pgimene0', 'Jefe', ['Solicitudes', 'Rutas', 'Tormenta', 'Dashboard', 'Perfil']],
    ['asuarez0', 'Administrador', ['Usuarios', 'Para revisar', 'Auditoría', 'Dashboard', 'Tormenta', 'Perfil']],
    ['tmolina0', 'Lector', ['Dashboard', 'Tormenta', 'Perfil']],
  ];
  test.describe('menú del rol (escritorio)', () => {
    test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
    for (const [usuario, rol, items] of ROLES) {
      test(`[CU-01 normal][RF-03][HU-01 c1] ${rol} (${usuario}) ve solo los ítems de su rol en el menú`, async ({ page }) => {
        await ingresarYEsperar(page, usuario);
        // El "Simulador externo" es del entorno de demostración y está para todos los roles.
        expect(await itemsDelMenu(page)).toEqual([...items, 'Simulador externo']);
        await expect(menu(page)).toContainText(`${usuario} · ${rol}`);
      });
    }
  });

  test('[CU-01 normal][RNF-09] en el celular el menú es una barra inferior con los ítems del rol', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    expect(await itemsDelMenu(page)).toEqual(['Usuarios', 'Revisar', 'Auditoría', 'Dashboard', 'Tormenta', 'Perfil']);
    const caja = (await menu(page).boundingBox())!;
    expect(caja.y).toBeGreaterThan(500); // abajo de la pantalla
  });

  test('[HU-01 c2][RF-50][CU-01 2.1] con contraseña incorrecta se rechaza con un mensaje genérico', async ({ page }) => {
    await ingresar(page, 'mrossi0', 'Incorrecta1!');
    await expect(page.getByRole('alert')).toContainText(GENERICO);
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('');
  });

  test('[HU-01 c3][RF-50] un usuario que no existe en la base local (nmedina0) recibe el mismo mensaje genérico', async ({ page }) => {
    await ingresar(page, 'nmedina0'); // existe en la Autenticación Institucional pero no en el sistema
    await expect(page.getByRole('alert')).toContainText(GENERICO);
    await expect(menu(page)).toHaveCount(0);
  });

  test('[CU-01 3.1][RF-50] un usuario no vigente en la institución (jdiaz0) recibe el mismo mensaje genérico', async ({ page }) => {
    await ingresar(page, 'jdiaz0');
    await expect(page.getByRole('alert')).toContainText(GENERICO);
    await expect(menu(page)).toHaveCount(0);
  });

  test('[RF-50][HU-01 c2][HU-01 c3][CU-01 3.1] contraseña incorrecta, usuario sin cuenta y usuario no vigente muestran exactamente el mismo texto', async ({ page }) => {
    const textos: string[] = [];
    for (const [usuario, contrasena] of [['mrossi0', 'Incorrecta1!'], ['nmedina0', CONTRASENA], ['jdiaz0', CONTRASENA]]) {
      await ingresar(page, usuario, contrasena);
      textos.push((await page.getByRole('alert').innerText()).trim());
    }
    expect(new Set(textos).size).toBe(1);
    expect(textos[0]).toContain(GENERICO);
  });

  test('[HU-01 c4][CU-01 E2][RF-04] a los 30 minutos sin actividad la sesión se cierra y se avisa', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.evaluate(() => localStorage.setItem('arbolado.actividad', String(Date.now() - 31 * 60_000)));
    await expect(page.getByText('Tu sesión se cerró por inactividad').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Usuario')).toBeVisible(); // solicita un nuevo ingreso
    await expect(menu(page)).toHaveCount(0);
  });

  test('[CU-01 E1][RF-50][RF-52] si la Autenticación Institucional no responde, el mensaje es distinto del genérico y no cuenta como intento fallido', async ({ page, browser }) => {
    const { context, page: otro } = await otraSesion(browser);
    await ingresarYEsperar(otro, 'asuarez0');
    await interruptor(otro, 'autenticacion_caida', true);
    try {
      // Más de 5 intentos: si contaran como fallidos, el captor quedaría bloqueado (RF-52).
      for (let i = 0; i < 6; i++) {
        await ingresar(page, 'mrossi0');
        await expect(page.getByRole('alert')).toContainText(SERVICIO_CAIDO);
        await expect(page.getByRole('alert')).not.toContainText(GENERICO);
      }
      await interruptor(otro, 'autenticacion_caida', false);
      await ingresarYEsperar(page, 'mrossi0'); // el captor no quedó bloqueado
    } finally {
      await interruptor(otro, 'autenticacion_caida', false).catch(() => undefined);
      await context.close();
    }
  });

  test('[WF-01] la pantalla de ingreso tiene la marca, los dos campos, el botón y el pie del wireframe', async ({ page }) => {
    await page.goto('/');
    const titulo = page.getByRole('heading', { name: 'Dictaminación Técnica' });
    const subtitulo = page.getByText('Arbolado Público', { exact: true });
    const usuario = page.getByLabel('Usuario');
    const contrasena = page.getByLabel('Contraseña', { exact: true });
    const ojo = page.getByRole('button', { name: 'Mostrar contraseña' });
    const boton = page.getByRole('button', { name: 'Ingresar' });
    const pie = page.getByText(/Centro de Informática Local \(CIL\)/);
    await expect(page.locator('.logo img, .marca-ingreso img').first()).toBeVisible(); // logo
    await expect(usuario).toHaveAttribute('placeholder', 'nombre.apellido');
    await expect(contrasena).toHaveAttribute('type', 'password');
    await expect(pie).toContainText('Parques y Paseos — Dirección Técnica');
    await enOrden([titulo, subtitulo, usuario, contrasena, boton, pie]);
    // "campos obligatorios antes de habilitar el botón"
    await expect(boton).toBeDisabled();
    await usuario.fill('mrossi0');
    await expect(boton).toBeDisabled();
    await contrasena.fill('x');
    await expect(boton).toBeEnabled();
    // ícono para mostrar y ocultar la contraseña
    await ojo.click();
    await expect(contrasena).toHaveAttribute('type', 'text');
    await expect(page.getByRole('button', { name: 'Ocultar contraseña' })).toBeVisible();
    await page.screenshot({ path: 'resultados/capturas/wf-01.png', fullPage: true });
    // estado con el error genérico (el que dibuja el wireframe)
    await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
    await boton.click();
    const error = page.getByRole('alert');
    await expect(error).toHaveText(`⚠ ${GENERICO}`);
    await enOrden([contrasena, error, boton]);
    await page.screenshot({ path: 'resultados/capturas/wf-01-error.png', fullPage: true });
  });
});

// ═══ HU-02 · CU-02 · Gestión de usuarios y roles ════════════════════════════════════════════════

test.describe('Gestión de usuarios', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
  });

  test('[HU-02 c1][CU-02 normal][CU-02 4.1][RF-06] el Administrador da de alta un usuario con nombre y apellido, rol y contraseña válida, y el nuevo usuario ingresa (una vez dado de alta en la Autenticación Institucional simulada)', async ({ page, browser }) => {
    const alta = await abrirAlta(page);
    await expect(alta.getByLabel('Usuario (autogenerado)')).toHaveValue('');
    await llenarAlta(alta, { nombre: 'Ana', apellido: 'Torres', contrasena: 'Clave2026!', rol: 'Jefe' });
    const generado = alta.getByLabel('Usuario (autogenerado)');
    await expect(generado).toHaveValue('atorres0'); // inicial + apellido + número desde 0 (RF-22) + número desde 0
    await expect(generado).toHaveJSProperty('readOnly', true); // de solo lectura: no se tipea
    await alta.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText(/Usuario creado: atorres0 \(Jefe\)/)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Nuevo usuario' })).toHaveCount(0);
    // CU-02 4: el usuario queda en el listado, con su rol
    const tarjeta = page.getByRole('button', { name: 'Abrir ficha de atorres0' });
    await expect(tarjeta).toBeVisible();
    await expect(tarjeta).toContainText('Jefe');
    // y con ese rol puede ingresar (la Autenticación Institucional, externa, tiene que conocerlo: se lo da de alta en el simulador)
    await exigirOk(await accesoApi('asuarez0'), 'POST', '/simulador/institucional', { nombreUsuario: 'atorres0', nombreCompleto: 'Ana Torres', vigente: true });
    const { context, page: nuevo } = await otraSesion(browser);
    await ingresar(nuevo, 'atorres0', 'Clave2026!');
    await expect(menu(nuevo)).toBeVisible();
    expect(await itemsDelMenu(nuevo)).toContain('Dashboard'); // menú de Jefe
    expect(await itemsDelMenu(nuevo)).not.toContain('Usuarios');
    await context.close();
  });

  test('[HU-02 c2][CU-02 3.1][RF-07] la contraseña se valida en vivo, indica qué requisito falta y no deja crear hasta cumplirlos', async ({ page }) => {
    const alta = await abrirAlta(page);
    await llenarAlta(alta, { nombre: 'Ana', apellido: 'Torres', contrasena: '' });
    const crear = alta.getByRole('button', { name: 'Crear usuario' });
    // el texto de ayuda está siempre visible, aun con el campo vacío
    await expect(alta.getByText('Mín. 8 car., mayúscula, minúscula, número y carácter especial')).toBeVisible();
    await expect(crear).toBeDisabled();
    const clave = alta.getByLabel('Contraseña', { exact: true });
    await clave.fill('abc');
    for (const falta of ['Mínimo 8 caracteres', 'Una mayúscula', 'Un número', 'Un carácter especial']) await expect(alta.getByText(`✗ ${falta}`)).toBeVisible();
    await expect(alta.getByText('✓ Una minúscula')).toBeVisible();
    await expect(crear).toBeDisabled();
    await clave.fill('Abcdefgh1'); // falta el especial
    await expect(alta.getByText('✗ Un carácter especial')).toBeVisible();
    await expect(alta.getByText('✓ Una mayúscula')).toBeVisible();
    await expect(crear).toBeDisabled();
    await clave.fill('abcdefg1!'); // falta la mayúscula
    await expect(alta.getByText('✗ Una mayúscula')).toBeVisible();
    await expect(crear).toBeDisabled();
    await clave.fill('Abcdef1!'); // 8 caracteres, cumple todo
    for (const regla of ['Mínimo 8 caracteres', 'Una mayúscula', 'Una minúscula', 'Un número', 'Un carácter especial']) await expect(alta.getByText(`✓ ${regla}`)).toBeVisible();
    await expect(crear).toBeEnabled();
    await clave.fill('Abcde1!'); // 7 caracteres
    await expect(alta.getByText('✗ Mínimo 8 caracteres')).toBeVisible();
    await expect(crear).toBeDisabled();
  });

  test('[HU-02 c2][CU-02 3.1][RF-07] el servidor también rechaza una contraseña débil e indica qué requisito falta', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('arbolado.sesion') ?? 'null');
      const res = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.acceso}` }, body: JSON.stringify({ nombre: 'Ana', apellido: 'Torres', contrasena: 'abc', rol: 'Operador' }) });
      return { estado: res.status, texto: await res.text() };
    });
    expect(r.estado).toBe(422);
    expect(r.texto).toMatch(/mayúscula/i);
    // y no se creó
    await page.goto('/usuarios');
    await expect(page.getByRole('button', { name: 'Abrir ficha de atorres0' })).toHaveCount(0);
  });

  test('[CU-02 E1] si el identificador generado ya existe se le agrega un número incremental', async ({ page }) => {
    for (const esperado of ['atorres0', 'atorres1', 'atorres2']) {
      const alta = await abrirAlta(page);
      await llenarAlta(alta, { nombre: 'Ana', apellido: 'Torres', contrasena: 'Clave2026!' });
      await expect(alta.getByLabel('Usuario (autogenerado)')).toHaveValue(esperado);
      await alta.getByRole('button', { name: 'Crear usuario' }).click();
      await expect(page.getByRole('button', { name: `Abrir ficha de ${esperado}` })).toBeVisible();
    }
  });

  test('[HU-02 c1][CU-02 normal][RF-06] el Administrador cambia el rol de un usuario', async ({ page, browser }) => {
    await page.goto('/usuarios');
    const ficha = await fichaDe(page, 'mrossi0');
    await expect(ficha).toContainText('Operador');
    const confirmar = ficha.getByRole('button', { name: 'Confirmar cambio' });
    await expect(confirmar).toBeDisabled(); // sin cambio no hay nada que confirmar
    await ficha.getByLabel('Rol').selectOption('Jefe');
    await confirmar.click();
    await expect(page.getByText(/Se cambió el rol de mrossi0 a Jefe/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir ficha de mrossi0' })).toContainText('Jefe');
    const { context, page: otro } = await otraSesion(browser);
    await ingresarYEsperar(otro, 'mrossi0');
    expect(await itemsDelMenu(otro)).toContain('Dashboard'); // ahora ve el menú de Jefe
    await context.close();
  });

  test('[HU-02 c3][CU-02 E2][RF-08] restablecer la contraseña muestra la temporal una sola vez, deja sin efecto la anterior y con la nueva se ingresa', async ({ page, browser }) => {
    await page.goto('/usuarios');
    const ficha = await fichaDe(page, 'cbenite0');
    await ficha.getByRole('button', { name: 'Restablecer contraseña' }).click();
    const confirmacion = page.getByRole('dialog', { name: '¿Restablecer la contraseña?' });
    await expect(confirmacion).toContainText('se muestra una sola vez');
    await confirmacion.getByRole('button', { name: 'Restablecer', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Contraseña temporal' });
    const temporal = (await modal.locator('.contrasena-temporal').innerText()).trim();
    expect(temporal.length).toBeGreaterThanOrEqual(8);
    expect(temporal).not.toBe(CONTRASENA);
    await expect(modal).toContainText('se muestra una sola vez');
    await modal.getByRole('button', { name: 'Ya la anoté' }).click();
    // una sola vez: ya no figura en ningún lado
    await expect(page.getByText(temporal)).toHaveCount(0);
    await (await fichaDe(page, 'cbenite0')).waitFor();
    await expect(page.getByText(temporal)).toHaveCount(0);
    // la anterior quedó sin efecto y la temporal funciona
    const { context, page: otro } = await otraSesion(browser);
    await ingresar(otro, 'cbenite0', CONTRASENA);
    await expect(otro.getByRole('alert')).toContainText(GENERICO);
    await ingresar(otro, 'cbenite0', temporal);
    await expect(menu(otro)).toBeVisible();
    await context.close();
  });

  test('[HU-02 c4][CU-02 E3] al dar de baja un usuario, no puede ingresar y el que tenía sesión no puede seguir operando', async ({ page, browser }) => {
    const { context, page: otro } = await otraSesion(browser);
    await ingresarYEsperar(otro, 'lfernan0'); // con sesión activa
    await page.goto('/usuarios');
    const ficha = await fichaDe(page, 'lfernan0');
    await ficha.getByRole('button', { name: 'Dar de baja' }).click();
    const confirmacion = page.getByRole('dialog', { name: '¿Dar de baja al usuario?' });
    await expect(confirmacion).toContainText('Queda registrado en Auditoría');
    await confirmacion.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByText(/lfernan0 quedó dado de baja/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir ficha de lfernan0' })).toContainText('Inactivo');
    // la sesión que estaba abierta no puede continuar
    await otro.goto('/solicitudes');
    await expect(otro.getByLabel('Usuario')).toBeVisible();
    await expect(menu(otro)).toHaveCount(0);
    // y el siguiente ingreso se niega
    await ingresar(otro, 'lfernan0');
    await expect(otro.getByRole('alert')).toBeVisible();
    await expect(menu(otro)).toHaveCount(0);
    // un usuario dado de baja no tiene acciones
    await expect((await fichaDe(page, 'lfernan0')).getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
    await context.close();
  });

  test('[CU-02 E4][RF-52][RF-54] el Administrador revoca el captor de un usuario por pérdida o robo y queda auditado', async ({ page }) => {
    await page.goto('/usuarios');
    const ficha = await fichaDe(page, 'lfernan0');
    await expect(ficha).toContainText('M5HW-2PZA');
    await ficha.getByRole('button', { name: 'Revocar captor por pérdida o robo' }).click();
    const confirmacion = page.getByRole('dialog', { name: '¿Revocar el captor?' });
    await expect(confirmacion).toContainText('no se puede deshacer');
    await confirmacion.getByRole('button', { name: 'Revocar captor' }).click();
    await expect(page.getByText(/Se revocó el captor M5HW-2PZA de lfernan0/)).toBeVisible();
    await page.goto('/auditoria');
    await expect(eventosDeAuditoria(page)).toHaveCount(1);
    await expect(eventosDeAuditoria(page).first()).toContainText('Revocación de captor');
    await expect(eventosDeAuditoria(page).first()).toContainText('lfernan0');
  });

  test('[HU-02 c5][RF-54][CU-02 4.1] el alta, el cambio de rol y la baja quedan en Auditoría con quién, qué y cuándo, sin poder editarse', async ({ page }) => {
    const alta = await abrirAlta(page);
    await llenarAlta(alta, { nombre: 'Ana', apellido: 'Torres', contrasena: 'Clave2026!' });
    await alta.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText(/Usuario creado: atorres0/)).toBeVisible();
    let ficha = await fichaDe(page, 'atorres0');
    await ficha.getByLabel('Rol').selectOption('Lector');
    await ficha.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(page.getByText(/Se cambió el rol de atorres0 a Lector/)).toBeVisible();
    ficha = await fichaDe(page, 'atorres0');
    await ficha.getByRole('button', { name: 'Dar de baja' }).click();
    await page.getByRole('dialog', { name: '¿Dar de baja al usuario?' }).getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByText(/atorres0 quedó dado de baja/)).toBeVisible();

    await page.goto('/auditoria');
    const eventos = eventosDeAuditoria(page);
    await expect(eventos).toHaveCount(3);
    // más reciente primero: baja, cambio de rol, alta
    await expect(eventos.nth(0)).toContainText('Baja de usuario');
    await expect(eventos.nth(1)).toContainText('Cambio de rol');
    await expect(eventos.nth(2)).toContainText('Alta de usuario');
    for (let i = 0; i < 3; i++) {
      await expect(eventos.nth(i)).toContainText('asuarez0'); // quién
      await expect(eventos.nth(i)).toContainText('afectado: atorres0');
      await expect(eventos.nth(i)).toContainText(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/); // cuándo
    }
    await expect(botonesDeEdicion(page)).toHaveCount(0);
  });

  test('[WF-07] Gestión de usuarios: encabezado, + Nuevo, buscador, tarjetas con rol y estado, y el modal de alta', async ({ page }) => {
    await page.goto('/usuarios');
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
    const nuevo = page.getByRole('button', { name: '+ Nuevo' });
    const buscador = page.getByPlaceholder('Buscar usuario…');
    await enOrden([page.getByRole('heading', { name: 'Usuarios' }), buscador, page.getByRole('button', { name: 'Abrir ficha de mrossi0' })]);
    await enOrden([page.getByRole('heading', { name: 'Usuarios' }), nuevo], 'x');
    for (const [u, rol] of [['mrossi0', 'Operador'], ['pgimene0', 'Jefe'], ['asuarez0', 'Administrador'], ['tmolina0', 'Lector']]) {
      const t = page.getByRole('button', { name: `Abrir ficha de ${u}` });
      await expect(t).toContainText(u);
      await expect(t).toContainText(rol);
    }
    await expect(page.locator('.tarjeta')).toHaveCount(7);
    // el buscador filtra el listado
    await buscador.fill('rossi');
    await expect(page.locator('.tarjeta')).toHaveCount(1);
    await buscador.fill('');
    // el estado inactivo se rotula con texto (no solo color): se prueba dando de baja a jdiaz0 antes de mirar
    await page.screenshot({ path: 'resultados/capturas/wf-07.png', fullPage: true });

    const alta = await (async () => {
      await nuevo.click();
      return page.getByRole('dialog', { name: 'Nuevo usuario' });
    })();
    await expect(alta.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();
    const generado = alta.getByLabel('Usuario (autogenerado)');
    const clave = alta.getByLabel('Contraseña', { exact: true });
    const rol = alta.getByLabel('Rol', { exact: true });
    const cancelar = alta.getByRole('button', { name: 'Cancelar' });
    const crear = alta.getByRole('button', { name: 'Crear usuario' });
    await expect(generado).toHaveAttribute('placeholder', /inicial \+ apellido/);
    await expect(alta.getByText('Mín. 8 car., mayúscula, minúscula, número y carácter especial')).toBeVisible();
    await expect(rol).toHaveValue('Operador'); // valor por defecto del wireframe
    expect(await rol.locator('option').allTextContents()).toEqual(['Administrador', 'Jefe', 'Operador', 'Lector']);
    await enOrden([generado, clave, rol, crear]);
    await enOrden([cancelar, crear], 'x');
    await page.screenshot({ path: 'resultados/capturas/wf-07-modal.png', fullPage: true });
    await cancelar.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // inactivo con texto, como la tarjeta "Inactivo" del wireframe
    const ficha = await fichaDe(page, 'tmolina0');
    await ficha.getByRole('button', { name: 'Dar de baja' }).click();
    await page.getByRole('dialog', { name: '¿Dar de baja al usuario?' }).getByRole('button', { name: 'Dar de baja' }).click();
    await expect(page.getByRole('button', { name: 'Abrir ficha de tmolina0' })).toContainText('Inactivo');
  });
});

// ═══ HU-18 · CU-16 · Captores bloqueados ════════════════════════════════════════════════════════

test.describe('Captores bloqueados', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
  });

  test('[HU-18 c2][CU-16 normal][RF-60] el Administrador busca el código, ve el captor y lo desbloquea con confirmación', async ({ page }) => {
    await page.goto('/usuarios');
    await page.getByRole('link', { name: 'Captores bloqueados' }).click();
    await expect(page.getByRole('heading', { name: 'Captores bloqueados' })).toBeVisible();
    // CU-16 1: ingresa el código y el sistema muestra el captor, el usuario y la fecha del bloqueo
    await page.getByLabel('Código del dispositivo').fill('K7M2-X9QD');
    const tarjeta = page.locator('.tarjeta', { hasText: 'K7M2-X9QD' });
    await expect(tarjeta).toHaveCount(1);
    await expect(tarjeta).toContainText('Bloqueado');
    await expect(tarjeta).toContainText('mrossi0');
    await expect(tarjeta).toContainText('12/10/2026 · 08:15');
    await expect(tarjeta).toContainText('5 intentos de ingreso fallidos');
    // CU-16 2: confirma y queda registrado
    await tarjeta.getByRole('button', { name: 'Desbloquear' }).click();
    const modal = page.getByRole('dialog', { name: '¿Desbloquear este captor?' });
    await expect(modal).toContainText('K7M2-X9QD · mrossi0');
    await expect(modal).toContainText('El ingeniero podrá volver a ingresar cuando el captor tenga conexión.');
    await expect(modal).toContainText('Queda registrado en Auditoría');
    await modal.getByRole('button', { name: 'Desbloquear' }).click();
    await expect(page.getByText(/Se desbloqueó el captor K7M2-X9QD/)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // [HU-18 c4] el desbloqueo queda en Auditoría: quién y qué captor
    await page.goto('/auditoria');
    await expect(eventosDeAuditoria(page)).toHaveCount(1);
    await expect(eventosDeAuditoria(page).first()).toContainText('Desbloqueo de captor');
    await expect(eventosDeAuditoria(page).first()).toContainText('asuarez0');
    await expect(eventosDeAuditoria(page).first()).toContainText('K7M2-X9QD');
  });

  test('[HU-18 c2] sin escribir un código se listan los captores bloqueados', async ({ page }) => {
    await page.goto('/usuarios/captores');
    await expect(page.locator('.tarjeta')).toHaveCount(1);
    await expect(page.locator('.tarjeta')).toContainText('K7M2-X9QD');
  });

  test('[CU-16 E1] un código que no corresponde a ningún captor bloqueado se informa y permite corregirlo', async ({ page }) => {
    await page.goto('/usuarios/captores');
    const campo = page.getByLabel('Código del dispositivo');
    await campo.fill('ZZZZ-0000');
    await expect(page.getByText('No se encontró un captor bloqueado con ese código')).toBeVisible();
    await expect(campo).toBeEditable();
    await campo.fill('K7M2-X9QD');
    await expect(page.locator('.tarjeta', { hasText: 'K7M2-X9QD' })).toBeVisible();
    await expect(page.getByText('No se encontró un captor bloqueado')).toHaveCount(0);
  });

  test('[CU-16 E2][RF-52] el captor revocado (R3TB-44LN) no se puede desbloquear: se indica que fue revocado', async ({ page }) => {
    await page.goto('/usuarios/captores');
    await page.getByLabel('Código del dispositivo').fill('R3TB-44LN');
    const tarjeta = page.locator('.tarjeta', { hasText: 'R3TB-44LN' });
    await expect(tarjeta).toContainText('Revocado');
    await expect(tarjeta).toContainText('Revocado por pérdida o robo: no se puede desbloquear');
    await expect(tarjeta.getByRole('button', { name: 'Desbloquear' })).toHaveCount(0);
    // ni siquiera por la API
    const r = await apiDePagina(page, 'POST', '/captores-admin/R3TB-44LN/desbloquear');
    expect(r.estado).toBeGreaterThanOrEqual(400);
    await page.goto('/auditoria');
    await expect(page.getByText('No hay eventos para este filtro')).toBeVisible(); // no se registró nada
  });

  test('[WF-07b] Captores bloqueados: encabezado con volver, búsqueda por código, tarjetas con insignia y datos, y la confirmación', async ({ page }) => {
    await page.goto('/usuarios/captores');
    await expect(page.getByRole('heading', { name: 'Captores bloqueados' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver' })).toBeVisible();
    const campo = page.getByLabel('Código del dispositivo');
    await expect(campo).toHaveAttribute('placeholder', 'Código del dispositivo: K7M2-X9QD');
    await campo.fill('-'); // trae el bloqueado y el revocado, como el wireframe
    const bloqueado = page.locator('.tarjeta', { hasText: 'K7M2-X9QD' });
    const revocado = page.locator('.tarjeta', { hasText: 'R3TB-44LN' });
    await expect(bloqueado).toContainText('Bloqueado');
    await expect(bloqueado).toContainText('Usuario: mrossi0');
    await expect(bloqueado).toContainText('Motivo: 5 intentos de ingreso fallidos');
    await expect(bloqueado.getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    await expect(revocado).toContainText('Revocado');
    await expect(revocado).toContainText('Revocado por pérdida o robo: no se puede desbloquear');
    // Diferencia con el wireframe: el revocado (sin fecha de bloqueo) sale ARRIBA del bloqueado; el dibujo los muestra al revés.
    await enOrden([campo, bloqueado]);
    await expect(revocado).toBeVisible();
    await page.screenshot({ path: 'resultados/capturas/wf-07b.png', fullPage: true });
    await bloqueado.getByRole('button', { name: 'Desbloquear' }).click();
    const modal = page.getByRole('dialog', { name: '¿Desbloquear este captor?' });
    const cancelar = modal.getByRole('button', { name: 'Cancelar' });
    const confirmar = modal.getByRole('button', { name: 'Desbloquear' });
    await enOrden([modal.getByRole('heading'), modal.getByText('K7M2-X9QD · mrossi0'), modal.getByText(/podrá volver a ingresar/), modal.getByText(/Queda registrado en Auditoría/), cancelar]);
    await enOrden([cancelar, confirmar], 'x');
    await page.screenshot({ path: 'resultados/capturas/wf-07b-modal.png', fullPage: true });
    await cancelar.click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(bloqueado).toBeVisible(); // cancelar no desbloquea
  });
});

// ═══ HU-13 · CU-13 · Auditoría ══════════════════════════════════════════════════════════════════

test.describe('Auditoría', () => {
  test('[HU-13 c1][CU-13 normal][RF-54] cada evento muestra el usuario, la acción y la fecha y hora, los más recientes primero', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    const eventos = eventosDeAuditoria(page);
    await expect(eventos).toHaveCount(5);
    await expect(page.getByText('Mostrando 1-5 de 5 eventos · más recientes primero')).toBeVisible();
    const esperados = [
      ['pgimene0', 'Desbloqueo de captor', 'K7M2-X9QD'],
      ['pgimene0', 'Baja de usuario', 'lfernan0'],
      ['pgimene0', 'Revocación de captor', 'M5HW-2PZA (lfernan0)'],
      ['asuarez0', 'Cambio de rol', 'pgimene0'],
      ['asuarez0', 'Alta de usuario', 'atorres0'],
    ];
    for (const [i, [quien, accion, afectado]] of esperados.entries()) {
      await expect(eventos.nth(i)).toContainText(quien);
      await expect(eventos.nth(i)).toContainText(accion);
      await expect(eventos.nth(i)).toContainText(`afectado: ${afectado}`);
      await expect(eventos.nth(i)).toContainText(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}/);
    }
  });

  test('[HU-13 c1][CU-13 normal] con más de 20 eventos se pagina de a 20', async ({ page }) => {
    await sembrarAuditoria(17); // 22 eventos
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    await expect(page.getByText('Mostrando 1-20 de 22 eventos · más recientes primero')).toBeVisible();
    await expect(eventosDeAuditoria(page)).toHaveCount(20);
    await page.getByRole('navigation', { name: 'Páginas' }).getByRole('button', { name: 'Página siguiente' }).click();
    await expect(page.getByText('Mostrando 21-22 de 22 eventos · más recientes primero')).toBeVisible();
    await expect(eventosDeAuditoria(page)).toHaveCount(2);
  });

  test('[HU-13 c2][CU-13 normal][RF-55] se filtra por usuario, por tipo de acción y por rango de fechas', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    const eventos = eventosDeAuditoria(page);
    await expect(eventos).toHaveCount(5);
    // por usuario
    await page.getByLabel('Usuario').fill('pgimene0');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eventos).toHaveCount(3);
    await expect(page.getByText('Mostrando 1-3 de 3 eventos')).toBeVisible();
    for (const t of await eventos.allInnerTexts()) expect(t).toContain('pgimene0');
    // por tipo de acción (se combina con el usuario)
    await page.getByLabel('Tipo de acción').selectOption('Baja de usuario');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eventos).toHaveCount(1);
    await expect(eventos.first()).toContainText('Baja de usuario');
    // sin usuario, solo por tipo
    await page.getByLabel('Usuario').fill('');
    await page.getByLabel('Tipo de acción').selectOption('Alta de usuario');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eventos).toHaveCount(1);
    await expect(eventos.first()).toContainText('afectado: atorres0');
    // por rango de fechas: hoy trae todo; desde mañana, nada; hasta ayer, nada
    await page.getByLabel('Tipo de acción').selectOption('');
    await page.getByLabel('Desde').fill(hoy());
    await page.getByLabel('Hasta').fill(hoy());
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eventos).toHaveCount(5);
    await page.getByLabel('Desde').fill(enDias(1));
    await page.getByLabel('Hasta').fill(enDias(2));
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText('No hay eventos para este filtro')).toBeVisible();
    await page.getByLabel('Desde').fill(enDias(-5));
    await page.getByLabel('Hasta').fill(enDias(-1));
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText('No hay eventos para este filtro')).toBeVisible();
  });

  test('[CU-13 E1] si ningún evento cumple el filtro se muestra el listado vacío con un mensaje', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    await page.getByLabel('Usuario').fill('nadie');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText('No hay eventos para este filtro')).toBeVisible();
    await expect(eventosDeAuditoria(page)).toHaveCount(0);
    // sin eventos en el sistema ocurre lo mismo (la base de prueba no precarga auditoría)
  });

  test('[CU-13 E2] con el rango invertido no se aplica el filtro, se conserva el listado y se avisa', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    await expect(eventosDeAuditoria(page)).toHaveCount(5);
    await page.getByLabel('Usuario').fill('pgimene0');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(eventosDeAuditoria(page)).toHaveCount(3);
    await page.getByLabel('Desde').fill('2026-10-10');
    await page.getByLabel('Hasta').fill('2026-10-01');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/El rango de fechas es inválido/)).toBeVisible();
    await expect(eventosDeAuditoria(page)).toHaveCount(3); // conserva el listado anterior (el último filtro aplicado)
    await expect(page.getByText('Mostrando 1-3 de 3 eventos')).toBeVisible();
    // corrige el rango y el aviso desaparece
    await page.getByLabel('Hasta').fill('2026-12-31');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByText(/El rango de fechas es inválido/)).toHaveCount(0);
  });

  test('[CU-13 E3] si el registro no se puede leer se informa y se puede reintentar, sin datos parciales', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.route('**/api/auditoria*', (r) => r.abort());
    await page.goto('/auditoria');
    await expect(page.getByText('No se pudo cargar')).toBeVisible();
    await expect(eventosDeAuditoria(page)).toHaveCount(0);
    await page.unroute('**/api/auditoria*');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(eventosDeAuditoria(page)).toHaveCount(5);
  });

  test('[HU-13 c3][RF-54] no hay ninguna opción para editar o eliminar un evento, y la API tampoco las ofrece', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    await expect(eventosDeAuditoria(page)).toHaveCount(5);
    await expect(botonesDeEdicion(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: /editar|eliminar|borrar/i })).toHaveCount(0);
    await expect(page.getByText('Registro inmutable: ningún evento de esta lista puede editarse ni eliminarse desde la aplicación (RF-54).')).toBeVisible();
    // tocar un evento no abre ninguna edición
    await eventosDeAuditoria(page).first().click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const metodo of ['PUT', 'PATCH', 'DELETE']) {
      for (const ruta of ['/auditoria', '/auditoria/1']) {
        const r = await apiDePagina(page, metodo, ruta);
        expect(r.estado, `${metodo} ${ruta}`).toBeGreaterThanOrEqual(400);
      }
    }
    await page.reload();
    await expect(eventosDeAuditoria(page)).toHaveCount(5);
  });

  test('[WF-09] Auditoría: encabezado, barra de filtros, tarjetas con insignia por tipo, aviso de registro inmutable', async ({ page }) => {
    await sembrarAuditoria(17);
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    const titulo = page.getByRole('heading', { name: 'Auditoría' });
    const barra = page.getByRole('button', { name: /Filtros .*\(usuario, acción, rango de fechas\)/ });
    const resumen = page.getByText(/Mostrando 1-20 de 22 eventos · más recientes primero/);
    const primera = eventosDeAuditoria(page).first();
    const inmutable = page.getByText(/Registro inmutable/);
    const paginacion = page.getByRole('navigation', { name: 'Páginas' });
    await expect(barra).toHaveAttribute('aria-expanded', 'true');
    for (const campo of ['Usuario', 'Tipo de acción', 'Desde', 'Hasta']) await expect(page.getByLabel(campo)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aplicar' })).toBeVisible();
    // Como el wireframe 09: el aviso de registro inmutable va antes de la paginación "‹ Página 1 de 2 ›".
    await enOrden([titulo, barra, page.getByLabel('Usuario'), resumen, primera, inmutable, paginacion]);
    // la insignia lleva el texto de la acción
    await expect(primera.locator('.etiqueta')).toHaveText('Cambio de rol');
    await expect(paginacion).toContainText('Página 1 de 2');
    expect(await page.getByLabel('Tipo de acción').locator('option').allTextContents()).toEqual(
      expect.arrayContaining(['Todas', 'Alta de usuario', 'Baja de usuario', 'Cambio de rol', 'Desbloqueo de captor', 'Revocación de captor']),
    );
    await page.screenshot({ path: 'resultados/capturas/wf-09.png', fullPage: true });
    // la barra de filtros es colapsable
    await barra.click();
    await expect(barra).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Tipo de acción')).toHaveCount(0);
    await page.screenshot({ path: 'resultados/capturas/wf-09-colapsado.png', fullPage: true });
  });
});

// ═══ HU-16 · CU-14 · Para revisar ═══════════════════════════════════════════════════════════════

test.describe('Para revisar', () => {
  test.beforeEach(async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/para-revisar');
  });
  const casos = (page: Page) => page.locator('.tarjeta.caso');

  test('[HU-16 c1][CU-14 normal][RF-58] cada caso muestra tipo, solicitud afectada, fecha y motivo, los más recientes primero', async ({ page }) => {
    await expect(casos(page)).toHaveCount(2);
    await expect(page.getByText('Mostrando 2 casos · más recientes primero')).toBeVisible();
    const integridad = casos(page).nth(0);
    const invalidos = casos(page).nth(1);
    await expect(integridad).toContainText('Integridad no verificada');
    await expect(integridad).toContainText('SUA 48070-2026');
    await expect(integridad).toContainText('11/10/2026 · 16:40');
    await expect(integridad).toContainText('Motivo: El hash recalculado no coincide con el de la firma');
    await expect(invalidos).toContainText('Datos inválidos del SUA');
    await expect(invalidos).toContainText('SUA 5521-2026');
    await expect(invalidos).toContainText('11/10/2026 · 09:12');
    await expect(invalidos).toContainText('Motivo: El campo distrito');
  });

  test('[HU-16 c3][CU-14 normal] un registro del SUA con datos inválidos aparece como "datos inválidos del SUA", y se puede filtrar por tipo', async ({ page }) => {
    await page.getByLabel('Tipo:').selectOption({ label: 'Datos inválidos del SUA' });
    await expect(casos(page)).toHaveCount(1);
    await expect(casos(page).first()).toContainText('Datos inválidos del SUA');
    await expect(casos(page).first()).toContainText('SUA 5521-2026');
    await expect(casos(page).first()).toContainText('distrito');
    await expect(casos(page).first()).toContainText('no se guardó la solicitud');
    await page.getByLabel('Tipo:').selectOption({ label: 'Integridad no verificada' });
    await expect(casos(page)).toHaveCount(1);
    await expect(casos(page).first()).toContainText('SUA 48070-2026');
    await expect(casos(page).first()).toContainText('no se dio por sincronizado');
    await page.getByLabel('Tipo:').selectOption({ label: 'Todos' });
    await expect(casos(page)).toHaveCount(2);
  });

  test('[CU-14 2] al abrir un caso se despliega su detalle de solo lectura', async ({ page }) => {
    const caso = casos(page).first();
    await caso.click();
    await expect(caso).toHaveAttribute('aria-expanded', 'true');
    for (const rotulo of ['Tipo:', 'Solicitud:', 'Dictamen:', 'Detectado:', 'Motivo:', 'Estado:']) await expect(caso.locator('.detalle')).toContainText(rotulo);
    await expect(caso.locator('.detalle')).toContainText('Integridad no verificada');
    await expect(caso.locator('.detalle')).toContainText('SUA 48070-2026');
    await expect(caso.locator('.detalle').locator('button, input, select, textarea, a')).toHaveCount(0); // sin edición
    await caso.click(); // vuelve a plegarse
    await expect(caso.locator('.detalle')).toHaveCount(0);
    await expect(casos(page)).toHaveCount(2);
  });

  test('[HU-16 c4][RF-58] la pantalla es de solo consulta: no ofrece editar ni descartar casos', async ({ page }) => {
    await expect(page.getByText('Solo consulta: desde esta pantalla no se puede editar ni descartar casos (RF-58).')).toBeVisible();
    await expect(botonesDeEdicion(page)).toHaveCount(0);
    await casos(page).first().click();
    await expect(botonesDeEdicion(page)).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(2); // solo las dos tarjetas que se despliegan
    for (const metodo of ['PUT', 'PATCH', 'DELETE']) {
      const r = await apiDePagina(page, metodo, '/revision/1');
      expect(r.estado, metodo).toBeGreaterThanOrEqual(400);
    }
    await page.reload();
    await expect(casos(page)).toHaveCount(2);
  });

  test('[CU-14 E1] sin casos se muestra el listado vacío con "No hay casos para revisar" (respuesta de la API simulada: los datos de prueba siempre traen 2 casos)', async ({ page }) => {
    await page.route('**/api/revision*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ casos: [] }) }));
    await page.reload();
    await expect(page.getByText('No hay casos para revisar')).toBeVisible();
    await expect(casos(page)).toHaveCount(0);
  });

  test('[CU-14 E2] si el listado no se puede leer se informa, se puede reintentar y no se muestran datos parciales', async ({ page }) => {
    await page.route('**/api/revision*', (r) => r.abort());
    await page.reload();
    await expect(page.getByText('No se pudo cargar')).toBeVisible();
    await expect(casos(page)).toHaveCount(0);
    await page.unroute('**/api/revision*');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(casos(page)).toHaveCount(2);
  });

  test('[WF-10] Para revisar: encabezado, filtro de tipo, resumen, tarjetas con insignia y aviso de solo consulta', async ({ page }) => {
    const titulo = page.getByRole('heading', { name: 'Para revisar' });
    const filtro = page.getByLabel('Tipo:');
    const resumen = page.getByText('Mostrando 2 casos · más recientes primero');
    const aviso = page.getByText(/Solo consulta: desde esta pantalla/);
    await expect(filtro).toHaveValue('');
    expect(await filtro.locator('option').allTextContents()).toEqual(['Todos', 'Integridad no verificada', 'Datos inválidos del SUA']);
    await enOrden([titulo, filtro, resumen, casos(page).nth(0), casos(page).nth(1), aviso]);
    // tarjeta 1: insignia, SUA, "Dictamen firmado ·", Motivo, Estado (en ese orden)
    const t1 = casos(page).nth(0);
    await enOrden([t1.locator('.etiqueta'), t1.locator('.sua'), t1.getByText(/Dictamen firmado/), t1.getByText(/^Motivo:/), t1.getByText(/^Estado:/)]);
    await expect(t1.locator('.etiqueta')).toHaveText('Integridad no verificada');
    await expect(t1).toContainText('Estado: no se dio por sincronizado');
    const t2 = casos(page).nth(1);
    await expect(t2.locator('.etiqueta')).toHaveText('Datos inválidos del SUA');
    await expect(t2).toContainText('Registro recibido 11/10/2026 · 09:12');
    await expect(t2).toContainText('Estado: no se guardó la solicitud');
    await page.screenshot({ path: 'resultados/capturas/wf-10.png', fullPage: true });
  });
});

// ═══ RNF-09 · Pantallas de administración en celular y en escritorio ════════════════════════════

const PANTALLAS_ADMIN = ['/usuarios', '/usuarios/captores', '/auditoria', '/para-revisar'];

test.describe('Celular (412 px)', () => {
  for (const ruta of PANTALLAS_ADMIN) {
    test(`[RNF-09] ${ruta} se ve bien en el celular: tarjetas, barra inferior y sin desborde horizontal`, async ({ page }) => {
      if (ruta === '/auditoria') await sembrarAuditoria();
      await ingresarYEsperar(page, 'asuarez0');
      await page.goto(ruta);
      await expect(page.locator('.tarjeta').first()).toBeVisible();
      await expect(page.getByRole('table')).toHaveCount(0); // la tabla de escritorio está oculta
      const caja = (await menu(page).boundingBox())!;
      expect(caja.y).toBeGreaterThan(500);
      expect(caja.width).toBeGreaterThan(380); // barra inferior de punta a punta
      await sinDesborde(page);
      const cuerpo = (await page.getByRole('main').boundingBox())!;
      expect(cuerpo.width).toBeLessThanOrEqual(412);
    });
  }
  test('[RNF-09][WF-01] el ingreso se ve bien en el celular, sin desborde horizontal', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await sinDesborde(page);
    const boton = (await page.getByRole('button', { name: 'Ingresar' }).boundingBox())!;
    expect(boton.height).toBeGreaterThanOrEqual(40); // botón grande, tocable con una mano
  });
});

test.describe('Escritorio (1280 px)', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  for (const ruta of PANTALLAS_ADMIN) {
    test(`[RNF-09] ${ruta} en escritorio: la lista pasa a tabla y el menú es lateral`, async ({ page }) => {
      if (ruta === '/auditoria') await sembrarAuditoria();
      await ingresarYEsperar(page, 'asuarez0');
      await page.goto(ruta);
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.locator('.tarjeta:visible')).toHaveCount(0); // las tarjetas del celular están ocultas
      const lateral = (await menu(page).boundingBox())!;
      expect(lateral.x).toBeLessThanOrEqual(1);
      expect(lateral.width).toBeLessThan(400);
      expect(lateral.height).toBeGreaterThan(500);
      expect(await itemsDelMenu(page)).toContain('Para revisar'); // texto completo, sin abreviar
      await sinDesborde(page);
    });
  }

  test('[RNF-09][WF-07] Usuarios en escritorio: tabla con usuario, rol, estado, alta y captores; la fila abre la ficha', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/usuarios');
    await expect(page.getByRole('table')).toBeVisible();
    const encabezados = await page.locator('thead th').allTextContents();
    expect(encabezados).toEqual(['Usuario', 'Rol', 'Estado', 'Alta', 'Captores']);
    const fila = page.getByRole('row', { name: /mrossi0/ });
    await expect(fila).toContainText('Operador');
    await expect(fila).toContainText('Activo');
    await expect(fila).toContainText('01/09/2026');
    await expect(fila).toContainText('K7M2-X9QD · Bloqueado');
    await fila.click();
    await expect(page.getByRole('dialog', { name: 'Ficha de mrossi0' })).toBeVisible();
    await page.screenshot({ path: 'resultados/capturas/wf-07-escritorio.png', fullPage: true });
  });

  test('[RNF-09][WF-09] Auditoría en escritorio: tabla de fecha y hora, usuario, acción y afectado', async ({ page }) => {
    await sembrarAuditoria();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/auditoria');
    await expect(page.locator('thead th')).toHaveText(['Fecha y hora', 'Usuario', 'Acción', 'Afectado']);
    await expect(page.getByRole('row')).toHaveCount(6); // encabezado + 5 eventos
    await expect(page.getByRole('row').nth(1)).toContainText('Desbloqueo de captor');
    await expect(botonesDeEdicion(page)).toHaveCount(0);
    await page.screenshot({ path: 'resultados/capturas/wf-09-escritorio.png', fullPage: true });
  });

  test('[RNF-09][WF-10] Para revisar en escritorio: tabla de tipo, solicitud, origen, motivo y estado; la fila despliega el detalle', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/para-revisar');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('thead th')).toHaveText(['Tipo', 'Solicitud', 'Origen', 'Motivo', 'Estado']);
    const fila = page.getByRole('row', { name: /SUA 48070-2026/ });
    await fila.click();
    await expect(page.locator('.detalle:visible')).toContainText('Integridad no verificada');
    await expect(page.locator('.detalle:visible').locator('button, input, select, textarea')).toHaveCount(0);
    await page.screenshot({ path: 'resultados/capturas/wf-10-escritorio.png', fullPage: true });
  });

  test('[RNF-09][WF-07b] Captores bloqueados en escritorio: tabla con código, estado, usuario, bloqueo, motivo y botón', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/usuarios/captores');
    await expect(page.locator('thead th')).toHaveText(['Código', 'Estado', 'Usuario', 'Bloqueado', 'Motivo', '']);
    await page.getByLabel('Código del dispositivo').fill('-');
    await expect(page.getByRole('row', { name: /K7M2-X9QD/ }).getByRole('button', { name: 'Desbloquear' })).toBeVisible();
    await expect(page.getByRole('row', { name: /R3TB-44LN/ }).getByRole('button')).toHaveCount(0);
    await page.screenshot({ path: 'resultados/capturas/wf-07b-escritorio.png', fullPage: true });
  });
});
