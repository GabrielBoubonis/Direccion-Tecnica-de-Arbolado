// Fallas de lectura o de generación: el sistema informa, permite reintentar y no muestra datos
// parciales (CU-08 E2, CU-13 E3, CU-14 E2). La falla se provoca respondiendo 500 desde el servidor.
import { expect, test } from '@playwright/test';
import { ingresarYEsperar, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

test('[CU-13 E3] si el registro de auditoría no se puede leer, se informa, no hay datos parciales y se puede reintentar', async ({ page }) => {
  await ingresarYEsperar(page, 'asuarez0');
  let fallar = true;
  await page.route('**/api/auditoria**', (r) => (fallar ? r.fulfill({ status: 500, json: { codigo: 'ERROR', mensaje: 'Falla de la base de datos.' } }) : r.continue()));
  await page.goto('/auditoria');
  await expect(page.getByText(/No se pudo cargar/).first()).toBeVisible();
  await expect(page.getByText(/afectado:/)).toHaveCount(0);
  fallar = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText(/No se pudo cargar/)).toHaveCount(0);
});

test('[CU-14 E2] si "Para revisar" no se puede leer, se informa, no hay datos parciales y se puede reintentar', async ({ page }) => {
  await ingresarYEsperar(page, 'asuarez0');
  let fallar = true;
  await page.route('**/api/revision**', (r) => (fallar ? r.fulfill({ status: 500, json: { codigo: 'ERROR', mensaje: 'Falla de la base de datos.' } }) : r.continue()));
  await page.goto('/para-revisar');
  await expect(page.getByText(/No se pudo cargar/).first()).toBeVisible();
  await expect(page.getByText(/^Motivo:/)).toHaveCount(0);
  fallar = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('SUA 5521-2026').first()).toBeVisible();
});

test('[CU-08 E2] si el PDF no se puede generar, se informa y el dictamen sigue disponible para reintentar', async ({ page }) => {
  await ingresarYEsperar(page, 'mrossi0');
  let fallar = true;
  await page.route('**/api/dictamenes/*/pdf', (r) => (fallar ? r.fulfill({ status: 500, body: 'error' }) : r.continue()));
  await page.goto('/solicitudes/48070/2026');
  const descargar = page.getByRole('button', { name: /Descargar PDF/ }).first();
  await descargar.click();
  await expect(page.getByText(/No se pudo generar el archivo/).first()).toBeVisible();
  fallar = false;
  const [descarga] = await Promise.all([page.waitForEvent('download'), descargar.click()]);
  expect(descarga.suggestedFilename()).toMatch(/^dictamen-48070-2026-\d+\.pdf$/);
});
