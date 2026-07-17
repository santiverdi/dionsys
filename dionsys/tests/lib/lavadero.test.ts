import { describe, it, expect } from 'vitest'
import {
  getBalanceRopa, conciliarLiquidacion, conciliarPrendas, prendaCanonica, sumarPrendasPeriodo,
  getRetirosPendientes, getStockRopa, getDeudaLavadero, costoLavaderoMes, getLavaderoMes,
} from '../../src/lib/lavadero'
import { getCostoHabitacion, getNochesHabitacion } from '../../src/lib/negocio'
import { getAnalisisMes } from '../../src/lib/analisisMes'
import type { LavaderoMovimiento, LavaderoLiquidacion, ParteHabitaciones, PagoSueldo } from '../../src/types'

let seq = 0
function mov(p: Partial<LavaderoMovimiento>): LavaderoMovimiento {
  return {
    id: `m${++seq}`, fecha: '2026-06-05', tipo: 'envio_sucia',
    prendas: [], createdBy: 'Roxy', createdAt: '2026-06-05T10:00:00.000Z', ...p,
  }
}
function liq(p: Partial<LavaderoLiquidacion>): LavaderoLiquidacion {
  return {
    id: `l${++seq}`, desde: '2026-06-01', hasta: '2026-06-15', total: 100000,
    remitos: [], pagada: false, createdBy: 'Charo', createdAt: '2026-06-16T10:00:00.000Z', ...p,
  }
}
function mkParte(p: Partial<ParteHabitaciones>): ParteHabitaciones {
  return {
    id: `p${++seq}`, nroCaja: p.nroCaja ?? 1, usuario: 'Gaston', fechaCaja: '2026-06-20T23:30:00.000Z',
    ocupadas: [], libres: [], totalOcupadas: 0, totalPlazas: 0, totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0, importedBy: 'X', importedAt: '2026-06-21T07:00:00.000Z', ...p,
  }
}

describe('getBalanceRopa', () => {
  it('calcula por prenda cuánto tiene el lavadero (salió - volvió)', () => {
    const movs = [
      mov({ tipo: 'envio_sucia', prendas: [{ prenda: 'Sábana', cantidad: 40 }, { prenda: 'Toalla', cantidad: 20 }] }),
      mov({ tipo: 'recibo_limpia', prendas: [{ prenda: 'Sábana', cantidad: 30 }] }),
    ]
    const b = getBalanceRopa(movs)
    expect(b.find(x => x.prenda === 'Sábana')).toMatchObject({ enviadas: 40, recibidas: 30, enLavadero: 10 })
    expect(b.find(x => x.prenda === 'Toalla')).toMatchObject({ enviadas: 20, recibidas: 0, enLavadero: 20 })
  })

  it('el cambio por rotura/mancha (canje 1 a 1) NO altera el balance', () => {
    const movs = [
      mov({ tipo: 'envio_sucia', prendas: [{ prenda: 'Toallas turcas', cantidad: 20 }] }),
      mov({ tipo: 'cambio', prendas: [{ prenda: 'Toallas turcas', cantidad: 10 }] }),
    ]
    const b = getBalanceRopa(movs)
    expect(b.find(x => x.prenda === 'Toallas turcas')).toMatchObject({ enviadas: 20, recibidas: 0, enLavadero: 20 })
  })
})

describe('getStockRopa', () => {
  const movs = [
    mov({ tipo: 'envio_sucia', prendas: [{ prenda: 'Fundas', cantidad: 42 }] }),
    mov({ tipo: 'recibo_limpia', prendas: [{ prenda: 'Fundas', cantidad: 30 }] }),
    mov({ tipo: 'cambio', prendas: [{ prenda: 'Fundas', cantidad: 5 }] }), // canje: no mueve nada
  ]

  it('en el hotel = base - en el lavadero', () => {
    const s = getStockRopa(movs, { Fundas: 300 })
    expect(s.find(x => x.prenda === 'Fundas')).toMatchObject({ base: 300, enLavadero: 12, enHotel: 288 })
  })

  it('sin base cargada la prenda muestra el balance pero no el en-hotel', () => {
    const s = getStockRopa(movs, {})
    expect(s.find(x => x.prenda === 'Fundas')).toMatchObject({ base: null, enLavadero: 12, enHotel: null })
  })

  it('las prendas con base pero sin movimientos aparecen con todo en el hotel', () => {
    const s = getStockRopa(movs, { Fundas: 300, Colchas: 40 })
    expect(s.find(x => x.prenda === 'Colchas')).toMatchObject({ base: 40, enLavadero: 0, enHotel: 40 })
  })
})

