import { describe, it, expect } from 'vitest'
import { parseGruposRows } from '../../src/lib/parseGrupos'
import {
  getResumenGrupos, gruposProximos, gruposConDeudaVencida, gruposSobrepagados,
  ingresosPorMes, ingresoGruposMes, grupoDeFecha, estaEnGrupo, mergeGrupos,
} from '../../src/lib/grupos'
import type { Grupo } from '../../src/types'

// Mismo layout que "GRUPOS hotel DION 2026.xlsx" (columnas y fórmulas reales),
// con datos inventados para no meter la planilla comercial en el repo.
// Las fechas van como número de serie de Excel, igual que las manda la librería.
const SERIAL = { '2026-09-08': 46273, '2026-09-11': 46276, '2026-10-19': 46314, '2026-10-23': 46318 }

const ENCABEZADOS = [
  ['HOTEL DION', '', '', '', '', 'PLAZAS', 'PRECIO', '', 'PLAZAS', 'PRECIO', '', '', '', '', '', ''],
  ['GRUPOS', 'FACTURA', 'INGRESO', 'EGRESO', 'NOCHES', 'BASE DOBLE', 'BASE DOBLE', 'SUBTOTAL',
    'BASE SINGLE', 'BASE SINGLE', 'SUBTOTAL', 'TOTAL', 'PAGO', 'PAGO', 'PAGO', 'SALDO'],
]

// CORO: 3 noches, 40 pax × $30.000 = $3.600.000; pagó 1.000.000 + 200.000
const CORO = ['CORO ', 0.5, SERIAL['2026-09-08'], SERIAL['2026-09-11'], 3,
  40, 30_000, 3_600_000, null, null, 0, 3_600_000, 1_000_000, 200_000, null, 2_400_000]
// CLUB: pagó MÁS que el total (caso real de la planilla)
const CLUB = ['CLUB ', 1, SERIAL['2026-10-19'], SERIAL['2026-10-23'], 4,
  100, 50_000, 20_000_000, null, null, 0, 20_000_000, 25_000_000, null, null, -5_000_000]
const VACIA = ['', '', '', '', 0, '', '', 0, '', '', 0, 0, '', '', '', 0]

const AOA = [...ENCABEZADOS, CORO, CLUB, VACIA, VACIA]

describe('parseGruposRows', () => {
  const grupos = parseGruposRows(AOA, 'Charo', 'GRUPOS.xlsx')

  it('lee solo las filas con grupo y las ordena por fecha de ingreso', () => {
    expect(grupos).toHaveLength(2)
    expect(grupos.map(g => g.nombre)).toEqual(['CORO', 'CLUB'])
  })

  it('convierte las fechas del serial de Excel sin correrlas de día', () => {
    expect(grupos[0].ingreso).toBe('2026-09-08')
    expect(grupos[0].egreso).toBe('2026-09-11')
    expect(grupos[1].ingreso).toBe('2026-10-19')
  })

  it('lee plazas, precios, noches y el % que se factura', () => {
    const g = grupos[0]
    expect({ noches: g.noches, plazasDoble: g.plazasDoble, precioDoble: g.precioDoble, facturaPct: g.facturaPct })
      .toEqual({ noches: 3, plazasDoble: 40, precioDoble: 30_000, facturaPct: 50 })
  })

  it('junta los pagos y RECALCULA el saldo (no confía en la fórmula del Excel)', () => {
    expect(grupos[0].pagos).toEqual([1_000_000, 200_000])
    expect(grupos[0].saldo).toBe(2_400_000)   // 3.600.000 - 1.200.000
  })

  it('un grupo que pagó de más queda con saldo negativo', () => {
    expect(grupos[1].saldo).toBe(-5_000_000)
  })

  it('si el Excel no trae total, lo calcula plazas × precio × noches', () => {
    const sinTotal = [...CORO]; sinTotal[11] = null
    const g = parseGruposRows([...ENCABEZADOS, sinTotal], 'X')[0]
    expect(g.total).toBe(3_600_000)
  })

  it('si no trae noches, las deriva de las fechas', () => {
    const sinNoches = [...CORO]; sinNoches[4] = null
    expect(parseGruposRows([...ENCABEZADOS, sinNoches], 'X')[0].noches).toBe(3)
  })
})

const grupos = parseGruposRows(AOA, 'Charo')

describe('getResumenGrupos', () => {
  it('separa lo que falta cobrar de lo que se pagó de más', () => {
    const r = getResumenGrupos(grupos)
    expect(r.contratado).toBe(23_600_000)
    expect(r.cobrado).toBe(26_200_000)
    expect(r.porCobrar).toBe(2_400_000)   // NO neteado contra el sobrepago
    expect(r.aFavor).toBe(5_000_000)
    expect(r.plazas).toBe(140)
    expect(r.nochesPlaza).toBe(520)       // 40×3 + 100×4
  })
})

