// Control predictivo del lavadero: cuánta ropa DEBERÍA haber salido según la
// ocupación real, contra la que se llevaron según los remitos.
//
// Es la versión automática del control que Charo hacía a mano en Excel: sumaba
// los remitos de la quincena y lo comparaba contra la liquidación. Acá se agrega
// el otro lado, que a mano no se podía: cuánta ropa justifica la ocupación.
//
// POR QUÉ SE MIDE POR PERÍODO Y NO POR REMITO (medido contra los datos reales de
// julio 2026, 18 retiros cruzados contra los partes):
//   - los check-outs casi NO explican el volumen de ropa (correlación 0,18): el
//     modelo "se cambia todo cuando se desocupa" no es lo que pasa en este hotel
//   - la ocupación explica bastante más (0,58 por noche-habitación)
//   - los retiros son irregulares (cada 1-3 días) y hay demora entre que la ropa
//     se ensucia y se la llevan, así que un remito suelto no mapea contra un
//     período limpio
// Conclusión: comparar remito por remito da falsos positivos. Acumulado por
// período (el de la liquidación) el ruido se promedia y la desviación se ve.
//
// OJO CON EL RATIO: se calibra con la propia historia del hotel, así que detecta
// CAMBIOS respecto de lo normal, no un sobreprecio que venga de arrastre. Si el
// lavadero factura de más desde siempre, eso queda dentro del ratio.

import type { LavaderoMovimiento, ParteHabitaciones } from '../types'
import { prendaCanonica } from './lavadero'
import { fechaConfiable } from './cajaControl'

// Cuántas noches con parte hacen falta para que la comparación signifique algo.
// Por debajo de esto el período está tan incompleto que el esperado es humo.
const MIN_COBERTURA_PCT = 60

export interface DriversPeriodo {
  desde: string
  hasta: string
  dias: number               // días del período
  nochesConParte: number     // noches que tienen parte del turno noche
  coberturaPct: number       // nochesConParte / dias
  nochesHabitacion: number   // Σ habitaciones ocupadas por noche
  nochesPlaza: number        // Σ personas durmiendo por noche
  salidas: number            // check-outs (informativo: no predicen la ropa)
}

const enRango = (d: string, desde: string, hasta: string) => !!d && d >= desde && d <= hasta

/**
 * Un parte por noche: el del turno NOCHE, que es el que refleja quiénes
 * DURMIERON esa noche (misma regla que usa el costo por habitación y el
 * desayuno). Si hay varios del mismo día se queda con el de más ocupadas.
 */
export function partesPorNoche(partes: ParteHabitaciones[]): Map<string, ParteHabitaciones> {
  const porDia = new Map<string, ParteHabitaciones>()
  for (const p of partes) {
    if (p.turno !== 'noche') continue
    const dia = fechaConfiable(p.fechaCaja, p.importedAt).slice(0, 10)
    if (!dia) continue
    const actual = porDia.get(dia)
    if (!actual || p.ocupadas.length > actual.ocupadas.length) porDia.set(dia, p)
  }
  return porDia
}

/** Ocupación acumulada del período: es lo que genera ropa sucia. */
export function driversDelPeriodo(
  desde: string,
  hasta: string,
  partes: ParteHabitaciones[],
): DriversPeriodo {
  const porNoche = partesPorNoche(partes)
  const dias = Math.max(1, Math.round(
    (new Date(hasta + 'T12:00:00').getTime() - new Date(desde + 'T12:00:00').getTime()) / 86_400_000,
  ) + 1)

  const noches = [...porNoche.keys()].filter(d => enRango(d, desde, hasta)).sort()
  let nochesHabitacion = 0, nochesPlaza = 0, salidas = 0

  const todas = [...porNoche.keys()].sort()
  for (const dia of noches) {
    const p = porNoche.get(dia)!
    nochesHabitacion += p.ocupadas.length
    nochesPlaza += p.ocupadas.reduce((s, o) => s + o.plazas, 0)
    // Salidas = reservas que estaban la noche anterior y ya no están.
    const anteriorDia = todas[todas.indexOf(dia) - 1]
    const anterior = anteriorDia ? porNoche.get(anteriorDia) : undefined
    if (anterior) {
      const hoy = new Set(p.ocupadas.map(o => o.reserva))
      salidas += anterior.ocupadas.filter(o => !hoy.has(o.reserva)).length
    }
  }

  return {
    desde, hasta, dias,
    nochesConParte: noches.length,
    coberturaPct: Math.round((noches.length / dias) * 100),
    nochesHabitacion, nochesPlaza, salidas,
  }
}

/** Prendas retiradas (sucias que se lleva el lavadero) en el período, por prenda canónica. */
export function retiradasDelPeriodo(
  desde: string,
  hasta: string,
  movs: LavaderoMovimiento[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo !== 'envio_sucia' || !enRango(m.fecha, desde, hasta)) continue
    for (const p of m.prendas) {
      const k = prendaCanonica(p.prenda)
      out.set(k, (out.get(k) ?? 0) + p.cantidad)
    }
  }
  return out
}

export interface RatioPrenda {
  prenda: string        // canónica
  porNocheHab: number   // prendas por noche-habitación
}

