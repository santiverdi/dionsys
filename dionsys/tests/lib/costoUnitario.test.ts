import { describe, it, expect } from 'vitest'
import { getCosteoDeposito } from '../../src/lib/costoUnitario'
import type { PedidoSemanal, DepositoItem, FacturaProveedor, PedidoSemanalItem, StockMovement } from '../../src/types'

// Harina: se compra en bolsa de 10 kg y se consume en kg.
// Café: se compra y consume en kg (sin pack).
const items: DepositoItem[] = [
  { id: 'des-1', name: 'Harina', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 8,
    packUnit: 'bolsa', packSize: 10, supplierId: 'sup-a' },
  { id: 'des-2', name: 'Café molido', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 3, supplierId: 'sup-a' },
  { id: 'lim-1', name: 'Lavandina', unit: 'bidon', category: 'limpieza', stock: 0, stockIdeal: 4, supplierId: 'sup-b' },
]

function pedidoItem(p: Partial<PedidoSemanalItem> & { itemId: string }): PedidoSemanalItem {
  return { name: '', unit: 'kg', stockActual: 0, stockIdeal: 0, aPedir: 0, ...p }
}

function factura(p: Partial<FacturaProveedor> & { supplierId: string; monto: number }): FacturaProveedor {
  return { supplierName: p.supplierId, tipoFactura: 'A', fecha: '2026-07-05', ...p }
}

function pedido(p: Partial<PedidoSemanal> & { id: string }): PedidoSemanal {
  return {
    date: '2026-07-05T10:00:00.000Z', createdBy: 'Roxana', items: [], status: 'recibido', ...p,
  }
}

describe('getCosteoDeposito', () => {
  it('con un solo producto del proveedor, el precio sale exacto sin mirar texto', () => {
    // 3 bolsas de 10 kg = 30 kg por $300.000 → $10.000 el kg.
    const r = getCosteoDeposito([pedido({
      id: 'p1',
      items: [pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 3, packSize: 10 })],
      facturas: [factura({ supplierId: 'sup-a', monto: 300000 })],
    })], items)

    const harina = r.precios.get('des-1')!
    expect(harina.precioPorUnidad).toBe(10000)
    expect(harina.unidad).toBe('kg')
    expect(harina.origen).toBe('proveedor-un-producto')
    expect(r.montoSinCostear).toBe(0)
  })

  it('con varios productos, usa los renglones de la factura', () => {
    const r = getCosteoDeposito([pedido({
      id: 'p2',
      items: [
        pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 2, packSize: 10 }),   // 20 kg
        pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 5 }),            // 5 kg
      ],
      facturas: [factura({
        supplierId: 'sup-a', monto: 400000,
        items: [
          { descripcion: 'HARINA 000 X 10KG', importe: 200000, cantidad: 2 },
          { descripcion: 'CAFE MOLIDO LA VIRGINIA', importe: 200000, cantidad: 5 },
        ],
      })],
    })], items)

    expect(r.precios.get('des-1')!.precioPorUnidad).toBe(10000)   // 200.000 / 20 kg
    expect(r.precios.get('des-2')!.precioPorUnidad).toBe(40000)   // 200.000 / 5 kg
    expect(r.precios.get('des-2')!.origen).toBe('renglon-de-factura')
    expect(r.montoCosteado).toBe(400000)
    expect(r.montoSinCostear).toBe(0)
  })

  it('el renglón de impuestos no se toma como producto', () => {
    const r = getCosteoDeposito([pedido({
      id: 'p3',
      items: [
        pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 1, packSize: 10 }),
        pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 1 }),
      ],
      facturas: [factura({
        supplierId: 'sup-a', monto: 121000,
        items: [
          { descripcion: 'HARINA 000', importe: 50000, concepto: 'producto' },
          { descripcion: 'CAFE MOLIDO', importe: 50000, concepto: 'producto' },
          { descripcion: 'IVA 21%', importe: 21000, concepto: 'impuesto' },
        ],
      })],
    })], items)

    expect(r.precios.get('des-1')!.precioPorUnidad).toBe(5000)   // 50.000 / 10 kg
    expect(r.montoCosteado).toBe(100000)
    expect(r.montoSinCostear).toBe(21000)                        // el IVA queda sin bajar a producto
  })

  it('el renglón ambiguo no se asigna: mejor sin costo que con un costo inventado', () => {
    const dosCafes: DepositoItem[] = [
      ...items,
      { id: 'des-3', name: 'Café en grano', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 2, supplierId: 'sup-a' },
    ]
    const r = getCosteoDeposito([pedido({
      id: 'p4',
      items: [
        pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 5 }),
        pedidoItem({ itemId: 'des-3', name: 'Café en grano', recibido: 5 }),
      ],
      facturas: [factura({
        supplierId: 'sup-a', monto: 100000,
        items: [{ descripcion: 'CAFE', importe: 100000 }],   // ¿molido o en grano?
      })],
    })], dosCafes)

    expect(r.precios.size).toBe(0)
    expect(r.montoSinCostear).toBe(100000)
    expect(r.sinCostear[0].motivo).toBe('sin renglones que matcheen')
  })

  it('la factura sin renglones con varios productos queda sin costear, no se reparte', () => {
    const r = getCosteoDeposito([pedido({
      id: 'p5',
      items: [
        pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 2, packSize: 10 }),
        pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 5 }),
      ],
      facturas: [factura({ supplierId: 'sup-a', monto: 400000 })],
    })], items)

    expect(r.precios.size).toBe(0)
    expect(r.montoSinCostear).toBe(400000)
    expect(r.sinCostear[0].motivo).toBe('sin factura')
  })

  it('se queda con el precio más reciente de cada producto', () => {
    const r = getCosteoDeposito([
      pedido({
        id: 'viejo', date: '2026-06-05T10:00:00.000Z',
        items: [pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 1 })],
        facturas: [factura({ supplierId: 'sup-a', monto: 20000, fecha: '2026-06-05' })],
      }),
      pedido({
        id: 'nuevo', date: '2026-07-05T10:00:00.000Z',
        items: [pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 1 })],
        facturas: [factura({ supplierId: 'sup-a', monto: 35000, fecha: '2026-07-05' })],
      }),
    ], items)

    expect(r.precios.get('des-2')!.precioPorUnidad).toBe(35000)
    expect(r.precios.get('des-2')!.fecha).toBe('2026-07-05')
  })

  it('ignora los pedidos borrados y lo que no se recibió', () => {
    const r = getCosteoDeposito([
      pedido({
        id: 'borrado', status: 'borrado',
        items: [pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 1 })],
        facturas: [factura({ supplierId: 'sup-a', monto: 999999 })],
      }),
      pedido({
        id: 'sin-recibir',
        items: [pedidoItem({ itemId: 'des-2', name: 'Café molido', recibido: 0, aPedir: 0 })],
        facturas: [factura({ supplierId: 'sup-a', monto: 50000 })],
      }),
    ], items)

    expect(r.precios.size).toBe(0)
    expect(r.sinCostear.map(s => s.motivo)).toEqual(['sin recibir'])
    expect(r.montoSinCostear).toBe(50000)
  })
})

