// Vista "de negocio" del dueño: cruza el dinero que ENTRA (cajas de los conserjes)
// con el que SALE (compras a proveedores, pedidos, mantenimiento, impuestos) para
// dar el RESULTADO del mes, la tendencia, la deuda en cuenta corriente y el gasto
// por proveedor. Función pura; reusa cajaControl y monthlyMetrics.
//
// OJO (regla del usuario): los RETIROS de caja NO son egresos — es plata que va a
// la caja fuerte/oficina, sigue siendo del hotel. Por eso los egresos del resultado
// salen de getMonthlyExpenses (compras/impuestos/mant), nunca de los retiros.

import type {
  CajaParte, Order, PedidoSemanal, MaintenanceTask, PagoMensual, PagoSueldo, FacturaProveedor,
  ParteHabitaciones, LavaderoLiquidacion, ImpuestoServicio,
} from '../types'
import type { OccupancyRecord } from '../context/OccupancyContext'
import { getCajaResumen, fechaConfiable } from './cajaControl'
import { getGastosCaja, getRetirosCaja, type GastoItem } from './panorama'
import { costoLavaderoMes } from './lavadero'
import { getMonthlyExpenses } from '../utils/monthlyMetrics'
import { isInMonth, getPreviousMonth, monthLabel, monthKey } from '../utils/dateRange'

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

// Todos los RETIROS DE EFECTIVO agrupados por mes (del más nuevo al más viejo).
// El retiro NO es gasto: es plata que va a la caja fuerte/oficina. Cada mes trae
// su total y el detalle, para ver el histórico completo en el dashboard. Agrupa
// por el mes de apertura de la caja.
export interface RetirosDeCajaMesGrupo {
  year: number
  month: number
  label: string
  key: string        // "YYYY-MM"
  total: number
  items: GastoItem[]
}

export function getRetirosDeCajaPorMes(cajas: CajaParte[]): RetirosDeCajaMesGrupo[] {
  const map = new Map<string, CajaParte[]>()
  for (const c of cajas) {
    const d = new Date(c.aperturaAt)
    if (isNaN(d.getTime())) continue
    const key = monthKey(d.getFullYear(), d.getMonth() + 1)
    const arr = map.get(key)
    if (arr) arr.push(c)
    else map.set(key, [c])
  }
  const out: RetirosDeCajaMesGrupo[] = []
  for (const [key, cs] of map.entries()) {
    const items = getRetirosCaja(cs)
    if (items.length === 0) continue
    const [y, m] = key.split('-').map(Number)
    out.push({ year: y, month: m, label: monthLabel(y, m), key, total: items.reduce((s, g) => s + g.total, 0), items })
  }
  return out.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))
}

// ===== Resultado del mes (ingresos − egresos) =====
export interface ResultadoMes {
  ingresos: number
  egresos: number       // compras/impuestos/sueldos/mant + gastos de caja + lavadero
  gastosCompras: number // sueldos/proveedores/pedidos/mantenimiento/impuestos (getMonthlyExpenses)
  gastosCaja: number    // egresos de caja (sin retiros)
  lavadero: number      // costo mensual del lavadero (0 si no está cargado)
  resultado: number
  margenPct: number     // resultado / ingresos
}

