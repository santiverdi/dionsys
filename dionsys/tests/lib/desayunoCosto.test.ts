import { describe, it, expect } from 'vitest'
import { getCostoDesayuno, sugerirProveedor, type DesayunoInputs } from '../../src/lib/desayunoCosto'
import type {
  Order, PedidoSemanal, StockMovement, DepositoItem, DepositoSupplier,
  ParteHabitaciones, HabitacionOcupada, CajaParte, CajaMovimiento,
} from '../../src/types'

const items: DepositoItem[] = [
  { id: 'des-1', name: 'Medialunas', unit: 'docena', category: 'desayunador', stock: 0, stockIdeal: 5 },
  { id: 'des-2', name: 'Café', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 3 },
  { id: 'lim-1', name: 'Lavandina', unit: 'bidon', category: 'limpieza', stock: 0, stockIdeal: 4 },
]

const suppliers: DepositoSupplier[] = [
  { id: 'sup-des', name: 'Alimentos del Sur', phone: '', category: 'Desayunador' },
  { id: 'sup-lim', name: 'Quimicos Express', phone: '', category: 'Limpieza' },
  { id: 'sup-x', name: 'Proveedor sin rubro', phone: '', category: '' },
]

function mov(p: Partial<StockMovement>): StockMovement {
  return {
    id: Math.random().toString(36), itemId: 'des-1', itemName: 'Medialunas', type: 'salida',
    quantity: 1, date: '2026-07-10T10:00:00.000Z', createdBy: 'X', notes: '', ...p,
  }
}

function order(p: Partial<Order>): Order {
  return {
    id: Math.random().toString(36), distributorId: 'panaderia', distributorName: 'Panaderia',
    createdBy: 'X', createdAt: '2026-07-10T08:00:00.000Z', items: [], status: 'recibido',
    notes: '', type: 'recepcion', ...p,
  }
}

function ocupada(habitacion: string, plazas: number): HabitacionOcupada {
  return { habitacion, reserva: '1', plazas, canal: 'Booking.com' }
}

function parteNoche(fecha: string, ocupadas: HabitacionOcupada[], totalPlazas?: number): ParteHabitaciones {
  return {
    id: `p${fecha}`, nroCaja: 1, usuario: 'X', fechaCaja: `${fecha}T01:30:00.000Z`, turno: 'noche',
    ocupadas, libres: [],
    totalOcupadas: ocupadas.length,
    totalPlazas: totalPlazas ?? ocupadas.reduce((s, o) => s + o.plazas, 0),
    totalLibres: 0, sucias: 0, limpias: 0, mantenimiento: 0,
    importedBy: 'X', importedAt: `${fecha}T02:00:00.000Z`,
  }
}

function inputs(p: Partial<DesayunoInputs> = {}): DesayunoInputs {
  return { orders: [], pedidos: [], movements: [], items, suppliers, partes: [], ...p }
}

