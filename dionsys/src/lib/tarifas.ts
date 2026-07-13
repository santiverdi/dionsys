// Fase 3 del control: tarifas fuera de lo pactado. El dueño define las tarifas
// por período; acá se cruza cada cobro de la caja contra la tarifa que le
// corresponde a esa reserva. Las plazas (personas) salen del parte de
// habitaciones — en el parte "plazas" son personas reales durmiendo.
//
// Regla del hotel: la single tiene precio fijo por noche; de la doble a la
// quíntuple se cobra POR PERSONA por noche. "efectivo" es el precio con
// descuento por pagar en efectivo. Un cobro que cuadra = n noches × tarifa.

import type { CajaParte, ParteHabitaciones, CajaMovimiento } from '../types'
import { fechaConfiable, ingresosNetos, type CajaFlag } from './cajaControl'

export interface TarifaPeriodo {
  desde: string   // YYYY-MM-DD inclusive
  hasta: string   // YYYY-MM-DD inclusive
  single: { lista: number; efectivo: number }
  porPersona: { lista: number; efectivo: number }   // doble a quíntuple, por persona
  // "Pueden haber mejores descuentos": un cobro MENOR a lo pactado en este
  // período se avisa como info (a confirmar), no como imperfección.
  puedeHaberMasDescuento?: boolean
}

// SEMILLA de tarifas pactadas (julio 2026, pasadas por el dueño). Después de la
// primera carga, la fuente de verdad es lo guardado en el sistema: el admin las
// edita desde Control de Caja → "Tarifas pactadas" (TarifasContext, sincronizado).
export const TARIFAS_PACTADAS: TarifaPeriodo[] = [
  {
    desde: '2026-07-01', hasta: '2026-07-17',
    single: { lista: 60_000, efectivo: 54_000 },
    porPersona: { lista: 35_000, efectivo: 31_500 },
  },
  {
    desde: '2026-07-18', hasta: '2026-07-31',
    single: { lista: 60_000, efectivo: 54_000 },
    porPersona: { lista: 37_500, efectivo: 33_750 },
    puedeHaberMasDescuento: true,
  },
]

const EPS = 1          // los precios pactados son redondos: el cobro debe dar exacto
const MAX_NOCHES = 31  // hasta cuántas noches se prueba el múltiplo

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}

export function tarifaVigente(fecha: string, tarifas: TarifaPeriodo[] = TARIFAS_PACTADAS): TarifaPeriodo | undefined {
  const dia = (fecha || '').slice(0, 10)
  if (!dia) return undefined
  return tarifas.find(t => t.desde <= dia && dia <= t.hasta)
}

// Ventana hacia atrás que se controla para el aviso de cobertura de tarifas.
const VENTANA_SIN_TARIFA_MS = 15 * 24 * 3_600_000

// Meses (YYYY-MM) RECIENTES sin ninguna tarifa cargada: hoy y los días de las
// cajas de los últimos 15 días. Es el aviso al admin de que esos cobros están
// quedando SIN control de tarifa (la historia vieja sin tarifas no es accionable
// y no se reclama). Devuelve ordenado.
export function mesesSinTarifa(
  cajas: CajaParte[],
  tarifas: TarifaPeriodo[] = TARIFAS_PACTADAS,
  ahora: Date = new Date(),
): string[] {
  const meses = new Set<string>()
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
  if (!tarifaVigente(hoy, tarifas)) meses.add(hoy.slice(0, 7))
  for (const c of cajas) {
    const f = fechaConfiable(c.aperturaAt, c.importedAt)
    const t = new Date(f).getTime()
    if (isNaN(t) || ahora.getTime() - t > VENTANA_SIN_TARIFA_MS) continue
    if (!tarifaVigente(f, tarifas)) meses.add(f.slice(0, 7))
  }
  return [...meses].sort()
}

