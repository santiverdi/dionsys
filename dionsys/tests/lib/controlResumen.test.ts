import { describe, it, expect } from 'vitest'
import { buildResumen } from '../../src/lib/controlResumen'
import type { CajaParte, CajaMovimiento } from '../../src/types'

const mov = (o: Partial<CajaMovimiento>): CajaMovimiento => ({
  fechaHora: '2026-06-17T12:00:00.000Z', usuario: '', comp: '', habitacion: '', observacion: '',
  efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...o,
})
const caja = (o: Partial<CajaParte>): CajaParte => ({
  id: 'x', nroCaja: 1, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'Leandro',
  aperturaAt: '2026-06-17T10:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
  ingresos: [], egresos: [], retiros: [], importedBy: '', importedAt: '', ...o,
})

describe('buildResumen', () => {
  const cajaA = caja({
    id: 'a', nroCaja: 92,
    ingresos: [mov({ efectivo: 100, total: 100, reserva: '500' })],
    egresos: [
      mov({ observacion: 'RETIRO EFECTIVO', efectivo: 1000, total: 1000 }),
      mov({ observacion: 'verduleria', efectivo: 30, total: 30 }),
    ],
  })
  const cajaB = caja({
    id: 'b', nroCaja: 93, aperturaAt: '2026-06-17T16:51:00.000Z',
    ingresos: [mov({ tarjetas: 200, total: 200, reserva: '600' })], // tarjeta sin FB
  })
  const r = buildResumen([cajaA, cajaB], [cajaA, cajaB], [])

  it('suma el dinero cobrado por medio de pago', () => {
    expect(r.totalCobrado).toBe(300)
    expect(r.efectivo).toBe(100)
    expect(r.tarjetas).toBe(200)
  })

  it('separa compras externas de los retiros de efectivo', () => {
    expect(r.retirosEfectivo).toBe(1000)
    expect(r.compras).toHaveLength(1)
    expect(r.compras[0].observacion).toBe('verduleria')
    expect(r.compras[0].nroCaja).toBe(92)
    expect(r.totalCompras).toBe(30)
  })

  it('cuenta cobros con tarjeta sin Factura B', () => {
    expect(r.tarjetaSinFB).toBe(1)
  })

  it('sin partes, no hay datos de habitaciones ni check-outs', () => {
    expect(r.ocupacionPct).toBeUndefined()
    expect(r.checkouts).toBe(0)
    expect(r.partesFaltantes).toEqual([92, 93])
  })
})
