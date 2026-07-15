// Panorama del admin: agrega TODO lo que cargan los conserjes (cajas + partes)
// en un solo análisis "desde arriba". Función pura, sin estado ni red. Reusa las
// reglas ya definidas en cajaControl/parteControl para no duplicar criterios.

import type { CajaParte, ParteHabitaciones, Turno, CajaMovimiento } from '../types'
import {
  getCajaResumen, getCajaFlags, anteriorPorNro, gapCircular, nrosEntre,
  fechaConfiable, MAX_SALTO_NROS, esAnulacionPago, ingresosNetos,
} from './cajaControl'
import { getParteResumen, getCheckouts, getEstadiasOcultas, parteAnteriorDe } from './parteControl'
import { getTarifaFlags, type TarifaPeriodo } from './tarifas'
import { usuarioLimpio } from './parseCaja'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// Día local (YYYY-MM-DD) de un ISO, para agrupar sin que la medianoche UTC corra el día.
function diaLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function conserjeDeCaja(c: CajaParte): string {
  return c.conserje || c.usuarioApertura || '—'
}

// Mismo criterio de ciclo que ParteContext: el contador del PMS da la vuelta en
// 100; un Nº repetido a más de 15 días es OTRO turno.
const MISMO_CICLO_MS = 15 * 24 * 3_600_000

export function conserjeDeParte(p: ParteHabitaciones, cajas?: CajaParte[]): string {
  if (p.conserje) return p.conserje
  // usuarioLimpio: partes viejos guardados con la fecha del encabezado pegada
  // en "usuario" no deben aparecer como conserjes fantasma.
  const u = usuarioLimpio(p.usuario || '')
  if (u) return u
  // Parte sin usuario legible: el conserje lo dice la caja del mismo turno
  // (mismo Nº dentro del ciclo).
  if (cajas) {
    const f = new Date(fechaConfiable(p.fechaCaja, p.importedAt)).getTime()
    const caja = cajas.find(c => c.nroCaja === p.nroCaja
      && Math.abs(new Date(fechaConfiable(c.aperturaAt, c.importedAt)).getTime() - f) <= MISMO_CICLO_MS)
    if (caja) return conserjeDeCaja(caja)
  }
  return '—'
}

// Un egreso de caja NO es gasto cuando es un movimiento INTERNO de plata: retiro
// a la caja fuerte/oficina, cierre de lote de tarjeta, transferencia a otra caja
// ("egreso de caja 100", "C-100"), o la anulación de un cobro mal cargado
// (esAnulacionPago). Solo el resto (compras, pagos a proveedores…) es gasto real.
// Patrones confirmados contra cajas reales del PMS.
const NO_ES_GASTO = [
  /retiro\s+efectivo/i,         // a la caja fuerte / oficina
  /cierre\s+de\s+lote/i,        // liquidación de tarjeta al cerrar
  /egreso\s+(de|a|al)\s+caja/i, // transferencia a otra caja
  /\bc\s*-\s*\d+\b/i,           // referencia a otra caja ("C-100")
]
const esMovimientoInterno = (m: CajaMovimiento) =>
  esAnulacionPago(m) || NO_ES_GASTO.some(re => re.test(m.observacion))
const esRetiroEfectivo = (m: CajaMovimiento) => /retiro\s+efectivo/i.test(m.observacion)

// ===== Dinero / cobranzas =====
export interface DineroResumen {
  totalCobrado: number
  efectivo: number
  tarjetas: number
  cheques: number
  transferencia: number
  otros: number
  cantIngresos: number
  ticketPromedio: number
  totalRetiros: number          // RETIRO EFECTIVO: plata que sale a la caja fuerte/oficina. NO es gasto.
  totalGastosCaja: number       // egresos que NO son movimiento interno (retiro/cierre lote/transf): gasto real
  cobrosTarjeta: number
  cobrosTarjetaConFB: number
  pctFB: number                 // % de cobros con tarjeta que traen Factura B
}