describe('getRetirosPendientes', () => {
  const retiro = mov({
    id: 'ret1', fecha: '2026-07-10', tipo: 'envio_sucia', remito: '174775',
    prendas: [{ prenda: 'Fundas', cantidad: 42 }, { prenda: 'Pie de baño', cantidad: 45 }],
  })

  it('un retiro sin devolución está pendiente completo', () => {
    const [rp] = getRetirosPendientes([retiro])
    expect(rp.totalPendiente).toBe(87)
    expect(rp.prendas).toEqual([
      { prenda: 'Fundas', enviada: 42, recibida: 0, pendiente: 42 },
      { prenda: 'Pie de baño', enviada: 45, recibida: 0, pendiente: 45 },
    ])
  })

  it('la devolución parcial enlazada por retiroId deja pendiente solo lo que falta', () => {
    const devolucion = mov({
      fecha: '2026-07-12', tipo: 'recibo_limpia', retiroId: 'ret1', remito: '174775',
      prendas: [{ prenda: 'Fundas', cantidad: 42 }, { prenda: 'Pie de baño', cantidad: 40 }],
    })
    const [rp] = getRetirosPendientes([retiro, devolucion])
    expect(rp.totalPendiente).toBe(5)
    expect(rp.prendas.find(p => p.prenda === 'Fundas')).toMatchObject({ pendiente: 0 })
    expect(rp.prendas.find(p => p.prenda === 'Pie de baño')).toMatchObject({ recibida: 40, pendiente: 5 })
  })

  it('devuelto todo, el retiro deja de estar pendiente', () => {
    const devolucion = mov({
      fecha: '2026-07-12', tipo: 'recibo_limpia', retiroId: 'ret1',
      prendas: [{ prenda: 'Fundas', cantidad: 42 }, { prenda: 'Pie de baño', cantidad: 45 }],
    })
    expect(getRetirosPendientes([retiro, devolucion])).toEqual([])
  })

  it('las devoluciones heredan el remito del retiro sin duplicar la conciliación', () => {
    const devolucion = mov({
      fecha: '2026-07-12', tipo: 'recibo_limpia', retiroId: 'ret1', remito: '174775',
      prendas: [{ prenda: 'Fundas', cantidad: 42 }],
    })
    const c = conciliarLiquidacion(
      liq({ desde: '2026-07-01', hasta: '2026-07-15', remitos: ['174775'] }),
      [retiro, devolucion],
    )
    expect(c.remitosSinCopia).toEqual([])
    expect(c.copiasSinLiquidar).toEqual([])
  })
})

describe('conciliarLiquidacion', () => {
  const movs = [
    mov({ fecha: '2026-06-03', remito: '0001-100', prendas: [{ prenda: 'Sábana', cantidad: 10 }] }),
    mov({ fecha: '2026-06-10', remito: '0001-101', prendas: [{ prenda: 'Sábana', cantidad: 10 }] }),
    mov({ fecha: '2026-06-20', remito: '0001-200', prendas: [{ prenda: 'Sábana', cantidad: 10 }] }), // fuera del período
  ]

  it('marca los remitos facturados sin copia y las copias sin liquidar', () => {
    const c = conciliarLiquidacion(liq({ desde: '2026-06-01', hasta: '2026-06-15', remitos: ['0001-100', '0001-999'] }), movs)
    expect(c.remitosSinCopia).toEqual(['0001-999'])   // lo facturan pero no hay copia
    expect(c.copiasSinLiquidar).toEqual(['0001-101']) // copia del período que no liquidaron
  })

  it('cuando todo coincide no hay avisos (tolerante a espacios/mayúsculas)', () => {
    const c = conciliarLiquidacion(liq({ remitos: [' 0001-100 ', '0001-101'] }), movs)
    expect(c.remitosSinCopia).toEqual([])
    expect(c.copiasSinLiquidar).toEqual([])
  })
})

describe('prendaCanonica', () => {
  it('agrupa toda variante de sábana (el lavadero factura "Sábanas" juntas)', () => {
    expect(prendaCanonica('Sábanas grandes (SG)')).toBe('sábanas')
    expect(prendaCanonica('Sábanas chicas (SCH)')).toBe('sábanas')
    expect(prendaCanonica('Sábanas')).toBe('sábanas')
    expect(prendaCanonica('sabana ajustable')).toBe('sábanas')
  })

  it('ignora "de" y mayúsculas ("Pie Baño" de la liquidación ≡ "Pie de baño" del form)', () => {
    expect(prendaCanonica('Pie Baño')).toBe(prendaCanonica('Pie de baño'))
    expect(prendaCanonica('Toallas de Baño')).toBe(prendaCanonica('toallas baño'))
    expect(prendaCanonica('Toallas turcas')).not.toBe(prendaCanonica('Toallas de baño'))
  })
})

