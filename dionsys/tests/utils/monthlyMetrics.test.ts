import { describe, it, expect } from 'vitest'
import {
  getMonthlyExpenses, getMonthlyOccupancy, getMonthlyDeposit,
  getMonthlyMaintenance, getEmployeeActivity, computeDelta,
} from '../../src/utils/monthlyMetrics'
import type {
  Order, PedidoSemanal, StockMovement, MaintenanceTask,
  PagoMensual, Employee, DepositoItem, PagoSueldo, ImpuestoServicio,
} from '../../src/types'
import type { OccupancyRecord } from '../../src/context/OccupancyContext'

const Y = 2026
const M = 5

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'o1',
    distributorId: 'd1',
    distributorName: 'Test',
    createdBy: 'Laura',
    createdAt: '2026-05-10T10:00:00Z',
    items: [],
    status: 'enviado',
    notes: '',
    ...overrides,
  }
}

function pedido(overrides: Partial<PedidoSemanal> = {}): PedidoSemanal {
  return {
    id: 'p1',
    date: '2026-05-10T10:00:00Z',
    createdBy: 'Santiago',
    items: [],
    status: 'enviado',
    ...overrides,
  }
}

function task(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: 't1',
    createdBy: 'Julio',
    createdByRole: 'mantenimiento',
    createdAt: '2026-05-10T10:00:00Z',
    description: 'test',
    issuePhoto: '',
    selfInitiated: false,
    status: 'pendiente',
    ...overrides,
  }
}

