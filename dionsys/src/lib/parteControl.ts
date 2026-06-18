// Cruces automáticos del parte de habitaciones (Fase 4). A partir de un
// ParteHabitaciones (y el parte anterior + las cajas importadas) devuelve un
// resumen de ocupación y la conciliación de check-outs contra la caja.
//
// Regla del hotel: al hacer check-in se cobra la habitación en la caja de ese
// turno. El parte no tiene plata, pero sí la reserva de cada habitación. Un
// check-out (habitación que estaba ocupada y ahora figura libre) debería tener
// un cobro de su reserva en alguna caja (la del turno en que entró). Si no, se fue
// sin pagar y hay que revisarlo.

import type { ParteHabitaciones, CajaParte, Turno } from '../types'

export type FlagLevel = 'error' | 'warn' | 'info'

export interface ParteFlag {
  level: FlagLevel
  tipo: string
  mensaje: string
}

export interface ParteResumen {
  ocupadas: number
  plazas: number
  libres: number
  sucias: number
  limpias: number
  mantenimiento: number
  ocupacionPct: number   // ocupadas / (ocupadas + libres)
}

// El cobro encontrado para una reserva (en qué caja/turno, cuándo, cuánto y cómo).
export interface CheckoutCobro {
  nroCaja: number
  turno?: Turno
  fechaHora: string
  monto: number
  medioPago: string   // "Efectivo" / "Tarjeta" / "Transf." / "Cheque" / "Otros"
  pasajero?: string
}

// Medio de pago "principal" de un movimiento (la columna con monto).
function medioDe(m: CajaParte['ingresos'][number]): string {
  if (m.tarjetas) return 'Tarjeta'
  if (m.transferencia) return 'Transf.'
  if (m.cheques) return 'Cheque'
  if (m.otros) return 'Otros'
  if (m.efectivo) return 'Efectivo'
  return '—'
}

// Un check-out detectado por diferencia entre partes, con su cobro (o sin él).
export interface CheckoutRecord {
  reserva: string
  habitaciones: string[]
  cobro?: CheckoutCobro   // ausente = sin cobro registrado en ninguna caja
}

export function getParteResumen(parte: ParteHabitaciones): ParteResumen {
  const total = parte.totalOcupadas + parte.totalLibres
  return {
    ocupadas: parte.totalOcupadas,
    plazas: parte.totalPlazas,
    libres: parte.totalLibres,
    sucias: parte.sucias,
    limpias: parte.limpias,
    mantenimiento: parte.mantenimiento,
    ocupacionPct: total > 0 ? Math.round((parte.totalOcupadas / total) * 100) : 0,
  }
}

// Primer cobro de una reserva en las cajas importadas (con la caja donde cayó).
function buscarCobro(reserva: string, cajas: CajaParte[]): CheckoutCobro | undefined {
  if (!reserva) return undefined
  for (const c of cajas) {
    const m = c.ingresos.find(i => i.reserva === reserva)
    if (m) {
      return {
        nroCaja: c.nroCaja,
        ...(c.turno ? { turno: c.turno } : {}),
        fechaHora: m.fechaHora,
        monto: m.total,
        medioPago: medioDe(m),
        ...(m.pasajero ? { pasajero: m.pasajero } : {}),
      }
    }
  }
  return undefined
}

// Check-outs del turno = RESERVAS que estaban ocupadas en el parte anterior y ya
// no figuran en este. Se compara por NÚMERO DE RESERVA (no por habitación): así
// un cambio de habitación (misma reserva, otra hab) NO cuenta como salida, y una
// habitación que se desocupó y volvió a entrar otro pasajero (misma hab, otra
// reserva) SÍ cuenta como salida de la reserva anterior. Por cada reserva que
// salió se busca su cobro en las cajas.
export function getCheckouts(
  parte: ParteHabitaciones,
  parteAnterior?: ParteHabitaciones,
  cajas: CajaParte[] = [],
): CheckoutRecord[] {
  if (!parteAnterior) return []
  const reservasActuales = new Set(parte.ocupadas.map(o => o.reserva))
  const reservasAnteriores = [...new Set(parteAnterior.ocupadas.map(o => o.reserva))]
  const salieron = reservasAnteriores.filter(r => r && !reservasActuales.has(r))

  return salieron.map(reserva => {
    const habitaciones = [...new Set(
      parteAnterior.ocupadas.filter(o => o.reserva === reserva).map(o => o.habitacion),
    )]
    const cobro = buscarCobro(reserva, cajas)
    return { reserva, habitaciones, ...(cobro ? { cobro } : {}) }
  })
}

export function getParteFlags(
  parte: ParteHabitaciones,
  parteAnterior?: ParteHabitaciones,
  cajas: CajaParte[] = [],
): ParteFlag[] {
  const flags: ParteFlag[] = []

  if (!parteAnterior) {
    flags.push({
      level: 'info',
      tipo: 'sin_parte_anterior',
      mensaje: 'Importá el parte del turno anterior para conciliar los check-outs contra la caja.',
    })
  }

  // Reservas ocupadas todavía sin ningún cobro en las cajas importadas (informativo:
  // pudo pagar en un turno cuya caja aún no se cargó).
  if (cajas.length) {
    const reservasOcupadas = [...new Set(parte.ocupadas.map(o => o.reserva))]
    const sinCobro = reservasOcupadas.filter(r => !buscarCobro(r, cajas))
    if (sinCobro.length) {
      flags.push({
        level: 'info',
        tipo: 'ocupada_sin_cobro',
        mensaje: `${sinCobro.length} reserva(s) ocupada(s) sin cobro registrado en las cajas importadas.`,
      })
    }
  }

  return flags
}
