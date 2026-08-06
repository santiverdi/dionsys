// Cruce del libro de Charo contra lo que el sistema ya tiene cargado.
//
// EL PROBLEMA: el libro es el registro completo de lo que se pagó, pero una
// parte de eso ya se carga en las pantallas del sistema (sueldos, impuestos,
// servicios, mantenimiento, pedidos). Sumar el libro entero contaría esos dos
// veces; no sumarlo pierde todo lo que solo está en el libro.
//
// LA SOLUCIÓN, SIN MARCAR NADA A MANO: se aparea pago contra pago por MONTO y
// FECHA CERCANA. Lo que aparea ya está contado y no se suma de nuevo; lo que no
// aparea es plata que el sistema no conocía y sí suma. Es el mismo criterio que
// ya se usa para no contar dos veces el pan pagado de la caja (desayunoCosto).
//
// Los "pagos del sistema" se arman con EL MISMO recorte que usa el Dashboard
// (getMonthlyExpenses): lo que aparea es exactamente lo que el Dashboard ya
// sumó ese mes, así las dos cuentas cierran.
//
// LO QUE NO APAREA NO ES UN ERROR: puede ser un gasto que solo lleva Charo
// (publicidad, sindicato, librería). Al revés también: algo cargado en el
// sistema que no está en el libro queda listado aparte para poder revisarlo.

import type {
  LibroCajaMes, LibroCajaMovimiento, Order, PedidoSemanal, MaintenanceTask,
  PagoMensual, PagoSueldo, ImpuestoServicio, CategoriaServicio,
} from '../types'
import { isInMonth, monthKey } from '../utils/dateRange'
import { esSalidaDePlata } from './libroCajaConceptos'

export interface PagoSistema {
  fuente: string      // dónde está cargado, para poder decirlo en pantalla
  fecha: string       // YYYY-MM-DD
  monto: number
  detalle: string
}

export interface SistemaInputs {
  orders: Order[]
  pedidos: PedidoSemanal[]
  tasks: MaintenanceTask[]
  pagos: PagoMensual[]
  pagosSueldos: PagoSueldo[]
  servicios: ImpuestoServicio[]
}

const fechaDe = (iso: string): string => (iso || '').slice(0, 10)

/**
 * Todo lo que el sistema ya tiene cargado como pagado en el mes, pago por pago.
 * Mismo recorte que getMonthlyExpenses: si el Dashboard lo sumó, está acá.
 */
export function pagosDelSistema(year: number, month: number, d: SistemaInputs): PagoSistema[] {
  const mKey = monthKey(year, month)
  const out: PagoSistema[] = []

  for (const p of d.pagosSueldos.filter(p => p.mes === mKey)) {
    out.push({
      fuente: 'Sueldos',
      fecha: fechaDe(p.fecha),
      monto: p.monto,
      detalle: p.tipo === 'cargas' ? 'Cargas sociales' : p.empleadoNombre,
    })
  }

  const categoriaDe = (impuestoId: string): CategoriaServicio =>
    d.servicios.find(s => s.id === impuestoId)?.categoria ?? 'impuesto'
  const nombreDe = (impuestoId: string): string =>
    d.servicios.find(s => s.id === impuestoId)?.nombre ?? 'Impuesto/servicio'

  for (const p of d.pagos.filter(p => p.pagado && p.mes === mKey)) {
    const cat = categoriaDe(p.impuestoId)
    out.push({
      fuente: cat === 'servicio' ? 'Servicios' : cat === 'profesional' ? 'Profesionales' : 'Impuestos',
      // El pago puede haberse marcado otro día: si no hay fecha de pago, manda el vencimiento.
      fecha: fechaDe(p.fechaPago ?? '') || p.vtoActual,
      monto: p.monto,
      detalle: nombreDe(p.impuestoId),
    })
  }

  // Pedidos y recepción diaria: se ofrecen el total del pedido Y cada factura
  // suelta, porque el libro suele tener un pago por proveedor y el sistema el
  // total. Aparear consume uno solo, así que no se cuenta dos veces.
  for (const p of d.pedidos) {
    if (p.status === 'borrado') continue
    if (!isInMonth(p.date, year, month)) continue
    if (p.monto != null) {
      out.push({ fuente: 'Pedido semanal', fecha: fechaDe(p.date), monto: p.monto, detalle: 'Pedido semanal' })
    }
    for (const f of p.facturas ?? []) {
      out.push({ fuente: 'Pedido semanal', fecha: fechaDe(f.fecha), monto: f.monto, detalle: f.supplierName || 'Proveedor' })
    }
  }
  for (const o of d.orders) {
    if (o.status === 'borrado') continue
    if (o.monto != null && isInMonth(o.createdAt, year, month)) {
      out.push({ fuente: 'Recepción diaria', fecha: fechaDe(o.createdAt), monto: o.monto, detalle: o.distributorName })
    }
    if (o.factura && isInMonth(o.factura.fecha, year, month)) {
      out.push({ fuente: 'Recepción diaria', fecha: fechaDe(o.factura.fecha), monto: o.factura.monto, detalle: o.factura.supplierName || o.distributorName })
    }
  }

  for (const t of d.tasks) {
    if (t.status !== 'completado' || !isInMonth(t.createdAt, year, month)) continue
    for (const m of t.materials ?? []) {
      if (m.source !== 'compra_externa' || !m.cost) continue
      out.push({ fuente: 'Mantenimiento', fecha: fechaDe(t.createdAt), monto: m.cost, detalle: m.name || t.description })
    }
  }

  return out.filter(p => p.monto > 0)
}

