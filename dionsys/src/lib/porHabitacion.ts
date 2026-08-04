// Rendimiento por habitación: cuánta plata hizo cada cuarto del hotel en el mes.
//
// El dato clave ya estaba cargado y sin usar: cada cobro del PMS trae el número
// de habitación (columna "Habitación" del Excel de caja → CajaMovimiento.habitacion).
// Cruzándolo contra el maestro (src/data/hotel.ts) y contra las noches vendidas
// de los partes, sale lo que el dashboard hoy no puede contestar: qué habitación
// factura, cuál no se vende, y cuánto rinde cada piso.
//
// Reemplaza al promedio plano de getRevenueOcupacion (ingreso del mes ÷ días).
//
// CÓMO SE REPARTE UN COBRO (regla del sistema, no del PMS):
//   - Un cobro puede tocar varias habitaciones ("205/202": un grupo en dos
//     cuartos). La plata se reparte PROPORCIONAL a la gente que el parte dice
//     que durmió en cada una, porque el precio sigue a la gente, no al cuarto.
//   - Si el parte no permite el cruce (no está importado, o no matchea), se cae
//     a las plazas del maestro. Peor que la gente real, pero mejor que perder el
//     cobro: el número de habitación del cobro es dato firme igual.
//   - Un cobro sin habitación ni reserva no se atribuye a nadie: queda contado
//     aparte en `ingresoSinAtribuir` y a la vista, para que nunca parezca que el
//     total por habitación es todo lo que entró.
//
// OJO CON LOS GRUPOS: los que cobra el dueño por fuera de la caja no pasan por
// acá. Esas habitaciones aparecen ocupadas y sin plata, y se marcan con
// `ocupadaSinCobro` — no son habitaciones improductivas, es plata que entró por
// otro lado (ver GruposPanel).

import type { CajaParte, CajaMovimiento, ParteHabitaciones } from '../types'
import { HABITACIONES, getHabitacion, tipoDeHabitacion, type Habitacion, type TipoHabitacion } from '../data/hotel'
import { ingresosNetos } from './cajaControl'
import { habitacionesDeCobro } from './tarifas'
import { partesNochePorDia } from './desayuno'
import { isInMonth, monthKey, monthLabel } from '../utils/dateRange'

export interface RendimientoHabitacion {
  numero: string
  piso: number
  plazas: number
  activa: boolean
  tipo?: TipoHabitacion
  ingreso: number            // plata del mes atribuida a esta habitación
  cobros: number             // cuántos cobros la tocaron
  noches: number             // noches vendidas (partes noche del mes)
  plazasVendidas: number     // gente-noche que durmió acá
  ocupacionPct: number       // noches vendidas sobre noches medidas
  ingresoPorNoche: number    // lo que rinde una noche de este cuarto
  ocupadaSinCobro: boolean   // durmió gente y no se le atribuyó plata (grupo / cobro fuera de caja)
}

export interface GrupoRendimiento {
  label: string              // "Piso 3" / "doble"
  ingreso: number
  noches: number
  ingresoPorNoche: number
  habitaciones: number
}

export interface RendimientoPorHabitacion {
  habitaciones: RendimientoHabitacion[]   // de mayor a menor ingreso
  porPiso: GrupoRendimiento[]
  porTipo: GrupoRendimiento[]
  nochesMedidas: number                   // días del mes con parte noche importado
  totalCobrado: number                    // todo lo que entró por caja en el mes
  ingresoAtribuido: number                // lo que se pudo colgar de una habitación
  ingresoSinAtribuir: number              // cobros sin habitación ni reserva utilizable
  sinCobro: string[]                      // habitaciones ocupadas sin plata atribuida
}

const round = (n: number) => Math.round(n * 100) / 100
const div = (a: number, b: number) => (b > 0 ? Math.round(a / b) : 0)

// A qué habitaciones va un cobro y con qué peso. Primero se intenta el cruce
// contra los partes (peso = gente real que durmió); si no hay match, se usa el
// número de habitación del propio cobro contra el maestro (peso = plazas).
interface Reparto {
  numero: string
  peso: number
}

function repartoDeCobro(m: CajaMovimiento, partes: ParteHabitaciones[]): Reparto[] {
  const delParte = habitacionesDeCobro(m, partes)
    .filter(h => getHabitacion(h.habitacion))
    .map(h => ({ numero: h.habitacion, peso: h.plazas }))
  if (delParte.length && delParte.some(r => r.peso > 0)) return delParte

  const delCobro = (m.habitacion || '')
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .map(numero => ({ numero, hab: getHabitacion(numero) }))
    .filter((x): x is { numero: string; hab: NonNullable<ReturnType<typeof getHabitacion>> } => !!x.hab)
    .map(x => ({ numero: x.numero, peso: x.hab.plazas }))
  if (delCobro.length) return delCobro

  // Hay habitaciones del parte pero todas con 0 personas: reparto parejo.
  return delParte
}

