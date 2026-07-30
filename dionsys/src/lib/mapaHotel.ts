// El hotel visto como plano: cada habitación del maestro con el estado que le
// asigna el último parte importado, agrupadas por piso.
//
// El parte del PMS trae dos listas sueltas (ocupadas y libres) sin piso ni
// capacidad. Cruzándolas contra el maestro (src/data/hotel.ts) queda el plano
// completo, y aparecen dos cosas que en las listas sueltas no se ven:
//   - habitaciones que el parte NO menciona (estado 'sin_dato'): nadie sabe si
//     se usaron
//   - habitaciones con más gente que plazas (sobreocupada)

import type { ParteHabitaciones, HabitacionOcupada, EstadoHabitacion } from '../types'
import { HABITACIONES, PISOS, TOTAL_PLAZAS, habitacionesDePiso, type Habitacion } from '../data/hotel'
import { fechaConfiable } from './cajaControl'

export type EstadoMapa = 'ocupada' | EstadoHabitacion | 'sin_dato'

export interface CeldaHabitacion {
  habitacion: Habitacion
  estado: EstadoMapa
  ocupacion?: HabitacionOcupada   // datos de la reserva, si está ocupada
  sobreocupada: boolean           // más personas que plazas
}

export interface PisoMapa {
  piso: number
  celdas: CeldaHabitacion[]
}

export interface TotalesMapa {
  ocupadas: number
  limpias: number
  sucias: number
  mantenimiento: number
  sinDato: number
  plazasOcupadas: number
  plazasTotales: number
  ocupacionPct: number     // sobre habitaciones vendibles
}

export interface MapaHotel {
  parte?: ParteHabitaciones   // el parte del que sale el estado (undefined = sin partes)
  pisos: PisoMapa[]
  totales: TotalesMapa
  desconocidas: string[]      // números del parte que no existen en el maestro
}

/** El parte más reciente por fecha confiable (la fechaCaja puede venir vacía). */
export function ultimoParte(partes: ParteHabitaciones[]): ParteHabitaciones | undefined {
  return partes.reduce<ParteHabitaciones | undefined>((mejor, p) => {
    if (!mejor) return p
    const a = fechaConfiable(p.fechaCaja, p.importedAt)
    const b = fechaConfiable(mejor.fechaCaja, mejor.importedAt)
    return a.localeCompare(b) > 0 ? p : mejor
  }, undefined)
}

export function getMapaHotel(partes: ParteHabitaciones[]): MapaHotel {
  const parte = ultimoParte(partes)
  const ocupadas = new Map((parte?.ocupadas ?? []).map(o => [o.habitacion, o]))
  const libres = new Map((parte?.libres ?? []).map(l => [l.habitacion, l.estado]))

  const celdaDe = (habitacion: Habitacion): CeldaHabitacion => {
    const ocupacion = ocupadas.get(habitacion.numero)
    if (ocupacion) {
      return {
        habitacion,
        estado: 'ocupada',
        ocupacion,
        sobreocupada: ocupacion.plazas > habitacion.plazas,
      }
    }
    const estado = libres.get(habitacion.numero)
    return { habitacion, estado: estado ?? 'sin_dato', sobreocupada: false }
  }

  const pisos = PISOS.map(piso => ({ piso, celdas: habitacionesDePiso(piso).map(celdaDe) }))
  const celdas = pisos.flatMap(p => p.celdas)
  const cuenta = (e: EstadoMapa) => celdas.filter(c => c.estado === e).length

  // El % se mide sobre lo VENDIBLE: una habitación fuera de servicio no es un
  // cuarto libre que se dejó de vender.
  const vendibles = HABITACIONES.filter(h => h.activa).length
  const ocupadasN = cuenta('ocupada')
  const plazasOcupadas = celdas.reduce((s, c) => s + (c.ocupacion?.plazas ?? 0), 0)

  const conocidas = new Set(HABITACIONES.map(h => h.numero))
  const desconocidas = [...new Set([...ocupadas.keys(), ...libres.keys()])]
    .filter(n => !conocidas.has(n))
    .sort()

  return {
    parte,
    pisos,
    desconocidas,
    totales: {
      ocupadas: ocupadasN,
      limpias: cuenta('limpia'),
      sucias: cuenta('sucia'),
      mantenimiento: cuenta('mantenimiento'),
      sinDato: cuenta('sin_dato'),
      plazasOcupadas,
      plazasTotales: TOTAL_PLAZAS,
      ocupacionPct: vendibles ? Math.round((ocupadasN / vendibles) * 100) : 0,
    },
  }
}
