// Ayudas de las pruebas en navegador. Cada prueba lleva en el título los IDs que verifica.
import { expect, type Page } from '@playwright/test';

export const CONTRASENA = 'Demo2026!';
const PUERTO_WEB = Number(process.env.PUERTO_WEB ?? 4173);
const PUERTO_CONTROL = Number(process.env.PUERTO_CONTROL ?? PUERTO_WEB + 50);
export const FOTO = require.resolve('../../datos-prueba/fotos/foto-prueba-1.jpg');

/** Vuelve la base al estado inicial de los datos de prueba. */
export async function reiniciarBase() {
  const r = await fetch(`http://localhost:${PUERTO_CONTROL}/reiniciar`, { method: 'POST' });
  if (!r.ok) throw new Error(`No se pudo reiniciar la base: ${await r.text()}`);
}

export async function ingresar(page: Page, usuario: string, contrasena = CONTRASENA) {
  await page.goto('/');
  await page.getByLabel('Usuario').fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByRole('button', { name: /ingresar/i }).click();
}

export async function ingresarYEsperar(page: Page, usuario: string) {
  await ingresar(page, usuario);
  await expect(page.getByRole('navigation', { name: 'Menú principal' }).first()).toBeVisible();
}

/** Prende o apaga una caída simulada desde el simulador externo (como usuario con sesión). */
export async function interruptor(page: Page, clave: 'sua_caido' | 'autenticacion_caida' | 'mapas_caido', activo: boolean) {
  const r = await page.evaluate(
    async ([c, a]) => {
      const s = JSON.parse(localStorage.getItem('arbolado.sesion') ?? 'null');
      const res = await fetch('/api/simulador/interruptor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s?.acceso}` },
        body: JSON.stringify({ clave: c, activo: a }),
      });
      return res.status;
    },
    [clave, activo] as const,
  );
  expect(r).toBe(200);
}