export function getRendimientoPorHabitacion(
  year: number, month: number,
  cajas: CajaParte[],
  partes: ParteHabitaciones[],
): RendimientoPorHabitacion {
  const ingreso = new Map<string, number>()
  const cobrosPorHab = new Map<string, number>()
  let totalCobrado = 0
  let ingresoAtribuido = 0

  for (const caja of cajas.filter(c => isInMonth(c.aperturaAt, year, month))) {
    for (const m of ingresosNetos(caja)) {
      totalCobrado += m.total
      const reparto = repartoDeCobro(m, partes)
      if (!reparto.length) continue
      // Si ningún peso es útil (todas en 0), se parte en partes iguales.
      const pesoTotal = reparto.reduce((s, r) => s + r.peso, 0)
      for (const r of reparto) {
        const parte = pesoTotal > 0 ? (r.peso / pesoTotal) : (1 / reparto.length)
        const monto = m.total * parte
        ingreso.set(r.numero, (ingreso.get(r.numero) ?? 0) + monto)
        ingresoAtribuido += monto
        cobrosPorHab.set(r.numero, (cobrosPorHab.get(r.numero) ?? 0) + 1)
      }
    }
  }

  // Noches vendidas: los partes del turno noche son los que dicen quién DURMIÓ
  // (misma regla que el desayuno). Un día = un parte noche.
  const nochesDelMes = [...partesNochePorDia(partes).entries()]
    .filter(([dia]) => dia.slice(0, 7) === monthKey(year, month))
  const noches = new Map<string, number>()
  const plazasVendidas = new Map<string, number>()
  for (const [, parte] of nochesDelMes) {
    for (const o of parte.ocupadas) {
      noches.set(o.habitacion, (noches.get(o.habitacion) ?? 0) + 1)
      plazasVendidas.set(o.habitacion, (plazasVendidas.get(o.habitacion) ?? 0) + o.plazas)
    }
  }
  const nochesMedidas = nochesDelMes.length

  const habitaciones: RendimientoHabitacion[] = HABITACIONES.map(h => {
    const ing = round(ingreso.get(h.numero) ?? 0)
    const n = noches.get(h.numero) ?? 0
    const tipo = tipoDeHabitacion(h.numero)
    return {
      numero: h.numero,
      piso: h.piso,
      plazas: h.plazas,
      activa: h.activa,
      ...(tipo ? { tipo } : {}),
      ingreso: ing,
      cobros: cobrosPorHab.get(h.numero) ?? 0,
      noches: n,
      plazasVendidas: plazasVendidas.get(h.numero) ?? 0,
      ocupacionPct: nochesMedidas > 0 ? Math.round((n / nochesMedidas) * 100) : 0,
      ingresoPorNoche: div(ing, n),
      ocupadaSinCobro: n > 0 && ing === 0,
    }
  }).sort((a, b) => (b.ingreso !== a.ingreso ? b.ingreso - a.ingreso : a.numero.localeCompare(b.numero)))

  const agrupar = (clave: (h: RendimientoHabitacion) => string | undefined, prefijo = ''): GrupoRendimiento[] => {
    const map = new Map<string, RendimientoHabitacion[]>()
    for (const h of habitaciones) {
      const k = clave(h)
      if (k == null) continue
      const arr = map.get(k)
      if (arr) arr.push(h)
      else map.set(k, [h])
    }
    return [...map.entries()]
      .map(([k, hs]) => {
        const ing = round(hs.reduce((s, h) => s + h.ingreso, 0))
        const n = hs.reduce((s, h) => s + h.noches, 0)
        return { label: `${prefijo}${k}`, ingreso: ing, noches: n, ingresoPorNoche: div(ing, n), habitaciones: hs.length }
      })
      .sort((a, b) => b.ingreso - a.ingreso)
  }

  return {
    habitaciones,
    porPiso: agrupar(h => String(h.piso), 'Piso '),
    porTipo: agrupar(h => h.tipo),
    nochesMedidas,
    totalCobrado: round(totalCobrado),
    ingresoAtribuido: round(ingresoAtribuido),
    ingresoSinAtribuir: round(totalCobrado - ingresoAtribuido),
    sinCobro: habitaciones.filter(h => h.ocupadaSinCobro).map(h => h.numero).sort(),
  }
}

// ===== Ficha de una habitación =====
// Todo lo que se sabe de un cuarto, sin recortar por mes: su historial de noches
// (quién durmió, de qué canal), sus cobros y cómo le fue mes a mes. Usa el MISMO
// reparto de plata que la tabla de arriba, así la ficha nunca la contradice.

export interface EstadiaNoche {
  fecha: string            // YYYY-MM-DD de la noche
  reserva: string
  canal: string
  plazas: number
  sobreocupada: boolean    // durmió más gente que plazas tiene
}

export interface CobroDeHabitacion {
  fecha: string            // ISO del movimiento
  nroCaja: number
  reserva?: string
  observacion: string
  monto: number            // lo atribuido a ESTA habitación
  compartido: boolean      // el cobro tocaba más de un cuarto: el monto es su parte
}

