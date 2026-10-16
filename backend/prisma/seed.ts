// Deja la base en el estado inicial de la demo con los datos de prueba. Uso: npm run db:seed
import { db } from '../src/compartido/base-de-datos';
import { cargarDatosDePrueba } from '../src/modulos/datos-de-prueba';

export { cargarDatosDePrueba };

if (require.main === module)
  cargarDatosDePrueba()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
