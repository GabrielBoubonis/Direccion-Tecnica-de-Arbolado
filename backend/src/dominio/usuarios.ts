import { createHash } from 'node:crypto';

// Reglas de los usuarios del sistema (Módulo 1).

/** Minúsculas, sin tildes, sin espacios ni signos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Identificador del usuario: inicial del nombre + 6 letras del apellido + número incremental (RF-22).
 * El número va siempre y empieza en 0, como en los datos de prueba (mrossi0, cbenite0) y el
 * wireframe 07 (jperez3); si ya existe, se usa el siguiente (CU-02 E1). Un apellido de menos de 6
 * letras se usa entero.
 */
export function generarNombreUsuario(nombre: string, apellido: string, existentes: readonly string[]): string {
  const base = normalizarTexto(nombre).slice(0, 1) + normalizarTexto(apellido).slice(0, 6);
  if (base.length < 2) throw new Error('El nombre y el apellido son obligatorios para generar el usuario.');
  const usados = new Set(existentes);
  let n = 0;
  while (usados.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Reglas de la contraseña local (RF-07, RNF-05). Devuelve las reglas que no cumple. */
export function reglasContrasenaIncumplidas(contrasena: string): string[] {
  const faltan: string[] = [];
  if (contrasena.length < 8) faltan.push('al menos 8 caracteres');
  if (!/[A-Z]/.test(contrasena)) faltan.push('una mayúscula');
  if (!/[a-z]/.test(contrasena)) faltan.push('una minúscula');
  if (!/[0-9]/.test(contrasena)) faltan.push('un número');
  if (!/[^A-Za-z0-9]/.test(contrasena)) faltan.push('un carácter especial');
  return faltan;
}

/** Contraseña temporal que cumple las reglas, para el blanqueo (RF-08). */
export function contrasenaTemporal(aleatorio: () => number = Math.random): string {
  const tomar = (s: string) => s[Math.floor(aleatorio() * s.length)];
  const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const min = 'abcdefghijkmnpqrstuvwxyz';
  const num = '23456789';
  const esp = '!#$%&*?';
  let c = tomar(may) + tomar(min) + tomar(num) + tomar(esp);
  for (let i = 0; i < 6; i++) c += tomar(may + min + num);
  return c;
}

/** Código corto visible de un captor, derivado de su identificador (RF-60). */
export function codigoVisibleDispositivo(idDispositivo: string): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = createHash('sha256').update(idDispositivo).digest();
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += alfabeto[bytes[i] % alfabeto.length];
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}