export interface MesDeHabitacion {
  key: string
  label: string
  noches: number
  nochesMedidas: number
  ingreso: number
  ingresoPorNoche: number
}

export interface FichaHabitacion {
  habitacion: Habitacion
  tipo?: TipoHabitacion
  estadias: EstadiaNoche[]        // de la más nueva a la más vieja
  cobros: CobroDeHabitacion[]     // idem
  meses: MesDeHabitacion[]        // idem
  canales: { canal: string; noches: number }[]
  totales: {
    noches: number
    nochesMedidas: number         // noches del hotel con parte cargado
    ingreso: number
    ingresoPorNoche: number
    ocupacionPct: number
    sinDato: number               // noches en que el parte no la nombró: sin control
    sucia: number
    mantenimiento: number
  }
}

export function getFichaHabitacion(
  numero: string,
  cajas: CajaParte[],
  partes: ParteHabitaciones[],
): FichaHabitacion | undefined {
  const habitacion = getHabitacion(numero)
  if (!habitacion) return undefined

  const estadias: EstadiaNoche[] = []
  const nochesPorMes = new Map<string, number>()
  const medidasPorMes = new Map<string, number>()
  const canales = new Map<string, number>()
  let sinDato = 0, sucia = 0, mantenimiento = 0, nochesMedidas = 0

  for (const [dia, parte] of partesNochePorDia(partes)) {
    nochesMedidas++
    const mes = dia.slice(0, 7)
    medidasPorMes.set(mes, (medidasPorMes.get(mes) ?? 0) + 1)

    const ocupada = parte.ocupadas.find(o => o.habitacion === habitacion.numero)
    if (ocupada) {
      estadias.push({
        fecha: dia,
        reserva: ocupada.reserva,
        canal: ocupada.canal || 'sin canal',
        plazas: ocupada.plazas,
        sobreocupada: ocupada.plazas > habitacion.plazas,
      })
      nochesPorMes.set(mes, (nochesPorMes.get(mes) ?? 0) + 1)
      const canal = ocupada.canal || 'sin canal'
      canales.set(canal, (canales.get(canal) ?? 0) + 1)
      continue
    }
    const libre = parte.libres.find(l => l.habitacion === habitacion.numero)
    if (!libre) sinDato++
    else if (libre.estado === 'sucia') sucia++
    else if (libre.estado === 'mantenimiento') mantenimiento++
  }

  const cobros: CobroDeHabitacion[] = []
  const ingresoPorMes = new Map<string, number>()
  for (const caja of cajas) {
    const d = new Date(caja.aperturaAt)
    // El mes del cobro es el de la caja, igual que en el resto del negocio.
    const mes = isNaN(d.getTime()) ? '' : monthKey(d.getFullYear(), d.getMonth() + 1)
    for (const m of ingresosNetos(caja)) {
      const reparto = repartoDeCobro(m, partes)
      const mia = reparto.find(r => r.numero === habitacion.numero)
      if (!mia) continue
      const pesoTotal = reparto.reduce((s, r) => s + r.peso, 0)
      const monto = round(m.total * (pesoTotal > 0 ? mia.peso / pesoTotal : 1 / reparto.length))
      cobros.push({
        fecha: m.fechaHora,
        nroCaja: caja.nroCaja,
        ...(m.reserva ? { reserva: m.reserva } : {}),
        observacion: m.observacion || 'sin observación',
        monto,
        compartido: reparto.length > 1,
      })
      if (mes) ingresoPorMes.set(mes, (ingresoPorMes.get(mes) ?? 0) + monto)
    }
  }

  const meses: MesDeHabitacion[] = [...new Set([...nochesPorMes.keys(), ...ingresoPorMes.keys()])]
    .sort((a, b) => b.localeCompare(a))
    .map(key => {
      const [y, m] = key.split('-').map(Number)
      const noches = nochesPorMes.get(key) ?? 0
      const ingreso = round(ingresoPorMes.get(key) ?? 0)
      return {
        key,
        label: monthLabel(y, m),
        noches,
        nochesMedidas: medidasPorMes.get(key) ?? 0,
        ingreso,
        ingresoPorNoche: div(ingreso, noches),
      }
    })

  const ingreso = round(cobros.reduce((s, c) => s + c.monto, 0))
  const tipo = tipoDeHabitacion(habitacion.numero)

  return {
    habitacion,
    ...(tipo ? { tipo } : {}),
    estadias: estadias.sort((a, b) => b.fecha.localeCompare(a.fecha)),
    cobros: cobros.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? '')),
    meses,
    canales: [...canales.entries()]
      .map(([canal, noches]) => ({ canal, noches }))
      .sort((a, b) => b.noches - a.noches),
    totales: {
      noches: estadias.length,
      nochesMedidas,
      ingreso,
      ingresoPorNoche: div(ingreso, estadias.length),
      ocupacionPct: nochesMedidas > 0 ? Math.round((estadias.length / nochesMedidas) * 100) : 0,
      sinDato,
      sucia,
      mantenimiento,
    },
  }
}
