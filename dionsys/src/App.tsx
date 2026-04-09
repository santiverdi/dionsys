import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrdersProvider } from './context/OrdersContext'
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
        <Route path="dashboard" element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
        <Route path="pedidos" element={<RoleRoute path="/pedidos"><Pedidos /></RoleRoute>} />
        <Route path="recepcion" element={<RoleRoute path="/recepcion"><PedidosRecepcion /></RoleRoute>} />
        <Route path="deposito" element={<RoleRoute path="/deposito"><Stock /></RoleRoute>} />
        <Route path="mantenimiento" element={<RoleRoute path="/mantenimiento"><Mantenimiento /></RoleRoute>} />
        <Route path="pedidos-admin" element={<RoleRoute path="/pedidos-admin"><PedidosAdmin /></RoleRoute>} />
        <Route path="impuestos" element={<RoleRoute path="/impuestos"><Impuestos /></RoleRoute>} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrdersProvider>
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
        </OrdersProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
