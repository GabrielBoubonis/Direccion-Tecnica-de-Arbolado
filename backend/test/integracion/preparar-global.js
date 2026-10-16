// Levanta un PostgreSQL propio para esta corrida, crea el esquema y deja la URL en el entorno.
const { execSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { createServer } = require('node:net');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const puertoLibre = () =>
  new Promise((ok) => {
    const s = createServer();
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

module.exports = async () => {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const puerto = await puertoLibre();
  const carpeta = mkdtempSync(join(tmpdir(), 'arbolado-pruebas-'));
  const pg = new EmbeddedPostgres({ databaseDir: carpeta, user: 'postgres', password: 'local', port: puerto, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('arbolado');
  // Mismo esquema que usa el sistema (ESQUEMA en src/compartido/configuracion.ts).
  const url = `postgresql://postgres:local@localhost:${puerto}/arbolado?schema=arbolado`;
  Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, MAPAS: 'prueba', JWT_SECRETO: 'secreto-de-prueba-'.padEnd(64, 'x'), NODE_ENV: 'test' });
  const entorno = { ...process.env };
  execSync('npx prisma db push --skip-generate --accept-data-loss', { cwd: join(__dirname, '../..'), env: entorno, stdio: 'ignore' });
  execSync('npx tsx prisma/indices.ts', { cwd: join(__dirname, '../..'), env: entorno, stdio: 'ignore' });
  globalThis.__POSTGRES__ = pg;
};
