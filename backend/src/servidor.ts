// Arranque local de la API (en Vercel la app se publica como función, ver api/index.js).
import app from './app';

const puerto = Number(process.env.PUERTO ?? 3000);
app.listen(puerto, () => {
  console.log(`API escuchando en http://localhost:${puerto}/api`);
});
