// Pruebas punta a punta en navegador: un recorrido por historia de usuario, con los datos de prueba.
// Uso: npx playwright test -c e2e/playwright.config.ts   (compilar antes: npm run build --workspace frontend)
import { defineConfig, devices } from '@playwright/test';

const PUERTO_WEB = Number(process.env.PUERTO_WEB ?? 4173);

export default defineConfig({
  testDir: './pruebas',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: `resultados/e2e-${PUERTO_WEB}.json` }]],
  use: {
    baseURL: `http://localhost:${PUERTO_WEB}`,
    channel: 'chrome',
    // El captor: un celular Android (Pixel 7), como pide RNF-09 y RNF-12.
    ...devices['Pixel 7'],
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx tsx servidor-pruebas.ts',
    cwd: __dirname,
    url: `http://localhost:${PUERTO_WEB}`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'pipe',
  },
});