// Plazas (personas) de un cobro según los partes: primero por Nº de reserva
// (exacto), si no por habitación (tolerante a combinadas "205/202"). Una reserva
// de varias habitaciones suma las plazas de todas. Sin match no se puede saber
// la tarifa → no se controla ese cobro (mejor que un falso positivo).
function plazasDe(m: CajaMovimiento, partes: ParteHabitaciones[]): number {
  if (m.reserva) {
    for (const p of partes) {
      const habs = p.ocupadas.filter(o => o.reserva === m.reserva)
      if (habs.length) return sum(habs.map(o => o.plazas))
    }
  }
  if (m.habitacion) {
    const habsCobro = m.habitacion.split('/').map(s => s.trim()).filter(Boolean)
    for (const p of partes) {
      const habs = p.ocupadas.filter(o => habsCobro.includes(o.habitacion))
      if (habs.length) return sum(habs.map(o => o.plazas))
    }
  }
  return 0
}

export function getTarifaFlags(
  caja: CajaParte,
  partes: ParteHabitaciones[],
  tarifas: TarifaPeriodo[] = TARIFAS_PACTADAS,
): CajaFlag[] {
  const flags: CajaFlag[] = []

  // ingresosNetos: un cobro anulado por el PMS no se controla contra tarifa.
  for (const m of ingresosNetos(caja)) {
    if (m.total <= 0) continue
    const plazas = plazasDe(m, partes)
    if (!plazas) continue
    const periodo = tarifaVigente(m.fechaHora || caja.aperturaAt, tarifas)
    if (!periodo) continue

    const base = plazas === 1
      ? periodo.single
      : { lista: periodo.porPersona.lista * plazas, efectivo: periodo.porPersona.efectivo * plazas }
    // El precio de efectivo solo vale si el cobro fue TODO en efectivo.
    const pagoEfectivo = m.efectivo > 0 && Math.abs(m.efectivo - m.total) <= EPS

    // ¿El total es n noches × alguna tarifa? Se registra el múltiplo más cercano
    // (con signo) para saber si cobró de más o de menos.
    let cuadraLista = false, cuadraEfectivo = false
    let diffMin = Infinity
    for (const [tarifa, marcar] of [[base.lista, 'lista'], [base.efectivo, 'efectivo']] as const) {
      for (let n = 1; n <= MAX_NOCHES; n++) {
        const diff = m.total - n * tarifa
        if (Math.abs(diff) < Math.abs(diffMin)) diffMin = diff
        if (Math.abs(diff) <= EPS) {
          if (marcar === 'lista') cuadraLista = true
          else cuadraEfectivo = true
        }
      }
    }
    if (cuadraLista || (cuadraEfectivo && pagoEfectivo)) continue

    const quien = `Hab. ${m.habitacion || '?'}${m.reserva ? ` · reserva ${m.reserva}` : ''} (${plazas} pax)`
    const pactada = plazas === 1
      ? `single ${fmt(base.lista)}/noche (${fmt(base.efectivo)} en efectivo)`
      : `${plazas} pax × ${fmt(periodo.porPersona.lista)} = ${fmt(base.lista)}/noche (${fmt(base.efectivo)} en efectivo)`

    if (cuadraEfectivo && !pagoEfectivo) {
      flags.push({
        level: 'warn',
        tipo: 'tarifa',
        mensaje: `${quien}: cobro de ${fmt(m.total)} al precio de efectivo, pero no se pagó en efectivo. Tarifa pactada: ${pactada}.`,
      })
    } else if (diffMin < 0 && periodo.puedeHaberMasDescuento) {
      flags.push({
        level: 'info',
        tipo: 'tarifa',
        mensaje: `${quien}: cobro de ${fmt(m.total)}, por debajo de la tarifa pactada (${pactada}). En este período puede haber descuentos mejores — confirmalo con administración.`,
      })
    } else {
      flags.push({
        level: 'warn',
        tipo: 'tarifa',
        mensaje: `${quien}: cobro de ${fmt(m.total)} no cuadra con la tarifa pactada (${pactada}) para ninguna cantidad de noches.`,
      })
    }
  }

  return flags
}
