// Análisis del mes para el Dashboard: junta TODO lo cargado (cajas, gastos,
// impuestos/servicios, stock, partes, sueldos, lavadero) y lo compara contra el
// mes anterior — qué sube, qué baja y en qué detalle. Es la base determinística
// que después narra la IA (api/analyze-month). Función pura, sin estado ni red.

import type {
  CajaParte, Order, PedidoSemanal, MaintenanceTask, PagoMensual, PagoSueldo,
  ImpuestoServicio, StockMovement, ParteHabitaciones, LavaderoMovimiento, LavaderoLiquidacion,
  CategoriaServicio,
} from '../types'
import { CATEGORIA_LABELS } from '../types'
import type { OccupancyRecord } from '../context/OccupancyContext'
import { getIngresosMes, getResultadoMes, getCostoHabitacion } from './negocio'
import { getLavaderoMes, getDeudaLavadero } from './lavadero'
import { getParteResumen } from './parteControl'
import { fechaConfiable } from './cajaControl'
import { getMonthlyExpenses, computeDelta, type Delta } from '../utils/monthlyMetrics'
import { isInMonth, getPreviousMonth, monthKey, monthLabel } from '../utils/dateRange'

export interface RubroComparado {
  rubro: string
  actual: number
  anterior: number
  delta: Delta
}

export interface StockItemComparado {
  item: string
  salidas: number          // consumo del mes, en unidad de consumo del item
  salidasAnterior: number
  delta: Delta
}

export interface AnalisisMesData {
  mes: string              // YYYY-MM
  label: string
  labelAnterior: string
  // Números grandes
  ingresos: RubroComparado
  egresos: RubroComparado
  resultado: RubroComparado
  ocupacionPromedioPct: RubroComparado   // de los partes del mes
  // Detalle
  egresosPorRubro: RubroComparado[]
  serviciosDetalle: RubroComparado[]     // cada impuesto/servicio, pagado mes vs anterior
  impuestosPendientes: number
  stockEntradas: RubroComparado          // unidades entradas al depósito
  stockSalidas: RubroComparado           // unidades consumidas
  stockPorItem: StockItemComparado[]     // top consumos con su variación
  costoHabitacion: {
    actual: number; anterior: number; delta: Delta
    sueldosCargados: boolean; lavaderoCargado: boolean
  }
  lavadero: { enviadas: number; recibidas: number; costo: number | null; deudaPendiente: number }
}

const comparar = (rubro: string, actual: number, anterior: number): RubroComparado =>
  ({ rubro, actual: Math.round(actual), anterior: Math.round(anterior), delta: computeDelta(Math.round(actual), Math.round(anterior)) })

function ocupacionPromedio(year: number, month: number, partes: ParteHabitaciones[]): number {
  const pcts = partes
    .filter(p => isInMonth(fechaConfiable(p.fechaCaja, p.importedAt), year, month))
    .map(p => getParteResumen(p).ocupacionPct)
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0
}

function stockDelMes(year: number, month: number, movements: StockMovement[]) {
  const delMes = movements.filter(m => isInMonth(m.date, year, month))
  const suma = (tipo: StockMovement['type']) =>
    delMes.filter(m => m.type === tipo).reduce((s, m) => s + m.quantity, 0)
  const salidasPorItem = new Map<string, number>()
  for (const m of delMes) {
    if (m.type !== 'salida') continue
    salidasPorItem.set(m.itemName, (salidasPorItem.get(m.itemName) ?? 0) + m.quantity)
  }
  return { entradas: suma('entrada'), salidas: suma('salida'), salidasPorItem }
}

export interface AnalisisInputs {
  cajas: CajaParte[]
  orders: Order[]
  pedidos: PedidoSemanal[]
  tasks: MaintenanceTask[]
  pagos: PagoMensual[]
  pagosSueldos: PagoSueldo[]
  servicios: ImpuestoServicio[]
  movements: StockMovement[]
  partes: ParteHabitaciones[]
  records: OccupancyRecord[]
  lavaderoMovs: LavaderoMovimiento[]
  lavaderoLiqs: LavaderoLiquidacion[]
}

