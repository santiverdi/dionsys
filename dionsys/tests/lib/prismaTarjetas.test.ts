import { describe, it, expect } from 'vitest'
import { conciliacionTarjetas, type PrismaResumenMes } from '../../src/lib/prismaTarjetas'
import { getSeguimientoTurnos } from '../../src/lib/panorama'
import type { CajaParte, CajaMovimiento, ParteHabitaciones } from '../../src/types'

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '2026-06-20T10:00:00.000Z', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}

function mkCaja(p: Partial<CajaParte>): CajaParte {
  return {
    id: `c${p.nroCaja}`, nroCaja: p.nroCaja ?? 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-06-20T07:00:00.000Z', cierreAt: '2026-06-20T15:00:00.000Z',
    aperturaMonto: 0, saldoFinal: 0, ingresos: [], egresos: [], retiros: [],
    importedBy: 'X', importedAt: '2026-06-20T15:30:00.000Z', ...p,
  }
}

function mkParte(p: Partial<ParteHabitaciones>): ParteHabitaciones {
  return {
    id: `p${p.nroCaja}`, nroCaja: p.nroCaja ?? 1, usuario: 'X', fechaCaja: '2026-06-20T07:00:00.000Z',
    ocupadas: [], libres: [], totalOcupadas: 0, totalPlazas: 0, totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0, importedBy: 'X', importedAt: '2026-06-20T15:30:00.000Z', ...p,
  }
}

describe('conciliacionTarjetas', () => {
  it('agrupa lo cobrado por tarjeta por mes y lo cruza contra el resumen Prisma', () => {
    const cajas = [
      mkCaja({ nroCaja: 1, ingresos: [
        mov({ tarjetas: 2000, total: 2000, fechaHora: '2026-06-05T10:00:00.000Z' }),
        mov({ tarjetas: 3000, total: 3000, fechaHora: '2026-06-20T10:00:00.000Z' }),
        mov({ efectivo: 9999, total: 9999, fechaHora: '2026-06-20T11:00:00.000Z' }), // efectivo no cuenta
      ] }),
      mkCaja({ nroCaja: 2, ingresos: [
        mov({ tarjetas: 1000, total: 1000, fechaHora: '2026-07-02T10:00:00.000Z' }),
      ] }),
    ]
    const resumenes: PrismaResumenMes[] = [
      { mes: '2026-06', total: 5000, cargadoBy: 'Roxana', cargadoAt: '2026-07-01T10:00:00.000Z' },
    ]
    const rows = conciliacionTarjetas(cajas, resumenes)
    expect(rows.map(r => r.mes)).toEqual(['2026-07', '2026-06']) // más nuevo primero
    const jun = rows.find(r => r.mes === '2026-06')
    expect(jun?.sistema).toBe(5000)
    expect(jun?.cobros).toBe(2)
    expect(jun?.prisma).toBe(5000)
    expect(jun?.dif).toBe(0)
    const jul = rows.find(r => r.mes === '2026-07')
    expect(jul?.prisma).toBeNull() // todavía sin resumen cargado
    expect(jul?.dif).toBeNull()
  })

  it('marca la diferencia cuando el resumen Prisma no coincide con el sistema', () => {
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ tarjetas: 10000, total: 10000, fechaHora: '2026-06-05T10:00:00.000Z' }),
    ] })]
    const rows = conciliacionTarjetas(cajas, [
      { mes: '2026-06', total: 8500, cargadoBy: 'Roxana', cargadoAt: '2026-07-01T10:00:00.000Z' },
    ])
    expect(rows[0].dif).toBe(-1500) // Prisma tiene menos que el sistema
  })

  it('los cobros con tarjeta anulados por el PMS no suman al sistema', () => {
    // Mismo criterio que el resto del control: ingresosNetos netea la anulación.
    const cajas = [mkCaja({ nroCaja: 66, ingresos: [
      mov({ observacion: 'Pago Reserva 682', tarjetas: 5817583, total: 5817583, fechaHora: '2026-06-05T10:00:00.000Z' }),
      mov({ observacion: 'Pago Reserva 682', tarjetas: 58175.83, total: 58175.83, fechaHora: '2026-06-05T10:05:00.000Z' }),
    ], egresos: [
      mov({ observacion: 'Egreso por anulación de pago en', tarjetas: 5817583, total: 5817583 }),
    ] })]
    const rows = conciliacionTarjetas(cajas, [])
    expect(rows[0].sistema).toBeCloseTo(58175.83)
    expect(rows[0].cobros).toBe(1)
  })

  it('un mes con resumen Prisma pero sin cobros en el sistema igual se lista', () => {
    const rows = conciliacionTarjetas([], [
      { mes: '2026-05', total: 12000, cargadoBy: 'Roxana', cargadoAt: '2026-06-01T10:00:00.000Z' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].sistema).toBe(0)
    expect(rows[0].dif).toBe(12000)
  })
})

describe('getSeguimientoTurnos', () => {
  it('lista cada turno con sus habitaciones, del más nuevo al más viejo', () => {
    const partes = [
      mkParte({ nroCaja: 20, turno: 'manana', conserje: 'Leandro', fechaCaja: '2026-06-20T07:00:00.000Z',
        totalOcupadas: 5, totalLibres: 15, sucias: 4, limpias: 10, mantenimiento: 1 }),
      mkParte({ nroCaja: 21, turno: 'tarde', conserje: 'Gaston', fechaCaja: '2026-06-20T15:00:00.000Z',
        totalOcupadas: 8, totalLibres: 12, sucias: 1, limpias: 11, mantenimiento: 0 }),
    ]
    const t = getSeguimientoTurnos(partes)
    expect(t.map(x => x.nroCaja)).toEqual([21, 20]) // más nuevo primero
    expect(t[0]).toMatchObject({ turno: 'tarde', conserje: 'Gaston', ocupadas: 8, libres: 12, sucias: 1 })
    expect(t[1]).toMatchObject({ turno: 'manana', conserje: 'Leandro', ocupadas: 5, libres: 15, sucias: 4 })
  })

  it('un parte leído por IA sin fecha de caja usa la fecha de import (no se pierde)', () => {
    const partes = [mkParte({ nroCaja: 30, fechaCaja: '', importedAt: '2026-06-22T10:00:00.000Z', totalOcupadas: 3 })]
    const t = getSeguimientoTurnos(partes)
    expect(t).toHaveLength(1)
    expect(t[0].fecha).toBe('2026-06-22T10:00:00.000Z')
  })
})
