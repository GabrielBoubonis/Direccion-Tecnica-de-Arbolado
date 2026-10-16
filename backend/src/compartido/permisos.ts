// Matriz de permisos por rol. Toda acción se controla en el servidor además de en la interfaz.
import type { RolNombre } from '../dominio/catalogos';

export const ACCIONES = {
  verUsuarios: ['Administrador'],
  gestionarUsuarios: ['Administrador'],
  gestionarCaptores: ['Administrador'],
  verParaRevisar: ['Administrador'],
  verAuditoria: ['Administrador'],
  verSolicitudes: ['Operador', 'Jefe'],
  generarRuta: ['Operador', 'Jefe'],
  dictaminar: ['Operador', 'Jefe'],
  agregarEspecie: ['Operador', 'Jefe'],
  verDictamenes: ['Operador', 'Jefe'],
  resolverConflicto: ['Jefe'],
  verDashboard: ['Lector', 'Jefe', 'Administrador'],
  verTormenta: ['Lector', 'Operador', 'Jefe', 'Administrador'],
  generarRutaTormenta: ['Operador', 'Jefe'],
} as const satisfies Record<string, readonly RolNombre[]>;

export type Accion = keyof typeof ACCIONES;

export const puede = (rol: RolNombre, accion: Accion): boolean =>
  (ACCIONES[accion] as readonly RolNombre[]).includes(rol);

/** Lo que cada rol ve en el menú, en orden, y la pantalla con la que arranca. */
export const MENU: Record<RolNombre, { items: string[]; inicio: string }> = {
  Lector: { items: ['dashboard', 'tormenta', 'perfil'], inicio: 'dashboard' },
  Operador: { items: ['solicitudes', 'rutas', 'tormenta', 'perfil'], inicio: 'solicitudes' },
  Jefe: { items: ['solicitudes', 'rutas', 'tormenta', 'dashboard', 'perfil'], inicio: 'solicitudes' },
  Administrador: {
    items: ['usuarios', 'para-revisar', 'auditoria', 'dashboard', 'tormenta', 'perfil'],
    inicio: 'usuarios',
  },
};
