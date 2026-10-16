// Simulador externo, solo demo: volver la demo al estado inicial sin redesplegar.
// No verifica un requisito de la especificación: es una herramienta para presentar la demo.
import { expect, test } from '@playwright/test';
import { ingresarYEsperar, reiniciarBase } from './ayudas';

test.beforeEach(reiniciarBase);

test.describe('Simulador · volver la demo al estado inicial', () => {
  test('el Administrador vuelve la demo al estado inicial: se deshacen los cambios y hay que ingresar de nuevo', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/simulador');
    // Un cambio hecho durante la demo: jdiaz0 pasa a vigente en la Autenticación Institucional.
    const vigencia = page.locator('#sim-vig-jdiaz0');
    await expect(vigencia).not.toBeChecked();
    // La casilla refleja lo que guardó el sistema: cambia cuando responde, no al tocarla.
    await vigencia.click();
    await expect(page.getByText('jdiaz0 ahora está vigente')).toBeVisible();
    await expect(vigencia).toBeChecked();

    await page.getByRole('button', { name: 'Volver la demo al estado inicial' }).click();
    const dialogo = page.getByRole('dialog', { name: '¿Volver la demo al estado inicial?' });
    await expect(dialogo).toContainText('Se pierde todo lo hecho en la demo');
    await dialogo.getByRole('button', { name: 'Volver al estado inicial' }).click();

    await expect(page).toHaveURL(/\/ingresar$/, { timeout: 30_000 });
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/simulador');
    await expect(page.locator('#sim-vig-jdiaz0')).not.toBeChecked();
  });

  test('cancelar no cambia nada', async ({ page }) => {
    await ingresarYEsperar(page, 'asuarez0');
    await page.goto('/simulador');
    await page.getByRole('button', { name: 'Volver la demo al estado inicial' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/\/simulador$/);
  });

  test('los otros roles no ven la opción', async ({ page }) => {
    await ingresarYEsperar(page, 'mrossi0');
    await page.goto('/simulador');
    await expect(page.getByRole('heading', { name: 'Autenticación Institucional simulada' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver la demo al estado inicial' })).toHaveCount(0);
  });
});