export function getDineroResumen(cajas: CajaParte[]): DineroResumen {
  // ingresosNetos: los cobros anulados por el PMS no son plata cobrada.
  const ingresos = cajas.flatMap(c => ingresosNetos(c))
  const efectivo = sum(ingresos.map(m => m.efectivo))
  const tarjetas = sum(ingresos.map(m => m.tarjetas))
  const cheques = sum(ingresos.map(m => m.cheques))
  const transferencia = sum(ingresos.map(m => m.transferencia))
  const otros = sum(ingresos.map(m => m.otros))
  const totalCobrado = efectivo + tarjetas + cheques + transferencia + otros
  const egresos = cajas.flatMap(c => c.egresos)
  const cobrosTarjeta = ingresos.filter(m => m.tarjetas > 0).length
  const cobrosTarjetaConFB = ingresos.filter(m => m.tarjetas > 0 && m.facturaB).length
  return {
    totalCobrado, efectivo, tarjetas, cheques, transferencia, otros,
    cantIngresos: ingresos.length,
    ticketPromedio: ingresos.length ? Math.round(totalCobrado / ingresos.length) : 0,
    totalRetiros: sum(egresos.filter(esRetiroEfectivo).map(m => m.total)),
    totalGastosCaja: sum(egresos.filter(m => !esMovimientoInterno(m)).map(m => m.total)),
    cobrosTarjeta,
    cobrosTarjetaConFB,
    pctFB: cobrosTarjeta ? Math.round((cobrosTarjetaConFB / cobrosTarjeta) * 100) : 100,
  }
}

// ===== Gastos de caja (egresos que NO son retiro de efectivo) =====
export interface GastoItem {
  cajaId: string
  nroCaja: number
  conserje: string
  turno?: Turno
  observacion: string
  total: number
  fechaHora: string
}

export function getGastosCaja(cajas: CajaParte[]): GastoItem[] {
  const items: GastoItem[] = []
  for (const c of cajas) {
    for (const e of c.egresos) {
      if (esMovimientoInterno(e)) continue
      items.push({
        cajaId: c.id,
        nroCaja: c.nroCaja,
        conserje: conserjeDeCaja(c),
        ...(c.turno ? { turno: c.turno } : {}),
        observacion: e.observacion || 'sin observación',
        total: e.total,
        fechaHora: e.fechaHora,
      })
    }
  }
  return items.sort((a, b) => b.total - a.total)
}

// ===== Control / imperfecciones =====
export interface ImperfeccionesCount {
  descuadres: number
  huecos: number            // cajas salteadas: números que faltan antes de esta caja
  tarjetaSinFB: number
  tarifasFuera: number      // cobros que no cuadran con la tarifa pactada
  checkoutsSinCobro: number
  estadiasOcultas: number
  cajasSinCerrar: number
  total: number
}

const cero = (): ImperfeccionesCount => ({
  descuadres: 0, huecos: 0, tarjetaSinFB: 0, tarifasFuera: 0, checkoutsSinCobro: 0,
  estadiasOcultas: 0, cajasSinCerrar: 0, total: 0,
})

function totalDe(i: ImperfeccionesCount): number {
  return i.descuadres + i.huecos + i.tarjetaSinFB + i.tarifasFuera
    + i.checkoutsSinCobro + i.estadiasOcultas + i.cajasSinCerrar
}

// Imperfecciones de una caja (reusa getCajaFlags para el descuadre de continuidad
// y getTarifaFlags para los cobros fuera de la tarifa pactada).
function imperfeccionesDeCaja(caja: CajaParte, cajas: CajaParte[], partes: ParteHabitaciones[], tarifas?: TarifaPeriodo[]): ImperfeccionesCount {
  const anterior = anteriorPorNro(caja, cajas)
  const flags = getCajaFlags(caja, anterior)
  const i = cero()
  i.descuadres = flags.some(f => f.tipo === 'continuidad') ? 1 : 0
  // Números salteados entre la caja anterior (por Nº circular) y esta. Se
  // atribuyen a quien cargó ESTA caja: es quien guardó salteando la numeración.
  const gap = anterior ? gapCircular(anterior.nroCaja, caja.nroCaja) : 0
  i.huecos = gap > 1 && gap <= MAX_SALTO_NROS ? gap - 1 : 0
  i.tarjetaSinFB = ingresosNetos(caja).filter(m => m.tarjetas > 0 && !m.facturaB).length
  // Solo los warn cuentan como imperfección (los info son descuentos a confirmar).
  i.tarifasFuera = getTarifaFlags(caja, partes, tarifas).filter(f => f.level === 'warn').length
  i.cajasSinCerrar = caja.cierreAt ? 0 : 1
  i.total = totalDe(i)
  return i
}

// Imperfecciones del parte (check-outs sin cobro + estadías ocultas).
function imperfeccionesDeParte(parte: ParteHabitaciones, partes: ParteHabitaciones[], cajas: CajaParte[]): ImperfeccionesCount {
  const anterior = parteAnteriorDe(parte, partes)
  const i = cero()
  i.checkoutsSinCobro = getCheckouts(parte, anterior, cajas).filter(c => !c.cobro).length
  i.estadiasOcultas = getEstadiasOcultas(parte, anterior).length
  i.total = totalDe(i)
  return i
}

