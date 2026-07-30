import { describe, it, expect } from 'vitest'
import { getMapaHotel, ultimoParte } from '../../src/lib/mapaHotel'
import { HABITACIONES, TOTAL_HABITACIONES, TOTAL_PLAZAS, PISOS } from '../../src/data/hotel'
import type { ParteHabitaciones, EstadoHabitacion } from '../../src/types'

function mkParte(
  nroCaja: number,
  fechaCaja: string,
  ocupadas: Array<[string, number]> = [],
  libres: Array<[string, EstadoHabitacion]> = [],
): ParteHabitaciones {
  return {
    id: `p${nroCaja}`, nroCaja, usuario: 'X', fechaCaja,
    ocupadas: ocupadas.map(([habitacion, plazas], i) => ({
      habitacion, plazas, reserva: String(900 + i), canal: 'Walk In',
    })),
    libres: libres.map(([habitacion, estado]) => ({ habitacion, estado })),
    totalOcupadas: ocupadas.length, totalPlazas: 0, totalLibres: libres.length,
    sucias: 0, limpias: 0, mantenimiento: 0,
    importedBy: 'X', importedAt: fechaCaja || '2026-06-19T12:00:00.000Z',
  }
}

const celda = (mapa: ReturnType<typeof getMapaHotel>, numero: string) =>
  mapa.pisos.flatMap(p => p.celdas).find(c => c.habitacion.numero === numero)

describe('ultimoParte', () => {
  it('toma el más reciente por fecha de caja', () => {
    const partes = [
      mkParte(80, '2026-06-18T09:00:00.000Z'),
      mkParte(99, '2026-06-20T09:00:00.000Z'),
      mkParte(12, '2026-06-19T09:00:00.000Z'),
    ]
    expect(ultimoParte(partes)?.nroCaja).toBe(99)
  })

  it('con la fechaCaja vacía cae al importedAt', () => {
    const viejo = mkParte(1, '2026-06-10T09:00:00.000Z')
    const sinFecha = { ...mkParte(2, ''), importedAt: '2026-06-25T09:00:00.000Z' }
    expect(ultimoParte([viejo, sinFecha])?.nroCaja).toBe(2)
  })

  it('sin partes devuelve undefined', () => {
    expect(ultimoParte([])).toBeUndefined()
  })
})

describe('getMapaHotel', () => {
  it('sin partes muestra el hotel entero sin dato', () => {
    const mapa = getMapaHotel([])
    expect(mapa.parte).toBeUndefined()
    expect(mapa.pisos).toHaveLength(PISOS.length)
    expect(mapa.pisos.flatMap(p => p.celdas)).toHaveLength(HABITACIONES.length)
    expect(mapa.totales.sinDato).toBe(HABITACIONES.length)
    expect(mapa.totales.ocupacionPct).toBe(0)
    expect(mapa.totales.plazasTotales).toBe(TOTAL_PLAZAS)
  })

  it('marca ocupadas, libres y las que el parte no menciona', () => {
    const mapa = getMapaHotel([mkParte(1, '2026-06-19T09:00:00.000Z',
      [['101', 3]],
      [['102', 'sucia'], ['103', 'mantenimiento']],
    )])
    expect(celda(mapa, '101')?.estado).toBe('ocupada')
    expect(celda(mapa, '101')?.ocupacion?.plazas).toBe(3)
    expect(celda(mapa, '102')?.estado).toBe('sucia')
    expect(celda(mapa, '103')?.estado).toBe('mantenimiento')
    expect(celda(mapa, '104')?.estado).toBe('sin_dato')
    expect(mapa.totales).toMatchObject({ ocupadas: 1, sucias: 1, mantenimiento: 1, plazasOcupadas: 3 })
    expect(mapa.totales.sinDato).toBe(HABITACIONES.length - 3)
  })

  it('marca la sobreocupación contra la capacidad real', () => {
    // 105 es doble (2 plazas); 101 es triple y va llena.
    const mapa = getMapaHotel([mkParte(1, '2026-06-19T09:00:00.000Z', [['105', 4], ['101', 3]])])
    expect(celda(mapa, '105')?.sobreocupada).toBe(true)
    expect(celda(mapa, '101')?.sobreocupada).toBe(false)
  })

  it('el % de ocupación se mide sobre las habitaciones vendibles', () => {
    const activas = HABITACIONES.filter(h => h.activa)
    const mapa = getMapaHotel([mkParte(1, '2026-06-19T09:00:00.000Z',
      activas.map(h => [h.numero, h.plazas] as [string, number]))])
    expect(mapa.totales.ocupadas).toBe(TOTAL_HABITACIONES)
    expect(mapa.totales.ocupacionPct).toBe(100)
    expect(mapa.totales.plazasOcupadas).toBe(TOTAL_PLAZAS)
  })

  it('la habitación fuera de servicio aparece en el plano pero no infla la ocupación', () => {
    const mapa = getMapaHotel([mkParte(1, '2026-06-19T09:00:00.000Z', [], [['1102', 'mantenimiento']])])
    expect(celda(mapa, '1102')?.habitacion.activa).toBe(false)
    expect(celda(mapa, '1102')?.estado).toBe('mantenimiento')
    expect(mapa.desconocidas).toEqual([])
  })

  it('junta los números del parte que no existen en el hotel', () => {
    const mapa = getMapaHotel([mkParte(1, '2026-06-19T09:00:00.000Z', [['999', 2]], [['106', 'limpia']])])
    expect(mapa.desconocidas).toEqual(['106', '999'])
  })

  it('usa el parte más nuevo, no el primero de la lista', () => {
    const mapa = getMapaHotel([
      mkParte(1, '2026-06-10T09:00:00.000Z', [['101', 3]]),
      mkParte(2, '2026-06-20T09:00:00.000Z', [['201', 3]]),
    ])
    expect(mapa.parte?.nroCaja).toBe(2)
    expect(celda(mapa, '201')?.estado).toBe('ocupada')
    expect(celda(mapa, '101')?.estado).toBe('sin_dato')
  })
})