describe('getCosteoDeposito con las entradas al deposito', () => {
  function entrada(itemId: string, quantity: number, pedidoId: string): StockMovement {
    return {
      id: `m-${itemId}-${pedidoId}`, itemId, itemName: itemId, type: 'entrada', quantity,
      date: '2026-07-05T12:00:00.000Z', createdBy: 'Roxana', notes: 'Pedido semanal', pedidoId,
    }
  }

  it('usa lo que entro al deposito, no el packSize de hoy', () => {
    // Entraron 30 kg de harina por $300.000 -> $10.000 el kg.
    // Si alguien despues corrige el packSize de la bolsa (10 -> 25), el precio
    // NO se tiene que mover: la entrada ya guardo la cantidad real.
    const itemsCorregidos: DepositoItem[] = [
      { ...items[0], packSize: 25 },   // packSize cambiado despues del pedido
      ...items.slice(1),
    ]
    const p = pedido({
      id: 'p-ent',
      items: [pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 3, packSize: 10 })],
      facturas: [factura({ supplierId: 'sup-a', monto: 300000 })],
    })
    const movs = [entrada('des-1', 30, 'p-ent')]

    expect(getCosteoDeposito([p], itemsCorregidos, movs).precios.get('des-1')!.precioPorUnidad).toBe(10000)
    // Sin entradas cae al respaldo, que usa el packSize guardado EN EL PEDIDO
    // (10), no el de hoy (25): tambien da bien.
    expect(getCosteoDeposito([p], itemsCorregidos, []).precios.get('des-1')!.precioPorUnidad).toBe(10000)
  })

  it('sin entradas y sin packSize guardado en el pedido, el respaldo usa el de hoy', () => {
    // Este es el caso en que el respaldo puede errarle: un pedido viejo sin el
    // snapshot de packSize queda a merced del valor actual del item.
    const itemsCorregidos: DepositoItem[] = [{ ...items[0], packSize: 25 }, ...items.slice(1)]
    const p = pedido({
      id: 'p-viejo',
      items: [pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 3 })],   // sin packSize
      facturas: [factura({ supplierId: 'sup-a', monto: 300000 })],
    })

    // Con la entrada real (30 kg) da el precio correcto...
    expect(getCosteoDeposito([p], itemsCorregidos, [entrada('des-1', 30, 'p-viejo')])
      .precios.get('des-1')!.precioPorUnidad).toBe(10000)
    // ...sin ella, 3 x 25 = 75 kg y el precio sale mal. Por eso mandan las entradas.
    expect(getCosteoDeposito([p], itemsCorregidos, [])
      .precios.get('des-1')!.precioPorUnidad).toBe(4000)
  })

  it('si entro menos de lo facturado, el precio sale por lo que realmente entro', () => {
    // Se facturaron 3 bolsas pero entraron 2 (20 kg): $300.000 / 20 = $15.000.
    const p = pedido({
      id: 'p-parcial',
      items: [pedidoItem({ itemId: 'des-1', name: 'Harina', recibido: 3, packSize: 10 })],
      facturas: [factura({ supplierId: 'sup-a', monto: 300000 })],
    })
    const r = getCosteoDeposito([p], items, [entrada('des-1', 20, 'p-parcial')])

    expect(r.precios.get('des-1')!.precioPorUnidad).toBe(15000)
  })

  it('no mezcla las entradas de otros pedidos', () => {
    const p = pedido({
      id: 'p-a',
      items: [pedidoItem({ itemId: 'des-2', name: 'Cafe molido', recibido: 5 })],
      facturas: [factura({ supplierId: 'sup-a', monto: 100000 })],
    })
    const movs = [entrada('des-2', 5, 'p-a'), entrada('des-2', 50, 'otro-pedido')]
    const r = getCosteoDeposito([p], items, movs)

    expect(r.precios.get('des-2')!.precioPorUnidad).toBe(20000)   // 100.000 / 5, no / 55
  })
})