function acumular(a: ImperfeccionesCount, b: ImperfeccionesCount): void {
  a.descuadres += b.descuadres
  a.huecos += b.huecos
  a.tarjetaSinFB += b.tarjetaSinFB
  a.tarifasFuera += b.tarifasFuera
  a.checkoutsSinCobro += b.checkoutsSinCobro
  a.estadiasOcultas += b.estadiasOcultas
  a.cajasSinCerrar += b.cajasSinCerrar
  a.total += b.total
}

export function getImperfeccionesGlobal(cajas: CajaParte[], partes: ParteHabitaciones[], tarifas?: TarifaPeriodo[]): ImperfeccionesCount {
  const acc = cero()
  for (const c of cajas) acumular(acc, imperfeccionesDeCaja(c, cajas, partes, tarifas))
  for (const p of partes) acumular(acc, imperfeccionesDeParte(p, partes, cajas))
  return acc
}

// ===== Por conserje (el ranking que quiere el dueño) =====
export interface ConserjeStats {
  conserje: string
  cajas: number
  partes: number
  totalCobrado: number
  cantIngresos: number
  ticketPromedio: number
  pctFB: number
  imperfecciones: ImperfeccionesCount
}

export function getConserjeStats(cajas: CajaParte[], partes: ParteHabitaciones[], tarifas?: TarifaPeriodo[]): ConserjeStats[] {
  const map = new Map<string, ConserjeStats>()
  const get = (nombre: string): ConserjeStats => {
    let s = map.get(nombre)
    if (!s) {
      s = { conserje: nombre, cajas: 0, partes: 0, totalCobrado: 0, cantIngresos: 0, ticketPromedio: 0, pctFB: 100, imperfecciones: cero() }
      map.set(nombre, s)
    }
    return s
  }
  // acumuladores fiscales por conserje (para pctFB)
  const fb = new Map<string, { tarjeta: number; conFB: number }>()

  for (const c of cajas) {
    const s = get(conserjeDeCaja(c))
    const r = getCajaResumen(c)
    s.cajas += 1
    s.totalCobrado += r.totalCobrado
    s.cantIngresos += r.cantIngresos
    acumular(s.imperfecciones, imperfeccionesDeCaja(c, cajas, partes, tarifas))
    const f = fb.get(s.conserje) ?? { tarjeta: 0, conFB: 0 }
    const netos = ingresosNetos(c)
    f.tarjeta += netos.filter(m => m.tarjetas > 0).length
    f.conFB += netos.filter(m => m.tarjetas > 0 && m.facturaB).length
    fb.set(s.conserje, f)
  }
  for (const p of partes) {
    const s = get(conserjeDeParte(p, cajas))
    s.partes += 1
    acumular(s.imperfecciones, imperfeccionesDeParte(p, partes, cajas))
  }
  for (const s of map.values()) {
    s.ticketPromedio = s.cantIngresos ? Math.round(s.totalCobrado / s.cantIngresos) : 0
    const f = fb.get(s.conserje)
    s.pctFB = f && f.tarjeta ? Math.round((f.conFB / f.tarjeta) * 100) : 100
  }
  // Orden: más imperfecciones primero (lo que el dueño quiere cazar).
  return [...map.values()].sort((a, b) => b.imperfecciones.total - a.imperfecciones.total)
}

// ===== Ocupación / canales =====
export interface CanalMix {
  canal: string
  reservas: number
  plazas: number
  pct: number   // % sobre el total de reservas
}

export interface OcupacionResumen {
  partes: number
  ocupacionPromedioPct: number
  huespedesUltimaNoche: number     // totalPlazas del último parte de turno noche
  fechaUltimaNoche: string
  canalMix: CanalMix[]
  limpieza: { sucias: number; limpias: number; mantenimiento: number }  // del último parte
}

