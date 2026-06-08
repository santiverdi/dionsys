import type { Role } from '../types'

export const ROLE_ROUTES: Record<Role, string[]> = {
  admin:         ['/dashboard', '/recepcion', '/deposito', '/mantenimiento', '/pedidos-admin', '/impuestos'],
  concierge:     ['/recepcion', '/deposito'],
  mucama:        ['/recepcion', '/deposito'],
  mantenimiento: ['/recepcion', '/mantenimiento'],
  encargada:     ['/deposito', '/recepcion'],
}

export function canAccess(role: Role, path: string): boolean {
  return ROLE_ROUTES[role]?.includes(path) ?? false
}

export function getDefaultRoute(role: Role): string {
  return role === 'admin' ? '/dashboard' : ROLE_ROUTES[role]?.[0] ?? '/recepcion'
}

export function canDelete(role: Role): boolean {
  return role === 'admin'
}
