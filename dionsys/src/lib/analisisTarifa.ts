// Análisis de tarifa: ¿a qué precio conviene vender los próximos meses?
//
// Cruza la ocupación real de cada noche (partes del turno noche, la misma regla
// que el desayuno: quién DURMIÓ) contra la tarifa vigente ese día. La pregunta
// que contesta: "¿a este precio estamos llenando?" — si una tarifa llena el
// hotel, hay margen para subirla; si no llena, subirla es contraproducente.
//
// La clave es que la respuesta NO es una sola tarifa: los findes (y sobre todo
// los findes largos) se llenan a un precio al que un martes no se llena. Por eso
// todo se agrupa por TIPO DE NOCHE (finde largo / finde / semana).
//
// Cada cambio de tarifa cargado (TarifaPeriodo) es un experimento natural: la
// tabla por período muestra si la ocupación aguantó la suba o se cayó.
//
// LO QUE ESTE ANÁLISIS NO VE (Fase B pendiente): la anticipación de reserva
// (pickup). Los partes son fotos de noches consumadas, no de reservas futuras;
// "a 5 días del finde quedan 2 habitaciones" hoy solo lo sabe el PMS.
//
// Función pura, sin estado ni red.

import type { CajaParte, ParteHabitaciones } from '../types'
import { tarifaVigente, cuadraConTarifa, habitacionesDeCobro, type TarifaPeriodo } from './tarifas'
import { ingresosNetos } from './cajaControl'
import { partesNochePorDia } from './desayuno'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const prom = (xs: number[]) => (xs.length ? Math.round(sum(xs) / xs.length) : 0)

// ===== Calendario: feriados y tipo de noche =====

// Feriados nacionales (Argentina). Lista corta y EDITABLE a mano: solo hace
// falta cubrir los meses con partes cargados y los próximos a decidir. Si el
// gobierno agrega un puente por decreto, sumarlo acá.
export const FERIADOS: string[] = [
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-03-24', '2026-04-02',
  '2026-04-03', '2026-05-01', '2026-05-25', '2026-06-20', '2026-07-09',
  '2026-08-17', '2026-10-12', '2026-11-20', '2026-12-08', '2026-12-25',
]

export type TipoNoche = 'finde-largo' | 'finde' | 'semana'

export const TIPO_NOCHE_LABELS: Record<TipoNoche, string> = {
  'finde-largo': 'Finde largo',
  finde: 'Finde',
  semana: 'Semana',
}

// Día no laborable: sábado, domingo o feriado.
function noLaborable(fecha: string, feriados: Set<string>): boolean {
  const d = new Date(`${fecha}T12:00:00`)
  const dow = d.getDay()
  return dow === 0 || dow === 6 || feriados.has(fecha)
}

