import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { cloudEnabled } from './lib/supabase'
import { pullAll, subscribeRealtime } from './lib/cloudStore'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrdersProvider } from './context/OrdersContext'
import { CajaProvider } from './context/CajaContext'
import { ParteProvider } from './context/ParteContext'
import { StockProvider } from './context/StockContext'
import { MaintenanceProvider } from './context/MaintenanceContext'
import { OccupancyProvider } from './context/OccupancyContext'
import { TurnosProvider } from './context/TurnosContext'
import { ImpuestosProvider } from './context/ImpuestosContext'
import { canAccess, getDefaultRoute } from './utils/permissions'
import Login from './pages/Login'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pedidos from './pages/Pedidos'
import PedidosRecepcion from './pages/PedidosRecepcion'
import Stock from './pages/Stock'
import Mantenimiento from './pages/Mantenimiento'
import PedidosAdmin from './pages/PedidosAdmin'
import Impuestos from './pages/Impuestos'
import Administracion from './pages/Administracion'
import Facturas from './pages/Facturas'
import ControlCaja from './pages/ControlCaja'
import CerrarTurno from './pages/CerrarTurno'
import SyncPanel from './pages/SyncPanel'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { employee } = useAuth()
  if (!employee) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleRoute({ path, children }: { path: string; children: React.ReactNode }) {
  const { employee } = useAuth()
  if (!employee || !canAccess(employee.role, path)) {
    return <Navigate to={getDefaultRoute(employee?.role ?? 'mucama')} replace />
  }
  return <>{children}</>
}

function DefaultRedirect() {
  const { employee } = useAuth()
  return <Navigate to={getDefaultRoute(employee?.role ?? 'mucama')} replace />
}

function AppRoutes() {
  const { employee } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={employee ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DefaultRedirect />} />
        <Route path="administracion" element={<RoleRoute path="/administracion"><Administracion /></RoleRoute>} />
        <Route path="dashboard" element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
        <Route path="pedidos" element={<RoleRoute path="/pedidos"><Pedidos /></RoleRoute>} />
        <Route path="recepcion" element={<RoleRoute path="/recepcion"><PedidosRecepcion /></RoleRoute>} />
        <Route path="deposito" element={<RoleRoute path="/deposito"><Stock /></RoleRoute>} />
        <Route path="mantenimiento" element={<RoleRoute path="/mantenimiento"><Mantenimiento /></RoleRoute>} />
        <Route path="pedidos-admin" element={<RoleRoute path="/pedidos-admin"><PedidosAdmin /></RoleRoute>} />
        <Route path="facturas-proveedores" element={<RoleRoute path="/facturas-proveedores"><Facturas /></RoleRoute>} />
        <Route path="control-caja" element={<RoleRoute path="/control-caja"><ControlCaja /></RoleRoute>} />
        <Route path="cerrar-turno" element={<RoleRoute path="/cerrar-turno"><CerrarTurno /></RoleRoute>} />
        <Route path="impuestos" element={<RoleRoute path="/impuestos"><Impuestos /></RoleRoute>} />
        {/* Herramienta de unificación de datos (oculta del menú). Cualquier usuario logueado. */}
        <Route path="sync" element={<SyncPanel />} />
      </Route>
    </Routes>
  )
}

// Antes de montar los Context (que leen localStorage en su init), bajamos los
// datos de la nube a localStorage. Mostramos un splash breve mientras tanto.
// Si la nube no está configurada o tarda, arrancamos igual con lo local.
function CloudGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!cloudEnabled)

  useEffect(() => {
    if (!cloudEnabled) return
    let unsubscribe = () => {}
    let active = true
    pullAll().finally(() => {
      if (!active) return
      setReady(true)
      unsubscribe = subscribeRealtime()
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-cream">
        <div className="w-10 h-10 rounded-full border-4 border-navy-200 border-t-navy-800 animate-spin" />
        <p className="text-sm text-navy-500 font-medium">Sincronizando…</p>
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <CloudGate>
    <BrowserRouter>
      <AuthProvider>
        <OrdersProvider>
          <CajaProvider>
          <ParteProvider>
          <StockProvider>
            <MaintenanceProvider>
              <OccupancyProvider>
                <TurnosProvider>
                  <ImpuestosProvider>
                    <AppRoutes />
                  </ImpuestosProvider>
                </TurnosProvider>
              </OccupancyProvider>
            </MaintenanceProvider>
          </StockProvider>
          </ParteProvider>
          </CajaProvider>
        </OrdersProvider>
      </AuthProvider>
    </BrowserRouter>
    </CloudGate>
  )
}