describe('getCostoDesayuno', () => {
  it('suma panadería y lácteos como desayuno y deja la verdulería afuera', () => {
    const r = getCostoDesayuno(2026, 7, inputs({ orders: [
      order({ distributorId: 'panaderia', monto: 120000 }),
      order({ distributorId: 'lacteos', monto: 80000 }),
      order({ distributorId: 'verduleria', monto: 50000 }),
    ] }))

    expect(r.compras.panaderia).toBe(120000)
    expect(r.compras.lacteos).toBe(80000)
    expect(r.compras.total).toBe(200000)   // la verdulería NO entra
    expect(r.verduleria).toBe(50000)
  })

  it('del pedido semanal toma solo las facturas de proveedores de desayunador', () => {
    const pedido: PedidoSemanal = {
      id: 'p1', date: '2026-07-05T10:00:00.000Z', createdBy: 'Roxana', items: [], status: 'recibido',
      facturas: [
        { supplierId: 'sup-des', supplierName: 'Alimentos del Sur', tipoFactura: 'A', monto: 300000, fecha: '2026-07-05' },
        { supplierId: 'sup-lim', supplierName: 'Quimicos Express', tipoFactura: 'A', monto: 200000, fecha: '2026-07-05' },
      ],
    }
    const r = getCostoDesayuno(2026, 7, inputs({ pedidos: [pedido] }))

    expect(r.compras.deposito).toBe(300000)   // la limpieza queda afuera
    expect(r.compras.total).toBe(300000)
    expect(r.sinClasificar).toBe(0)
  })

  it('la plata que no se puede asignar a un rubro queda a la vista, no se reparte', () => {
    const sinFacturas: PedidoSemanal = {
      id: 'p2', date: '2026-07-06T10:00:00.000Z', createdBy: 'Roxana', items: [],
      status: 'recibido', monto: 500000,   // mezcla rubros y no se puede partir
    }
    const proveedorSinRubro: PedidoSemanal = {
      id: 'p3', date: '2026-07-07T10:00:00.000Z', createdBy: 'Roxana', items: [], status: 'recibido',
      facturas: [{ supplierId: 'sup-x', supplierName: 'Proveedor sin rubro', tipoFactura: 'B', monto: 90000, fecha: '2026-07-07' }],
    }
    const r = getCostoDesayuno(2026, 7, inputs({ pedidos: [sinFacturas, proveedorSinRubro] }))

    expect(r.compras.total).toBe(0)
    expect(r.sinClasificar).toBe(590000)
  })

  it('calcula el consumo por huésped con los desayunos de los partes noche', () => {
    const partes = [
      parteNoche('2026-07-10', [ocupada('301', 20)]),
      parteNoche('2026-07-11', [ocupada('301', 30)]),
    ]
    const movements = [
      mov({ itemId: 'des-1', itemName: 'Medialunas', type: 'salida', quantity: 25 }),
      mov({ itemId: 'des-2', itemName: 'Café', type: 'salida', quantity: 5 }),
      mov({ itemId: 'des-1', itemName: 'Medialunas', type: 'entrada', quantity: 40 }),
      mov({ itemId: 'lim-1', itemName: 'Lavandina', type: 'salida', quantity: 99 }), // limpieza: no es desayuno
    ]
    const r = getCostoDesayuno(2026, 7, inputs({ partes, movements }))

    expect(r.desayunos).toBe(50)
    expect(r.nochesMedidas).toBe(2)
    expect(r.consumo.map(c => c.item)).toEqual(['Medialunas', 'Café'])   // por salida, de mayor a menor
    expect(r.consumo[0].porHuesped).toBe(0.5)      // 25 docenas / 50 huéspedes
    expect(r.consumo[0].porCada100).toBe(50)
    expect(r.consumo[0].entradas).toBe(40)
    expect(r.totalSalidas).toBe(30)                // 25 + 5, sin la lavandina
    expect(r.totalEntradas).toBe(40)
  })

  it('calcula el costo por huésped', () => {
    const partes = [parteNoche('2026-07-10', [ocupada('301', 40)])]
    const r = getCostoDesayuno(2026, 7, inputs({
      partes,
      orders: [order({ distributorId: 'panaderia', monto: 200000 })],
    }))

    expect(r.desayunos).toBe(40)
    expect(r.costoPorHuesped).toBe(5000)
  })

  it('sin partes cargados no inventa un consumo por huésped', () => {
    const r = getCostoDesayuno(2026, 7, inputs({
      movements: [mov({ quantity: 25 })],
      orders: [order({ monto: 200000 })],
    }))

    expect(r.desayunos).toBe(0)
    expect(r.costoPorHuesped).toBe(0)
    expect(r.consumo[0].porHuesped).toBe(0)
    expect(r.consumo[0].salidas).toBe(25)   // el consumo en unidades sí se sabe
  })

  it('ignora otros meses y los pedidos borrados', () => {
    const r = getCostoDesayuno(2026, 7, inputs({
      orders: [
        order({ distributorId: 'panaderia', monto: 100000 }),
        order({ distributorId: 'panaderia', monto: 999999, createdAt: '2026-06-10T08:00:00.000Z' }),
        order({ distributorId: 'panaderia', monto: 888888, status: 'borrado' }),
      ],
      movements: [
        mov({ quantity: 10 }),
        mov({ quantity: 777, date: '2026-06-10T10:00:00.000Z' }),
      ],
    }))

    expect(r.compras.panaderia).toBe(100000)
    expect(r.totalSalidas).toBe(10)
  })
})

describe('getCostoDesayuno con precios', () => {
  it('valoriza el consumo con el precio de las facturas y deja sin costear lo que no tiene precio', () => {
    const partes = [parteNoche('2026-07-10', [ocupada('301', 50)])]
    const movements = [
      mov({ itemId: 'des-1', itemName: 'Medialunas', type: 'salida', quantity: 10 }),
      mov({ itemId: 'des-2', itemName: 'Café', type: 'salida', quantity: 4 }),
    ]
    // Solo las medialunas tienen precio: $3.000 la docena.
    const precios = new Map([
      ['des-1', {
        itemId: 'des-1', nombre: 'Medialunas', unidad: 'docena', precioPorUnidad: 3000,
        fecha: '2026-07-05', origen: 'proveedor-un-producto' as const,
        proveedor: 'Panaderia', pedidoId: 'p1',
      }],
    ])
    const r = getCostoDesayuno(2026, 7, inputs({ partes, movements, precios }))

    expect(r.costoConsumido).toBe(30000)            // 10 docenas x $3.000
    expect(r.costoConsumidoPorHuesped).toBe(600)    // 30.000 / 50 desayunos
    expect(r.productosCosteados).toBe(1)
    expect(r.productosSinCostear).toBe(1)           // el café no tiene precio

    const medialunas = r.consumo.find(c => c.item === 'Medialunas')!
    expect(medialunas.costo).toBe(30000)
    expect(medialunas.precioUnitario).toBe(3000)
    expect(r.consumo.find(c => c.item === 'Café')!.costo).toBeUndefined()
  })
})

