import { describe, it, expect } from 'vitest'
import {
  getDineroResumen, getImperfeccionesGlobal, getConserjeStats,
  getOcupacionResumen, getCobertura, getGastosCaja, getRetirosCaja, getPanorama, conserjeDeParte,
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

  it('el retiro estilo conserje (monto + Nº de caja) no es gasto (caso real caja 5 de Gaston)', () => {
    const cajas = [mkCaja({ nroCaja: 5, conserje: 'Gaston', egresos: [
      mov({ observacion: '$2.500.000. CAJA 5. GASTON', efectivo: 2500000, total: 2500000 }), // "CAJA 5" sin guion
      mov({ observacion: '$700.000. C-5. HERRERA', efectivo: 700000, total: 700000 }),        // "C-5" con guion
      mov({ observacion: '5 bolsas camiseta 3 cajas de', efectivo: 78500, total: 78500 }),     // gasto real: "cajas de", sigue gasto
    ] })]
    expect(getGastosCaja(cajas).map(x => x.observacion)).toEqual(['5 bolsas camiseta 3 cajas de'])
    const retiros = getRetirosCaja(cajas)
    expect(retiros.map(x => x.total)).toEqual([2500000, 700000]) // ambos retiros, ordenados por monto
    const r = getDineroResumen(cajas)
    expect(r.totalRetiros).toBe(3200000)
    expect(r.totalGastosCaja).toBe(78500)
  })

  it('el retiro con numeral ("CAJA N°26") tampoco es gasto (caso real caja 26 de Gaston)', () => {
    const cajas = [mkCaja({ nroCaja: 26, conserje: 'Gaston', egresos: [
      mov({ observacion: '$700.000. CAJA N°26. HERRERA', efectivo: 700000, total: 700000 }),
      mov({ observacion: '$500.000. CAJA Nº 26. HERRERA', efectivo: 500000, total: 500000 }),
      mov({ observacion: '$300.000. CAJA NRO 26. HERRERA', efectivo: 300000, total: 300000 }),
      mov({ observacion: '$200.000. CAJA #26. HERRERA', efectivo: 200000, total: 200000 }),
      mov({ observacion: 'medialunas 2 cajas de facturas', efectivo: 15000, total: 15000 }), // gasto real
    ] })]
    expect(getGastosCaja(cajas).map(x => x.observacion)).toEqual(['medialunas 2 cajas de facturas'])
    const r = getDineroResumen(cajas)
    expect(r.totalRetiros).toBe(1700000)
    expect(r.totalGastosCaja).toBe(15000)
  })

  it('la anulación de un cobro mal cargado no es gasto ni cobro (caso real caja 66)', () => {
    const cajas = [mkCaja({ nroCaja: 66, conserje: 'Gaston',
      ingresos: [
        mov({ observacion: 'Pago Reserva 682 / #702. C66', efectivo: 5817583, total: 5817583 }), // mal tipeado
        mov({ observacion: 'Pago Reserva 682 / #702. C66', efectivo: 58175.83, total: 58175.83 }), // el correcto
      ],
      egresos: [
        mov({ observacion: 'Egreso por anulación de pago en', efectivo: 5817583, total: 5817583 }),
      ] })]
    expect(getGastosCaja(cajas)).toEqual([]) // no aparece como gasto
    const r = getDineroResumen(cajas)
    expect(r.totalGastosCaja).toBe(0)
    expect(r.totalCobrado).toBeCloseTo(58175.83) // el cobro anulado tampoco suma
    expect(r.cantIngresos).toBe(1)
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
    // Gaston cargó la 32 salteando la 31 (la anterior por número es la 30).
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

  it('detecta el hueco aunque la caja venga por IA sin fecha de apertura', () => {
    // La anterior se busca por NÚMERO: una caja con aperturaAt vacío (lectura IA)
    // igual encuentra a la 30 como anterior y el hueco de la 31 no se pierde.
    const conHueco = [
      mkCaja({ nroCaja: 30, conserje: 'Leandro', saldoFinal: 100 }),
      mkCaja({ nroCaja: 32, conserje: 'Gaston', aperturaAt: '' }),
    ]
    const i = getImperfeccionesGlobal(conHueco, [])
    expect(i.huecos).toBe(1)
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
    const cajas = [
      mkCaja({ nroCaja: 30 }),
      mkCaja({ nroCaja: 32, aperturaAt: '2026-06-20T23:00:00.000Z' }), // falta 31
    ]
    const partes = [mkParte({ nroCaja: 30 }), mkParte({ nroCaja: 33 })]
    const c = getCobertura(cajas, partes)
    expect(c.cajasSinParte).toEqual([32])
    expect(c.partesSinCaja).toEqual([33])
    expect(c.huecosNroCaja).toEqual([31]) // sin caja NI parte
    expect(c.ultimaCajaNro).toBe(32)
  })

  it('los huecos se miden sobre la unión: los partes también delatan cajas que faltan', () => {
    // Las cajas llegan hasta la 32, pero hay un parte de la 36: los turnos
    // 33-35 no rindieron NADA y antes eran invisibles (solo se miraba el rango de cajas).
    const cajas = [mkCaja({ nroCaja: 31 }), mkCaja({ nroCaja: 32 })]
    const partes = [mkParte({ nroCaja: 31 }), mkParte({ nroCaja: 36 })]
    const c = getCobertura(cajas, partes)
    expect(c.huecosNroCaja).toEqual([33, 34, 35])
    expect(c.partesSinCaja).toEqual([36])
  })

  it('mide las horas sin carga desde la apertura de la última caja (hueco en la cola)', () => {
    const cajas = [
      mkCaja({ nroCaja: 30, aperturaAt: '2026-06-20T07:00:00.000Z' }),
      mkCaja({ nroCaja: 31, aperturaAt: '2026-06-20T15:00:00.000Z' }),
    ]
    const c = getCobertura(cajas, [], new Date('2026-06-21T17:00:00.000Z'))
    expect(c.horasSinCarga).toBe(26) // un día entero sin rendir, aunque no haya hueco numérico
  })

  it('el paso 100→1 no es hueco (el contador del PMS da la vuelta) y la última caja es por fecha', () => {
    const cajas = [
      mkCaja({ nroCaja: 99, aperturaAt: '2026-06-19T22:00:00.000Z' }),
      mkCaja({ nroCaja: 100, aperturaAt: '2026-06-20T06:00:00.000Z' }),
      mkCaja({ nroCaja: 1, aperturaAt: '2026-06-20T14:00:00.000Z' }),
      mkCaja({ nroCaja: 2, aperturaAt: '2026-06-20T22:00:00.000Z' }),
      mkCaja({ nroCaja: 4, aperturaAt: '2026-06-21T06:00:00.000Z' }),
    ]
    const c = getCobertura(cajas, [])
    expect(c.huecosNroCaja).toEqual([3])  // NO aparecen 5..98 como "faltantes"
    expect(c.ultimaCajaNro).toBe(4)       // la última por fecha, no la Nº 100
  })

  it('sin cajas cargadas no reporta horas (no hay desde cuándo medir)', () => {
    const c = getCobertura([], [], new Date('2026-06-21T17:00:00.000Z'))
    expect(c.horasSinCarga).toBeNull()
    expect(c.ultimaCajaNro).toBeNull()
  })
})

describe('conserjeDeParte (usuario roto por el encabezado del PDF)', () => {
  const JUNK = 'Fecha caja: 22/06/2026 06:46: Fecha/hora emisión : Jun 22, 2026 06:48'

  it('no inventa un conserje con la fecha pegada en usuario', () => {
    expect(conserjeDeParte(mkParte({ nroCaja: 40, usuario: JUNK }))).toBe('—')
  })

  it('sin usuario legible, toma el conserje de la caja del mismo turno (mismo Nº)', () => {
    const parte = mkParte({ nroCaja: 40, usuario: JUNK })
    const caja = mkCaja({ nroCaja: 40, conserje: 'Leandro' })
    expect(conserjeDeParte(parte, [caja])).toBe('Leandro')
  })

  it('la caja homónima de OTRO ciclo (a más de 15 días) no presta su conserje', () => {
    const parte = mkParte({ nroCaja: 40, usuario: JUNK, fechaCaja: '2026-06-20T07:00:00.000Z' })
    const caja = mkCaja({ nroCaja: 40, conserje: 'Leandro',
      aperturaAt: '2026-04-01T07:00:00.000Z', importedAt: '2026-04-01T08:00:00.000Z' })
    expect(conserjeDeParte(parte, [caja])).toBe('—')
  })

  it('un usuario real del PMS que no es conserje conocido se muestra tal cual', () => {
    expect(conserjeDeParte(mkParte({ nroCaja: 41, usuario: 'Diego Armando' }))).toBe('Diego Armando')
  })

  it('en el ranking, los partes rotos no generan una fila por parte', () => {
    const partes = [
      mkParte({ nroCaja: 50, usuario: JUNK }),
      mkParte({ nroCaja: 51, usuario: 'Fecha caja: 05/07/2026 06:48: Fecha/hora emisión : Jul 5, 2026 06:50' }),
    ]
    const stats = getConserjeStats([], partes)
    expect(stats).toHaveLength(1)
    expect(stats[0].conserje).toBe('—')
    expect(stats[0].partes).toBe(2)
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
