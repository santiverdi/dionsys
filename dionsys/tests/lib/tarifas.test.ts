import { describe, it, expect } from 'vitest'
import { getTarifaFlags, tarifaVigente, mesesSinTarifa, TARIFAS_PACTADAS } from '../../src/lib/tarifas'
import type { CajaParte, CajaMovimiento, ParteHabitaciones } from '../../src/types'

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '2026-07-05T12:00:00.000Z', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}

function mkCaja(p: Partial<CajaParte>): CajaParte {
  return {
    id: `c${p.nroCaja ?? 1}`, nroCaja: p.nroCaja ?? 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-07-05T07:00:00.000Z', cierreAt: '2026-07-05T15:00:00.000Z',
    aperturaMonto: 0, saldoFinal: 0, ingresos: [], egresos: [], retiros: [],
    importedBy: 'X', importedAt: '2026-07-05T15:30:00.000Z', ...p,
  }
}

// Parte con la reserva 500 en la hab 101 (plazas configurables).
function mkParte(plazas: number, reserva = '500', habitacion = '101'): ParteHabitaciones {
  return {
    id: 'p1', nroCaja: 1, usuario: 'X', fechaCaja: '2026-07-05T07:00:00.000Z',
    ocupadas: [{ habitacion, reserva, plazas, canal: 'Booking.com' }],
    libres: [], totalOcupadas: 1, totalPlazas: plazas, totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0, importedBy: 'X', importedAt: '2026-07-05T15:30:00.000Z',
  }
}

describe('tarifaVigente', () => {
  it('elige el período por fecha (julio parte en dos)', () => {
    expect(tarifaVigente('2026-07-05T12:00:00.000Z')?.porPersona.lista).toBe(35_000)
    expect(tarifaVigente('2026-07-20T12:00:00.000Z')?.porPersona.lista).toBe(37_500)
    expect(tarifaVigente('2026-06-30T12:00:00.000Z')).toBeUndefined()
  })
})

describe('getTarifaFlags', () => {
  it('una single a precio de lista o de efectivo (pagando efectivo) no marca nada', () => {
    const caja = mkCaja({ ingresos: [
      mov({ reserva: '500', habitacion: '101', tarjetas: 60_000, total: 60_000 }),          // 1 noche lista
      mov({ reserva: '500', habitacion: '101', efectivo: 108_000, total: 108_000 }),        // 2 noches efectivo
    ] })
    expect(getTarifaFlags(caja, [mkParte(1)])).toEqual([])
  })

  it('una doble (2 pax) por noches enteras no marca nada', () => {
    const caja = mkCaja({ ingresos: [
      mov({ reserva: '500', habitacion: '101', tarjetas: 210_000, total: 210_000 }),        // 3 noches × 2 × 35.000
      mov({ reserva: '500', habitacion: '101', efectivo: 63_000, total: 63_000 }),          // 1 noche × 2 × 31.500
    ] })
    expect(getTarifaFlags(caja, [mkParte(2)])).toEqual([])
  })

  it('un cobro que no cuadra con ninguna cantidad de noches marca warn', () => {
    const caja = mkCaja({ ingresos: [mov({ reserva: '500', habitacion: '101', tarjetas: 50_000, total: 50_000 })] })
    const flags = getTarifaFlags(caja, [mkParte(2)])
    expect(flags).toHaveLength(1)
    expect(flags[0].level).toBe('warn')
    expect(flags[0].mensaje).toContain('no cuadra')
  })

  it('el precio de efectivo pagado con tarjeta marca warn (descuento sin efectivo)', () => {
    const caja = mkCaja({ ingresos: [mov({ reserva: '500', habitacion: '101', tarjetas: 54_000, total: 54_000 })] })
    const flags = getTarifaFlags(caja, [mkParte(1)])
    expect(flags).toHaveLength(1)
    expect(flags[0].mensaje).toContain('no se pagó en efectivo')
  })

  it('en el período con "mejores descuentos", cobrar de menos es info (a confirmar), no warn', () => {
    const caja = mkCaja({
      aperturaAt: '2026-07-20T07:00:00.000Z',
      ingresos: [mov({ fechaHora: '2026-07-20T12:00:00.000Z', reserva: '500', habitacion: '101', efectivo: 60_000, total: 60_000 })],
      // 2 pax período 2: pactado 75.000 lista / 67.500 efectivo → 60.000 es menor
    })
    const flags = getTarifaFlags(caja, [mkParte(2)])
    expect(flags).toHaveLength(1)
    expect(flags[0].level).toBe('info')
    expect(flags[0].mensaje).toContain('descuentos mejores')
  })

  it('sin match de reserva/habitación en los partes no controla (evita falsos positivos)', () => {
    const caja = mkCaja({ ingresos: [mov({ reserva: '999', habitacion: '905', tarjetas: 50_000, total: 50_000 })] })
    expect(getTarifaFlags(caja, [mkParte(2)])).toEqual([])
  })

  it('sin tarifa vigente para la fecha no controla', () => {
    const caja = mkCaja({
      aperturaAt: '2026-06-15T07:00:00.000Z',
      ingresos: [mov({ fechaHora: '2026-06-15T12:00:00.000Z', reserva: '500', tarjetas: 50_000, total: 50_000 })],
    })
    expect(getTarifaFlags(caja, [mkParte(2)])).toEqual([])
  })

  it('matchea por habitación (combinada "205/202") cuando la reserva no coincide', () => {
    const caja = mkCaja({ ingresos: [mov({ habitacion: '101/102', tarjetas: 50_000, total: 50_000 })] })
    const flags = getTarifaFlags(caja, [mkParte(2, '500', '101')])
    expect(flags).toHaveLength(1) // encontró las 2 plazas por la hab 101 y el monto no cuadra
  })

  it('avisa los meses recientes sin tarifa cargada (hoy y cajas de los últimos 15 días)', () => {
    // Hoy 5 de agosto sin tarifas de agosto: avisa, aunque haya una caja de julio cubierta.
    const cajas = [
      mkCaja({ nroCaja: 50, aperturaAt: '2026-08-03T07:00:00.000Z', importedAt: '2026-08-03T15:00:00.000Z' }),
      mkCaja({ nroCaja: 40, aperturaAt: '2026-07-16T07:00:00.000Z', importedAt: '2026-07-16T15:00:00.000Z' }),
    ]
    expect(mesesSinTarifa(cajas, TARIFAS_PACTADAS, new Date('2026-08-05T12:00:00'))).toEqual(['2026-08'])
    // En pleno julio (cubierto) no avisa nada, aunque exista historia vieja sin tarifas.
    const conVieja = [mkCaja({ nroCaja: 10, aperturaAt: '2026-06-10T07:00:00.000Z', importedAt: '2026-06-10T15:00:00.000Z' })]
    expect(mesesSinTarifa(conVieja, TARIFAS_PACTADAS, new Date('2026-07-10T12:00:00'))).toEqual([])
  })

  it('las tarifas pactadas de julio son las que pasó el dueño', () => {
    expect(TARIFAS_PACTADAS[0].single).toEqual({ lista: 60_000, efectivo: 54_000 })
    expect(TARIFAS_PACTADAS[0].porPersona).toEqual({ lista: 35_000, efectivo: 31_500 })
    expect(TARIFAS_PACTADAS[1].porPersona).toEqual({ lista: 37_500, efectivo: 33_750 })
    expect(TARIFAS_PACTADAS[1].puedeHaberMasDescuento).toBe(true)
  })
})
