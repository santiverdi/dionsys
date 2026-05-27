import { useState, useMemo } from 'react'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus,
  DollarSign, Users, Package, Wrench, Activity, FileSpreadsheet,
} from 'lucide-react'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useOccupancy, HOTEL_CAPACITY } from '../context/OccupancyContext'
import { useImpuestos } from '../context/ImpuestosContext'
import {
  monthLabel, getPreviousMonth, getCurrentMonth, getNextMonth,
} from '../utils/dateRange'
import {
  getMonthlyExpenses, getMonthlyOccupancy, getMonthlyDeposit,
  getMonthlyMaintenance, getEmployeeActivity, computeDelta, type Delta,
} from '../utils/monthlyMetrics'
import { exportMonthlyReport } from '../utils/monthlyExport'
import { formatMontoCurrency } from '../utils/validators'
import { employees } from '../data/mock'

function DeltaPill({ delta, inverse = false }: { delta: Delta; inverse?: boolean }) {
  // inverse=true means "up is good" (e.g. ocupación). Default: up is bad (gastos).
  const Icon = delta.direction === 'up' ? TrendingUp : delta.direction === 'down' ? TrendingDown : Minus
  const isGood = inverse ? delta.direction === 'up' : delta.direction === 'down'
  const isBad = inverse ? delta.direction === 'down' : delta.direction === 'up'
  const color = isGood
    ? 'text-green-700 bg-green-50'
    : isBad
      ? 'text-red-700 bg-red-50'
      : 'text-navy-400 bg-navy-50'
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${color}`}>
      <Icon size={10} />
      {delta.direction === 'flat' ? '—' : `${Math.abs(delta.pct)}%`}
    </span>
  )
}

function ExpenseTile({ label, current, previous }: { label: string; current: number; previous: number }) {
  const delta = computeDelta(current, previous)
  return (
    <div className="bg-navy-50 rounded-lg p-2">
      <p className="text-[10px] text-navy-500 mb-0.5 leading-tight">{label}</p>
      <p className="text-sm font-bold text-navy-800 mb-0.5">{formatMontoCurrency(current)}</p>
      <DeltaPill delta={delta} />
    </div>
  )
}

function MetricCard({ label, value, prevValue, suffix = '', inverse = false }: {
  label: string; value: number; prevValue: number; suffix?: string; inverse?: boolean
}) {
  const delta = computeDelta(value, prevValue)
  return (
    <div className="bg-navy-50 rounded-lg p-2">
      <p className="text-[10px] text-navy-500 mb-0.5 leading-tight">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <p className="text-base font-bold text-navy-800">{value}{suffix}</p>
        <DeltaPill delta={delta} inverse={inverse} />
      </div>
    </div>
  )
}

export default function MonthlyView() {
  const { orders } = useOrders()
  const { items, pedidos, movements } = useStock()
  const { tasks } = useMaintenance()
  const { records } = useOccupancy()
  const { pagos } = useImpuestos()

  const [view, setView] = useState(() => getCurrentMonth())
  const current = useMemo(() => getCurrentMonth(), [])
  const prev = useMemo(() => getPreviousMonth(view.year, view.month), [view])
  const isCurrentOrPast = view.year < current.year || (view.year === current.year && view.month <= current.month)

  const expenses = useMemo(
    () => getMonthlyExpenses(view.year, view.month, orders, pedidos, tasks, pagos),
    [view, orders, pedidos, tasks, pagos]
  )
  const expensesPrev = useMemo(
    () => getMonthlyExpenses(prev.year, prev.month, orders, pedidos, tasks, pagos),
    [prev, orders, pedidos, tasks, pagos]
  )

  const occupancy = useMemo(
    () => getMonthlyOccupancy(view.year, view.month, records, HOTEL_CAPACITY),
    [view, records]
  )
  const occupancyPrev = useMemo(
    () => getMonthlyOccupancy(prev.year, prev.month, records, HOTEL_CAPACITY),
    [prev, records]
  )

  const deposit = useMemo(
    () => getMonthlyDeposit(view.year, view.month, movements, items),
    [view, movements, items]
  )
  const depositPrev = useMemo(
    () => getMonthlyDeposit(prev.year, prev.month, movements, items),
    [prev, movements, items]
  )

  const maintenance = useMemo(
    () => getMonthlyMaintenance(view.year, view.month, tasks),
    [view, tasks]
  )
  const maintenancePrev = useMemo(
    () => getMonthlyMaintenance(prev.year, prev.month, tasks),
    [prev, tasks]
  )

  const activity = useMemo(
    () => getEmployeeActivity(view.year, view.month, employees, orders, pedidos, movements, tasks, pagos),
    [view, orders, pedidos, movements, tasks, pagos]
  )

  function handleExport() {
    exportMonthlyReport(view.year, view.month, {
      orders, pedidos, movements, tasks, pagos, records, employees,
    })
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-navy-100 gap-2">
        <button
          onClick={() => setView(getPreviousMonth(view.year, view.month))}
          className="p-2 rounded-lg hover:bg-navy-50 transition-colors"
        >
          <ChevronLeft size={20} className="text-navy-600" />
        </button>
        <h3 className="text-lg font-bold text-navy-800 flex-1 text-center">{monthLabel(view.year, view.month)}</h3>
        <button
          onClick={() => setView(getNextMonth(view.year, view.month))}
          disabled={!isCurrentOrPast}
          className="p-2 rounded-lg hover:bg-navy-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={20} className="text-navy-600" />
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shrink-0"
          title="Descargar Excel del mes"
        >
          <FileSpreadsheet size={14} /> Excel
        </button>
      </div>

      {/* Gastos */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={18} className="text-navy-600" />
          <h3 className="font-bold text-navy-800">Gastos del mes</h3>
        </div>
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <span className="text-3xl font-bold text-navy-800">{formatMontoCurrency(expenses.total)}</span>
          <DeltaPill delta={computeDelta(expenses.total, expensesPrev.total)} />
          <span className="text-xs text-navy-400">vs {monthLabel(prev.year, prev.month)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <ExpenseTile label="Impuestos pagados" current={expenses.impuestosPagado} previous={expensesPrev.impuestosPagado} />
          <ExpenseTile label="Imp. pendiente" current={expenses.impuestosPendiente} previous={expensesPrev.impuestosPendiente} />
          <ExpenseTile label="Pedido semanal" current={expenses.pedidosSemanales} previous={expensesPrev.pedidosSemanales} />
          <ExpenseTile label="Pedidos distrib." current={expenses.pedidosDistribuidor} previous={expensesPrev.pedidosDistribuidor} />
          <ExpenseTile label="Mantenimiento" current={expenses.mantenimiento} previous={expensesPrev.mantenimiento} />
        </div>
      </section>

      {/* Ocupación */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-navy-600" />
          <h3 className="font-bold text-navy-800">Ocupación</h3>
        </div>
        {occupancy.totalDiasConDatos === 0 ? (
          <p className="text-sm text-navy-400 italic">Sin datos de ocupación cargados este mes.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard label="Huésp./día (avg)" value={occupancy.avgGuests} prevValue={occupancyPrev.avgGuests} suffix=" pax" inverse />
              <MetricCard label="% ocupación avg" value={occupancy.avgOccupancyPct} prevValue={occupancyPrev.avgOccupancyPct} suffix="%" inverse />
              <MetricCard label="Días llenos (>85%)" value={occupancy.diasLlenos} prevValue={occupancyPrev.diasLlenos} inverse />
              <MetricCard label="Días vacíos (<30%)" value={occupancy.diasVacios} prevValue={occupancyPrev.diasVacios} />
            </div>
            <p className="text-[10px] text-navy-400 mt-2">{occupancy.totalDiasConDatos} día(s) con datos cargados</p>
          </>
        )}
      </section>

      {/* Depósito */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
        <div className="flex items-center gap-2 mb-3">
          <Package size={18} className="text-navy-600" />
          <h3 className="font-bold text-navy-800">Depósito</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <MetricCard label="Movimientos" value={deposit.movimientosCount} prevValue={depositPrev.movimientosCount} />
          <MetricCard label="Entradas (cant)" value={deposit.totalEntradas} prevValue={depositPrev.totalEntradas} />
          <MetricCard label="Salidas (cant)" value={deposit.totalSalidas} prevValue={depositPrev.totalSalidas} />
        </div>
        {deposit.topSalidas.length > 0 && (
          <div className="bg-navy-50 rounded-lg p-2.5 mb-2">
            <p className="text-[10px] font-semibold text-navy-600 uppercase mb-1.5">Top 5 con más salidas</p>
            <div className="space-y-0.5">
              {deposit.topSalidas.map(s => (
                <div key={s.itemName} className="flex justify-between text-xs">
                  <span className="text-navy-700 truncate">{s.itemName}</span>
                  <span className="font-semibold text-navy-800 shrink-0 ml-2">{s.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {deposit.stockCritico.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
            {deposit.stockCritico.length} ítem(s) en stock crítico al cierre del mes
          </p>
        )}
      </section>

      {/* Mantenimiento */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
        <div className="flex items-center gap-2 mb-3">
          <Wrench size={18} className="text-navy-600" />
          <h3 className="font-bold text-navy-800">Mantenimiento</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard label="Creadas" value={maintenance.creadas} prevValue={maintenancePrev.creadas} />
          <MetricCard label="Completadas" value={maintenance.completadas} prevValue={maintenancePrev.completadas} inverse />
          <MetricCard label="Pendientes" value={maintenance.pendientes} prevValue={maintenancePrev.pendientes} />
          <MetricCard label="Tiempo resol. (h)" value={maintenance.tiempoPromedioHoras} prevValue={maintenancePrev.tiempoPromedioHoras} />
        </div>
        {maintenance.gastoMateriales > 0 && (
          <p className="text-xs text-navy-500 mt-2">
            Gasto en materiales: <span className="font-bold text-navy-800">{formatMontoCurrency(maintenance.gastoMateriales)}</span>
          </p>
        )}
      </section>

      {/* Actividad por usuario */}
      <section className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
        <div className="flex items-center gap-2 mb-3">
          <Activity size={18} className="text-navy-600" />
          <h3 className="font-bold text-navy-800">Actividad por usuario</h3>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-navy-500 border-b border-navy-100">
                <th className="text-left py-2 pr-2">Empleado</th>
                <th className="text-right px-2">Última act.</th>
                <th className="text-right px-2">Pedidos</th>
                <th className="text-right px-2">Mov +/−</th>
                <th className="text-right px-2">Tareas</th>
                <th className="text-right pl-2">Montos</th>
              </tr>
            </thead>
            <tbody>
              {activity.map(a => (
                <tr key={a.name} className="border-b border-navy-50 last:border-0">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-navy-800">{a.name}</span>
                      <span className="text-[9px] bg-navy-100 text-navy-500 px-1.5 py-0.5 rounded-full uppercase tracking-wide">{a.role}</span>
                    </div>
                  </td>
                  <td className={`text-right px-2 ${a.daysInactive > 7 ? 'text-red-600 font-semibold' : 'text-navy-500'}`}>
                    {a.lastActivityAt
                      ? (a.daysInactive === 0 ? 'hoy' : a.daysInactive === 1 ? 'ayer' : `hace ${a.daysInactive}d`)
                      : '—'}
                  </td>
                  <td className="text-right px-2 text-navy-700">{a.orders + a.pedidosSemanales}</td>
                  <td className="text-right px-2 text-navy-700">{a.movimientosEntradas} / {a.movimientosSalidas}</td>
                  <td className="text-right px-2 text-navy-700">{a.tareasCreadas} / {a.tareasCompletadas}</td>
                  <td className="text-right pl-2 text-navy-700">{a.montosCargados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-navy-400 mt-2">
          Mov +/− = entradas/salidas · Tareas = creadas/completadas · Inactivo &gt;7d en rojo
        </p>
      </section>
    </div>
  )
}
