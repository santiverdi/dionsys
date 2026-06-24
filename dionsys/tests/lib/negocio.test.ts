import { describe, it, expect } from 'vitest'
import {
  getIngresosMes, getResultadoMes, getTendencia, getCuentaCorriente, getGastoPorProveedor,
} from '../../src/lib/negocio'
import type { CajaParte, CajaMovimiento, Order, PedidoSemanal, FacturaProveedor } from '../../src/types'

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}
function mkCaja(p: Partial<CajaParte>): CajaParte {
  return {
    id: `c${p.nroCaja ?? 1}`, nroCaja: p.nroCaja ?? 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-06-10T07:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
    ingresos: [], egresos: [], retiros: [], importedBy: 'X', importedAt: '', ...p,
  }
}
function mkOrder(p: Partial<Order>): Order {
  return {
    id: `o${Math.random()}`, distributorId: 'd', distributorName: 'Dist', createdBy: 'X',
    createdAt: '2026-06-06T10:00:00.000Z', items: [], status: 'recibido', notes: '', ...p,
  }
}
function mkPedido(p: Partial<PedidoSemanal>): PedidoSemanal {
  return {
    id: `p${Math.random()}`, date: '2026-06-05T10:00:00.000Z', createdBy: 'X', items: [], status: 'recibido', ...p,
  }
}
function mkFactura(p: Partial<FacturaProveedor>): FacturaProveedor {
  return { supplierId: 's', supplierName: 'Prov', tipoFactura: 'A', monto: 0, fecha: '2026-06-03', ...p }
}

describe('getIngresosMes', () => {
  it('suma el cobrado de las cajas del mes', () => {
    const cajas = [
      mkCaja({ nroCaja: 1, aperturaAt: '2026-06-10T07:00:00.000Z', ingresos: [mov({ efectivo: 100000, total: 100000 }), mov({ tarjetas: 50000, total: 50000 })] }),
      mkCaja({ nroCaja: 2, aperturaAt: '2026-05-30T07:00:00.000Z', ingresos: [mov({ efectivo: 999, total: 999 })] }), // otro mes
    ]
    const r = getIngresosMes(2026, 6, cajas)
    expect(r.total).toBe(150000)
    expect(r.efectivo).toBe(100000)
    expect(r.tarjetas).toBe(50000)
    expect(r.cajas).toBe(1)
  })
})

describe('getResultadoMes', () => {
  it('resultado = ingresos − compras − gastos de caja; el retiro NO cuenta', () => {
    const cajas = [mkCaja({ aperturaAt: '2026-06-10T07:00:00.000Z',
      ingresos: [mov({ efectivo: 100000, total: 100000 })],
      egresos: [
        mov({ observacion: 'RETIRO EFECTIVO', efectivo: 80000, total: 80000 }), // a caja fuerte, NO resta
        mov({ observacion: 'Ferreteria', efectivo: 10000, total: 10000 }),       // gasto de caja, SÍ resta
      ] })]
    const orders = [mkOrder({ monto: 20000, createdAt: '2026-06-06T10:00:00.000Z' })]
    const pedidos = [mkPedido({ monto: 30000, date: '2026-06-05T10:00:00.000Z' })]
    const r = getResultadoMes(2026, 6, cajas, orders, pedidos, [], [])
    expect(r.ingresos).toBe(100000)
    expect(r.gastosCompras).toBe(50000)  // 20000 + 30000
    expect(r.gastosCaja).toBe(10000)     // Ferreteria; el retiro de 80000 NO
    expect(r.egresos).toBe(60000)
    expect(r.resultado).toBe(40000)
    expect(r.margenPct).toBe(40)
  })
})

describe('getCuentaCorriente', () => {
  const hoy = new Date('2026-06-20T12:00:00.000Z')
  it('junta facturas de cuenta corriente sin pagar y marca las vencidas', () => {
    const orders = [mkOrder({ factura: mkFactura({ supplierName: 'Coca', monto: 15000, pago: 'cuenta_corriente', pagado: false, vencimiento: '2026-06-25' }) })]
    const pedidos = [mkPedido({ facturas: [
      mkFactura({ supplierName: 'Pan SA', monto: 5000, pago: 'cuenta_corriente', pagado: false, vencimiento: '2026-06-10' }), // vencida
      mkFactura({ supplierName: 'Lacteos', monto: 9000, pago: 'contado' }), // contado, no es deuda
      mkFactura({ supplierName: 'Pagada', monto: 7000, pago: 'cuenta_corriente', pagado: true }), // ya pagada
    ] })]
    const cc = getCuentaCorriente(orders, pedidos, hoy)
    expect(cc.totalPendiente).toBe(20000) // 15000 + 5000
    expect(cc.vencidas).toBe(5000)         // Pan SA venció el 10
    expect(cc.items.map(d => d.supplierName)).toEqual(['Pan SA', 'Coca']) // ordenadas por vto
  })
})

describe('getGastoPorProveedor', () => {
  it('agrega por proveedor con las facturas del mes, ordenado por monto', () => {
    const orders = [mkOrder({ distributorName: 'Coca', factura: mkFactura({ supplierName: 'Coca', monto: 10000, fecha: '2026-06-03' }) })]
    const pedidos = [mkPedido({ facturas: [mkFactura({ supplierName: 'Pan SA', monto: 8000, fecha: '2026-06-04' })] })]
    const g = getGastoPorProveedor(2026, 6, orders, pedidos)
    expect(g[0]).toEqual({ proveedor: 'Coca', monto: 10000, facturas: 1 })
    expect(g[1]).toEqual({ proveedor: 'Pan SA', monto: 8000, facturas: 1 })
  })
})

describe('getTendencia', () => {
  it('devuelve N meses terminando en el mes actual', () => {
    const hoy = new Date('2026-06-15T12:00:00.000Z')
    const t = getTendencia(6, [], [], [], [], [], hoy)
    expect(t).toHaveLength(6)
    expect(t[5].label).toBe('Junio 2026')
    expect(t[0].label).toBe('Enero 2026')
  })
})
