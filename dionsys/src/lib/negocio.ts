// Vista "de negocio" del dueño: cruza el dinero que ENTRA (cajas de los conserjes)
// con el que SALE (compras a proveedores, pedidos, mantenimiento, impuestos) para
// dar el RESULTADO del mes, la tendencia, la deuda en cuenta corriente y el gasto
// por proveedor. Función pura; reusa cajaControl y monthlyMetrics.
//
// OJO (regla del usuario): los RETIROS de caja NO son egresos — es plata que va a
// la caja fuerte/oficina, sigue siendo del hotel. Por eso los egresos del resultado
// salen de getMonthlyExpenses (compras/impuestos/mant), nunca de los retiros.

import type { CajaParte, Order, PedidoSemanal, MaintenanceTask, PagoMensual, PagoSueldo, FacturaProveedor } from '../types'
import type { OccupancyRecord } from '../context/OccupancyContext'
import { getCajaResumen } from './cajaControl'
import { getGastosCaja, type GastoItem } from './panorama'
import { getMonthlyExpenses } from '../utils/monthlyMetrics'
import { isInMonth, getPreviousMonth, monthLabel } from '../utils/dateRange'

// ===== Ingresos del mes (de las cajas) =====
export interface IngresosMes {
  total: number
  efectivo: number
  tarjetas: number
  cheques: number
  transferencia: number
  otros: number
  cajas: number
}

export function getIngresosMes(year: number, month: number, cajas: CajaParte[]): IngresosMes {
  const delMes = cajas.filter(c => isInMonth(c.aperturaAt, year, month))
  const acc: IngresosMes = { total: 0, efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, cajas: delMes.length }
  for (const c of delMes) {
    const r = getCajaResumen(c)
    acc.total += r.totalCobrado
    acc.efectivo += r.efectivo
    acc.tarjetas += r.tarjetas
    acc.cheques += r.cheques
    acc.transferencia += r.transferencia
    acc.otros += r.otros
  }
  return acc
}

// Detalle de los gastos pagados DESDE la caja en el mes: cada egreso que NO es
// retiro de efectivo (el retiro va a la caja fuerte, no es gasto). Reusa
// getGastosCaja (ya excluye los RETIRO EFECTIVO), filtrando las cajas del mes.
export function getGastosDeCajaDetalle(year: number, month: number, cajas: CajaParte[]): GastoItem[] {
  return getGastosCaja(cajas.filter(c => isInMonth(c.aperturaAt, year, month)))
}

// Total de esos gastos de caja del mes.
export function getGastosDeCajaMes(year: number, month: number, cajas: CajaParte[]): number {
  return getGastosDeCajaDetalle(year, month, cajas).reduce((s, g) => s + g.total, 0)
}

// ===== Resultado del mes (ingresos − egresos) =====
export interface ResultadoMes {
  ingresos: number
  egresos: number       // compras/impuestos/sueldos/mant + gastos pagados de la caja
  gastosCompras: number // sueldos/proveedores/pedidos/mantenimiento/impuestos (getMonthlyExpenses)
  gastosCaja: number    // egresos de caja (sin retiros)
  resultado: number
  margenPct: number     // resultado / ingresos
}

export function getResultadoMes(
  year: number, month: number,
  cajas: CajaParte[], orders: Order[], pedidos: PedidoSemanal[], tasks: MaintenanceTask[], pagos: PagoMensual[],
  pagosSueldos: PagoSueldo[] = [],
): ResultadoMes {
  const ingresos = getIngresosMes(year, month, cajas).total
  // Los sueldos SÍ son un egreso del mes. Solo llegan con un admin logueado
  // (ADMIN_ONLY_KEYS); para no-admin la lista viene vacía y suman 0, que es lo correcto.
  const gastosCompras = getMonthlyExpenses(year, month, orders, pedidos, tasks, pagos, pagosSueldos).total
  const gastosCaja = getGastosDeCajaMes(year, month, cajas)
  const egresos = gastosCompras + gastosCaja
  const resultado = ingresos - egresos
  return {
    ingresos, egresos, gastosCompras, gastosCaja, resultado,
    margenPct: ingresos > 0 ? Math.round((resultado / ingresos) * 100) : 0,
  }
}

// ===== Tendencia de los últimos N meses =====
export interface TendenciaMes {
  year: number
  month: number
  label: string
  ingresos: number
  egresos: number
  resultado: number
}

export function getTendencia(
  meses: number,
  cajas: CajaParte[], orders: Order[], pedidos: PedidoSemanal[], tasks: MaintenanceTask[], pagos: PagoMensual[],
  hoy: Date = new Date(),
  pagosSueldos: PagoSueldo[] = [],
): TendenciaMes[] {
  const out: TendenciaMes[] = []
  let y = hoy.getFullYear()
  let m = hoy.getMonth() + 1
  for (let i = 0; i < meses; i++) {
    const res = getResultadoMes(y, m, cajas, orders, pedidos, tasks, pagos, pagosSueldos)
    out.unshift({ year: y, month: m, label: monthLabel(y, m), ingresos: res.ingresos, egresos: res.egresos, resultado: res.resultado })
    const prev = getPreviousMonth(y, m)
    y = prev.year; m = prev.month
  }
  return out
}

// ===== Facturas de proveedores (de orders + pedidos) =====
// Junta todas las FacturaProveedor cargadas, vengan del pedido semanal (varias por
// distribuidora) o de la recepción diaria (una por order).
interface FacturaConOrigen {
  factura: FacturaProveedor
  origen: 'Pedido semanal' | 'Recepción diaria'
}

