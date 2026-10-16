// Índices que Prisma no expresa en el esquema. Se aplican después de `prisma db push`.
import { db } from '../src/compartido/base-de-datos';
import { ESQUEMA } from '../src/compartido/configuracion';

// Nombres calificados con el esquema del sistema (ver ESQUEMA en configuracion.ts).
const e = `"${ESQUEMA}"`;

async function main() {
  // Una solicitud solo puede estar reservada en una ruta a la vez, normal o de tormenta (RF-16, RF-42).
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS ruta_solicitud_reserva_activa ON ${e}.ruta_solicitud (numero_sua, anio) WHERE liberada = false`,
  );
  // El registro de auditoría es de solo inserción (RF-54): se rechaza toda modificación o borrado.
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION ${e}.auditoria_inmutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'El registro de auditoría no se puede modificar ni borrar (RF-54)';
    END;
    $$ LANGUAGE plpgsql`);
  await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS auditoria_inmutable ON ${e}.registro_auditoria`);
  await db.$executeRawUnsafe(
    `CREATE TRIGGER auditoria_inmutable BEFORE UPDATE OR DELETE ON ${e}.registro_auditoria FOR EACH ROW EXECUTE FUNCTION ${e}.auditoria_inmutable()`,
  );
  console.log('Índices y reglas aplicados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