describe('getMonthlyExpenses', () => {
  it('suma impuestos pagados del mes', () => {
    const pagos: PagoMensual[] = [
      { id: '1', impuestoId: 'a', mes: '2026-05', monto: 1000, vtoActual: '2026-05-15', vtoSiguiente: '', pagado: true },
      { id: '2', impuestoId: 'b', mes: '2026-05', monto: 500, vtoActual: '2026-05-20', vtoSiguiente: '', pagado: false },
      { id: '3', impuestoId: 'c', mes: '2026-04', monto: 999, vtoActual: '2026-04-15', vtoSiguiente: '', pagado: true },
    ]
    const result = getMonthlyExpenses(Y, M, [], [], [], pagos)
    expect(result.impuestosPagado).toBe(1000)
    expect(result.impuestosPendiente).toBe(500)
  })

  it('ignora pedidos sin monto y borrados', () => {
    const orders: Order[] = [
      order({ monto: 100 }),
      order({ id: 'o2', monto: 200, status: 'borrado' }),
      order({ id: 'o3' }), // sin monto
    ]
    const result = getMonthlyExpenses(Y, M, orders, [], [], [])
    expect(result.pedidosDistribuidor).toBe(100)
  })

  it('suma pedidos semanales del mes', () => {
    const pedidos: PedidoSemanal[] = [
      pedido({ monto: 5000 }),
      pedido({ id: 'p2', monto: 3000, date: '2026-04-15T10:00:00Z' }),
      pedido({ id: 'p3', monto: 2000, status: 'borrado' }),
    ]
    const result = getMonthlyExpenses(Y, M, [], pedidos, [], [])
    expect(result.pedidosSemanales).toBe(5000)
  })

  it('total suma todos los rubros excluyendo pendientes', () => {
    const result = getMonthlyExpenses(Y, M,
      [order({ monto: 100 })],
      [pedido({ monto: 200 })],
      [task({ status: 'completado', materials: [{ id: 'm1', name: 'x', quantity: 1, unit: 'u', source: 'compra_externa', cost: 50 }] })],
      [{ id: '1', impuestoId: 'a', mes: '2026-05', monto: 1000, vtoActual: '2026-05-15', vtoSiguiente: '', pagado: true }],
    )
    expect(result.total).toBe(1350)
  })

  it('suma sueldos del mes y los incluye en el total', () => {
    const pagosSueldos: PagoSueldo[] = [
      { id: 's1', empleadoId: 'e1', empleadoNombre: 'Roxana', mes: '2026-05', tipo: 'sueldo', monto: 800, fecha: '2026-05-05', medio: 'efectivo' },
      { id: 's2', empleadoId: 'e1', empleadoNombre: 'Roxana', mes: '2026-05', tipo: 'adelanto', monto: 200, fecha: '2026-05-20', medio: 'transferencia' },
      { id: 's3', empleadoId: 'e2', empleadoNombre: 'Julio', mes: '2026-04', tipo: 'sueldo', monto: 999, fecha: '2026-04-05', medio: 'efectivo' }, // otro mes
    ]
    const result = getMonthlyExpenses(Y, M, [order({ monto: 100 })], [], [], [], pagosSueldos)
    expect(result.sueldos).toBe(1000)
    expect(result.total).toBe(1100) // 1000 sueldos + 100 recepción
  })

  // Las cargas sociales (VEP de seguridad social) se pagan por toda la nómina
  // junta: no son de un empleado, van en su propio rubro, pero suman al total.
  // El mes es el del PAGO: las cargas del período 04 pagadas en mayo son de mayo.
  it('separa las cargas sociales de los sueldos pero las suma al total', () => {
    const pagosSueldos: PagoSueldo[] = [
      { id: 's1', empleadoId: 'e1', empleadoNombre: 'Roxana', mes: '2026-05', tipo: 'sueldo', monto: 800, fecha: '2026-05-05', medio: 'efectivo' },
      // Mismo empleado, mismo mes, recibo aparte: las vacaciones se liquidan solas.
      { id: 'v1', empleadoId: 'e1', empleadoNombre: 'Roxana', mes: '2026-05', tipo: 'vacaciones', monto: 200, fecha: '2026-05-05', medio: 'efectivo' },
      { id: 'c1', empleadoId: '', empleadoNombre: 'Cargas sociales (AFIP)', mes: '2026-05', tipo: 'cargas', monto: 350, fecha: '2026-05-12', medio: 'transferencia', periodo: '2026-04' },
      { id: 'c2', empleadoId: '', empleadoNombre: 'Cargas sociales (AFIP)', mes: '2026-04', tipo: 'cargas', monto: 999, fecha: '2026-04-12', medio: 'transferencia', periodo: '2026-03' }, // otro mes
    ]
    const result = getMonthlyExpenses(Y, M, [], [], [], [], pagosSueldos)
    expect(result.sueldos).toBe(1000) // sueldo + vacaciones: los dos son pago al personal
    expect(result.cargasSociales).toBe(350)
    expect(result.total).toBe(1350)
  })

  it('separa los pagos por categoría de servicio (sin categoría = impuesto)', () => {
    const servicios: ImpuestoServicio[] = [
      { id: 'imp', nombre: 'ARBA', nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '', categoria: 'impuesto' },
      { id: 'srv', nombre: 'Ascensores', nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '', categoria: 'servicio' },
      { id: 'prof', nombre: 'Contadora', nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '', categoria: 'profesional' },
      { id: 'legacy', nombre: 'EDEA', nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '' }, // sin categoría
    ]
    const pagos: PagoMensual[] = [
      { id: '1', impuestoId: 'imp', mes: '2026-05', monto: 1000, vtoActual: '2026-05-10', vtoSiguiente: '', pagado: true },
      { id: '2', impuestoId: 'srv', mes: '2026-05', monto: 300, vtoActual: '2026-05-10', vtoSiguiente: '', pagado: true },
      { id: '3', impuestoId: 'prof', mes: '2026-05', monto: 500, vtoActual: '2026-05-10', vtoSiguiente: '', pagado: true },
      { id: '4', impuestoId: 'legacy', mes: '2026-05', monto: 700, vtoActual: '2026-05-10', vtoSiguiente: '', pagado: true },
    ]
    const result = getMonthlyExpenses(Y, M, [], [], [], pagos, [], servicios)
    expect(result.impuestosPagado).toBe(1700) // ARBA + EDEA (sin categoría)
    expect(result.serviciosPagado).toBe(300)
    expect(result.profesionalesPagado).toBe(500)
    expect(result.total).toBe(2500)
  })

  it('sin lista de servicios, todos los pagos cuentan como impuesto (retrocompat)', () => {
    const pagos: PagoMensual[] = [
      { id: '1', impuestoId: 'a', mes: '2026-05', monto: 1000, vtoActual: '2026-05-15', vtoSiguiente: '', pagado: true },
      { id: '2', impuestoId: 'b', mes: '2026-05', monto: 500, vtoActual: '2026-05-20', vtoSiguiente: '', pagado: true },
    ]
    const result = getMonthlyExpenses(Y, M, [], [], [], pagos)
    expect(result.impuestosPagado).toBe(1500)
    expect(result.serviciosPagado).toBe(0)
    expect(result.profesionalesPagado).toBe(0)
  })
})

