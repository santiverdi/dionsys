import { describe, it, expect } from 'vitest'
import {
  getDineroResumen, getImperfeccionesGlobal, getConserjeStats,
  getOcupacionResumen, getCobertura, getGastosCaja, getPanorama,
} from '../../src/lib/panorama'
import type { CajaParte, CajaMovimiento, ParteHabitaciones, EstadoHabitacion } from '../../src/types'

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

describe('getDineroResumen', () => {
  const cajas = [
    mkCaja({ nroCaja: 1, conserje: 'Leandro', ingresos: [
      mov({ efectivo: 1000, total: 1000 }),
      mov({ tarjetas: 2000, total: 2000, facturaB: '3-1' }),
      mov({ tarjetas: 500, total: 500 }), // tarjeta SIN FB
    ], egresos: [
      mov({ observacion: 'RETIRO EFECTIVO', efectivo: 800, total: 800 }),
      mov({ observacion: 'Compra lamparas', efectivo: 300, total: 300 }), // gasto a revisar
    ] }),
  ]

  it('suma cobros por medio de pago y el total', () => {
    const r = getDineroResumen(cajas)
    expect(r.totalCobrado).toBe(3500)
    expect(r.efectivo).toBe(1000)
    expect(r.tarjetas).toBe(2500)
    expect(r.cantIngresos).toBe(3)
  })

  it('separa retiros de efectivo (a caja fuerte) de los gastos de caja', () => {
    const r = getDineroResumen(cajas)
    expect(r.totalRetiros).toBe(800)
    expect(r.totalGastosCaja).toBe(300)
  })

  it('calcula el % de cobros con tarjeta que traen Factura B', () => {
    const r = getDineroResumen(cajas)
    expect(r.cobrosTarjeta).toBe(2)
    expect(r.cobrosTarjetaConFB).toBe(1)
    expect(r.pctFB).toBe(50)
  })
})

describe('getGastosCaja', () => {
  it('lista solo los egresos que no son retiro de efectivo, ordenados por monto', () => {
    const cajas = [mkCaja({ nroCaja: 1, conserje: 'Gaston', egresos: [
      mov({ observacion: 'RETIRO EFECTIVO', total: 5000 }),
      mov({ observacion: 'Ferreteria', total: 300 }),
      mov({ observacion: 'Delivery', total: 900 }),
    ] })]
    const g = getGastosCaja(cajas)
    expect(g.map(x => x.observacion)).toEqual(['Delivery', 'Ferreteria'])
    expect(g[0].nroCaja).toBe(1)
    expect(g[0].conserje).toBe('Gaston')
  })

  it('excluye movimientos internos: retiro, cierre de lote y transferencia entre cajas', () => {
    const cajas = [mkCaja({ nroCaja: 1, egresos: [
      mov({ observacion: 'RETIRO EFECTIVO OFICINA', total: 5000 }),
      mov({ observacion: 'CIERRE DE LOTE TARJETA DE', total: 4000 }),
      mov({ observacion: 'Egreso de caja 100', total: 3000 }),
      mov({ observacion: 'C-100', total: 2000 }),
      mov({ observacion: 'verduleria', total: 1500 }),
    ] })]
    const g = getGastosCaja(cajas)
    expect(g.map(x => x.observacion)).toEqual(['verduleria']) // solo el gasto real
  })
})

describe('getImperfeccionesGlobal + getConserjeStats', () => {
  // Caja sin cerrar + tarjeta sin FB (Leandro); caja con descuadre (Santiago).
  const cajas = [
    mkCaja({ nroCaja: 10, conserje: 'Leandro', cierreAt: undefined, saldoFinal: 100, aperturaMonto: 0,
      ingresos: [mov({ tarjetas: 500, total: 500 })] }),
    mkCaja({ nroCaja: 11, conserje: 'Santiago', aperturaMonto: 999, // != saldoFinal anterior (100) => descuadre
      aperturaAt: '2026-06-20T15:00:00.000Z', ingresos: [] }),
  ]
  const partes: ParteHabitaciones[] = []

  it('cuenta cajas sin cerrar, tarjeta sin FB y descuadres', () => {
    const i = getImperfeccionesGlobal(cajas, partes)
    expect(i.cajasSinCerrar).toBe(1)
    expect(i.tarjetaSinFB).toBe(1)
    expect(i.descuadres).toBe(1)
    expect(i.total).toBe(3)
  })

  it('atribuye las imperfecciones a cada conserje y ordena por peor', () => {
    const stats = getConserjeStats(cajas, partes)
    const leandro = stats.find(s => s.conserje === 'Leandro')
    const santiago = stats.find(s => s.conserje === 'Santiago')
    expect(leandro?.imperfecciones.tarjetaSinFB).toBe(1)
    expect(leandro?.imperfecciones.cajasSinCerrar).toBe(1)
    expect(santiago?.imperfecciones.descuadres).toBe(1)
    // Leandro tiene 2 imperfecciones, Santiago 1 → Leandro primero.
    expect(stats[0].conserje).toBe('Leandro')
  })

  it('cuenta las cajas salteadas como imperfección y las atribuye a quien salteó', () => {
    // Gaston cargó la 32 salteando la 31 (la anterior por fecha es la 30).
    const conHueco = [
      mkCaja({ nroCaja: 30, conserje: 'Leandro', saldoFinal: 100 }),
      mkCaja({ nroCaja: 32, conserje: 'Gaston', aperturaMonto: 999, aperturaAt: '2026-06-20T23:00:00.000Z' }),
    ]
    const i = getImperfeccionesGlobal(conHueco, [])
    expect(i.huecos).toBe(1)
    // El hueco NO genera además un descuadre falso (apertura de la 32 vs cierre de la 30).
    expect(i.descuadres).toBe(0)
    const stats = getConserjeStats(conHueco, [])
    expect(stats.find(s => s.conserje === 'Gaston')?.imperfecciones.huecos).toBe(1)
    expect(stats.find(s => s.conserje === 'Leandro')?.imperfecciones.huecos).toBe(0)
  })
})

