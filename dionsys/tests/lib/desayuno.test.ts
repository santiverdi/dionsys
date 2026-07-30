import { describe, it, expect } from 'vitest'
import { desayunoDeFecha, ultimaNoche, serieDesayuno, diasDeAntiguedad } from '../../src/lib/desayuno'
import type { ParteHabitaciones, Turno } from '../../src/types'

// El parte del turno noche se cierra PASADA la medianoche (medido: entre 00:07 y
// 03:51 en los 45 partes noche reales), así que su fechaCaja ya lleva la fecha
// del día siguiente: el parte del "30/07 01:58" son los que durmieron la noche
// del 29 al 30 → los que desayunan el 30.
function mkParte(
  fechaCaja: string,
  turno: Turno,
  ocupadas: number,
  plazas: number,
  nroCaja = 1,
  conserje?: string,
): ParteHabitaciones {
  return {
    id: `${fechaCaja}-${turno}`, nroCaja, usuario: 'X', fechaCaja, turno,
    ...(conserje ? { conserje } : {}),
    ocupadas: Array.from({ length: ocupadas }, (_, i) => ({
      habitacion: `${101 + i}`, reserva: `r${i}`, plazas: 2, canal: 'Walk In',
    })),
    libres: [], totalOcupadas: ocupadas, totalPlazas: plazas, totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0,
    importedBy: 'X', importedAt: fechaCaja,
  }
}

const PARTES = [
  mkParte('2026-07-28T09:55:00.000Z', 'manana', 40, 90),   // ignorado: no es noche
  mkParte('2026-07-28T18:03:00.000Z', 'tarde', 38, 85),    // ignorado
  mkParte('2026-07-28T02:04:00.000Z', 'noche', 34, 73, 14, 'Valentin'),
  mkParte('2026-07-29T02:08:00.000Z', 'noche', 31, 70, 17, 'Valentin'),
  mkParte('2026-07-30T02:02:00.000Z', 'noche', 30, 70, 20, 'Gaston'),
]

describe('desayunoDeFecha', () => {
  it('usa el parte del turno NOCHE con la fecha del desayuno', () => {
    const d = desayunoDeFecha('2026-07-30', PARTES)
    expect(d).toMatchObject({
      fecha: '2026-07-30', huespedes: 70, habitaciones: 30, nroCaja: 20, conserje: 'Gaston', cargadoA: '02:02',
    })
  })

  it('no toma el parte de la mañana ni el de la tarde', () => {
    // El 28 hay parte de mañana (90 plazas) y de tarde (85): manda el de noche (73).
    expect(desayunoDeFecha('2026-07-28', PARTES)?.huespedes).toBe(73)
  })

  it('sin parte noche de esa fecha devuelve undefined (no inventa)', () => {
    expect(desayunoDeFecha('2026-07-27', PARTES)).toBeUndefined()
    expect(desayunoDeFecha('', PARTES)).toBeUndefined()
  })

  it('acepta una fecha ISO completa', () => {
    expect(desayunoDeFecha('2026-07-29T00:00:00.000Z', PARTES)?.huespedes).toBe(70)
  })

  it('con varios partes noche del mismo día se queda con el de más ocupadas', () => {
    const dobles = [...PARTES, mkParte('2026-07-30T01:10:00.000Z', 'noche', 45, 99, 19)]
    expect(desayunoDeFecha('2026-07-30', dobles)?.huespedes).toBe(99)
  })

  it('usa el total IMPRESO de plazas, no la suma de lo parseado', () => {
    // El total impreso (73) es el dato confiable aun en partes a los que el
    // parser viejo les comía filas.
    const p = mkParte('2026-08-01T02:00:00.000Z', 'noche', 2, 73)
    expect(desayunoDeFecha('2026-08-01', [p])?.huespedes).toBe(73)
  })
})

describe('ultimaNoche', () => {
  it('devuelve la medición más reciente', () => {
    expect(ultimaNoche(PARTES)).toMatchObject({ fecha: '2026-07-30', huespedes: 70 })
  })

  it('sin partes noche no devuelve nada', () => {
    expect(ultimaNoche([PARTES[0], PARTES[1]])).toBeUndefined()
    expect(ultimaNoche([])).toBeUndefined()
  })
})

describe('diasDeAntiguedad', () => {
  const ultima = ultimaNoche(PARTES)!

  it('mide cuántos días hace que se midió', () => {
    expect(diasDeAntiguedad(ultima, new Date('2026-07-30T23:00:00'))).toBe(0)
    expect(diasDeAntiguedad(ultima, new Date('2026-08-02T08:00:00'))).toBe(3)
  })

  it('nunca es negativo', () => {
    expect(diasDeAntiguedad(ultima, new Date('2026-07-28T08:00:00'))).toBe(0)
  })
})

describe('serieDesayuno', () => {
  it('devuelve los días con parte noche, del más nuevo al más viejo', () => {
    expect(serieDesayuno(PARTES).map(d => d.fecha))
      .toEqual(['2026-07-30', '2026-07-29', '2026-07-28'])
  })

  it('recorta a la cantidad de días pedida', () => {
    expect(serieDesayuno(PARTES, 2).map(d => d.huespedes)).toEqual([70, 70])
  })
})
