import type { Role } from '../types'

export const ROLE_ROUTES: Record<Role, string[]> = {
  // Admin (Charo): entra por Inicio (los avisos de cada sección) y tiene acceso total.
  admin:         ['/inicio', '/dashboard', '/hotel', '/recepcion', '/deposito', '/mantenimiento', '/cajas', '/proveedores', '/impuestos', '/sueldos', '/lavadero', '/web', '/usuarios', '/sync'],
  // Recepcionista (conserje): recepción + depósito (incluye armar el pedido semanal) + cierre de turno (caja + parte).
  // /web: solo ven las consultas de la página web (tarifario y métricas son de admin).
  concierge:     ['/recepcion', '/hotel', '/deposito', '/cerrar-turno', '/lavadero', '/web'],
  // Mucamas y gobernanta manejan la ropa con el lavadero.
  mucama:        ['/recepcion', '/hotel', '/deposito', '/lavadero'],
  mantenimiento: ['/recepcion', '/hotel', '/mantenimiento'],
  // Encargada (Roxy): depósito + lavadero (los remitos los guarda la gobernanta).
  encargada:     ['/deposito', '/lavadero'],
}

export function canAccess(role: Role, path: string): boolean {
  return ROLE_ROUTES[role]?.includes(path) ?? false
}

export function getDefaultRoute(role: Role): string {
  return role === 'admin' ? '/inicio' : ROLE_ROUTES[role]?.[0] ?? '/recepcion'
}

export function canDelete(role: Role): boolean {
  return role === 'admin'
}
