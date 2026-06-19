import { describe, it, expect } from 'vitest'
import { parseCajaRows, cajaFromExtracted, turnoDeApertura, type Aoa } from '../../src/lib/parseCaja'
import { getCajaResumen, getCajaFlags } from '../../src/lib/cajaControl'
import type { ExtractedCaja } from '../../src/lib/invoiceExtract'

// Fixture tomado de un Excel real exportado por el PMS ("Caja 80", cerrada).
const H = ['Fecha/Hora', 'Usuario', 'Comp', 'Habitación', 'Observación', 'Efectivo', 'Tarjetas', 'Cheques', 'Transf.', 'Otros', 'TOTAL MOV.']
const AOA: Aoa = [
  ['Informe de caja - Hotel Dion', '', '', '', '', '', '', '', 'Fecha impresión: Jun 17, 2026 11:27', '', ''],
  ['Pto. Vta.', 'Recepcion', '', '', '', 'Nro. Caja', 80, '', 'Moneda de la caja', '', 'AR$'],
  ['Usuario apertura', '', '', 'Usuario cierre', '', 'Apertura', '', '', 'Cierre', '', ''],
  ['Leandro Touriño', '', '', 'Leandro Touriño', '', '13/06/2026 06:58', '', '', '13/06/2026 14:59', '', ''],
  ['Apertura', '', '', '', '', '', '', '', '', '', ''],
  H,
  ['13/06/2026 06:58', 'Touriño Leandro', '', '', 'Monto de Apertura (Efectivo)', 2419075.55, '', '', '', '', 2419075.55],
  ['Totales', '', '', '', '', 2419075.55, 0, 0, 0, 0, 2419075.55],
  ['Ingresos', '', '', '', '', '', '', '', '', '', ''],
  H,
  ['13/06/2026 07:14', 'Touriño Leandro', 'FB 3-527', '1001', 'Reserva 389 - Yamila Inzaurraldez', '', 63135.14, '', '', '', 63135.14],
  ['13/06/2026 08:40', 'Touriño Leandro', 'FB 3-528', '503', 'Reserva 469 - Micaela Ojeda', '', 105631.55, '', '', '', 105631.55],
  ['13/06/2026 13:21', 'Touriño Leandro', 'FB 3-529', '103', 'Reserva 476 - viviana tortorici', '', 99753.85, '', '', '', 99753.85],
  ['13/06/2026 13:32', 'Touriño Leandro', 'FB 3-530', '305', 'Reserva 498 - Piva Andrea soledad', '', 100000, '', '', '', 100000],
  ['13/06/2026 10:42', 'Touriño Leandro', '', '602', 'Pago Reserva 492 /', 208000, '', '', '', '', 208000],
  ['13/06/2026 11:25', 'Touriño Leandro', '', '205/202', 'Pago Reserva 353 /', 260000, '', '', '', '', 260000],
  ['13/06/2026 12:49', 'Touriño Leandro', '', '102', 'Pago Reserva 390 /', 87750, '', '', '', '', 87750],
  ['13/06/2026 13:07', 'Touriño Leandro', '', '301', 'Pago Reserva 465 /', '', '', '', 105631.55, '', 105631.55],
  ['13/06/2026 13:54', 'Touriño Leandro', '', '901', 'Pago Reserva 497 /', '', '', '', 105631.55, '', 105631.55],
  ['13/06/2026 13:59', 'Touriño Leandro', '', '604/603', 'Pago Reserva 356 /', 208000, '', '', '', '', 208000],
  ['Totales', '', '', '', '', 763750, 368520.54, 0, 211263.1, 0, 1343533.64],
  ['Egresos', '', '', '', '', '', '', '', '', '', ''],
  H,
  ['13/06/2026 10:03', 'Touriño Leandro', '', '', 'RETIRO EFECTIVO', 2000000, '', '', '', '', 2000000],
  ['13/06/2026 11:35', 'Touriño Leandro', '', '', 'RETIRO EFECTIVO', 700000, '', '', '', '', 700000],
  ['Totales', '', '', '', '', 2700000, 0, 0, 0, 0, 2700000],
  ['Retiros', '', '', '', '', '', '', '', '', '', ''],
  H,
  ['13/06/2026 14:59', 'Touriño Leandro', '', '', 'Egreso al cerrar Caja Cierre Caja ', '', 368520.54, '', 211263.1, '', 579783.64],
  ['Totales', '', '', '', '', 0, 368520.54, 0, 211263.1, 0, 579783.64],
  ['', '', '', '', '', '', '', '', 'Saldo total en caja', '', 482825.56],
]