describe('getMonthlyOccupancy', () => {
  function rec(date: string, guests: number, rooms: number): OccupancyRecord {
    return { id: date, date, guests, rooms, createdBy: 'Santiago', createdAt: '' }
  }
  const records: OccupancyRecord[] = [
    rec('2026-05-01', 40, 25),
    rec('2026-05-02', 50, 30),
    rec('2026-05-03', 10, 5),  // día vacío
    rec('2026-05-04', 50, 50), // día lleno (>85% de 53)
    rec('2026-04-15', 100, 50), // otro mes — debe ignorarse
  ]

  it('promedios solo del mes pedido', () => {
    const r = getMonthlyOccupancy(Y, M, records, 53)
    expect(r.totalDiasConDatos).toBe(4)
    expect(r.avgGuests).toBe(38)  // round((40+50+10+50)/4) = 37.5 → 38
  })

  it('cuenta días llenos (>85%)', () => {
    const r = getMonthlyOccupancy(Y, M, records, 53)
    expect(r.diasLlenos).toBe(1)
  })

  it('cuenta días vacíos (<30%)', () => {
    const r = getMonthlyOccupancy(Y, M, records, 53)
    expect(r.diasVacios).toBe(1)
  })

  it('devuelve ceros si no hay datos', () => {
    const r = getMonthlyOccupancy(Y, M, [], 53)
    expect(r).toEqual({ avgGuests: 0, avgRooms: 0, avgOccupancyPct: 0, diasLlenos: 0, diasVacios: 0, totalDiasConDatos: 0 })
  })
})

describe('getMonthlyDeposit', () => {
  const movements: StockMovement[] = [
    { id: '1', itemId: 'a', itemName: 'Harina', type: 'entrada', quantity: 10, date: '2026-05-05T10:00:00Z', createdBy: 'X', notes: '' },
    { id: '2', itemId: 'b', itemName: 'Azúcar', type: 'salida', quantity: 5, date: '2026-05-06T10:00:00Z', createdBy: 'X', notes: '' },
    { id: '3', itemId: 'b', itemName: 'Azúcar', type: 'salida', quantity: 3, date: '2026-05-07T10:00:00Z', createdBy: 'X', notes: '' },
    { id: '4', itemId: 'c', itemName: 'Café', type: 'salida', quantity: 1, date: '2026-04-01T10:00:00Z', createdBy: 'X', notes: '' }, // otro mes
  ]
  const items: DepositoItem[] = [
    { id: 'a', name: 'Harina', unit: 'kg', category: 'desayunador', stock: 5, stockIdeal: 8 },
    { id: 'b', name: 'Azúcar', unit: 'kg', category: 'desayunador', stock: 10, stockIdeal: 8 }, // no crítico
  ]

  it('suma entradas/salidas del mes', () => {
    const r = getMonthlyDeposit(Y, M, movements, items)
    expect(r.totalEntradas).toBe(10)
    expect(r.totalSalidas).toBe(8)
    expect(r.movimientosCount).toBe(3)
  })

  it('top salidas ordenadas', () => {
    const r = getMonthlyDeposit(Y, M, movements, items)
    expect(r.topSalidas[0]).toEqual({ itemName: 'Azúcar', quantity: 8 })
  })

  it('stockCritico filtra por stock < ideal', () => {
    const r = getMonthlyDeposit(Y, M, movements, items)
    expect(r.stockCritico.length).toBe(1)
    expect(r.stockCritico[0].name).toBe('Harina')
  })
})

