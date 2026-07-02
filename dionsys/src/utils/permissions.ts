import type { Role } from '../types'

export const ROLE_ROUTES: Record<Role, string[]> = {
  // Admin (Charo): entra por Administración pero mantiene acceso total.
  admin:         ['/administracion', '/dashboard', '/recepcion', '/deposito', '/mantenimiento', '/pedidos-admin', '/impuestos', '/sueldos', '/facturas-proveedores', '/control-caja'],
  // Recepcionista (conserje): recepción + depósito (incluye armar el pedido semanal) + cierre de turno (caja + parte).
  concierge:     ['/recepcion', '/deposito', '/cerrar-turno'],
  mucama:        ['/recepcion', '/deposito'],
  mantenimiento: ['/recepcion', '/mantenimiento'],
  // Encargada (Roxy): solo depósito.
  encargada:     ['/deposito'],
}

export function canAccess(role: Role, path: string): boolean {
  return ROLE_ROUTES[role]?.includes(path) ?? false
}

export function getDefaultRoute(role: Role): string {
  return role === 'admin' ? '/administracion' : ROLE_ROUTES[role]?.[0] ?? '/recepcion'
}

export function canDelete(role: Role): boolean {
  return role === 'admin'
}