describe('parseCajaRows', () => {
  const caja = parseCajaRows(AOA, 'Charo')

  it('lee los metadatos de la caja', () => {
    expect(caja.nroCaja).toBe(80)
    expect(caja.puntoVenta).toBe('Recepcion')
    expect(caja.moneda).toBe('AR$')
    expect(caja.usuarioApertura).toBe('Leandro Touriño')
    expect(caja.turno).toBe('manana')
    expect(caja.conserje).toBe('Leandro')
    expect(caja.cierreAt).toBeTruthy()
  })

  it('parsea apertura, ingresos, egresos y saldo', () => {
    expect(caja.aperturaMonto).toBeCloseTo(2419075.55, 2)
    expect(caja.ingresos).toHaveLength(10)
    expect(caja.egresos).toHaveLength(2)
    expect(caja.retiros).toHaveLength(1)
    expect(caja.saldoFinal).toBeCloseTo(482825.56, 2)
  })

  it('extrae Factura B, reserva y pasajero del detalle', () => {
    const first = caja.ingresos[0]
    expect(first.facturaB).toBe('3-527')
    expect(first.reserva).toBe('389')
    expect(first.pasajero).toBe('Yamila Inzaurraldez')
    expect(first.habitacion).toBe('1001')
  })

  it('resume el total cobrado por medio de pago', () => {
    const r = getCajaResumen(caja)
    expect(r.totalCobrado).toBeCloseTo(1343533.64, 2)
    expect(r.efectivo).toBeCloseTo(763750, 2)
    expect(r.tarjetas).toBeCloseTo(368520.54, 2)
    expect(r.transferencia).toBeCloseTo(211263.1, 2)
    expect(r.cantFacturasB).toBe(4)
    expect(r.totalRetiros).toBeCloseTo(2700000, 2)
  })

  it('no marca imperfecciones en una caja cerrada y consistente (sin caja anterior)', () => {
    expect(getCajaFlags(caja)).toHaveLength(0)
  })

  it('marca descuadre de continuidad si la apertura no coincide con el cierre anterior', () => {
    const anterior = { ...caja, nroCaja: 79, saldoFinal: 999999 }
    const flags = getCajaFlags(caja, anterior)
    expect(flags.some(f => f.tipo === 'continuidad')).toBe(true)
  })
})

describe('cajaFromExtracted (lectura por IA del Informe de caja)', () => {
  // Lo que devolvería /api/extract-invoice en modo 'caja': todo como texto,
  // importes con formato AR ("1.234,56"), fechas "dd/mm/yyyy hh:mm".
  const ex: ExtractedCaja = {
    nroCaja: '80',
    puntoVenta: 'Recepcion',
    moneda: 'AR$',
    usuarioApertura: 'Leandro Touriño',
    usuarioCierre: 'Leandro Touriño',
    aperturaAt: '13/06/2026 06:58',
    cierreAt: '13/06/2026 14:59',
    aperturaMonto: '2.419.075,55',
    saldoFinal: '482.825,56',
    ingresos: [
      { fechaHora: '13/06/2026 07:14', usuario: 'Touriño Leandro', comp: 'FB 3-527', habitacion: '1001', observacion: 'Reserva 389 - Yamila Inzaurraldez', efectivo: '', tarjetas: '63.135,14', cheques: '', transferencia: '', otros: '', total: '63.135,14' },
    ],
    egresos: [],
    retiros: [],
  }
  const caja = cajaFromExtracted(ex, 'Charo', 'caja80.jpg')

  it('arma la caja con metadatos y números parseados desde texto', () => {
    expect(caja.nroCaja).toBe(80)
    expect(caja.turno).toBe('manana')
    expect(caja.conserje).toBe('Leandro')
    expect(caja.aperturaMonto).toBeCloseTo(2419075.55, 2)
    expect(caja.saldoFinal).toBeCloseTo(482825.56, 2)
    expect(caja.cierreAt).toBeTruthy()
    expect(caja.sourceFileName).toBe('caja80.jpg')
  })

  it('deriva reserva, pasajero y Factura B igual que el Excel', () => {
    const m = caja.ingresos[0]
    expect(m.total).toBeCloseTo(63135.14, 2)
    expect(m.reserva).toBe('389')
    expect(m.pasajero).toBe('Yamila Inzaurraldez')
    expect(m.facturaB).toBe('3-527')
  })

  it('tira error claro si no se pudo leer el Nro. de Caja', () => {
    expect(() => cajaFromExtracted({ ...ex, nroCaja: '' }, 'Charo')).toThrow(/Nro\. de Caja/)
  })
})

describe('turnoDeApertura (el turno lo dice la caja)', () => {
  // 17/06/2026 13:51 (hora → mañana por el corte 5-15)
  const apertura1351 = '2026-06-17T13:51:00'
  it('usa el turno del conserje titular aunque la hora diga otra cosa', () => {
    expect(turnoDeApertura('Santiago Diez Queral', apertura1351)).toBe('tarde')
    expect(turnoDeApertura('Touriño Leandro', '2026-06-17T06:58:00')).toBe('manana')
    expect(turnoDeApertura('Gaston X', '2026-06-17T22:54:00')).toBe('noche')
  })
  it('cae a la hora para cubridores (Valentin/Franquero) o desconocidos', () => {
    expect(turnoDeApertura('Valentin', apertura1351)).toBe('tarde')           // 13:51 → tarde
    expect(turnoDeApertura('Valentin Gomez', '2026-06-17T22:54:00')).toBe('noche') // 22:54 → noche
    expect(turnoDeApertura('Franquero', '2026-06-17T07:00:00')).toBe('manana')     // 07:00 → mañana
    expect(turnoDeApertura('Nadie Conocido', '2026-06-17T18:00:00')).toBe('tarde')
  })
})
