// Cruces automáticos del parte de habitaciones (Fase 4). A partir de un
// ParteHabitaciones (y opcionalmente el parte anterior + las cajas importadas)
// devuelve un resumen de ocupación y las "imperfecciones" a revisar.
//
// Cruce clave con caja: el parte no tiene plata, pero sí la reserva de cada
// habitación. Un check-out (habitación que estaba ocupada y ahora figura libre)
// debería tener un cobro asociado en alguna caja. Si no, se marca.

import type { ParteHabitaciones, CajaParte } from '../types'

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

// ¿Existe algún cobro para esta reserva en las cajas importadas?
function reservaTieneCobro(reserva: string, cajas: CajaParte[]): boolean {
  return cajas.some(c => c.ingresos.some(m => m.reserva === reserva))
}

export function getParteFlags(
  parte: ParteHabitaciones,
  parteAnterior?: ParteHabitaciones,
  cajas: CajaParte[] = [],
): ParteFlag[] {
  const flags: ParteFlag[] = []

  // 1) Check-outs por diferencia: habitaciones que estaban ocupadas en el parte
  //    anterior y ya no figuran ocupadas en este → se fueron en el turno.
  if (parteAnterior) {
    const sigueOcupada = (hab: string, reserva: string) =>
      parte.ocupadas.some(o => o.habitacion === hab && o.reserva === reserva)
    const checkouts = parteAnterior.ocupadas.filter(o => !sigueOcupada(o.habitacion, o.reserva))

    // Agrupo por reserva (una reserva puede ocupar varias habitaciones).
    const reservas = [...new Set(checkouts.map(c => c.reserva))]
    const sinCobro = cajas.length
      ? reservas.filter(r => !reservaTieneCobro(r, cajas))
      : []

    if (sinCobro.length) {
      for (const r of sinCobro) {
        const habs = checkouts.filter(c => c.reserva === r).map(c => c.habitacion).join(', ')
        flags.push({
          level: 'warn',
          tipo: 'checkout_sin_cobro',
          mensaje: `Check-out de la reserva ${r} (hab. ${habs}) sin cobro registrado en caja.`,
        })
      }
    }
  } else {
    flags.push({
      level: 'info',
      tipo: 'sin_parte_anterior',
      mensaje: 'Importá el parte del turno anterior para detectar los check-outs por diferencia.',
    })
  }

  // 2) Reservas ocupadas todavía sin ningún cobro en caja (huésped sin facturar).
  //    Solo si hay cajas importadas; es informativo (pudo pagar en otro turno aún no cargado).
  if (cajas.length) {
    const reservasOcupadas = [...new Set(parte.ocupadas.map(o => o.reserva))]
    const sinCobro = reservasOcupadas.filter(r => !reservaTieneCobro(r, cajas))
    if (sinCobro.length) {
      flags.push({
        level: 'info',
        tipo: 'ocupada_sin_cobro',
        mensaje: `${sinCobro.length} reserva(s) ocupada(s) sin cobro registrado en las cajas importadas: ${sinCobro.join(', ')}.`,
      })
    }
  }

  return flags
}