export function getOcupacionResumen(partes: ParteHabitaciones[]): OcupacionResumen {
  const porNroDesc = [...partes].sort((a, b) => b.nroCaja - a.nroCaja)
  const ultimaNoche = porNroDesc.find(p => p.turno === 'noche')
  const ultimo = porNroDesc[0]

  // Mix por canal: dedup por reserva (una reserva aparece en varios partes, una por noche).
  const canalDe = new Map<string, { canal: string; plazas: number }>()
  for (const p of partes) {
    for (const o of p.ocupadas) {
      if (!o.reserva || canalDe.has(o.reserva)) continue
      canalDe.set(o.reserva, { canal: o.canal || 'Sin canal', plazas: o.plazas })
    }
  }
  const porCanal = new Map<string, { reservas: number; plazas: number }>()
  for (const { canal, plazas } of canalDe.values()) {
    const c = porCanal.get(canal) ?? { reservas: 0, plazas: 0 }
    c.reservas += 1
    c.plazas += plazas
    porCanal.set(canal, c)
  }
  const totalReservas = canalDe.size || 1
  const canalMix: CanalMix[] = [...porCanal.entries()]
    .map(([canal, v]) => ({ canal, reservas: v.reservas, plazas: v.plazas, pct: Math.round((v.reservas / totalReservas) * 100) }))
    .sort((a, b) => b.reservas - a.reservas)

  const ocupPcts = partes.map(p => getParteResumen(p).ocupacionPct)
  return {
    partes: partes.length,
    ocupacionPromedioPct: ocupPcts.length ? Math.round(sum(ocupPcts) / ocupPcts.length) : 0,
    huespedesUltimaNoche: ultimaNoche?.totalPlazas ?? 0,
    fechaUltimaNoche: ultimaNoche?.fechaCaja ?? '',
    canalMix,
    limpieza: {
      sucias: ultimo?.sucias ?? 0,
      limpias: ultimo?.limpias ?? 0,
      mantenimiento: ultimo?.mantenimiento ?? 0,
    },
  }
}

// ===== Cobertura de carga (qué falta) =====
export interface Cobertura {
  cajas: number
  partes: number
  cajasSinParte: number[]    // nroCaja con caja pero sin parte
  partesSinCaja: number[]    // nroCaja con parte pero sin caja
  huecosNroCaja: number[]    // números faltantes entre la primera y la última caja
  ultimaCajaNro: number | null
  // Horas desde la apertura de la última caja cargada. Los huecos de arriba solo
  // ven ENTRE cajas cargadas; esto detecta el hueco en la cola: si nadie carga
  // las últimas cajas, no hay hueco numérico pero esta cifra crece (con 3 turnos
  // por día debería entrar una caja cada ~8 h).
  horasSinCarga: number | null
  ultimaCargaPorConserje: { conserje: string; ultima: string }[]
}

export function getCobertura(cajas: CajaParte[], partes: ParteHabitaciones[], ahora: Date = new Date()): Cobertura {
  const nrosCaja = new Set(cajas.map(c => c.nroCaja))
  const nrosParte = new Set(partes.map(p => p.nroCaja))
  const cajasSinParte = [...nrosCaja].filter(n => !nrosParte.has(n)).sort((a, b) => a - b)
  const partesSinCaja = [...nrosParte].filter(n => !nrosCaja.has(n)).sort((a, b) => a - b)

  // Huecos = números sin caja NI parte: turnos enteros sin rendir nada. Como el
  // contador del PMS da la vuelta en 100, no sirve mirar el rango min–max: se
  // arma la LÍNEA DE TIEMPO de números cargados (caja o parte, ordenados por
  // fecha confiable) y se marcan los saltos circulares entre vecinos. Así los
  // partes también delatan cajas que faltan en la cola, y el paso 100→1 no es
  // hueco. Un número con solo una de las dos cargas ya sale en
  // cajasSinParte/partesSinCaja.
  const porNro = new Map<number, string>()
  const anotar = (nro: number, f: string) => {
    const prev = porNro.get(nro)
    if (!prev || f < prev) porNro.set(nro, f)
  }
  for (const c of cajas) anotar(c.nroCaja, fechaConfiable(c.aperturaAt, c.importedAt))
  for (const p of partes) anotar(p.nroCaja, fechaConfiable(p.fechaCaja, p.importedAt))
  const linea = [...porNro.entries()]
    .map(([nro, f]) => ({ nro, f }))
    .sort((a, b) => a.f.localeCompare(b.f))
  const huecosSet = new Set<number>()
  for (let k = 1; k < linea.length; k++) {
    const gap = gapCircular(linea[k - 1].nro, linea[k].nro)
    if (gap > 1 && gap <= MAX_SALTO_NROS) {
      for (const n of nrosEntre(linea[k - 1].nro, linea[k].nro)) huecosSet.add(n)
    }
  }
  // Un número cargado nunca es hueco (las fechas de import pueden desordenar la línea).
  const huecos = [...huecosSet].filter(n => !porNro.has(n)).sort((a, b) => a - b)

  const ultimaPorConserje = new Map<string, string>()
  for (const c of cajas) {
    const k = conserjeDeCaja(c)
    const prev = ultimaPorConserje.get(k)
    if (!prev || c.importedAt > prev) ultimaPorConserje.set(k, c.importedAt)
  }

  // La última caja por fecha confiable (por Nº no sirve: la 100 vieja le "ganaría" a la 37 nueva).
  const ultimaCaja = cajas.length
    ? cajas.reduce((a, b) =>
        fechaConfiable(b.aperturaAt, b.importedAt) > fechaConfiable(a.aperturaAt, a.importedAt) ? b : a)
    : null
  const horasSinCarga = ultimaCaja
    ? Math.max(0, Math.round((ahora.getTime() - new Date(fechaConfiable(ultimaCaja.aperturaAt, ultimaCaja.importedAt)).getTime()) / 3_600_000))
    : null

  return {
    cajas: cajas.length,
    partes: partes.length,
    cajasSinParte,
    partesSinCaja,
    huecosNroCaja: huecos,
    ultimaCajaNro: ultimaCaja?.nroCaja ?? null,
    horasSinCarga,
    ultimaCargaPorConserje: [...ultimaPorConserje.entries()]
      .map(([conserje, ultima]) => ({ conserje, ultima }))
      .sort((a, b) => b.ultima.localeCompare(a.ultima)),
  }
}

