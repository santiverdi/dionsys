// Cuánta gente desayuna, derivado del parte de habitaciones.
//
// Hoy el conserje carga los huéspedes a mano en Ocupación 3 veces por día, y su
// única razón de peso es este número: alimenta la proyección de compra de
// panadería y lácteos. Pero el parte del PMS ya lo tiene, así que es doble carga.
//
// REGLA (confirmada por el usuario): el desayuno de un día son las PLAZAS del
// parte del turno NOCHE, porque son los que DURMIERON esa noche. Un check-in que
// carga el turno mañana entra DESPUÉS del desayuno y cuenta para el día
// siguiente. No sirve el parte de la mañana ni el de la tarde.
//
// LA FECHA COINCIDE DIRECTO, y no es obvio: el turno noche corre de 22 a 5, pero
// su parte se cierra pasada la medianoche (medido sobre los 45 partes noche
// reales: entre las 00:07 y las 03:51), así que su `fechaCaja` ya lleva la fecha
// del día siguiente. Un parte noche del 30/07 a las 01:58 son los que durmieron
// la noche del 29 al 30 → los que desayunan el 30. Es decir:
//
//     desayuno(D) = totalPlazas del parte noche con fecha D
//
// `totalPlazas` es el total IMPRESO del PDF, no la suma de lo parseado: es el
// dato confiable aun en los partes viejos a los que el parser les comía filas.

import type { ParteHabitaciones } from '../types'
import { fechaConfiable } from './cajaControl'

export interface DesayunoDia {
  fecha: string          // YYYY-MM-DD del desayuno
  huespedes: number      // plazas del parte noche = gente que durmió
  habitaciones: number
  nroCaja: number
  conserje?: string
  cargadoA: string       // hora en que se cerró el parte (para saber si ya está)
}

/** Los partes del turno noche, uno por día. Si hay varios se queda con el de más ocupadas. */
function nochePorDia(partes: ParteHabitaciones[]): Map<string, ParteHabitaciones> {
  const out = new Map<string, ParteHabitaciones>()
  for (const p of partes) {
    if (p.turno !== 'noche') continue
    const dia = fechaConfiable(p.fechaCaja, p.importedAt).slice(0, 10)
    if (!dia) continue
    const actual = out.get(dia)
    if (!actual || p.ocupadas.length > actual.ocupadas.length) out.set(dia, p)
  }
  return out
}

function aDesayuno(fecha: string, p: ParteHabitaciones): DesayunoDia {
  return {
    fecha,
    // El total impreso manda; si no viniera, se suma lo parseado.
    huespedes: p.totalPlazas || p.ocupadas.reduce((s, o) => s + o.plazas, 0),
    habitaciones: p.totalOcupadas || p.ocupadas.length,
    nroCaja: p.nroCaja,
    ...(p.conserje ? { conserje: p.conserje } : {}),
    cargadoA: (p.fechaCaja || p.importedAt || '').slice(11, 16),
  }
}

/** Desayuno de una fecha puntual. undefined = no hay parte noche de esa noche. */
export function desayunoDeFecha(fecha: string, partes: ParteHabitaciones[]): DesayunoDia | undefined {
  const dia = (fecha || '').slice(0, 10)
  const p = nochePorDia(partes).get(dia)
  return p ? aDesayuno(dia, p) : undefined
}

/**
 * La última noche MEDIDA: el parte noche más reciente.
 *
 * OJO con qué es y qué no es. El pedido de panadería lo hace el turno noche
 * para el desayuno que viene, así que necesita una PREVISIÓN, y un parte es una
 * MEDICIÓN de lo que ya pasó. Encajan porque el conserje de la noche cierra su
 * parte cerca de las 2 AM y pide el pan después: para entonces el parte ya mide
 * exactamente a la gente que va a desayunar en unas horas.
 *
 * Pero si pide antes de cerrar el parte, lo último medido es la noche anterior.
 * Por eso esto NO se presenta como "el número de mañana" sino como "anoche
 * durmieron N", con su fecha a la vista: sirve de base y el conserje ajusta si
 * sabe que entra o sale un grupo.
 */
export function ultimaNoche(partes: ParteHabitaciones[]): DesayunoDia | undefined {
  const porDia = nochePorDia(partes)
  const dias = [...porDia.keys()].sort()
  const ultimo = dias[dias.length - 1]
  return ultimo ? aDesayuno(ultimo, porDia.get(ultimo)!) : undefined
}

/** Días de antigüedad de una medición, para avisar si está vieja. */
export function diasDeAntiguedad(d: DesayunoDia, hoy = new Date()): number {
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const ms = new Date(dia + 'T12:00:00').getTime() - new Date(d.fecha + 'T12:00:00').getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

/** Serie de los últimos días con parte noche, del más nuevo al más viejo. */
export function serieDesayuno(partes: ParteHabitaciones[], dias = 14): DesayunoDia[] {
  const porDia = nochePorDia(partes)
  return [...porDia.keys()]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, dias)
    .map(d => aDesayuno(d, porDia.get(d)!))
}
