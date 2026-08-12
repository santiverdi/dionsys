// Fase 3 del control: tarifas fuera de lo pactado. El dueño define las tarifas
// por período; acá se cruza cada cobro de la caja contra la tarifa que le
// corresponde a esa reserva. Las plazas (personas) salen del parte de
// habitaciones — en el parte "plazas" son personas reales durmiendo.
//
// Regla del hotel: la "single" NO es un tipo de habitación — el hotel no tiene
// ninguna de 1 cama. Es la tarifa de OCUPACIÓN SIMPLE: una sola persona en una
// habitación paga un precio fijo por noche (60.000). De 2 personas en adelante
// se cobra POR PERSONA por noche (2 pax = 2 × 35.000 = 70.000). Por eso el
// precio se elige por las personas del parte y no por la capacidad del cuarto.
// "efectivo" es el precio con descuento por pagar en efectivo. Un cobro que
// cuadra = n noches × tarifa.
//
// La capacidad real de la habitación (maestro en src/data/hotel.ts) no entra en
// el precio, pero sí en el control de ocupación: ver flagsDeOcupacion().

import type { CajaParte, ParteHabitaciones, CajaMovimiento } from '../types'
import { fechaConfiable, ingresosNetos, type CajaFlag } from './cajaControl'
import { getHabitacion, tipoDeHabitacion, haySobreocupacion } from '../data/hotel'
import type { TarifarioPublico } from './landing'
import { cuadraConTarifarioPublico } from './tarifaDiaria'

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