// ===== Seguimiento por turno (habitaciones al cierre de cada turno) =====
export interface TurnoHabitaciones {
  nroCaja: number
  fecha: string          // fecha confiable del parte (ISO)
  turno?: Turno
  conserje: string
  ocupadas: number
  libres: number
  sucias: number
  limpias: number
  mantenimiento: number
}

export function getSeguimientoTurnos(partes: ParteHabitaciones[], cajas?: CajaParte[]): TurnoHabitaciones[] {
  return partes
    .map(p => ({
      nroCaja: p.nroCaja,
      fecha: fechaConfiable(p.fechaCaja, p.importedAt),
      ...(p.turno ? { turno: p.turno } : {}),
      conserje: conserjeDeParte(p, cajas),
      ocupadas: p.totalOcupadas,
      libres: p.totalLibres,
      sucias: p.sucias,
      limpias: p.limpias,
      mantenimiento: p.mantenimiento,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

// ===== Serie diaria (evolución) =====
export interface SerieDia {
  fecha: string        // YYYY-MM-DD
  cobrado: number
  ocupacionPct?: number
}

export function getSerieDiaria(cajas: CajaParte[], partes: ParteHabitaciones[]): SerieDia[] {
  const map = new Map<string, { cobrado: number; ocupPcts: number[] }>()
  const get = (fecha: string) => {
    let e = map.get(fecha)
    if (!e) { e = { cobrado: 0, ocupPcts: [] }; map.set(fecha, e) }
    return e
  }
  for (const c of cajas) {
    const f = diaLocal(c.aperturaAt)
    if (f) get(f).cobrado += getCajaResumen(c).totalCobrado
  }
  for (const p of partes) {
    const f = diaLocal(p.fechaCaja)
    if (f) get(f).ocupPcts.push(getParteResumen(p).ocupacionPct)
  }
  return [...map.entries()]
    .map(([fecha, v]) => ({
      fecha,
      cobrado: v.cobrado,
      ...(v.ocupPcts.length ? { ocupacionPct: Math.round(sum(v.ocupPcts) / v.ocupPcts.length) } : {}),
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

// ===== Top-level: todo junto =====
export interface Panorama {
  dinero: DineroResumen
  imperfecciones: ImperfeccionesCount
  conserjes: ConserjeStats[]
  ocupacion: OcupacionResumen
  cobertura: Cobertura
  gastos: GastoItem[]
  serie: SerieDia[]
  turnos: TurnoHabitaciones[]
}

export function getPanorama(cajas: CajaParte[], partes: ParteHabitaciones[], ahora: Date = new Date(), tarifas?: TarifaPeriodo[]): Panorama {
  return {
    dinero: getDineroResumen(cajas),
    imperfecciones: getImperfeccionesGlobal(cajas, partes, tarifas),
    conserjes: getConserjeStats(cajas, partes, tarifas),
    ocupacion: getOcupacionResumen(partes),
    cobertura: getCobertura(cajas, partes, ahora),
    gastos: getGastosCaja(cajas),
    serie: getSerieDiaria(cajas, partes),
    turnos: getSeguimientoTurnos(partes, cajas),
  }
}