describe('getMonthlyMaintenance', () => {
  const tasks: MaintenanceTask[] = [
    task({ id: 't1', status: 'completado', createdAt: '2026-05-01T10:00:00Z', completedAt: '2026-05-01T16:00:00Z', materials: [{ id: 'm1', name: 'x', quantity: 1, unit: 'u', source: 'compra_externa', cost: 100 }] }),
    task({ id: 't2', status: 'completado', createdAt: '2026-05-02T10:00:00Z', completedAt: '2026-05-03T10:00:00Z' }),
    task({ id: 't3', status: 'pendiente', createdAt: '2026-05-05T10:00:00Z' }),
    task({ id: 't4', status: 'completado', createdAt: '2026-04-01T10:00:00Z', completedAt: '2026-04-01T12:00:00Z' }), // otro mes
  ]

  it('cuenta creadas/completadas/pendientes del mes', () => {
    const r = getMonthlyMaintenance(Y, M, tasks)
    expect(r.creadas).toBe(3)
    expect(r.completadas).toBe(2)
    expect(r.pendientes).toBe(1)
  })

  it('suma gasto materiales solo de completadas del mes', () => {
    const r = getMonthlyMaintenance(Y, M, tasks)
    expect(r.gastoMateriales).toBe(100)
  })

  it('calcula tiempo promedio en horas', () => {
    const r = getMonthlyMaintenance(Y, M, tasks)
    // t1: 6h, t2: 24h → promedio = 15h
    expect(r.tiempoPromedioHoras).toBe(15)
  })
})

describe('getEmployeeActivity', () => {
  const employees: Employee[] = [
    { id: '1', name: 'Laura', pin: '0000', role: 'admin', active: true },
    { id: '2', name: 'Santiago', pin: '2222', role: 'concierge', active: true },
    { id: '3', name: 'Inactive', pin: '9999', role: 'concierge', active: false },
  ]

  it('cuenta actividad por empleado', () => {
    const orders: Order[] = [
      order({ id: 'o1', createdBy: 'Laura' }),
      order({ id: 'o2', createdBy: 'Santiago' }),
    ]
    const tasks: MaintenanceTask[] = [
      task({ id: 't1', createdBy: 'Laura', completedBy: 'Laura', status: 'completado', completedAt: '2026-05-15T10:00:00Z' }),
    ]
    const now = new Date('2026-05-20T00:00:00Z')
    const r = getEmployeeActivity(Y, M, employees, orders, [], [], tasks, [], now)
    expect(r.length).toBe(2) // excluye inactivo
    const laura = r.find(e => e.name === 'Laura')!
    expect(laura.orders).toBe(1)
    expect(laura.tareasCreadas).toBe(1)
    expect(laura.tareasCompletadas).toBe(1)
  })

  it('marca inactividad correctamente', () => {
    const now = new Date('2026-05-20T00:00:00Z')
    const orders: Order[] = [order({ id: 'o1', createdBy: 'Laura', createdAt: '2026-05-10T10:00:00Z' })]
    const r = getEmployeeActivity(Y, M, employees, orders, [], [], [], [], now)
    const laura = r.find(e => e.name === 'Laura')!
    const santiago = r.find(e => e.name === 'Santiago')!
    expect(laura.daysInactive).toBe(9)
    expect(santiago.daysInactive).toBe(999) // sin actividad
  })
})

describe('computeDelta', () => {
  it('up cuando current > previous', () => {
    const d = computeDelta(150, 100)
    expect(d.direction).toBe('up')
    expect(d.pct).toBe(50)
  })
  it('down cuando current < previous', () => {
    const d = computeDelta(80, 100)
    expect(d.direction).toBe('down')
    expect(d.pct).toBe(-20)
  })
  it('flat cuando casi iguales', () => {
    expect(computeDelta(100, 100).direction).toBe('flat')
  })
  it('maneja previous = 0', () => {
    expect(computeDelta(50, 0).direction).toBe('up')
    expect(computeDelta(0, 0).direction).toBe('flat')
  })
})