function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// La corrida de días no laborables consecutivos que contiene a `fecha`.
function corridaNoLaborable(fecha: string, feriados: Set<string>): { inicio: string; fin: string; largo: number } {
  let inicio = fecha
  while (noLaborable(sumarDias(inicio, -1), feriados)) inicio = sumarDias(inicio, -1)
  let fin = fecha
  while (noLaborable(sumarDias(fin, 1), feriados)) fin = sumarDias(fin, 1)
  const largo = Math.round((new Date(`${fin}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86_400_000) + 1
  return { inicio, fin, largo }
}

// Clasifica la NOCHE de una fecha. Se piensa en noches dormidas, no en días:
//   - finde-largo: noches dentro de un puente de 3+ días no laborables (menos la
//     última, que es la noche del check-out) y la víspera (la noche de entrada).
//     Ej: finde del 15 al 17/8 → noches del vie 14, sáb 15 y dom 16.
//   - finde: noches de viernes y sábado comunes.
//   - semana: el resto (el domingo a la noche ya es noche floja).
export function tipoDeNoche(fecha: string, feriados: string[] = FERIADOS): TipoNoche {
  const fer = new Set(feriados)
  if (noLaborable(fecha, fer)) {
    const c = corridaNoLaborable(fecha, fer)
    if (c.largo >= 3 && fecha !== c.fin) return 'finde-largo'
  } else if (noLaborable(sumarDias(fecha, 1), fer)) {
    const c = corridaNoLaborable(sumarDias(fecha, 1), fer)
    if (c.largo >= 3) return 'finde-largo'
  }
  const dow = new Date(`${fecha}T12:00:00`).getDay()
  return dow === 5 || dow === 6 ? 'finde' : 'semana'
}

// ===== Estructuras del análisis =====

export interface NocheTarifa {
  fecha: string              // YYYY-MM-DD (la noche)
  tipo: TipoNoche
  ocupadas: number
  libres: number
  ocupacionPct: number
  plazas: number             // personas que durmieron
  tarifaPorPersona?: number  // lista vigente esa noche (sin tarifa cargada = undefined)
}

export interface OcupacionAgrupada {
  label: string
  noches: number             // noches con parte cargado
  ocupacionPromPct: number
  nochesLlenas: number       // noches con ocupación >= LLENA_PCT
  plazasProm: number         // personas promedio por noche
}

export interface PeriodoAnalizado {
  desde: string
  hasta: string
  tarifaPorPersona: number   // lista
  porTipo: OcupacionAgrupada[]   // solo tipos con datos
  total: OcupacionAgrupada
}

export interface CobrosVsTarifa {
  controlables: number       // cobros con parte y tarifa para comparar
  aLista: number
  aEfectivo: number
  fuera: number
  sinDatos: number           // sin parte que diga cuánta gente, o sin tarifa cargada
  montoLista: number
  montoEfectivo: number
  montoFuera: number
  pctEfectivo: number        // % de cobros controlables que pagaron el precio con descuento
}

export type AccionTarifa = 'subir-fuerte' | 'subir' | 'mantener' | 'no-subir'

export interface SugerenciaTarifa {
  tipo: TipoNoche
  noches: number             // tamaño de la muestra en el período de referencia
  ocupacionPromPct: number
  nochesLlenas: number
  accion: AccionTarifa
  tarifaActual: number       // lista por persona del período de referencia
  tarifaSugerida: number     // redondeada a 500
  motivo: string
}

export interface AnalisisTarifa {
  noches: NocheTarifa[]          // ascendente por fecha
  periodos: PeriodoAnalizado[]   // uno por TarifaPeriodo con noches medidas
  porDiaSemana: OcupacionAgrupada[]  // lun..dom
  cobros: CobrosVsTarifa
  sugerencias: SugerenciaTarifa[]
  referencia?: { desde: string; hasta: string; tarifaPorPersona: number }  // período que respalda las sugerencias
  pisoPorPersona: number | null  // costo por hab-noche / personas promedio por habitación
  avisos: string[]
}

// Umbral de "noche llena": con 53 habitaciones, 95% son 50+ ocupadas (quedan
// 2-3 sueltas, que a veces son las que el PMS tiene en mantenimiento o sucias).
const LLENA_PCT = 95
// Muestra mínima de noches para animarse a sugerir sobre un tipo de noche.
const MIN_NOCHES = 3

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function agrupar(label: string, noches: NocheTarifa[]): OcupacionAgrupada {
  return {
    label,
    noches: noches.length,
    ocupacionPromPct: prom(noches.map(n => n.ocupacionPct)),
    nochesLlenas: noches.filter(n => n.ocupacionPct >= LLENA_PCT).length,
    plazasProm: prom(noches.map(n => n.plazas)),
  }
}

const redondear500 = (n: number) => Math.round(n / 500) * 500

// La regla de sugerencia: ocupación alta sostenida = margen para subir; floja =
// subir espanta. Los % son deliberadamente conservadores: el objetivo es mover
// la tarifa por datos, no pegar saltos.
function sugerir(tipo: TipoNoche, g: OcupacionAgrupada, tarifaActual: number): SugerenciaTarifa {
  const casiSiempreLlena = g.noches > 0 && g.nochesLlenas / g.noches >= 0.5
  let accion: AccionTarifa
  let factor: number
  let motivo: string
  if (g.ocupacionPromPct >= 90 || casiSiempreLlena) {
    accion = 'subir-fuerte'
    factor = 1.12
    motivo = 'Se llena casi siempre a este precio: hay plata quedando sobre la mesa.'
  } else if (g.ocupacionPromPct >= 80) {
    accion = 'subir'
    factor = 1.06
    motivo = 'Ocupación alta y estable: aguanta una suba moderada.'
  } else if (g.ocupacionPromPct >= 60) {
    accion = 'mantener'
    factor = 1
    motivo = 'Ocupación media: subir ahora arriesga las noches que sí se venden.'
  } else {
    accion = 'no-subir'
    factor = 1
    motivo = 'Ocupación floja: antes que tocar la tarifa, empujar el descuento por efectivo o promos de estas noches.'
  }
  return {
    tipo,
    noches: g.noches,
    ocupacionPromPct: g.ocupacionPromPct,
    nochesLlenas: g.nochesLlenas,
    accion,
    tarifaActual,
    tarifaSugerida: redondear500(tarifaActual * factor),
    motivo,
  }
}

export function getAnalisisTarifa(
  cajas: CajaParte[],
  partes: ParteHabitaciones[],
  tarifas: TarifaPeriodo[],
  opts: { costoPorHabNoche?: number; feriados?: string[] } = {},
): AnalisisTarifa {
  const feriados = opts.feriados ?? FERIADOS
  const avisos: string[] = []

  // --- Noches medidas: una por parte noche ---
  const noches: NocheTarifa[] = [...partesNochePorDia(partes).entries()]
    .map(([fecha, p]) => {
      const total = p.totalOcupadas + p.totalLibres
      const t = tarifaVigente(fecha, tarifas)
      return {
        fecha,
        tipo: tipoDeNoche(fecha, feriados),
        ocupadas: p.totalOcupadas,
        libres: p.totalLibres,
        ocupacionPct: total > 0 ? Math.round((p.totalOcupadas / total) * 100) : 0,
        plazas: p.totalPlazas,
        ...(t ? { tarifaPorPersona: t.porPersona.lista } : {}),
      }
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const sinTarifa = noches.filter(n => n.tarifaPorPersona == null).length
  if (sinTarifa > 0) {
    avisos.push(`${sinTarifa} noche(s) medidas sin tarifa cargada para su fecha: esas noches no entran a la comparación por período. Cargá el período en Control de Caja → Tarifas pactadas.`)
  }

  // --- Por período de tarifa (cada cambio de precio es un experimento) ---
  const periodos: PeriodoAnalizado[] = tarifas
    .map(t => {
      const delPeriodo = noches.filter(n => t.desde <= n.fecha && n.fecha <= t.hasta)
      const porTipo = (['finde-largo', 'finde', 'semana'] as TipoNoche[])
        .map(tipo => agrupar(TIPO_NOCHE_LABELS[tipo], delPeriodo.filter(n => n.tipo === tipo)))
        .filter(g => g.noches > 0)
      return {
        desde: t.desde,
        hasta: t.hasta,
        tarifaPorPersona: t.porPersona.lista,
        porTipo,
        total: agrupar('Total', delPeriodo),
      }
    })
    .filter(p => p.total.noches > 0)
    .sort((a, b) => a.desde.localeCompare(b.desde))

  // --- Por día de semana (lunes a domingo) ---
  const porDiaSemana: OcupacionAgrupada[] = [1, 2, 3, 4, 5, 6, 0].map(dow =>
    agrupar(DIAS_SEMANA[dow], noches.filter(n => new Date(`${n.fecha}T12:00:00`).getDay() === dow)),
  )

  // --- Cobros contra la tarifa: ¿cuántos pagan lista, cuántos el descuento? ---
  const cobros: CobrosVsTarifa = {
    controlables: 0, aLista: 0, aEfectivo: 0, fuera: 0, sinDatos: 0,
    montoLista: 0, montoEfectivo: 0, montoFuera: 0, pctEfectivo: 0,
  }
  for (const caja of cajas) {
    for (const m of ingresosNetos(caja)) {
      if (m.total <= 0) continue
      const plazas = sum(habitacionesDeCobro(m, partes).map(h => h.plazas))
      const periodo = tarifaVigente(m.fechaHora || caja.aperturaAt, tarifas)
      if (!plazas || !periodo) { cobros.sinDatos++; continue }
      cobros.controlables++
      const cuadra = cuadraConTarifa(m.total, plazas, periodo)
      if (cuadra === 'lista') { cobros.aLista++; cobros.montoLista += m.total }
      else if (cuadra === 'efectivo') { cobros.aEfectivo++; cobros.montoEfectivo += m.total }
      else { cobros.fuera++; cobros.montoFuera += m.total }
    }
  }
  cobros.pctEfectivo = cobros.controlables ? Math.round((cobros.aEfectivo / cobros.controlables) * 100) : 0

  // --- Sugerencias: sobre el último período con datos (el precio de HOY) ---
  const ref = periodos[periodos.length - 1]
  const sugerencias: SugerenciaTarifa[] = []
  if (ref) {
    const delRef = noches.filter(n => ref.desde <= n.fecha && n.fecha <= ref.hasta)
    for (const tipo of ['finde-largo', 'finde', 'semana'] as TipoNoche[]) {
      const g = agrupar(TIPO_NOCHE_LABELS[tipo], delRef.filter(n => n.tipo === tipo))
      if (g.noches === 0) continue
      if (g.noches < MIN_NOCHES) {
        avisos.push(`${TIPO_NOCHE_LABELS[tipo]}: solo ${g.noches} noche(s) medidas en el período vigente — la sugerencia es orientativa.`)
      }
      sugerencias.push(sugerir(tipo, g, ref.tarifaPorPersona))
    }
  } else {
    avisos.push('Sin noches medidas dentro de ningún período de tarifa: no hay base para sugerir. Importá partes del turno noche y cargá las tarifas pactadas.')
  }

  // --- Piso de rentabilidad por persona ---
  // El costo por hab-noche viene del Negocio (todos los gastos del mes ÷ noches
  // vendidas). Dividido por la gente promedio por habitación da el piso POR
  // PERSONA: por debajo de eso, una noche vendida pierde plata.
  const conGente = noches.filter(n => n.ocupadas > 0)
  const plazasPorHab = conGente.length
    ? sum(conGente.map(n => n.plazas)) / sum(conGente.map(n => n.ocupadas))
    : 0
  const pisoPorPersona = opts.costoPorHabNoche && plazasPorHab > 0
    ? Math.round(opts.costoPorHabNoche / plazasPorHab)
    : null

  return {
    noches,
    periodos,
    porDiaSemana,
    cobros,
    sugerencias,
    ...(ref ? { referencia: { desde: ref.desde, hasta: ref.hasta, tarifaPorPersona: ref.tarifaPorPersona } } : {}),
    pisoPorPersona,
    avisos,
  }
}
