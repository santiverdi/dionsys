import type {
  Order, PedidoSemanal, StockMovement, MaintenanceTask,
  PagoMensual, Employee, DepositoItem, PagoSueldo, ImpuestoServicio,
  CategoriaServicio,
} from '../types'
import type { OccupancyRecord } from '../context/OccupancyContext'
import { isInMonth, monthKey } from './dateRange'

// ---------- Gastos ----------

export interface MonthlyExpenses {
  sueldos: number
  impuestosPagado: number
  serviciosPagado: number
  profesionalesPagado: number
  impuestosPendiente: number
  pedidosSemanales: number
  pedidosDistribuidor: number
  mantenimiento: number
  total: number
}

export function getMonthlyExpenses(
  year: number,
  month: number,
  orders: Order[],
  pedidos: PedidoSemanal[],
  tasks: MaintenanceTask[],
  pagos: PagoMensual[],
  pagosSueldos: PagoSueldo[] = [],
  servicios: ImpuestoServicio[] = [],
): MonthlyExpenses {
  const mKey = monthKey(year, month)

  // Mapa servicioId → categoría. Un servicio sin categoría (o inexistente) cuenta
  // como 'impuesto' para no romper la retrocompatibilidad con lo ya cargado.
  const categoriaDe = (impuestoId: string): CategoriaServicio => {
    const srv = servicios.find(s => s.id === impuestoId)
    return srv?.categoria ?? 'impuesto'
  }

  const pagados = pagos.filter(p => p.pagado && p.mes === mKey)
  const impuestosPagado = pagados
    .filter(p => categoriaDe(p.impuestoId) === 'impuesto')
    .reduce((s, p) => s + p.monto, 0)
  const serviciosPagado = pagados
    .filter(p => categoriaDe(p.impuestoId) === 'servicio')
    .reduce((s, p) => s + p.monto, 0)
  const profesionalesPagado = pagados
    .filter(p => categoriaDe(p.impuestoId) === 'profesional')
    .reduce((s, p) => s + p.monto, 0)
  const impuestosPendiente = pagos
    .filter(p => !p.pagado && p.mes === mKey)
    .reduce((s, p) => s + p.monto, 0)
  const sueldos = pagosSueldos
    .filter(p => p.mes === mKey)
    .reduce((s, p) => s + p.monto, 0)
  const pedidosSemanales = pedidos
    .filter(p => p.status !== 'borrado' && p.monto != null && isInMonth(p.date, year, month))
    .reduce((s, p) => s + (p.monto ?? 0), 0)
  const pedidosDistribuidor = orders
    .filter(o => o.status !== 'borrado' && o.monto != null && isInMonth(o.createdAt, year, month))
    .reduce((s, o) => s + (o.monto ?? 0), 0)
  const mantenimiento = tasks
    .filter(t => t.status === 'completado' && isInMonth(t.createdAt, year, month))
    .reduce((sum, t) => sum + (t.materials ?? [])
      .filter(m => m.source === 'compra_externa')
      .reduce((s, m) => s + (m.cost ?? 0), 0), 0)

  const total = sueldos + impuestosPagado + serviciosPagado + profesionalesPagado
    + pedidosSemanales + pedidosDistribuidor + mantenimiento
  return {
    sueldos, impuestosPagado, serviciosPagado, profesionalesPagado, impuestosPendiente,
    pedidosSemanales, pedidosDistribuidor, mantenimiento, total,
  }
}

// ---------- Ocupación ----------

export interface MonthlyOccupancy {
  avgGuests: number
  avgRooms: number
  avgOccupancyPct: number
  diasLlenos: number
  diasVacios: number
  totalDiasConDatos: number
}

