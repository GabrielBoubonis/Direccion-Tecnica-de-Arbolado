/**
 * Pruebas de integración: la API completa contra un PostgreSQL real (embebido, en una carpeta
 * temporal propia de cada corrida) cargado con los datos de prueba de datos-prueba/.
 * Uso: npm run test:integracion
 */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integracion'],
  globalSetup: '<rootDir>/test/integracion/preparar-global.js',
  globalTeardown: '<rootDir>/test/integracion/terminar-global.js',
  testTimeout: 60_000,
  maxWorkers: 1,
};