export function getResultadoMes(
  year: number, month: number,
  cajas: CajaParte[], orders: Order[], pedidos: PedidoSemanal[], tasks: MaintenanceTask[], pagos: PagoMensual[],
  pagosSueldos: PagoSueldo[] = [],
  liquidacionesLavadero: LavaderoLiquidacion[] = [],
): ResultadoMes {
  const ingresos = getIngresosMes(year, month, cajas).total
  // Los sueldos SÍ son un egreso del mes. Solo llegan con un admin logueado
  // (ADMIN_ONLY_KEYS); para no-admin la lista viene vacía y suman 0, que es lo correcto.
  const gastosCompras = getMonthlyExpenses(year, month, orders, pedidos, tasks, pagos, pagosSueldos).total
  const gastosCaja = getGastosDeCajaMes(year, month, cajas)
  const lavadero = costoLavaderoMes(year, month, liquidacionesLavadero) ?? 0
  const egresos = gastosCompras + gastosCaja + lavadero
  const resultado = ingresos - egresos
  return {
    ingresos, egresos, gastosCompras, gastosCaja, lavadero, resultado,
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
  liquidacionesLavadero: LavaderoLiquidacion[] = [],
): TendenciaMes[] {
  const out: TendenciaMes[] = []
  let y = hoy.getFullYear()
  let m = hoy.getMonth() + 1
  for (let i = 0; i < meses; i++) {
    const res = getResultadoMes(y, m, cajas, orders, pedidos, tasks, pagos, pagosSueldos, liquidacionesLavadero)
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

// ===== Noches-habitación del mes (para costo por habitación) =====
// Fuente primaria: los PARTES del turno NOCHE (el parte noche dice qué habitaciones
// durmieron ocupadas esa noche — sin doble carga). Un parte noche por día; si hay
// más de uno se queda el más nuevo. Fallback: los OccupancyRecord cargados a mano.
export interface NochesHabitacion {
  noches: number          // suma de habitaciones ocupadas por noche en el mes
  dias: number            // días del mes con dato
  fuente: 'partes' | 'ocupacion' | 'sin datos'
}

export function getNochesHabitacion(
  year: number, month: number,
  partes: ParteHabitaciones[], records: OccupancyRecord[] = [],
): NochesHabitacion {
  const porDia = new Map<string, ParteHabitaciones>()
  for (const p of partes) {
    if (p.turno !== 'noche') continue
    const f = fechaConfiable(p.fechaCaja, p.importedAt)
    if (!isInMonth(f, year, month)) continue
    const dia = f.slice(0, 10)
    const prev = porDia.get(dia)
    if (!prev || f > fechaConfiable(prev.fechaCaja, prev.importedAt)) porDia.set(dia, p)
  }
  if (porDia.size > 0) {
    const noches = [...porDia.values()].reduce((s, p) => s + p.totalOcupadas, 0)
    return { noches, dias: porDia.size, fuente: 'partes' }
  }
  // Fallback: ocupación cargada a mano (dedup por día, el último registro).
  const recPorDia = new Map<string, OccupancyRecord>()
  for (const r of records) {
    const [y, m] = r.date.split('-').map(Number)
    if (y !== year || m !== month) continue
    const prev = recPorDia.get(r.date)
    if (!prev || new Date(r.createdAt) > new Date(prev.createdAt)) recPorDia.set(r.date, r)
  }
  if (recPorDia.size > 0) {
    const noches = [...recPorDia.values()].reduce((s, r) => s + r.rooms, 0)
    return { noches, dias: recPorDia.size, fuente: 'ocupacion' }
  }
  return { noches: 0, dias: 0, fuente: 'sin datos' }
}

// ===== Costo por habitación ocupada del mes =====
// TODOS los costos del mes (sueldos, impuestos, servicios, compras, mantenimiento,
// gastos de caja, lavadero) repartidos sobre las noches-habitación ocupadas.
// Para que el número sea real tienen que estar cargados los sueldos y el costo
// del lavadero del mes: si faltan, se avisa (el costo daría de menos).
export interface CostoHabitacion {
  costoTotal: number
  noches: NochesHabitacion
  // El costo es del MES entero pero puede haber días sin parte: se estima el
  // total de noches del período con el promedio de los días que sí tienen dato.
  nochesEstimadas: number
  costoPorHabNoche: number      // costoTotal / nochesEstimadas (0 sin datos)
  desglose: { label: string; monto: number }[]
  sueldosCargados: boolean      // hay pagos de sueldos en el mes
  lavaderoCargado: boolean      // hay costo de lavadero cargado para el mes
}

export function getCostoHabitacion(
  year: number, month: number,
  cajas: CajaParte[], orders: Order[], pedidos: PedidoSemanal[], tasks: MaintenanceTask[], pagos: PagoMensual[],
  pagosSueldos: PagoSueldo[], servicios: ImpuestoServicio[],
  partes: ParteHabitaciones[], records: OccupancyRecord[],
  liquidacionesLavadero: LavaderoLiquidacion[],
  hoy: Date = new Date(),
): CostoHabitacion {
  const exp = getMonthlyExpenses(year, month, orders, pedidos, tasks, pagos, pagosSueldos, servicios)
  const gastosCaja = getGastosDeCajaMes(year, month, cajas)
  const lavadero = costoLavaderoMes(year, month, liquidacionesLavadero)
  const desglose = [
    { label: 'Sueldos', monto: exp.sueldos },
    { label: 'Impuestos y cargas', monto: exp.impuestosPagado },
    { label: 'Servicios (luz/gas/agua…)', monto: exp.serviciosPagado },
    { label: 'Profesionales y abonos', monto: exp.profesionalesPagado },
    { label: 'Compras (pedido semanal)', monto: exp.pedidosSemanales },
    { label: 'Compras (recepción diaria)', monto: exp.pedidosDistribuidor },
    { label: 'Mantenimiento', monto: exp.mantenimiento },
    { label: 'Gastos de caja', monto: gastosCaja },
    { label: 'Lavadero (ropa)', monto: lavadero ?? 0 },
  ].filter(d => d.monto > 0).sort((a, b) => b.monto - a.monto)
  const costoTotal = exp.total + gastosCaja + (lavadero ?? 0)
  const noches = getNochesHabitacion(year, month, partes, records)
  // Días del período: el mes completo si ya pasó; los transcurridos si es el actual.
  const esMesActual = hoy.getFullYear() === year && hoy.getMonth() + 1 === month
  const diasPeriodo = esMesActual ? hoy.getDate() : new Date(year, month, 0).getDate()
  const promedio = noches.dias > 0 ? noches.noches / noches.dias : 0
  const nochesEstimadas = Math.round(promedio * diasPeriodo)
  const mKey = monthKey(year, month)
  return {
    costoTotal,
    noches,
    nochesEstimadas,
    costoPorHabNoche: nochesEstimadas > 0 ? Math.round(costoTotal / nochesEstimadas) : 0,
    desglose,
    sueldosCargados: pagosSueldos.some(p => p.mes === mKey),
    lavaderoCargado: lavadero != null,
  }
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
