import type { Role } from '../types'

export const ROLE_ROUTES: Record<Role, string[]> = {
  // Admin (Charo): entra por Administración pero mantiene acceso total.
  admin:         ['/administracion', '/dashboard', '/hotel', '/recepcion', '/deposito', '/mantenimiento', '/pedidos-admin', '/impuestos', '/sueldos', '/facturas-proveedores', '/control-caja', '/caja-admin', '/lavadero', '/landing', '/sync'],
  // Recepcionista (conserje): recepción + depósito (incluye armar el pedido semanal) + cierre de turno (caja + parte).
  concierge:     ['/recepcion', '/hotel', '/deposito', '/cerrar-turno', '/lavadero'],
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
  return role === 'admin' ? '/administracion' : ROLE_ROUTES[role]?.[0] ?? '/recepcion'
}

export function canDelete(role: Role): boolean {
  return role === 'admin'
}