export interface Calibracion {
  ratios: RatioPrenda[]
  desde: string
  hasta: string
  nochesHabitacion: number
  noches: number
}

/**
 * Ratio normal del hotel, calibrado con la historia cargada: total de cada
 * prenda retirada ÷ total de noches-habitación del mismo tramo.
 *
 * El tramo es el SOLAPAMIENTO entre las noches con parte y las fechas con
 * remitos. Sin eso el ratio se diluye: si hay partes de junio pero los remitos
 * arrancan en julio, esas noches de junio suman ocupación sin ropa y el ratio
 * queda bajo → después TODO parece exceso del lavadero.
 */
export function calibrarRatios(
  movs: LavaderoMovimiento[],
  partes: ParteHabitaciones[],
): Calibracion {
  const vacia: Calibracion = { ratios: [], desde: '', hasta: '', nochesHabitacion: 0, noches: 0 }
  const porNoche = partesPorNoche(partes)
  const dias = [...porNoche.keys()].sort()
  const fechasRemito = movs.filter(m => m.tipo === 'envio_sucia').map(m => m.fecha).filter(Boolean).sort()
  if (!dias.length || !fechasRemito.length) return vacia

  const desde = dias[0] > fechasRemito[0] ? dias[0] : fechasRemito[0]
  const hasta = dias[dias.length - 1] < fechasRemito[fechasRemito.length - 1]
    ? dias[dias.length - 1]
    : fechasRemito[fechasRemito.length - 1]
  if (desde > hasta) return vacia

  const drivers = driversDelPeriodo(desde, hasta, partes)
  const retiradas = retiradasDelPeriodo(desde, hasta, movs)

  const ratios = [...retiradas.entries()]
    .map(([prenda, cantidad]) => ({
      prenda,
      porNocheHab: drivers.nochesHabitacion ? cantidad / drivers.nochesHabitacion : 0,
    }))
    .filter(r => r.porNocheHab > 0)
    .sort((a, b) => b.porNocheHab - a.porNocheHab)

  return { ratios, desde, hasta, nochesHabitacion: drivers.nochesHabitacion, noches: drivers.nochesConParte }
}

export interface ComparacionPrenda {
  prenda: string
  esperadas: number
  retiradas: number
  diff: number        // retiradas - esperadas (>0 = salió más ropa de la que justifica la ocupación)
  desvioPct: number   // sobre lo esperado
}

export interface PrediccionPeriodo {
  drivers: DriversPeriodo
  prendas: ComparacionPrenda[]
  totalEsperadas: number
  totalRetiradas: number
  /** false = el período tiene demasiados días sin parte; la comparación no significa nada. */
  confiable: boolean
  /** Prendas que aparecen en los remitos y no tienen ratio (nunca se vieron antes). */
  sinRatio: string[]
}

const DESVIO_MIN = 10    // % por debajo del cual es ruido, no vale marcarlo
// Piso de volumen: una prenda que se movió 6 veces puede dar "+133%" sin querer
// decir nada (caso real: "Tapices", que salió en un solo remito de julio). Sin
// este piso el panel se llena de porcentajes enormes sobre cantidades chicas.
const VOLUMEN_MIN = 20

export function compararPeriodo(
  desde: string,
  hasta: string,
  movs: LavaderoMovimiento[],
  partes: ParteHabitaciones[],
  ratios: RatioPrenda[],
): PrediccionPeriodo {
  const drivers = driversDelPeriodo(desde, hasta, partes)
  const retiradas = retiradasDelPeriodo(desde, hasta, movs)
  const porPrenda = new Map(ratios.map(r => [r.prenda, r.porNocheHab]))

  const nombres = [...new Set([...porPrenda.keys(), ...retiradas.keys()])].sort()
  const prendas = nombres.map(prenda => {
    const esperadas = Math.round((porPrenda.get(prenda) ?? 0) * drivers.nochesHabitacion)
    const reales = retiradas.get(prenda) ?? 0
    const diff = reales - esperadas
    return {
      prenda,
      esperadas,
      retiradas: reales,
      diff,
      desvioPct: esperadas ? Math.round((diff / esperadas) * 100) : 0,
    }
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

  return {
    drivers,
    prendas,
    totalEsperadas: prendas.reduce((s, p) => s + p.esperadas, 0),
    totalRetiradas: prendas.reduce((s, p) => s + p.retiradas, 0),
    confiable: drivers.coberturaPct >= MIN_COBERTURA_PCT && drivers.nochesHabitacion > 0,
    sinRatio: [...retiradas.keys()].filter(p => !porPrenda.has(p)).sort(),
  }
}

/** Las prendas que se desviaron lo suficiente —y con volumen suficiente— como para preguntar. */
export function desviosRelevantes(pred: PrediccionPeriodo): ComparacionPrenda[] {
  if (!pred.confiable) return []
  return pred.prendas.filter(p =>
    p.esperadas > 0 &&
    Math.max(p.esperadas, p.retiradas) >= VOLUMEN_MIN &&
    Math.abs(p.desvioPct) >= DESVIO_MIN,
  )
}
