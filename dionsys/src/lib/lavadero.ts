// Control del lavadero tercerizado. La ropa blanca es ALQUILADA (sábanas,
// fundas, pie de baño…) en cuenta corriente: cada pedido va con remito (la
// copia la guarda la gobernanta y es lo que se carga acá) y a fin de quincena
// llega la LIQUIDACIÓN de los remitos originales, que debe coincidir con las
// copias. Funciones puras, sin estado.

import type { LavaderoMovimiento, LavaderoLiquidacion } from '../types'
import { isInMonth } from '../utils/dateRange'

// Sugerencias para cargar rápido (la prenda es texto libre igual).
export const PRENDAS_SUGERIDAS = [
  'Sábana', 'Sábana ajustable', 'Funda de almohada', 'Pie de baño',
  'Toalla', 'Toallón', 'Frazada', 'Acolchado', 'Cubrecama',
]

// ===== Balance por prenda: cuánta ropa tiene el lavadero ahora =====
export interface BalancePrenda {
  prenda: string
  enviadas: number     // sucias mandadas al lavadero (histórico)
  recibidas: number    // limpias que volvieron
  enLavadero: number   // enviadas - recibidas (>0 = la tiene el lavadero)
}

export function getBalanceRopa(movs: LavaderoMovimiento[]): BalancePrenda[] {
  const map = new Map<string, { enviadas: number; recibidas: number }>()
  for (const m of movs) {
    for (const p of m.prendas) {
      const key = p.prenda.trim()
      if (!key) continue
      const e = map.get(key) ?? { enviadas: 0, recibidas: 0 }
      if (m.tipo === 'envio_sucia') e.enviadas += p.cantidad
      else e.recibidas += p.cantidad
      map.set(key, e)
    }
  }
  return [...map.entries()]
    .map(([prenda, v]) => ({ prenda, ...v, enLavadero: v.enviadas - v.recibidas }))
    .sort((a, b) => b.enLavadero - a.enLavadero || a.prenda.localeCompare(b.prenda))
}

// ===== Conciliación de una liquidación contra las copias de remitos =====
// La liquidación lista los remitos ORIGINALES de la quincena; la gobernanta
// tiene las COPIAS (los movimientos cargados). Tienen que coincidir.
const normRemito = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')

export interface ConciliacionLiquidacion {
  // Remitos que la liquidación factura pero de los que NO hay copia cargada:
  // o falta cargar la copia, o el lavadero está cobrando algo que no entregó.
  remitosSinCopia: string[]
  // Copias del período que la liquidación NO lista (¿se olvidaron de facturarlo?).
  copiasSinLiquidar: string[]
}

export function conciliarLiquidacion(liq: LavaderoLiquidacion, movs: LavaderoMovimiento[]): ConciliacionLiquidacion {
  const copias = new Set(
    movs
      .filter(m => m.remito?.trim() && m.fecha >= liq.desde && m.fecha <= liq.hasta)
      .map(m => normRemito(m.remito!)),
  )
  const liquidados = new Set(liq.remitos.map(normRemito).filter(Boolean))
  return {
    remitosSinCopia: liq.remitos.filter(r => r.trim() && !copias.has(normRemito(r))),
    copiasSinLiquidar: movs
      .filter(m => m.remito?.trim() && m.fecha >= liq.desde && m.fecha <= liq.hasta && !liquidados.has(normRemito(m.remito!)))
      .map(m => m.remito!.trim()),
  }
}

// ===== Cuenta corriente con el lavadero =====
// Se paga en efectivo de la caja fuerte, a veces dos quincenas juntas: lo que
// no está marcado pagado es deuda.
export function getDeudaLavadero(liqs: LavaderoLiquidacion[]): { total: number; liquidaciones: number } {
  const pendientes = liqs.filter(l => !l.pagada)
  return { total: pendientes.reduce((s, l) => s + l.total, 0), liquidaciones: pendientes.length }
}

// ===== Costo mensual (para Negocio / costo por habitación) =====
// El costo del mes = liquidaciones cuya quincena TERMINA en ese mes (criterio
// devengado: la quincena 1-15 y la 16-fin caen en su propio mes). null = no hay
// ninguna liquidación cargada para ese mes todavía.
export function costoLavaderoMes(year: number, month: number, liqs: LavaderoLiquidacion[]): number | null {
  const delMes = liqs.filter(l => isInMonth(l.hasta + 'T12:00:00', year, month))
  if (delMes.length === 0) return null
  return delMes.reduce((s, l) => s + l.total, 0)
}

// ===== Resumen del mes =====
export interface LavaderoMes {
  enviadas: number       // prendas sucias mandadas en el mes
  recibidas: number      // prendas limpias recibidas en el mes
  movimientos: number
  costo: number | null   // liquidaciones del mes (null = sin liquidación cargada)
}

export function getLavaderoMes(
  year: number, month: number,
  movs: LavaderoMovimiento[], liqs: LavaderoLiquidacion[] = [],
): LavaderoMes {
  const delMes = movs.filter(m => isInMonth(m.fecha + 'T12:00:00', year, month))
  const cant = (tipo: LavaderoMovimiento['tipo']) =>
    delMes.filter(m => m.tipo === tipo).reduce((s, m) => s + m.prendas.reduce((a, p) => a + p.cantidad, 0), 0)
  return {
    enviadas: cant('envio_sucia'),
    recibidas: cant('recibo_limpia'),
    movimientos: delMes.length,
    costo: costoLavaderoMes(year, month, liqs),
  }
}