export function getMonthlyOccupancy(
  year: number,
  month: number,
  records: OccupancyRecord[],
  capacity: number,
): MonthlyOccupancy {
  const filtered = records.filter(r => {
    const parts = r.date.split('-').map(Number)
    return parts[0] === year && parts[1] === month
  })

  // Deduplicate by date: keep the LATEST record per day (when multiple turnos exist)
  const byDate = new Map<string, OccupancyRecord>()
  for (const r of filtered) {
    const existing = byDate.get(r.date)
    if (!existing || new Date(r.createdAt) > new Date(existing.createdAt)) {
      byDate.set(r.date, r)
    }
  }
  const dayRecords = [...byDate.values()]

  const total = dayRecords.length
  if (total === 0) {
    return { avgGuests: 0, avgRooms: 0, avgOccupancyPct: 0, diasLlenos: 0, diasVacios: 0, totalDiasConDatos: 0 }
  }
  const avgGuests = dayRecords.reduce((s, r) => s + r.guests, 0) / total
  const avgRooms = dayRecords.reduce((s, r) => s + r.rooms, 0) / total
  const avgOccupancyPct = (avgRooms / capacity) * 100
  const diasLlenos = dayRecords.filter(r => (r.rooms / capacity) > 0.85).length
  const diasVacios = dayRecords.filter(r => (r.rooms / capacity) < 0.30).length

  return {
    avgGuests: Math.round(avgGuests),
    avgRooms: Math.round(avgRooms * 10) / 10,
    avgOccupancyPct: Math.round(avgOccupancyPct),
    diasLlenos,
    diasVacios,
    totalDiasConDatos: total,
  }
}

// ---------- Depósito ----------

export interface MonthlyDeposit {
  totalEntradas: number
  totalSalidas: number
  movimientosCount: number
  topSalidas: { itemName: string; quantity: number }[]
  stockCritico: { name: string; stock: number; ideal: number }[]
}

export function getMonthlyDeposit(
  year: number,
  month: number,
  movements: StockMovement[],
  items: DepositoItem[],
): MonthlyDeposit {
  const filtered = movements.filter(m => isInMonth(m.date, year, month))
  const totalEntradas = filtered
    .filter(m => m.type === 'entrada')
    .reduce((s, m) => s + m.quantity, 0)
  const totalSalidas = filtered
    .filter(m => m.type === 'salida')
    .reduce((s, m) => s + m.quantity, 0)

  const salidasByItem = new Map<string, number>()
  for (const m of filtered) {
    if (m.type !== 'salida') continue
    salidasByItem.set(m.itemName, (salidasByItem.get(m.itemName) ?? 0) + m.quantity)
  }
  const topSalidas = [...salidasByItem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([itemName, quantity]) => ({ itemName, quantity: Math.round(quantity * 10) / 10 }))

  const stockCritico = items
    .filter(i => i.stock < i.stockIdeal)
    .map(i => ({ name: i.name, stock: i.stock, ideal: i.stockIdeal }))

  return {
    totalEntradas: Math.round(totalEntradas * 10) / 10,
    totalSalidas: Math.round(totalSalidas * 10) / 10,
    movimientosCount: filtered.length,
    topSalidas,
    stockCritico,
  }
}

// ---------- Mantenimiento ----------

export interface MonthlyMaintenance {
  creadas: number
  completadas: number
  pendientes: number
  tiempoPromedioHoras: number
  gastoMateriales: number
}

export function getMonthlyMaintenance(
  year: number,
  month: number,
  tasks: MaintenanceTask[],
): MonthlyMaintenance {
  const createdInMonth = tasks.filter(t => isInMonth(t.createdAt, year, month))
  const completedInMonth = tasks.filter(t => t.completedAt && isInMonth(t.completedAt, year, month))
  const pendientes = tasks.filter(t => t.status !== 'completado' && isInMonth(t.createdAt, year, month)).length

  const tiemposMs = completedInMonth
    .filter(t => t.completedAt)
    .map(t => new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime())
  const tiempoPromedioMs = tiemposMs.length > 0
    ? tiemposMs.reduce((s, n) => s + n, 0) / tiemposMs.length
    : 0

  const gastoMateriales = completedInMonth.reduce((sum, t) => {
    return sum + (t.materials ?? [])
      .filter(m => m.source === 'compra_externa')
      .reduce((s, m) => s + (m.cost ?? 0), 0)
  }, 0)

  return {
    creadas: createdInMonth.length,
    completadas: completedInMonth.length,
    pendientes,
    tiempoPromedioHoras: Math.round((tiempoPromedioMs / (1000 * 60 * 60)) * 10) / 10,
    gastoMateriales,
  }
}

