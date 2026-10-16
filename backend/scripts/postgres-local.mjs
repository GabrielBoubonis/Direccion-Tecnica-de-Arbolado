// PostgreSQL local (binarios embebidos, sin instalar nada) para desarrollar y para las pruebas.
// Uso directo: `node scripts/postgres-local.mjs` lo deja corriendo en el puerto 54329 y
// muestra la DATABASE_URL. Las pruebas lo levantan en otro puerto con `iniciarPostgres`.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function iniciarPostgres({ puerto = 54329, carpeta = join(tmpdir(), 'arbolado-postgres'), base = 'arbolado' } = {}) {
  const pg = new EmbeddedPostgres({ databaseDir: carpeta, user: 'postgres', password: 'local', port: puerto, persistent: true, onLog: () => {} });
  if (!existsSync(join(carpeta, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(base);
  } catch {
    // ya existía
  }
  return { pg, url: `postgresql://postgres:local@localhost:${puerto}/${base}` };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pg, url } = await iniciarPostgres();
  console.log(`PostgreSQL local listo.\nDATABASE_URL=${url}\nDIRECT_URL=${url}\nCtrl+C para detenerlo.`);
  const parar = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}