describe('estado de los grupos según la fecha', () => {
  it('próximos = los que todavía no terminaron', () => {
    expect(gruposProximos(grupos, new Date('2026-09-10')).map(g => g.nombre)).toEqual(['CORO', 'CLUB'])
    expect(gruposProximos(grupos, new Date('2026-09-30')).map(g => g.nombre)).toEqual(['CLUB'])
    expect(gruposProximos(grupos, new Date('2026-12-01'))).toEqual([])
  })

  it('deuda vencida = ya se fue y sigue debiendo', () => {
    expect(gruposConDeudaVencida(grupos, new Date('2026-09-30')).map(g => g.nombre)).toEqual(['CORO'])
    // El CLUB pagó de más: nunca es deuda.
    expect(gruposConDeudaVencida(grupos, new Date('2026-12-01')).map(g => g.nombre)).toEqual(['CORO'])
  })

  it('marca los sobrepagos para revisar', () => {
    expect(gruposSobrepagados(grupos).map(g => g.nombre)).toEqual(['CLUB'])
  })
})

describe('ingresos por mes', () => {
  it('imputa el ingreso al mes en que el grupo se aloja', () => {
    expect(ingresosPorMes(grupos)).toEqual([
      { mes: '2026-09', total: 3_600_000, grupos: 1 },
      { mes: '2026-10', total: 20_000_000, grupos: 1 },
    ])
    expect(ingresoGruposMes(2026, 10, grupos)).toBe(20_000_000)
    expect(ingresoGruposMes(2026, 11, grupos)).toBe(0)
  })
})

describe('grupoDeFecha', () => {
  it('reconoce las fechas en que hay un grupo alojado (para no marcar falta de cobro)', () => {
    expect(grupoDeFecha('2026-09-09', grupos)?.nombre).toBe('CORO')
    expect(estaEnGrupo('2026-09-08', grupos)).toBe(true)   // día de entrada
    expect(estaEnGrupo('2026-09-11', grupos)).toBe(true)   // día de salida
    expect(estaEnGrupo('2026-09-12', grupos)).toBe(false)
    expect(estaEnGrupo('2026-09-20T10:00:00.000Z', grupos)).toBe(false)
  })

  it('sin grupos no rompe', () => {
    expect(estaEnGrupo('2026-09-09', [] as Grupo[])).toBe(false)
    expect(getResumenGrupos([]).contratado).toBe(0)
  })
})

// La planilla del dueño SOLO tiene los grupos que vienen: cuando uno se aloja,
// lo saca. Si el import reemplazara todo, ese grupo (y su ingreso) desaparecería.
describe('mergeGrupos', () => {
  const [coro, club] = grupos   // CORO 08→11/09, CLUB 19→23/10

  it('conserva el grupo que YA se alojó y salió de la planilla', () => {
    // Estamos en octubre: el CORO ya pasó y el Excel solo trae al CLUB.
    const r = mergeGrupos(grupos, [club], new Date('2026-10-01'))
    expect(r.grupos.map(g => g.nombre)).toEqual(['CORO', 'CLUB'])
    expect(r.archivados.map(g => g.nombre)).toEqual(['CORO'])
    expect(r.quitados).toEqual([])
  })

  it('saca el grupo FUTURO que ya no figura, y lo informa', () => {
    // Seguimos en agosto: el CORO todavía no se alojó y desapareció del Excel.
    const r = mergeGrupos(grupos, [club], new Date('2026-08-01'))
    expect(r.grupos.map(g => g.nombre)).toEqual(['CLUB'])
    expect(r.quitados.map(g => g.nombre)).toEqual(['CORO'])
    expect(r.archivados).toEqual([])
  })

  it('lo del Excel pisa lo guardado (trae los pagos al día)', () => {
    const coroPagado = { ...coro, pagos: [3_600_000], saldo: 0 }
    const r = mergeGrupos(grupos, [coroPagado, club], new Date('2026-08-01'))
    expect(r.grupos.find(g => g.nombre === 'CORO')!.saldo).toBe(0)
    expect(r).toMatchObject({ nuevos: 0, actualizados: 2 })
  })

  it('cuenta los nuevos', () => {
    const r = mergeGrupos([coro], [coro, club], new Date('2026-08-01'))
    expect(r).toMatchObject({ nuevos: 1, actualizados: 1 })
  })

  it('la primera importación entra entera', () => {
    const r = mergeGrupos([], grupos, new Date('2026-08-01'))
    expect(r.grupos).toHaveLength(2)
    expect(r).toMatchObject({ nuevos: 2, actualizados: 0 })
  })

  it('el ingreso de un grupo ya alojado sigue contando en su mes', () => {
    const r = mergeGrupos(grupos, [club], new Date('2026-10-01'))
    expect(ingresoGruposMes(2026, 9, r.grupos)).toBe(3_600_000)
  })
})
