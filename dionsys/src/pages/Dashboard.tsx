import { useMemo } from 'react'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useOccupancy, HOTEL_CAPACITY } from '../context/OccupancyContext'
import {
  AlertTriangle, ShoppingCart, Wrench, DollarSign,
  Package, TrendingDown, Clock, CheckCircle2, Users,
} from 'lucide-react'

export default function Dashboard() {
  const { orders } = useOrders()
  const { items } = useStock()
  const { tasks } = useMaintenance()
  const { getToday } = useOccupancy()

  const now = new Date()
  const todayOccupancy = getToday()

  // Stock critico (stock < ideal)
  const lowStock = useMemo(
    () => items.filter(i => i.stock < i.stockIdeal),
    [items]
  )
  const zeroStock = useMemo(
    () => items.filter(i => i.stock === 0),
    [items]
  )

  // Pedidos de hoy
  const todayOrders = useMemo(() => {
    const today = now.toDateString()
    return orders.filter(o => o.status !== 'borrado' && new Date(o.createdAt).toDateString() === today)
  }, [orders])

  // Tareas pendientes
  const pendingTasks = useMemo(
    () => tasks.filter(t => t.status === 'pendiente' || t.status === 'en_progreso'),
    [tasks]
  )

  // Gastos del mes (mantenimiento)
  const monthCosts = useMemo(() => {
    return tasks
      .filter(t => {
        if (t.status !== 'completado') return false
        const d = new Date(t.createdAt)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      .reduce((sum, t) => {
        return sum + (t.materials ?? [])
          .filter(m => m.source === 'compra_externa')
          .reduce((s, m) => s + (m.cost ?? 0), 0)
      }, 0)
  }, [tasks])

  // Tareas completadas este mes
  const monthCompleted = useMemo(() => {
    return tasks.filter(t => {
      if (t.status !== 'completado' || !t.completedAt) return false
      const d = new Date(t.completedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [tasks])

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-1">Dashboard</h2>
      <p className="text-sm text-navy-400 mb-6">
        {now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Occupancy card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
        {todayOccupancy ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
              <Users size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-lg font-bold text-navy-800">{todayOccupancy.guests} huespedes</span>
                <span className="text-sm text-navy-500">{todayOccupancy.rooms} hab.</span>
                <span className="text-sm font-semibold text-navy-600">
                  {Math.round((todayOccupancy.rooms / HOTEL_CAPACITY) * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-navy-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (todayOccupancy.rooms / HOTEL_CAPACITY) * 100)}%`,
                    backgroundColor: (todayOccupancy.rooms / HOTEL_CAPACITY) > 0.85 ? '#ef4444' :
                      (todayOccupancy.rooms / HOTEL_CAPACITY) > 0.6 ? '#f59e0b' : '#22c55e'
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-navy-400">
            <Users size={20} />
            <span className="text-sm">Sin datos de ocupacion hoy</span>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-xs font-semibold text-red-600 uppercase">Sin stock</span>
          </div>
          <p className="text-2xl font-bold text-red-700">{zeroStock.length}</p>
          <p className="text-xs text-red-500">{lowStock.length} bajo ideal</p>
        </div>

        <div className="bg-gold-50 border border-gold-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingCart size={16} className="text-gold-600" />
            <span className="text-xs font-semibold text-gold-700 uppercase">Pedidos hoy</span>
          </div>
          <p className="text-2xl font-bold text-gold-800">{todayOrders.length}</p>
          <p className="text-xs text-gold-600">{orders.filter(o => o.status === 'enviado').length} enviados total</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={16} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 uppercase">Tareas pend.</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">{pendingTasks.length}</p>
          <p className="text-xs text-amber-600">{monthCompleted} completadas este mes</p>
        </div>

        <div className="bg-navy-50 border border-navy-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-navy-600" />
            <span className="text-xs font-semibold text-navy-500 uppercase">Gastos mes</span>
          </div>
          <p className="text-2xl font-bold text-navy-800">${monthCosts.toLocaleString('es-AR')}</p>
          <p className="text-xs text-navy-500">compras externas mant.</p>
        </div>
      </div>

      {/* Stock critico */}
      <div className="mb-6">
        <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3 flex items-center gap-2">
          <TrendingDown size={16} /> Stock critico
        </h3>
        {zeroStock.length === 0 && lowStock.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle2 size={24} className="mx-auto text-green-400 mb-1" />
            <p className="text-sm text-green-700 font-medium">Todo el stock esta al dia</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {[...zeroStock, ...lowStock.filter(i => i.stock > 0)].slice(0, 10).map(item => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  item.stock === 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Package size={14} className={item.stock === 0 ? 'text-red-500' : 'text-amber-500'} />
                  <span className="text-sm font-medium text-navy-800">{item.name}</span>
                </div>
                <span className={`text-sm font-bold ${item.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>
                  {item.stock} / {item.stockIdeal} {item.unit}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tareas pendientes */}
      {pendingTasks.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-navy-700 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock size={16} /> Tareas pendientes
          </h3>
          <div className="space-y-2">
            {pendingTasks.slice(0, 5).map(task => (
              <div key={task.id} className="bg-white border border-navy-100 rounded-xl p-3 flex gap-3">
                <img src={task.issuePhoto} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy-800 truncate">{task.description}</p>
                  <div className="flex items-center gap-2 text-xs text-navy-400 mt-0.5">
                    <span>{task.createdBy}</span>
                    {task.location && <span>- {task.location}</span>}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium self-start shrink-0 ${
                  task.status === 'en_progreso' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {task.status === 'en_progreso' ? 'En prog.' : 'Pendiente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
