// Entorno de las pruebas en navegador: PostgreSQL propio (temporal), el servidor con los datos de
// prueba y la aplicación compilada (con su service worker) servida por `vite preview`.
// Además expone, solo para las pruebas, POST http://localhost:<PUERTO_CONTROL>/reiniciar, que vuelve
// la base al estado inicial de los datos de prueba.
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as servidorTcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const PUERTO_API = Number(process.env.PUERTO_API ?? 3100);
const PUERTO_WEB = Number(process.env.PUERTO_WEB ?? 4173);
const PUERTO_CONTROL = Number(process.env.PUERTO_CONTROL ?? PUERTO_WEB + 50);
const RAIZ = join(__dirname, '..');

const puertoLibre = () =>
  new Promise<number>((ok) => {
    const s = servidorTcp();
    s.listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    });
  });

async function main() {
  const puertoPg = await puertoLibre();
  const pg = new EmbeddedPostgres({ databaseDir: mkdtempSync(join(tmpdir(), 'arbolado-e2e-')), user: 'postgres', password: 'local', port: puertoPg, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('arbolado');
  // Mismo esquema que usa el sistema (ESQUEMA en backend/src/compartido/configuracion.ts).
  const url = `postgresql://postgres:local@localhost:${puertoPg}/arbolado?schema=arbolado`;
  Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, MAPAS: 'prueba', JWT_SECRETO: 'secreto-e2e-'.padEnd(64, 'x') });
  const backend = join(RAIZ, 'backend');
  execSync('npx prisma db push --skip-generate --accept-data-loss', { cwd: backend, env: process.env, stdio: 'ignore' });
  execSync('npx tsx prisma/indices.ts', { cwd: backend, env: process.env, stdio: 'ignore' });

  const { cargarDatosDePrueba } = await import('../backend/prisma/seed');
  const { crearApp } = await import('../backend/src/app');
  await cargarDatosDePrueba(() => undefined);
  const api = crearApp().listen(PUERTO_API);

  const web = spawn('npx', ['vite', 'preview', '--port', String(PUERTO_WEB), '--strictPort'], {
    cwd: join(RAIZ, 'frontend'),
    env: { ...process.env, API_URL: `http://localhost:${PUERTO_API}` },
    stdio: 'inherit',
    shell: true,
  });

  const control = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/reiniciar') {
      try {
        await cargarDatosDePrueba(() => undefined);
        res.end('ok');
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
      return;
    }
    res.statusCode = 404;
    res.end();
  }).listen(PUERTO_CONTROL);

  const terminar = async () => {
    web.kill();
    api.close();
    control.close();
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', terminar);
  process.on('SIGTERM', terminar);
  console.log(`Entorno de pruebas listo: web ${PUERTO_WEB}, api ${PUERTO_API}, control ${PUERTO_CONTROL}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