export interface CruceLibro {
  yaCargados: { mov: LibroCajaMovimiento; pago: PagoSistema }[]
  soloLibro: LibroCajaMovimiento[]      // lo que suma: el sistema no lo tenía
  soloSistema: PagoSistema[]            // cargado en el sistema y sin espejo en el libro
  totalSoloLibro: number
  totalYaCargado: number
}

const dias = (a: string, b: string): number =>
  Math.abs(new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86_400_000

/**
 * Aparea las salidas del libro contra los pagos del sistema: mismo monto (±$1)
 * y fecha cercana. Cada pago se usa una sola vez. Se busca primero el más
 * cercano en fecha, para que dos pagos iguales no se crucen entre sí.
 */
export function cruzarLibro(
  movimientos: LibroCajaMovimiento[],
  pagosSistema: PagoSistema[],
  toleranciaDias = 10,
): CruceLibro {
  const libres = pagosSistema.map(p => ({ p, usado: false }))
  const yaCargados: CruceLibro['yaCargados'] = []
  const soloLibro: LibroCajaMovimiento[] = []

  // Solo las SALIDAS que son gasto de verdad: lo que entra y los movimientos
  // internos (retiros, cambio) no se cruzan con nada ni suman.
  const salidas = movimientos.filter(m => m.monto < 0 && esSalidaDePlata(m.conceptoCod))

  for (const mov of salidas) {
    const monto = -mov.monto
    let mejor = -1, mejorDist = Infinity
    for (let i = 0; i < libres.length; i++) {
      const c = libres[i]
      if (c.usado || Math.abs(c.p.monto - monto) > 1) continue
      const dist = dias(c.p.fecha, mov.fecha)
      if (dist > toleranciaDias || dist >= mejorDist) continue
      mejor = i; mejorDist = dist
    }
    if (mejor >= 0) {
      libres[mejor].usado = true
      yaCargados.push({ mov, pago: libres[mejor].p })
    } else {
      soloLibro.push(mov)
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    yaCargados,
    soloLibro,
    soloSistema: libres.filter(c => !c.usado).map(c => c.p),
    totalSoloLibro: round(soloLibro.reduce((s, m) => s - m.monto, 0)),
    totalYaCargado: round(yaCargados.reduce((s, x) => s - x.mov.monto, 0)),
  }
}

/**
 * Lo que el libro agrega a los egresos de cada mes: las salidas que el sistema
 * NO tenía cargadas. Es lo que suma el Dashboard.
 */
export function salidasDelLibroPorMes(
  meses: LibroCajaMes[],
  d: SistemaInputs,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const mes of meses) {
    const [y, m] = mes.mes.split('-').map(Number)
    if (!y || !m) continue
    const cruce = cruzarLibro(mes.movimientos, pagosDelSistema(y, m, d))
    if (cruce.totalSoloLibro > 0) out.set(mes.mes, cruce.totalSoloLibro)
  }
  return out
}