// ---------- Actividad por empleado ----------

export interface EmployeeActivity {
  name: string
  role: string
  lastActivityAt: string | null
  daysInactive: number
  orders: number
  pedidosSemanales: number
  movimientosEntradas: number
  movimientosSalidas: number
  tareasCreadas: number
  tareasCompletadas: number
  montosCargados: number
}

export function getEmployeeActivity(
  year: number,
  month: number,
  employees: Employee[],
  orders: Order[],
  pedidos: PedidoSemanal[],
  movements: StockMovement[],
  tasks: MaintenanceTask[],
  pagos: PagoMensual[],
  now: Date = new Date(),
): EmployeeActivity[] {
  return employees.filter(e => e.active).map(emp => {
    const empOrders = orders.filter(o => o.createdBy === emp.name && o.status !== 'borrado' && isInMonth(o.createdAt, year, month))
    const empPedidos = pedidos.filter(p => p.createdBy === emp.name && p.status !== 'borrado' && isInMonth(p.date, year, month))
    const empMovements = movements.filter(m => m.createdBy === emp.name && isInMonth(m.date, year, month))
    const empTasksCreated = tasks.filter(t => t.createdBy === emp.name && isInMonth(t.createdAt, year, month))
    const empTasksCompleted = tasks.filter(t => t.completedBy === emp.name && t.completedAt && isInMonth(t.completedAt, year, month))

    const empOrdersMonto = orders.filter(o => o.montoCargadoBy === emp.name && o.montoCargadoAt && isInMonth(o.montoCargadoAt, year, month))
    const empPedidosMonto = pedidos.filter(p => p.montoCargadoBy === emp.name && p.montoCargadoAt && isInMonth(p.montoCargadoAt, year, month))
    const empPagos = pagos.filter(p => p.createdBy === emp.name && p.createdAt && isInMonth(p.createdAt, year, month))

    const allDates: string[] = [
      ...empOrders.map(o => o.createdAt),
      ...empPedidos.map(p => p.date),
      ...empMovements.map(m => m.date),
      ...empTasksCreated.map(t => t.createdAt),
      ...empTasksCompleted.map(t => t.completedAt!),
      ...empOrdersMonto.map(o => o.montoCargadoAt!),
      ...empPedidosMonto.map(p => p.montoCargadoAt!),
      ...empPagos.map(p => p.createdAt!),
    ]
    const lastActivityAt = allDates.length > 0
      ? allDates.reduce((a, b) => (a > b ? a : b))
      : null
    const daysInactive = lastActivityAt
      ? Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999

    return {
      name: emp.name,
      role: emp.role,
      lastActivityAt,
      daysInactive,
      orders: empOrders.length,
      pedidosSemanales: empPedidos.length,
      movimientosEntradas: empMovements.filter(m => m.type === 'entrada').length,
      movimientosSalidas: empMovements.filter(m => m.type === 'salida').length,
      tareasCreadas: empTasksCreated.length,
      tareasCompletadas: empTasksCompleted.length,
      montosCargados: empOrdersMonto.length + empPedidosMonto.length + empPagos.length,
    }
  })
}

// ---------- Delta helper ----------

export interface Delta {
  pct: number
  absolute: number
  direction: 'up' | 'down' | 'flat'
}

export function computeDelta(current: number, previous: number): Delta {
  const absolute = current - previous
  if (previous === 0) {
    return { pct: current > 0 ? 100 : 0, absolute, direction: current > 0 ? 'up' : 'flat' }
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  return {
    pct: Math.round(pct * 10) / 10,
    absolute,
    direction: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
  }
}