describe('getCostoDesayuno con lo pagado de la caja', () => {
  function egreso(observacion: string, total: number, fechaHora = '2026-07-10T09:00:00.000Z'): CajaMovimiento {
    return {
      fechaHora, usuario: 'Gaston', comp: '', habitacion: '', observacion,
      efectivo: total, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total,
    }
  }

  function caja(egresos: CajaMovimiento[], aperturaAt = '2026-07-10T07:00:00.000Z'): CajaParte {
    return {
      id: 'c1', nroCaja: 1, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'Gaston',
      aperturaAt, cierreAt: '2026-07-10T15:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
      ingresos: [], egresos, retiros: [], importedBy: 'X', importedAt: '2026-07-10T15:30:00.000Z',
    }
  }

  it('cuenta el desayuno pagado en efectivo: Piazza es la panaderia y El Amanecer los lacteos', () => {
    const r = getCostoDesayuno(2026, 7, inputs({ cajas: [caja([
      egreso('PIAZZA', 180000),
      egreso('EL AMANECER lacteos', 90000),
      egreso('Ferreteria', 40000),          // no es desayuno
    ])] }))

    expect(r.compras.caja).toBe(270000)
    expect(r.compras.total).toBe(270000)
    expect(r.cajaSinClasificar).toEqual([{ observacion: 'Ferreteria', total: 40000 }])
  })

  it('no cuenta dos veces la compra que ademas tiene el monto cargado en el pedido', () => {
    // Misma plata por dos lados: el egreso de caja y el monto del pedido diario.
    const r = getCostoDesayuno(2026, 7, inputs({
      cajas: [caja([egreso('PIAZZA', 180000, '2026-07-10T09:00:00.000Z')])],
      orders: [order({ distributorId: 'panaderia', monto: 180000, createdAt: '2026-07-10T08:00:00.000Z' })],
    }))

    expect(r.compras.caja).toBe(180000)
    expect(r.compras.panaderia).toBe(0)   // no se suma de nuevo
    expect(r.compras.total).toBe(180000)
  })

  it('el pedido con monto que NO se pago de la caja sigue contando', () => {
    const r = getCostoDesayuno(2026, 7, inputs({
      cajas: [caja([egreso('PIAZZA', 180000)])],
      orders: [order({ distributorId: 'lacteos', monto: 95000 })],   // otro monto: es otra compra
    }))

    expect(r.compras.caja).toBe(180000)
    expect(r.compras.lacteos).toBe(95000)
    expect(r.compras.total).toBe(275000)
  })

  it('el retiro de efectivo no es un gasto de desayuno ni figura sin clasificar', () => {
    const r = getCostoDesayuno(2026, 7, inputs({ cajas: [caja([
      egreso('RETIRO EFECTIVO', 500000),
      egreso('PIAZZA', 100000),
    ])] }))

    expect(r.compras.caja).toBe(100000)
    expect(r.cajaSinClasificar).toEqual([])
  })

  it('el proveedor que marca el usuario pasa a contar como desayuno', () => {
    const cajas = [caja([
      egreso('LA ESPIGA facturas', 60000),
      egreso('Ferreteria', 40000),
    ])]

    const sinMarcar = getCostoDesayuno(2026, 7, inputs({ cajas }))
    expect(sinMarcar.compras.caja).toBe(0)
    expect(sinMarcar.cajaSinClasificar).toHaveLength(2)

    const marcado = getCostoDesayuno(2026, 7, inputs({ cajas, proveedoresCaja: ['espiga'] }))
    expect(marcado.compras.caja).toBe(60000)
    expect(marcado.cajaSinClasificar).toEqual([{ observacion: 'Ferreteria', total: 40000 }])
  })

  it('el nombre marcado matchea sin importar acentos ni mayusculas', () => {
    const r = getCostoDesayuno(2026, 7, inputs({
      cajas: [caja([egreso('PANIFICACIÓN DEL SUR', 50000)])],
      proveedoresCaja: ['panificacion'],
    }))
    expect(r.compras.caja).toBe(50000)
  })

  it('un termino de menos de 3 letras se ignora: matcharia cualquier cosa', () => {
    const r = getCostoDesayuno(2026, 7, inputs({
      cajas: [caja([egreso('Ferreteria', 40000)])],
      proveedoresCaja: ['re'],
    }))
    expect(r.compras.caja).toBe(0)
  })
})

describe('sugerirProveedor', () => {
  it('propone la palabra mas larga que no sea relleno ni numero', () => {
    expect(sugerirProveedor('PAGO PIAZZA 12/07')).toBe('piazza')
    expect(sugerirProveedor('compra factura EL AMANECER')).toBe('amanecer')
  })

  it('sin ninguna palabra util devuelve vacio', () => {
    expect(sugerirProveedor('12/07 $ 5000')).toBe('')
  })
})
