// Punto de entrada de la API en Vercel: la aplicación Express se publica como una función.
// Usa el servidor ya compilado por `npm run build` (backend/dist), con la misma configuración de
// TypeScript que en desarrollo y en las pruebas.
module.exports = require('../backend/dist/app').default;
