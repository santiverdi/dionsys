import { useState, type CSSProperties } from 'react'
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { canAccess } from '../utils/permissions'
import { NAV_GROUPS, findNavItem, type NavGroup } from '../utils/nav'
import { Menu, X, LogOut, ChevronRight } from 'lucide-react'
import type { Role } from '../types'
import OccupancyReminder from './OccupancyReminder'
import CierreTurnoReminder from './CierreTurnoReminder'
import PedidosPorRecibir from './PedidosPorRecibir'

// Con hasta 6 secciones el celular usa una barra fija abajo (como Instagram);
// con más (admin) usa el menú desplegable agrupado.
const MAX_BARRA_ABAJO = 6

const roleLabel: Record<string, string> = {
  concierge: 'Concierge',
  mucama: 'Mucama',
  admin: 'Administracion',
  mantenimiento: 'Mantenimiento',
  encargada: 'Encargada',
}

function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  // Si el rol solo ve un grupo, el título sobra.
  const conTitulos = groups.filter(g => g.title).length > 1
  return (
    <>
      {groups.map(g => (
        <div key={g.title ?? 'inicio'} className="mb-1">
          {g.title && conTitulos && (
            <p className="text-[11px] uppercase tracking-wider text-navy-300 font-semibold px-3 pt-3 pb-1">{g.title}</p>
          )}
          {g.items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-gold-400 text-navy-900' : 'text-cream hover:bg-navy-700'
                }`
              }
            >
              <item.icon size={18} className="shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  )
}

export default function Layout() {
  const { employee, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const role = employee?.role as Role | undefined
  const groups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => role && canAccess(role, i.to) && !i.ocultarPara?.includes(role)) }))
    .filter(g => g.items.length > 0)
  const visibleItems = groups.flatMap(g => g.items)
  const barraAbajo = visibleItems.length <= MAX_BARRA_ABAJO

  // "Inicio › Plata › Cajas": dónde estoy y cómo vuelvo. Solo para quien tiene
  // Inicio (el resto ve pocas secciones y ya las tiene a la vista).
  const actual = findNavItem(pathname, role)
  const migas = role && canAccess(role, '/inicio') && actual && actual.item.to !== '/inicio' ? actual : null

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen md:flex">
      {/* Menú lateral (compu / tablet) */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 bg-navy-800 text-cream sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center shrink-0">
          <h1 className="text-xl font-bold tracking-wide">DionSys</h1>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          <NavGroups groups={groups} />
        </nav>
        <div className="border-t border-navy-700 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{employee?.name}</p>
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
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Header (celular) */}
        <header className="md:hidden bg-navy-800 text-cream shadow-lg sticky top-0 z-50">
          <div className="px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!barraAbajo && (
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="p-2 -ml-2 rounded-lg hover:bg-navy-700 transition-colors"
                  aria-label="Menú"
                >
                  {menuOpen ? <X size={22} /> : <Menu size={22} />}
                </button>
              )}
              <h1 className="text-lg font-bold tracking-wide">DionSys</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-sm font-medium leading-tight">{employee?.name}</p>
                <p className="text-[11px] text-gold-400">{roleLabel[employee?.role ?? '']}</p>
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

          {menuOpen && !barraAbajo && (
            <nav className="border-t border-navy-700 px-3 py-2 max-h-[calc(100vh-3.5rem)] overflow-y-auto">
              <NavGroups groups={groups} onNavigate={() => setMenuOpen(false)} />
            </nav>
          )}
        </header>

        {/* Content */}
        <main
          className={`flex-1 max-w-6xl mx-auto w-full p-4 md:p-6 ${barraAbajo ? 'pb-24 md:pb-6' : ''}`}
          style={barraAbajo ? { '--barra-abajo': '4.25rem' } as CSSProperties : undefined}
        >
          {migas && (
            <p className="flex items-center gap-1 text-xs text-navy-400 mb-3">
              <Link to="/inicio" className="hover:text-navy-700 hover:underline">Inicio</Link>
              {migas.group.title && <><ChevronRight size={12} /> <span>{migas.group.title}</span></>}
              <ChevronRight size={12} /> <span className="text-navy-700 font-medium">{migas.item.label}</span>
            </p>
          )}
          {role && canAccess(role, '/recepcion') && <OccupancyReminder />}
          {role && canAccess(role, '/cerrar-turno') && <CierreTurnoReminder />}
          <PedidosPorRecibir />
          <Outlet />
        </main>

        {/* Barra de abajo (celular, pocos ítems) */}
        {barraAbajo && visibleItems.length > 1 && (
          <nav
            className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-navy-100 grid pb-[env(safe-area-inset-bottom)]"
            style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}
          >
            {visibleItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-navy-800' : 'text-navy-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`px-4 py-1 rounded-full ${isActive ? 'bg-gold-400/40' : ''}`}>
                      <item.icon size={22} />
                    </span>
                    <span className="truncate max-w-full px-1">{item.short ?? item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
