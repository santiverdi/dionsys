import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../utils/permissions'
import { ShoppingCart, Menu, X, LogOut, ConciergeBell, Warehouse, Wrench, LayoutDashboard, ClipboardList } from 'lucide-react'
import type { Role } from '../types'

const NAV_ITEMS: { to: string; label: string; icon: typeof ShoppingCart }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pedidos', label: 'Distribuidores', icon: ShoppingCart },
  { to: '/recepcion', label: 'Recepcion', icon: ConciergeBell },
  { to: '/deposito', label: 'Pedido Semanal', icon: Warehouse },
  { to: '/mantenimiento', label: 'Mantenimiento', icon: Wrench },
  { to: '/pedidos-admin', label: 'Proveedores', icon: ClipboardList },
]

export default function Layout() {
  const { employee, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const role = employee?.role as Role | undefined
  const visibleItems = NAV_ITEMS.filter(item => role && canAccess(role, item.to))

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const roleLabel: Record<string, string> = {
    concierge: 'Concierge',
    mucama: 'Mucama',
    admin: 'Administracion',
    mantenimiento: 'Mantenimiento',
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-navy-800 text-cream shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile menu button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-navy-700 transition-colors"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
            <h1 className="text-xl font-bold tracking-wide">DionSys</h1>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {visibleItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gold-400 text-navy-900'
                      : 'text-cream hover:bg-navy-700'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-tight">{employee?.name}</p>
              <p className="text-xs text-gold-400">{roleLabel[employee?.role ?? '']}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg hover:bg-navy-700 transition-colors text-gold-300 hover:text-gold-200"
              title="Cerrar sesion"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        {/* Mobile nav dropdown */}
        {menuOpen && (
          <nav className="md:hidden border-t border-navy-700 px-4 py-2 space-y-1">
            {visibleItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gold-400 text-navy-900'
                      : 'text-cream hover:bg-navy-700'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
            <div className="sm:hidden pt-2 border-t border-navy-700 mt-2">
              <p className="text-sm text-cream px-4">{employee?.name}</p>
              <p className="text-xs text-gold-400 px-4">{roleLabel[employee?.role ?? '']}</p>
            </div>
          </nav>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  )
}
