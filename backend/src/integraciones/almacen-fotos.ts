// Almacenamiento de fotografías en la propia base de datos.
// Detrás del puerto AlmacenFotos: pasar a un almacenamiento de archivos es cambiar este adaptador.
import { randomUUID } from 'node:crypto';
import { db } from '../compartido/base-de-datos';
import type { AlmacenFotos } from './puertos';

export const almacenEnBase: AlmacenFotos = {
  async guardar(datos, tipoMime) {
    const id = randomUUID();
    await db.archivoFoto.create({ data: { id, tipoMime, datos } });
    return `foto:${id}`;
  },
  async obtener(referencia) {
    const id = referencia.replace(/^foto:/, '');
    const fila = await db.archivoFoto.findUnique({ where: { id } });
    return fila ? { datos: Buffer.from(fila.datos), tipoMime: fila.tipoMime } : null;
  },
};
