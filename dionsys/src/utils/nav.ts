import {
  Home, ConciergeBell, Building2, ClipboardCheck, Warehouse, Shirt, Wrench,
  Wallet, Users, Receipt, Truck, Globe, LayoutDashboard, MessageCircle, KeyRound, type LucideIcon,
} from 'lucide-react'
import type { Role } from '../types'

export interface NavItem {
  to: string
  label: string
  // Nombre corto para la barra de abajo del celular.
  short?: string
  icon: LucideIcon
  // Roles que NO ven este ítem aunque tengan acceso a la ruta (para que una
  // misma pantalla aparezca con otro nombre/lugar según quién entra).
  ocultarPara?: Role[]
}

export interface NavGroup {
  title: string | null
  items: NavItem[]
}

// El menú agrupado por la pregunta que se hace el usuario, no por módulo.
// Cada rol ve solo los ítems a los que tiene acceso (ver permissions.ts).
export const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [
    { to: '/inicio', label: 'Inicio', icon: Home },
  ] },
  { title: 'Hoy', items: [
    { to: '/recepcion', label: 'Recepción', icon: ConciergeBell },
    { to: '/hotel', label: 'Mapa del hotel', short: 'Mapa', icon: Building2 },
    { to: '/cerrar-turno', label: 'Cerrar turno', short: 'Turno', icon: ClipboardCheck },
    { to: '/deposito', label: 'Depósito', icon: Warehouse },
    { to: '/web', label: 'Consultas web', short: 'Consultas', icon: MessageCircle, ocultarPara: ['admin'] },
    { to: '/lavadero', label: 'Lavadero', icon: Shirt },
    { to: '/mantenimiento', label: 'Mantenimiento', short: 'Arreglos', icon: Wrench },
  ] },
  { title: 'Plata', items: [
    { to: '/cajas', label: 'Cajas', icon: Wallet },
    { to: '/sueldos', label: 'Sueldos', icon: Users },
    { to: '/impuestos', label: 'Impuestos y servicios', short: 'Impuestos', icon: Receipt },
  ] },
  { title: 'Proveedores', items: [
    { to: '/proveedores', label: 'Pedidos y facturas', short: 'Proveedores', icon: Truck },
  ] },
  { title: 'Ventas', items: [
    { to: '/web', label: 'Página web y tarifas', short: 'Web', icon: Globe, ocultarPara: ['concierge'] },
  ] },
  { title: 'Números', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Sistema', items: [
    { to: '/usuarios', label: 'Usuarios', icon: KeyRound },
  ] },
]

export function findNavItem(pathname: string, role?: Role): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    const item = group.items.find(i =>
      (pathname === i.to || pathname.startsWith(i.to + '/')) && !(role && i.ocultarPara?.includes(role)))
    if (item) return { group, item }
  }
  return null
}
