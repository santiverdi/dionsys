// Cruces automáticos del control de caja (Fase 1). A partir de una CajaParte
// (y opcionalmente la caja anterior) devuelve las "imperfecciones" a revisar y
// un resumen por medio de pago. Pura función, sin estado.

import type { CajaParte } from '../types'

export type FlagLevel = 'error' | 'warn' | 'info'

export interface CajaFlag {
  level: FlagLevel
  tipo: string
  mensaje: string
}

export interface CajaResumen {
  efectivo: number
  tarjetas: number
  cheques: number
  transferencia: number
  otros: number
  totalCobrado: number
  cantIngresos: number
  cantFacturasB: number
  totalRetiros: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function getCajaResumen(caja: CajaParte): CajaResumen {
  const i = caja.ingresos
  const efectivo = sum(i.map(m => m.efectivo))
  const tarjetas = sum(i.map(m => m.tarjetas))
  const cheques = sum(i.map(m => m.cheques))
  const transferencia = sum(i.map(m => m.transferencia))
  const otros = sum(i.map(m => m.otros))
  return {
    efectivo, tarjetas, cheques, transferencia, otros,
    totalCobrado: efectivo + tarjetas + cheques + transferencia + otros,
    cantIngresos: i.length,
    cantFacturasB: i.filter(m => m.facturaB).length,
    totalRetiros: sum(caja.egresos.map(m => m.total)),
  }
}

// Tolerancia de redondeo para los cuadres (centavos).
const EPS = 0.5

export function getCajaFlags(caja: CajaParte, cajaAnterior?: CajaParte): CajaFlag[] {
  const flags: CajaFlag[] = []

  // 1) Continuidad: la apertura de esta caja debe coincidir con el cierre (saldo) de la anterior.
  if (cajaAnterior) {
    const diff = caja.aperturaMonto - cajaAnterior.saldoFinal
    if (Math.abs(diff) > EPS) {
      flags.push({
        level: 'error',
        tipo: 'continuidad',
        mensaje: `La apertura (${fmt(caja.aperturaMonto)}) no coincide con el cierre de la caja ${cajaAnterior.nroCaja} (${fmt(cajaAnterior.saldoFinal)}). Diferencia ${fmt(diff)}.`,
      })
    }
  }

  // 2) Caja sin cerrar.
  if (!caja.cierreAt) {
    flags.push({ level: 'warn', tipo: 'sin_cierre', mensaje: 'La caja todavía no está cerrada.' })
  }

  // 3) Cobros con tarjeta sin Factura B asociada.
  const tarjetaSinFB = caja.ingresos.filter(m => m.tarjetas > 0 && !m.facturaB)
  if (tarjetaSinFB.length) {
    flags.push({
      level: 'warn',
      tipo: 'tarjeta_sin_fb',
      mensaje: `${tarjetaSinFB.length} cobro(s) con tarjeta sin Factura B: ${tarjetaSinFB.map(m => m.habitacion || m.reserva || '?').join(', ')}.`,
    })
  }

  // Los egresos que no son "RETIRO EFECTIVO" son gastos de caja (no alertas): se
  // muestran como gasto en el análisis, no como imperfección a revisar.

  return flags
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}
