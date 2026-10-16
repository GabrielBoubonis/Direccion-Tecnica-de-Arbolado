/** Pruebas unitarias del dominio (rápidas, sin base de datos). */
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testPathIgnorePatterns: ['/integracion/'],
};
