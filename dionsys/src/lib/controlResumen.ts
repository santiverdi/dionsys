// Resumen de control para el dueño: junta dinero, habitaciones y compras externas
// de un conjunto de cajas (un día o un mes). Función pura; recibe TODAS las cajas
// y partes para poder calcular "anterior" (continuidad, check-outs por diferencia).

import type { CajaParte, ParteHabitaciones } from '../types'
import { getCajaResumen, getCajaFlags } from './cajaControl'
import { getCheckouts } from './parteControl'

export interface CompraExterna {
  fechaHora: string
  nroCaja: number
  conserje: string
  observacion: string
  monto: number
}

export interface ControlResumen {
  nCajas: number
  // Dinero
  efectivo: number
  tarjetas: number
  transferencia: number
  cheques: number
  otros: number
  totalCobrado: number
  retirosEfectivo: number
  // Alertas de dinero
  descuadres: number
  tarjetaSinFB: number
  // Compras externas (egresos que NO son retiro de efectivo)
  compras: CompraExterna[]
  totalCompras: number
  // Habitaciones (del parte más reciente del período)
  ocupacionPct?: number
  ocupadas?: number
  libres?: number
  // Check-outs del período
  checkouts: number
  checkoutsSinCobro: number
  // Turnos con caja pero sin parte cargado
  partesFaltantes: number[]
}

const esRetiroEfectivo = (obs: string) => /retiro\s+efectivo/i.test(obs)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

function cajaAnteriorDe(caja: CajaParte, todas: CajaParte[]): CajaParte | undefined {
  return todas
    .filter(c => c.id !== caja.id && c.aperturaAt < caja.aperturaAt)
    .sort((a, b) => b.aperturaAt.localeCompare(a.aperturaAt))[0]
}

function parteAnteriorDe(parte: ParteHabitaciones, todos: ParteHabitaciones[]): ParteHabitaciones | undefined {
  return todos
    .filter(p => p.id !== parte.id && p.fechaCaja < parte.fechaCaja)
    .sort((a, b) => b.fechaCaja.localeCompare(a.fechaCaja))[0]
}

export function buildResumen(
  cajasPeriodo: CajaParte[],
  allCajas: CajaParte[],
  allPartes: ParteHabitaciones[],
): ControlResumen {
  // --- Dinero ---
  const resumenes = cajasPeriodo.map(getCajaResumen)
  const efectivo = sum(resumenes.map(r => r.efectivo))
  const tarjetas = sum(resumenes.map(r => r.tarjetas))
  const transferencia = sum(resumenes.map(r => r.transferencia))
  const cheques = sum(resumenes.map(r => r.cheques))
  const otros = sum(resumenes.map(r => r.otros))

  // --- Compras externas vs retiros de efectivo (ambos salen de caja.egresos) ---
  const compras: CompraExterna[] = []
  let retirosEfectivo = 0
  for (const c of cajasPeriodo) {
    for (const e of c.egresos) {
      if (esRetiroEfectivo(e.observacion)) {
        retirosEfectivo += e.total
      } else {
        compras.push({
          fechaHora: e.fechaHora,
          nroCaja: c.nroCaja,
          conserje: c.conserje ?? c.usuarioApertura,
          observacion: e.observacion || 'Egreso sin detalle',
          monto: e.total,
        })
      }
    }
  }

  // --- Alertas de dinero ---
  let descuadres = 0
  let tarjetaSinFB = 0
  for (const c of cajasPeriodo) {
    if (getCajaFlags(c, cajaAnteriorDe(c, allCajas)).some(f => f.tipo === 'continuidad')) descuadres++
    tarjetaSinFB += c.ingresos.filter(m => m.tarjetas > 0 && !m.facturaB).length
  }

  // --- Habitaciones ---
  const nrosPeriodo = new Set(cajasPeriodo.map(c => c.nroCaja))
  const partesPeriodo = allPartes
    .filter(p => nrosPeriodo.has(p.nroCaja))
    .sort((a, b) => b.fechaCaja.localeCompare(a.fechaCaja))
  const ultimoParte = partesPeriodo[0]

  // Check-outs del período (cada parte contra su anterior), dedup por reserva.
  const reservasOut = new Map<string, boolean>() // reserva → tieneCobro
  for (const p of partesPeriodo) {
    for (const co of getCheckouts(p, parteAnteriorDe(p, allPartes), allCajas)) {
      if (!reservasOut.has(co.reserva)) reservasOut.set(co.reserva, !!co.cobro)
    }
  }
  const checkouts = reservasOut.size
  const checkoutsSinCobro = [...reservasOut.values()].filter(tieneCobro => !tieneCobro).length

  const partesFaltantes = cajasPeriodo
    .filter(c => !allPartes.some(p => p.nroCaja === c.nroCaja))
    .map(c => c.nroCaja)

  return {
    nCajas: cajasPeriodo.length,
    efectivo, tarjetas, transferencia, cheques, otros,
    totalCobrado: efectivo + tarjetas + transferencia + cheques + otros,
    retirosEfectivo,
    descuadres,
    tarjetaSinFB,
    compras: compras.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora)),
    totalCompras: sum(compras.map(c => c.monto)),
    ...(ultimoParte ? {
      ocupacionPct: ultimoParte.totalOcupadas + ultimoParte.totalLibres > 0
        ? Math.round((ultimoParte.totalOcupadas / (ultimoParte.totalOcupadas + ultimoParte.totalLibres)) * 100)
        : 0,
      ocupadas: ultimoParte.totalOcupadas,
      libres: ultimoParte.totalLibres,
    } : {}),
    checkouts,
    checkoutsSinCobro,
    partesFaltantes,
  }
}