describe('conciliarPrendas', () => {
  const movs = [
    mov({ fecha: '2026-06-18', tipo: 'envio_sucia', prendas: [
      { prenda: 'Sábanas grandes (SG)', cantidad: 34 },
      { prenda: 'Sábanas chicas (SCH)', cantidad: 22 },
      { prenda: 'Fundas', cantidad: 42 },
      { prenda: 'Frazadas', cantidad: 3 },
    ] }),
    mov({ fecha: '2026-06-25', tipo: 'recibo_limpia', prendas: [
      { prenda: 'Sábanas grandes (SG)', cantidad: 50 },
      { prenda: 'Fundas', cantidad: 42 },
    ] }),
    mov({ fecha: '2026-07-02', tipo: 'envio_sucia', prendas: [{ prenda: 'Fundas', cantidad: 99 }] }), // fuera del período
  ]
  const liqDetalle = liq({
    desde: '2026-06-16', hasta: '2026-06-29',
    detalle: [
      { prenda: 'Sábanas', cantidad: 56 },
      { prenda: 'Fundas', cantidad: 42 },
      { prenda: 'Pie Baño', cantidad: 10 },
    ],
  })

  it('cruza lo facturado contra las copias del período (sábanas SG+SCH agrupan)', () => {
    const c = conciliarPrendas(liqDetalle, movs)
    expect(c.find(x => x.prenda === 'Sábanas')).toMatchObject({ facturadas: 56, retiradas: 56, entregadas: 50 })
    expect(c.find(x => x.prenda === 'Fundas')).toMatchObject({ facturadas: 42, retiradas: 42, entregadas: 42 })
    // Facturan pie de baño pero las copias no registran ninguno: queda a la vista.
    expect(c.find(x => x.prenda === 'Pie Baño')).toMatchObject({ facturadas: 10, retiradas: 0, entregadas: 0 })
  })

  it('agrega las prendas movidas que la liquidación no factura', () => {
    const c = conciliarPrendas(liqDetalle, movs)
    expect(c.find(x => x.prenda === 'Frazadas')).toMatchObject({ facturadas: 0, retiradas: 3, entregadas: 0 })
    // Los movimientos fuera del período no entran.
    expect(c.find(x => x.prenda === 'Fundas')?.retiradas).toBe(42)
  })

  it('sin detalle cargado no hay filas (la conciliación por prenda es opcional)', () => {
    expect(conciliarPrendas(liq({}), movs)).toEqual([])
  })

  it('sumarPrendasPeriodo arma el subtotal del período como el Excel de Charo', () => {
    const s = sumarPrendasPeriodo(movs, '2026-06-16', '2026-06-29')
    expect(s.get('sábanas')).toEqual({ retiradas: 56, entregadas: 50 })
    expect(s.get('fundas')).toEqual({ retiradas: 42, entregadas: 42 })  // el mov del 02/07 queda afuera
    expect(s.get('frazadas')).toEqual({ retiradas: 3, entregadas: 0 })
  })
})

describe('deuda y costo mensual', () => {
  const liqs = [
    liq({ hasta: '2026-06-15', total: 100000, pagada: true }),
    liq({ desde: '2026-06-16', hasta: '2026-06-30', total: 120000 }),
    liq({ desde: '2026-07-01', hasta: '2026-07-15', total: 130000 }),
  ]

  it('la deuda son las liquidaciones sin pagar (se pueden juntar dos quincenas)', () => {
    expect(getDeudaLavadero(liqs)).toEqual({ total: 250000, liquidaciones: 2 })
  })

  it('el costo del mes junta las quincenas que TERMINAN en ese mes', () => {
    expect(costoLavaderoMes(2026, 6, liqs)).toBe(220000)
    expect(costoLavaderoMes(2026, 7, liqs)).toBe(130000)
    expect(costoLavaderoMes(2026, 5, liqs)).toBeNull() // sin liquidación = null (no 0)
  })

  it('getLavaderoMes suma prendas del mes y trae el costo', () => {
    const movs = [
      mov({ fecha: '2026-06-05', tipo: 'envio_sucia', prendas: [{ prenda: 'Sábana', cantidad: 40 }] }),
      mov({ fecha: '2026-06-20', tipo: 'recibo_limpia', prendas: [{ prenda: 'Sábana', cantidad: 35 }] }),
      mov({ fecha: '2026-07-02', tipo: 'envio_sucia', prendas: [{ prenda: 'Sábana', cantidad: 99 }] }),
    ]
    const r = getLavaderoMes(2026, 6, movs, liqs)
    expect(r.enviadas).toBe(40)
    expect(r.recibidas).toBe(35)
    expect(r.costo).toBe(220000)
  })
})