function todasLasFacturas(orders: Order[], pedidos: PedidoSemanal[]): FacturaConOrigen[] {
  const out: FacturaConOrigen[] = []
  for (const o of orders) {
    if (o.status !== 'borrado' && o.factura) out.push({ factura: o.factura, origen: 'Recepción diaria' })
  }
  for (const p of pedidos) {
    if (p.status === 'borrado') continue
    for (const f of p.facturas ?? []) out.push({ factura: f, origen: 'Pedido semanal' })
  }
  return out
}

// ===== Cuenta corriente: deuda con proveedores sin saldar =====
export interface DeudaItem {
  supplierName: string
  monto: number
  vencimiento?: string   // YYYY-MM-DD
  origen: string
  diasParaVto?: number   // negativo = vencida
}

export interface CuentaCorriente {
  totalPendiente: number
  vencidas: number       // monto ya vencido y sin pagar
  items: DeudaItem[]     // todas las pendientes, ordenadas por vencimiento
  proximos: DeudaItem[]  // las que vencen dentro de 14 días (o ya vencidas)
}

export function getCuentaCorriente(orders: Order[], pedidos: PedidoSemanal[], hoy: Date = new Date()): CuentaCorriente {
  const items: DeudaItem[] = []
  const hoyMs = hoy.getTime()
  for (const { factura: f, origen } of todasLasFacturas(orders, pedidos)) {
    if (f.pago !== 'cuenta_corriente' || f.pagado) continue
    const diasParaVto = f.vencimiento
      ? Math.ceil((new Date(f.vencimiento + 'T00:00:00').getTime() - hoyMs) / (1000 * 60 * 60 * 24))
      : undefined
    items.push({
      supplierName: f.supplierName || 'Proveedor',
      monto: f.monto,
      ...(f.vencimiento ? { vencimiento: f.vencimiento } : {}),
      origen,
      ...(diasParaVto != null ? { diasParaVto } : {}),
    })
  }
  // Orden por vencimiento (las sin fecha al final).
  items.sort((a, b) => (a.vencimiento ?? '9999').localeCompare(b.vencimiento ?? '9999'))
  const totalPendiente = items.reduce((s, d) => s + d.monto, 0)
  const vencidas = items.filter(d => d.diasParaVto != null && d.diasParaVto < 0).reduce((s, d) => s + d.monto, 0)
  const proximos = items.filter(d => d.diasParaVto != null && d.diasParaVto <= 14)
  return { totalPendiente, vencidas, items, proximos }
}

// ===== Gasto por proveedor (en el mes) =====
export interface GastoProveedor {
  proveedor: string
  monto: number
  facturas: number
}

export function getGastoPorProveedor(year: number, month: number, orders: Order[], pedidos: PedidoSemanal[]): GastoProveedor[] {
  const map = new Map<string, { monto: number; facturas: number }>()
  const add = (nombre: string, monto: number) => {
    const e = map.get(nombre) ?? { monto: 0, facturas: 0 }
    e.monto += monto
    e.facturas += 1
    map.set(nombre, e)
  }
  // Recepción diaria: si hay factura usamos su fecha/monto/proveedor; si no, el order.
  for (const o of orders) {
    if (o.status === 'borrado') continue
    if (o.factura && isInMonth(o.factura.fecha, year, month)) {
      add(o.factura.supplierName || o.distributorName, o.factura.monto)
    } else if (o.monto != null && isInMonth(o.createdAt, year, month)) {
      add(o.distributorName || 'Sin proveedor', o.monto)
    }
  }
  // Pedido semanal: por distribuidora a través de sus facturas; si no hay, lump.
  for (const p of pedidos) {
    if (p.status === 'borrado') continue
    const fact = (p.facturas ?? []).filter(f => isInMonth(f.fecha, year, month))
    if (fact.length) {
      for (const f of fact) add(f.supplierName || 'Proveedor', f.monto)
    } else if (p.monto != null && isInMonth(p.date, year, month)) {
      add('Pedido semanal (sin desglose)', p.monto)
    }
  }
  return [...map.entries()]
    .map(([proveedor, v]) => ({ proveedor, monto: v.monto, facturas: v.facturas }))
    .sort((a, b) => b.monto - a.monto)
}

// ===== Ingreso cruzado con ocupación (RevPAR/ADR aproximados) =====
export interface RevenueOcupacion {
  ingresoPorHuesped: number
  ingresoPorHabitacion: number
  diasConDatos: number
}

// Usa los OccupancyRecord (dedup por día, el último de cada fecha) del mes para
// estimar noches-huésped y noches-habitación, y reparte el ingreso del mes.
export function getRevenueOcupacion(year: number, month: number, cajas: CajaParte[], records: OccupancyRecord[]): RevenueOcupacion {
  const delMes = records.filter(r => {
    const [y, m] = r.date.split('-').map(Number)
    return y === year && m === month
  })
  const porDia = new Map<string, OccupancyRecord>()
  for (const r of delMes) {
    const prev = porDia.get(r.date)
    if (!prev || new Date(r.createdAt) > new Date(prev.createdAt)) porDia.set(r.date, r)
  }
  const dias = [...porDia.values()]
  const huespedNoches = dias.reduce((s, r) => s + r.guests, 0)
  const nochesHab = dias.reduce((s, r) => s + r.rooms, 0)
  const ingresos = getIngresosMes(year, month, cajas).total
  return {
    ingresoPorHuesped: huespedNoches > 0 ? Math.round(ingresos / huespedNoches) : 0,
    ingresoPorHabitacion: nochesHab > 0 ? Math.round(ingresos / nochesHab) : 0,
    diasConDatos: dias.length,
  }
}
