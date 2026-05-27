import * as XLSX from 'xlsx'
import type {
  Order, PedidoSemanal, StockMovement, MaintenanceTask,
  PagoMensual, Employee,
} from '../types'
import type { OccupancyRecord } from '../context/OccupancyContext'
import { HOTEL_CAPACITY } from '../context/OccupancyContext'
import {
  getMonthlyExpenses, getMonthlyOccupancy, getMonthlyDeposit,
  getMonthlyMaintenance, getEmployeeActivity,
} from './monthlyMetrics'
import {
  monthLabel, monthKey, isInMonth, getPreviousMonth, daysInMonth,
} from './dateRange'

export interface ExportData {
  orders: Order[]
  pedidos: PedidoSemanal[]
  movements: StockMovement[]
  tasks: MaintenanceTask[]
  pagos: PagoMensual[]
  records: OccupancyRecord[]
  employees: Employee[]
}

type Cell = string | number
type Row = Cell[]

export function exportMonthlyReport(year: number, month: number, data: ExportData): string {
  const expenses = getMonthlyExpenses(year, month, data.orders, data.pedidos, data.tasks, data.pagos)
  const prev = getPreviousMonth(year, month)
  const expensesPrev = getMonthlyExpenses(prev.year, prev.month, data.orders, data.pedidos, data.tasks, data.pagos)
  const occupancy = getMonthlyOccupancy(year, month, data.records, HOTEL_CAPACITY)
  const deposit = getMonthlyDeposit(year, month, data.movements, [])
  const maintenance = getMonthlyMaintenance(year, month, data.tasks)
  const activity = getEmployeeActivity(year, month, data.employees, data.orders, data.pedidos, data.movements, data.tasks, data.pagos)

  const workbook = XLSX.utils.book_new()

  // Hoja 1: Resumen
  const resumen: Row[] = [
    ['DIONSYS - Reporte mensual', monthLabel(year, month)],
    [],
    ['GASTOS DEL MES'],
    ['Concepto', 'Monto', `vs ${monthLabel(prev.year, prev.month)}`],
    ['Impuestos pagados', expenses.impuestosPagado, expensesPrev.impuestosPagado],
    ['Impuestos pendientes', expenses.impuestosPendiente, expensesPrev.impuestosPendiente],
    ['Pedidos semanales', expenses.pedidosSemanales, expensesPrev.pedidosSemanales],
    ['Pedidos distribuidor', expenses.pedidosDistribuidor, expensesPrev.pedidosDistribuidor],
    ['Mantenimiento', expenses.mantenimiento, expensesPrev.mantenimiento],
    ['TOTAL', expenses.total, expensesPrev.total],
    [],
    ['OCUPACION'],
    ['Días con datos cargados', occupancy.totalDiasConDatos],
    ['Promedio huéspedes/día', occupancy.avgGuests],
    ['Promedio habitaciones/día', occupancy.avgRooms],
    ['Promedio % ocupación', occupancy.avgOccupancyPct],
    ['Días llenos (>85%)', occupancy.diasLlenos],
    ['Días vacíos (<30%)', occupancy.diasVacios],
    [],
    ['DEPOSITO'],
    ['Total movimientos', deposit.movimientosCount],
    ['Total entradas (cantidad)', deposit.totalEntradas],
    ['Total salidas (cantidad)', deposit.totalSalidas],
    ['Stock crítico (al cierre)', deposit.stockCritico.length],
    [],
    ['MANTENIMIENTO'],
    ['Tareas creadas', maintenance.creadas],
    ['Tareas completadas', maintenance.completadas],
    ['Tareas pendientes', maintenance.pendientes],
    ['Tiempo promedio resolución (h)', maintenance.tiempoPromedioHoras],
    ['Gasto en materiales', maintenance.gastoMateriales],
  ]
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')

  // Hoja 2: Gastos detallados
  const mKey = monthKey(year, month)
  const gastosRows: Row[] = [['Tipo', 'Fecha', 'Descripción', 'Monto', 'Cargado por', 'Estado']]
  for (const p of data.pagos.filter(p => p.mes === mKey)) {
    gastosRows.push(['Impuesto', p.vtoActual, 'Vto pago', p.monto, p.createdBy ?? '', p.pagado ? 'Pagado' : 'Pendiente'])
  }
  for (const o of data.orders) {
    if (o.status === 'borrado' || o.monto == null || !isInMonth(o.createdAt, year, month)) continue
    gastosRows.push(['Pedido distribuidor', o.createdAt, o.distributorName, o.monto, o.montoCargadoBy ?? '', o.status])
  }
  for (const p of data.pedidos) {
    if (p.status === 'borrado' || p.monto == null || !isInMonth(p.date, year, month)) continue
    gastosRows.push(['Pedido semanal', p.date, `${p.items.length} ítems`, p.monto, p.montoCargadoBy ?? '', p.status])
  }
  for (const t of data.tasks) {
    if (t.status !== 'completado' || !isInMonth(t.createdAt, year, month)) continue
    const cost = (t.materials ?? [])
      .filter(m => m.source === 'compra_externa')
      .reduce((s, m) => s + (m.cost ?? 0), 0)
    if (cost > 0) {
      gastosRows.push(['Mantenimiento', t.completedAt ?? t.createdAt, t.description, cost, t.completedBy ?? '', 'Completado'])
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(gastosRows), 'Gastos')

  // Hoja 3: Movimientos
  const movRows: Row[] = [['Fecha', 'Tipo', 'Item', 'Cantidad', 'Usuario', 'Notas']]
  for (const m of data.movements) {
    if (!isInMonth(m.date, year, month)) continue
    movRows.push([m.date, m.type, m.itemName, m.quantity, m.createdBy, m.notes])
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(movRows), 'Movimientos')

  // Hoja 4: Mantenimiento
  const mantRows: Row[] = [['Creada', 'Completada', 'Descripción', 'Ubicación', 'Estado', 'Creado por', 'Completado por', 'Tiempo (h)', 'Gasto materiales']]
  for (const t of data.tasks) {
    const inMonth = isInMonth(t.createdAt, year, month) || (t.completedAt ? isInMonth(t.completedAt, year, month) : false)
    if (!inMonth) continue
    const tiempoH = t.completedAt
      ? Math.round(((new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime()) / (1000 * 60 * 60)) * 10) / 10
      : ''
    const gasto = (t.materials ?? [])
      .filter(m => m.source === 'compra_externa')
      .reduce((s, m) => s + (m.cost ?? 0), 0)
    mantRows.push([
      t.createdAt, t.completedAt ?? '', t.description, t.location ?? '',
      t.status, t.createdBy, t.completedBy ?? '', tiempoH, gasto,
    ])
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(mantRows), 'Mantenimiento')

  // Hoja 5: Actividad por usuario
  const actRows: Row[] = [['Empleado', 'Rol', 'Última actividad', 'Días inactivo', 'Pedidos distribuidor', 'Pedidos semanales', 'Mov. entradas', 'Mov. salidas', 'Tareas creadas', 'Tareas completadas', 'Montos cargados']]
  for (const a of activity) {
    actRows.push([
      a.name, a.role, a.lastActivityAt ?? '', a.daysInactive,
      a.orders, a.pedidosSemanales, a.movimientosEntradas, a.movimientosSalidas,
      a.tareasCreadas, a.tareasCompletadas, a.montosCargados,
    ])
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(actRows), 'Actividad')

  // Hoja 6: Ocupación diaria
  const days = daysInMonth(year, month)
  const occRows: Row[] = [['Día', 'Fecha', 'Huéspedes', 'Habitaciones', '% Ocupación', 'Cargado por']]
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const rec = data.records.find(r => r.date === dateStr)
    if (rec) {
      const pct = Math.round((rec.rooms / HOTEL_CAPACITY) * 100)
      occRows.push([d, dateStr, rec.guests, rec.rooms, pct, rec.createdBy])
    } else {
      occRows.push([d, dateStr, '', '', '', ''])
    }
  }
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(occRows), 'Ocupación')

  const filename = `dionsys-${monthKey(year, month)}.xlsx`
  XLSX.writeFile(workbook, filename)
  return filename
}