describe('getNochesHabitacion + getCostoHabitacion', () => {
  const partes = [
    mkParte({ nroCaja: 10, turno: 'noche', fechaCaja: '2026-06-10T23:30:00.000Z', totalOcupadas: 10 }),
    mkParte({ nroCaja: 13, turno: 'noche', fechaCaja: '2026-06-11T23:30:00.000Z', totalOcupadas: 20 }),
    mkParte({ nroCaja: 12, turno: 'manana', fechaCaja: '2026-06-11T07:00:00.000Z', totalOcupadas: 99 }), // no es noche: no cuenta
  ]
  const sueldos: PagoSueldo[] = [{
    id: 's1', empleadoId: 'e1', empleadoNombre: 'Ana', mes: '2026-06', tipo: 'sueldo',
    monto: 900000, fecha: '2026-06-05', medio: 'efectivo',
  }]
  const liqs = [liq({ desde: '2026-06-16', hasta: '2026-06-30', total: 90000 })]

  it('cuenta las noches-habitación con los partes del turno noche', () => {
    const n = getNochesHabitacion(2026, 6, partes)
    expect(n).toEqual({ noches: 30, dias: 2, fuente: 'partes' })
  })

  it('calcula el costo por hab/noche con sueldos + lavadero, extrapolando al mes', () => {
    const c = getCostoHabitacion(2026, 6, [], [], [], [], [], sueldos, [], partes, [], liqs, new Date('2026-07-15T12:00:00'))
    // promedio 15 hab/noche × 30 días de junio = 450 noches; (900000 + 90000) / 450 = 2200
    expect(c.costoTotal).toBe(990000)
    expect(c.nochesEstimadas).toBe(450)
    expect(c.costoPorHabNoche).toBe(2200)
    expect(c.sueldosCargados).toBe(true)
    expect(c.lavaderoCargado).toBe(true)
    expect(c.desglose.find(d => d.label === 'Lavadero (ropa)')?.monto).toBe(90000)
  })

  it('avisa cuando faltan sueldos o liquidación del lavadero', () => {
    const c = getCostoHabitacion(2026, 6, [], [], [], [], [], [], [], partes, [], [], new Date('2026-07-15T12:00:00'))
    expect(c.sueldosCargados).toBe(false)
    expect(c.lavaderoCargado).toBe(false)
  })
})

describe('getAnalisisMes', () => {
  it('arma los deltas mes contra mes sin romper con datos vacíos', () => {
    const a = getAnalisisMes(2026, 6, {
      cajas: [], orders: [], pedidos: [], tasks: [], pagos: [], pagosSueldos: [], servicios: [],
      movements: [], partes: [], records: [], lavaderoMovs: [], lavaderoLiqs: [],
    })
    expect(a.mes).toBe('2026-06')
    expect(a.ingresos.actual).toBe(0)
    expect(a.egresosPorRubro).toEqual([])
    expect(a.stockPorItem).toEqual([])
  })

  it('detecta qué subió: consumo de stock por item y el rubro lavadero', () => {
    const a = getAnalisisMes(2026, 7, {
      cajas: [], orders: [], pedidos: [], tasks: [], pagos: [], pagosSueldos: [], servicios: [],
      movements: [
        { id: '1', itemId: 'i1', itemName: 'Harina', type: 'salida', quantity: 10, date: '2026-06-10T10:00:00.000Z', createdBy: 'x', notes: '' },
        { id: '2', itemId: 'i1', itemName: 'Harina', type: 'salida', quantity: 25, date: '2026-07-10T10:00:00.000Z', createdBy: 'x', notes: '' },
      ],
      partes: [], records: [], lavaderoMovs: [],
      lavaderoLiqs: [
        liq({ desde: '2026-06-16', hasta: '2026-06-30', total: 100000 }),
        liq({ desde: '2026-07-01', hasta: '2026-07-15', total: 150000 }),
      ],
    })
    const harina = a.stockPorItem.find(s => s.item === 'Harina')
    expect(harina?.salidas).toBe(25)
    expect(harina?.salidasAnterior).toBe(10)
    expect(harina?.delta.direction).toBe('up')
    const lav = a.egresosPorRubro.find(r => r.rubro === 'Lavadero (ropa)')
    expect(lav?.actual).toBe(150000)
    expect(lav?.anterior).toBe(100000)
    expect(lav?.delta.pct).toBe(50)
  })
})