describe('getOcupacionResumen', () => {
  const partes = [
    mkParte({ nroCaja: 20, turno: 'manana', totalOcupadas: 5, totalLibres: 5,
      ocupadas: [{ habitacion: '101', reserva: '500', plazas: 2, canal: 'Booking.com' }] }),
    mkParte({ nroCaja: 22, turno: 'noche', totalPlazas: 40, fechaCaja: '2026-06-21T07:00:00.000Z',
      sucias: 3, limpias: 10, mantenimiento: 1,
      ocupadas: [
        { habitacion: '101', reserva: '500', plazas: 2, canal: 'Booking.com' }, // misma reserva, no duplica
        { habitacion: '305', reserva: '600', plazas: 3, canal: 'WhatsApp' },
      ] }),
  ]

  it('toma los huéspedes de la última noche (totalPlazas del parte noche)', () => {
    const o = getOcupacionResumen(partes)
    expect(o.huespedesUltimaNoche).toBe(40)
  })

  it('arma el mix por canal deduplicando reservas', () => {
    const o = getOcupacionResumen(partes)
    const booking = o.canalMix.find(c => c.canal === 'Booking.com')
    const whatsapp = o.canalMix.find(c => c.canal === 'WhatsApp')
    expect(booking?.reservas).toBe(1) // reserva 500 aparece en 2 partes pero cuenta 1
    expect(whatsapp?.reservas).toBe(1)
  })

  it('usa la limpieza del último parte', () => {
    const o = getOcupacionResumen(partes)
    expect(o.limpieza.sucias).toBe(3)
  })
})

describe('getCobertura', () => {
  it('detecta cajas sin parte, partes sin caja y huecos en la numeración', () => {
    const cajas = [mkCaja({ nroCaja: 30 }), mkCaja({ nroCaja: 32 })] // falta 31
    const partes = [mkParte({ nroCaja: 30 }), mkParte({ nroCaja: 40 })]
    const c = getCobertura(cajas, partes)
    expect(c.cajasSinParte).toEqual([32])
    expect(c.partesSinCaja).toEqual([40])
    expect(c.huecosNroCaja).toEqual([31])
    expect(c.ultimaCajaNro).toBe(32)
  })

  it('mide las horas sin carga desde la apertura de la última caja (hueco en la cola)', () => {
    const cajas = [
      mkCaja({ nroCaja: 30, aperturaAt: '2026-06-20T07:00:00.000Z' }),
      mkCaja({ nroCaja: 31, aperturaAt: '2026-06-20T15:00:00.000Z' }),
    ]
    const c = getCobertura(cajas, [], new Date('2026-06-21T17:00:00.000Z'))
    expect(c.horasSinCarga).toBe(26) // un día entero sin rendir, aunque no haya hueco numérico
  })

  it('sin cajas cargadas no reporta horas (no hay desde cuándo medir)', () => {
    const c = getCobertura([], [], new Date('2026-06-21T17:00:00.000Z'))
    expect(c.horasSinCarga).toBeNull()
    expect(c.ultimaCajaNro).toBeNull()
  })
})

describe('getPanorama', () => {
  it('arma todas las secciones sin romper con datos vacíos', () => {
    const p = getPanorama([], [])
    expect(p.dinero.totalCobrado).toBe(0)
    expect(p.conserjes).toEqual([])
    expect(p.serie).toEqual([])
    expect(p.ocupacion.huespedesUltimaNoche).toBe(0)
  })
})