// ¿Con qué precio pactado cuadra un total (n noches × tarifa)? Misma regla que
// getTarifaFlags: precios redondos, n hasta MAX_NOCHES. 'lista' gana si cuadra
// con ambos. undefined = no cuadra con ninguno (cobro fuera de tarifa).
export function cuadraConTarifa(total: number, plazas: number, periodo: TarifaPeriodo): 'lista' | 'efectivo' | undefined {
  const base = plazas === 1
    ? periodo.single
    : { lista: periodo.porPersona.lista * plazas, efectivo: periodo.porPersona.efectivo * plazas }
  for (const [tarifa, tipo] of [[base.lista, 'lista'], [base.efectivo, 'efectivo']] as const) {
    for (let n = 1; n <= MAX_NOCHES; n++) {
      if (Math.abs(total - n * tarifa) <= EPS) return tipo
    }
  }
  return undefined
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

// Una habitación de un cobro, con la gente que el parte dice que durmió ahí.
export interface HabDeCobro {
  habitacion: string
  plazas: number     // personas reportadas por el PMS, NO la capacidad
}

// Habitaciones de un cobro según los partes: primero por Nº de reserva (exacto),
// si no por habitación (tolerante a combinadas "205/202"). Una reserva puede
// tener varias habitaciones. Sin match no se puede saber la tarifa → no se
// controla ese cobro (mejor que un falso positivo).
export function habitacionesDeCobro(m: CajaMovimiento, partes: ParteHabitaciones[]): HabDeCobro[] {
  const mapear = (habs: ParteHabitaciones['ocupadas']) =>
    habs.map(o => ({ habitacion: o.habitacion, plazas: o.plazas }))

  if (m.reserva) {
    for (const p of partes) {
      const habs = p.ocupadas.filter(o => o.reserva === m.reserva)
      if (habs.length) return mapear(habs)
    }
  }
  if (m.habitacion) {
    const habsCobro = m.habitacion.split('/').map(s => s.trim()).filter(Boolean)
    for (const p of partes) {
      const habs = p.ocupadas.filter(o => habsCobro.includes(o.habitacion))
      if (habs.length) return mapear(habs)
    }
  }
  return []
}

// Cuánta gente entró vs cuánta entra, comparando el parte contra el maestro de
// habitaciones. El parte solo dice cuántas personas durmieron; sin el maestro no
// había con qué compararlo. Se avisa una vez por habitación por caja.
//
//   - más gente que plazas  → warn: o durmió gente de más, o el parte está mal
//   - menos gente que plazas → info: plazas que quedaron sin vender
//
// Las habitaciones que no existen en el maestro se ignoran acá: eso es un
// problema del parte, no del cobro, y lo reporta la validación de partes.
function flagsDeOcupacion(habs: HabDeCobro[], yaAvisadas: Set<string>): CajaFlag[] {
  const flags: CajaFlag[] = []
  for (const h of habs) {
    if (yaAvisadas.has(h.habitacion)) continue
    const real = getHabitacion(h.habitacion)
    if (!real) continue
    const tipo = tipoDeHabitacion(h.habitacion) ?? `${real.plazas} plazas`

    if (haySobreocupacion(h.habitacion, h.plazas)) {
      yaAvisadas.add(h.habitacion)
      flags.push({
        level: 'warn',
        tipo: 'ocupacion',
        mensaje: `Hab. ${h.habitacion}: el parte declara ${h.plazas} personas en una ${tipo} de ${real.plazas} plazas. O durmió gente de más sin cobrarse, o el parte está mal cargado.`,
      })
    } else if (h.plazas < real.plazas) {
      yaAvisadas.add(h.habitacion)
      const libres = real.plazas - h.plazas
      flags.push({
        level: 'info',
        tipo: 'ocupacion',
        mensaje: `Hab. ${h.habitacion}: ${tipo} de ${real.plazas} plazas vendida a ${h.plazas} — ${libres} plaza(s) sin vender.`,
      })
    }
  }
  return flags
}

export function getTarifaFlags(
  caja: CajaParte,
  partes: ParteHabitaciones[],
  tarifas: TarifaPeriodo[] = TARIFAS_PACTADAS,
  // El tarifario PUBLICADO de la landing (vista tarifario_publico). Un cobro que
  // no cuadra con las tarifas pactadas planas pero SÍ con lo que cotiza la
  // página (vie/sáb, findes largos, tope, descuento por día) también está bien:
  // el conserje cobró exactamente lo que la web le mostró al huésped.
  tarifarioPublico?: TarifarioPublico | null,
): CajaFlag[] {
  const flags: CajaFlag[] = []
  const yaAvisadas = new Set<string>()

  // ingresosNetos: un cobro anulado por el PMS no se controla contra tarifa.
  for (const m of ingresosNetos(caja)) {
    if (m.total <= 0) continue
    const habs = habitacionesDeCobro(m, partes)
    const plazas = sum(habs.map(h => h.plazas))
    if (!plazas) continue

    // Ocupación real vs capacidad: es independiente de si el precio cuadra, así
    // que se controla antes de decidir nada sobre la tarifa.
    flags.push(...flagsDeOcupacion(habs, yaAvisadas))

    // El precio de efectivo solo vale si el cobro fue TODO en efectivo.
    const pagoEfectivo = m.efectivo > 0 && Math.abs(m.efectivo - m.total) <= EPS
    const fechaCobro = m.fechaHora || caja.aperturaAt

    const periodo = tarifaVigente(fechaCobro, tarifas)
    if (!periodo) {
      // Sin tarifa pactada para esa fecha: si el tarifario de la landing cubre
      // el día, la web queda como única referencia pactada. Fuera de su
      // vigencia, el cobro no se controla (igual que siempre).
      const v = tarifarioPublico?.config?.vigencia
      const dia = (fechaCobro || '').slice(0, 10)
      if (!tarifarioPublico || !v || !dia || dia < v.desde || dia > v.hasta) continue
      const web = cuadraConTarifarioPublico(m.total, plazas, dia, tarifarioPublico)
      if (web && (web.tipo === 'lista' || pagoEfectivo)) continue
      const quienWeb = `Hab. ${m.habitacion || habs.map(h => h.habitacion).join('/') || '?'}`
        + `${m.reserva ? ` · reserva ${m.reserva}` : ''} (${plazas} pax)`
      flags.push({
        level: 'warn',
        tipo: 'tarifa',
        mensaje: web
          ? `${quienWeb}: cobro de ${fmt(m.total)} al precio de efectivo de la página de reservas, pero no se pagó en efectivo.`
          : `${quienWeb}: cobro de ${fmt(m.total)} no cuadra con el tarifario de la página de reservas para ninguna estadía que empiece o termine ese día (no hay tarifa pactada cargada para la fecha).`,
      })
      continue
    }

    const base = plazas === 1
      ? periodo.single
      : { lista: periodo.porPersona.lista * plazas, efectivo: periodo.porPersona.efectivo * plazas }

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

    // Última chance antes de marcar: ¿cuadra con el tarifario de la landing?
    // (solo se calcula para los cobros que las pactadas no explican).
    if (tarifarioPublico) {
      const web = cuadraConTarifarioPublico(m.total, plazas, fechaCobro, tarifarioPublico)
      if (web && (web.tipo === 'lista' || pagoEfectivo)) continue
    }

    // Con una sola habitación se nombra su tipo real (del maestro): ayuda a
    // entender el cobro sin ir a buscar cuántas camas tiene ese cuarto.
    const tipoUnico = habs.length === 1 ? tipoDeHabitacion(habs[0].habitacion) : undefined
    const quien = `Hab. ${m.habitacion || habs.map(h => h.habitacion).join('/') || '?'}`
      + `${m.reserva ? ` · reserva ${m.reserva}` : ''}`
      + ` (${tipoUnico ? `${tipoUnico}, ` : ''}${plazas} pax)`
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