export function getAnalisisMes(year: number, month: number, d: AnalisisInputs, hoy: Date = new Date()): AnalisisMesData {
  const prev = getPreviousMonth(year, month)
  const mKey = monthKey(year, month)
  const mKeyPrev = monthKey(prev.year, prev.month)

  const res = getResultadoMes(year, month, d.cajas, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.lavaderoLiqs)
  const resPrev = getResultadoMes(prev.year, prev.month, d.cajas, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.lavaderoLiqs)

  // Egresos por rubro, mes vs anterior.
  const exp = getMonthlyExpenses(year, month, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.servicios)
  const expPrev = getMonthlyExpenses(prev.year, prev.month, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.servicios)
  const egresosPorRubro = ([
    ['Sueldos', exp.sueldos, expPrev.sueldos],
    ['Cargas sociales', exp.cargasSociales, expPrev.cargasSociales],
    ['Impuestos y cargas', exp.impuestosPagado, expPrev.impuestosPagado],
    ['Servicios (luz/gas/agua…)', exp.serviciosPagado, expPrev.serviciosPagado],
    ['Profesionales y abonos', exp.profesionalesPagado, expPrev.profesionalesPagado],
    ['Compras (pedido semanal)', exp.pedidosSemanales, expPrev.pedidosSemanales],
    ['Compras (recepción diaria)', exp.pedidosDistribuidor, expPrev.pedidosDistribuidor],
    ['Mantenimiento', exp.mantenimiento, expPrev.mantenimiento],
    ['Gastos de caja', res.gastosCaja, resPrev.gastosCaja],
    ['Lavadero (ropa)', res.lavadero, resPrev.lavadero],
  ] as const)
    .filter(([, a, b]) => a > 0 || b > 0)
    .map(([rubro, a, b]) => comparar(rubro, a, b))
    .sort((a, b) => b.actual - a.actual)

  // Cada impuesto/servicio, uno por uno (lo pagado en el mes vs el anterior).
  const pagadoDe = (servicioId: string, mes: string) =>
    d.pagos.filter(p => p.pagado && p.impuestoId === servicioId && p.mes === mes).reduce((s, p) => s + p.monto, 0)
  const serviciosDetalle = d.servicios
    .map(s => {
      const cat: CategoriaServicio = s.categoria ?? 'impuesto'
      return comparar(`${s.nombre} (${CATEGORIA_LABELS[cat]})`, pagadoDe(s.id, mKey), pagadoDe(s.id, mKeyPrev))
    })
    .filter(r => r.actual > 0 || r.anterior > 0)
    .sort((a, b) => b.actual - a.actual)

  // Stock: entradas/salidas y consumo por item.
  const stock = stockDelMes(year, month, d.movements)
  const stockPrev = stockDelMes(prev.year, prev.month, d.movements)
  const items = new Set([...stock.salidasPorItem.keys(), ...stockPrev.salidasPorItem.keys()])
  const stockPorItem: StockItemComparado[] = [...items]
    .map(item => {
      const salidas = +(stock.salidasPorItem.get(item) ?? 0).toFixed(2)
      const salidasAnterior = +(stockPrev.salidasPorItem.get(item) ?? 0).toFixed(2)
      return { item, salidas, salidasAnterior, delta: computeDelta(salidas, salidasAnterior) }
    })
    .sort((a, b) => b.salidas - a.salidas)
    .slice(0, 15)

  // Costo por habitación (mes actual y anterior, para el delta).
  const costo = getCostoHabitacion(year, month, d.cajas, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.servicios, d.partes, d.records, d.lavaderoLiqs, hoy)
  const costoPrev = getCostoHabitacion(prev.year, prev.month, d.cajas, d.orders, d.pedidos, d.tasks, d.pagos, d.pagosSueldos, d.servicios, d.partes, d.records, d.lavaderoLiqs, hoy)

  const lavaderoMes = getLavaderoMes(year, month, d.lavaderoMovs, d.lavaderoLiqs)

  return {
    mes: mKey,
    label: monthLabel(year, month),
    labelAnterior: monthLabel(prev.year, prev.month),
    ingresos: comparar('Ingresos', getIngresosMes(year, month, d.cajas).total, getIngresosMes(prev.year, prev.month, d.cajas).total),
    egresos: comparar('Egresos', res.egresos, resPrev.egresos),
    resultado: comparar('Resultado', res.resultado, resPrev.resultado),
    ocupacionPromedioPct: comparar('Ocupación promedio %', ocupacionPromedio(year, month, d.partes), ocupacionPromedio(prev.year, prev.month, d.partes)),
    egresosPorRubro,
    serviciosDetalle,
    impuestosPendientes: exp.impuestosPendiente,
    stockEntradas: comparar('Entradas de stock (unidades)', stock.entradas, stockPrev.entradas),
    stockSalidas: comparar('Salidas de stock (unidades)', stock.salidas, stockPrev.salidas),
    stockPorItem,
    costoHabitacion: {
      actual: costo.costoPorHabNoche,
      anterior: costoPrev.costoPorHabNoche,
      delta: computeDelta(costo.costoPorHabNoche, costoPrev.costoPorHabNoche),
      sueldosCargados: costo.sueldosCargados,
      lavaderoCargado: costo.lavaderoCargado,
    },
    lavadero: {
      enviadas: lavaderoMes.enviadas,
      recibidas: lavaderoMes.recibidas,
      costo: lavaderoMes.costo,
      deudaPendiente: getDeudaLavadero(d.lavaderoLiqs).total,
    },
  }
}
