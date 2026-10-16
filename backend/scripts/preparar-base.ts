// Prepara la base: esquema, índices y, si está vacía, los datos de prueba. Corre en el build de Vercel,
// así que alcanza con cargar las variables en Vercel y publicar.
// Todo queda dentro del esquema propio del sistema (ESQUEMA, `arbolado`): la base puede ser compartida
// y nada de `public` ni de otro esquema se lee, se modifica o se borra.
// Uso: npm run db:preparar            esquema, índices y datos de prueba si la base está vacía
//      npm run db:push                solo esquema e índices
//      REINICIAR_DEMO=si               vuelve a cargar los datos de prueba aunque la base tenga datos
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cargarDatosDePrueba } from '../prisma/seed';
import { db } from '../src/compartido/base-de-datos';
import { conEsquema, ESQUEMA } from '../src/compartido/configuracion';

const backend = resolve(__dirname, '..');
const soloEsquema = process.argv.includes('--sin-datos');

function correr(comando: string) {
  // Prisma CLI toma el esquema del parámetro `schema` de las URL.
  const env = { ...process.env, DATABASE_URL: conEsquema(process.env.DATABASE_URL), DIRECT_URL: conEsquema(process.env.DIRECT_URL) };
  execSync(comando, { cwd: backend, stdio: 'inherit', env });
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
    console.log('Sin DATABASE_URL y DIRECT_URL: no se prepara ninguna base.');
    return;
  }
  console.log(`Preparando la base en el esquema "${ESQUEMA}"…`);
  // --accept-data-loss alcanza solo al esquema del sistema: Prisma no mira los demás.
  correr('npx prisma db push --skip-generate --accept-data-loss');
  correr('npx tsx prisma/indices.ts');
  if (soloEsquema) return;

  const usuarios = await db.usuario.count();
  if (usuarios > 0 && process.env.REINICIAR_DEMO !== 'si') {
    console.log(`La base ya tiene datos (${usuarios} usuarios): se dejan como están.`);
    return;
  }
  await cargarDatosDePrueba();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
