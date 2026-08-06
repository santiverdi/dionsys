import { describe, it, expect } from 'vitest'
import { cruzarLibro, pagosDelSistema, type PagoSistema } from '../../src/lib/libroCajaCruce'
import type { LibroCajaMovimiento, PagoSueldo, PagoMensual, ImpuestoServicio } from '../../src/types'

function mov(p: Partial<LibroCajaMovimiento>): LibroCajaMovimiento {
  return {
    fecha: '2026-07-10', conceptoCod: '031', concepto: 'PUBLICIDAD Y PROPAGANDA',
    medioCod: '003', medio: 'BANCOS', monto: -100000, detalle: '', ...p,
  }
}

const pago = (p: Partial<PagoSistema>): PagoSistema =>
  ({ fuente: 'Impuestos', fecha: '2026-07-10', monto: 100000, detalle: 'EDEA', ...p })

describe('cruzarLibro', () => {
  it('lo que ya está cargado en el sistema no vuelve a sumar', () => {
    const r = cruzarLibro(
      [mov({ monto: -100000, detalle: 'EDEA VTO.07/26' })],
      [pago({ monto: 100000, fecha: '2026-07-12' })],
    )
    expect(r.yaCargados).toHaveLength(1)
    expect(r.soloLibro).toHaveLength(0)
    expect(r.totalSoloLibro).toBe(0)
    expect(r.totalYaCargado).toBe(100000)
  })

  it('lo que el sistema no tenía suma como egreso', () => {
    const r = cruzarLibro([mov({ monto: -55000, detalle: 'ANUNCIOS' })], [])
    expect(r.soloLibro).toHaveLength(1)
    expect(r.totalSoloLibro).toBe(55000)
  })

  it('no aparea si la fecha está lejos, aunque el monto sea igual', () => {
    const r = cruzarLibro(
      [mov({ fecha: '2026-07-28', monto: -100000 })],
      [pago({ fecha: '2026-07-01', monto: 100000 })],
    )
    expect(r.soloLibro).toHaveLength(1)
    expect(r.soloSistema).toHaveLength(1)
  })

  it('cada pago del sistema se usa una sola vez', () => {
    // Dos pagos iguales en el libro y uno solo cargado: uno aparea, el otro suma.
    const r = cruzarLibro(
      [mov({ monto: -100000, fecha: '2026-07-10' }), mov({ monto: -100000, fecha: '2026-07-11' })],
      [pago({ monto: 100000, fecha: '2026-07-10' })],
    )
    expect(r.yaCargados).toHaveLength(1)
    expect(r.soloLibro).toHaveLength(1)
    expect(r.totalSoloLibro).toBe(100000)
  })

  it('elige el pago más cercano en fecha cuando hay varios iguales', () => {
    const r = cruzarLibro(
      [mov({ monto: -100000, fecha: '2026-07-10' })],
      [pago({ monto: 100000, fecha: '2026-07-04', detalle: 'lejos' }),
       pago({ monto: 100000, fecha: '2026-07-09', detalle: 'cerca' })],
    )
    expect(r.yaCargados[0].pago.detalle).toBe('cerca')
  })

  it('lo que entra y los movimientos internos no se cruzan ni suman', () => {
    const r = cruzarLibro([
      mov({ conceptoCod: '001', concepto: 'CAJA', monto: 1000000 }),        // entra
      mov({ conceptoCod: '032', concepto: 'RETIRO', monto: -500000 }),      // no es gasto
      mov({ conceptoCod: '029', concepto: 'CAMBIO', monto: -20000 }),       // no es gasto
    ], [])
    expect(r.soloLibro).toHaveLength(0)
    expect(r.totalSoloLibro).toBe(0)
  })

  it('lo cargado en el sistema sin espejo en el libro queda listado para revisar', () => {
    const r = cruzarLibro([], [pago({ monto: 77000, detalle: 'ARBA' })])
    expect(r.soloSistema).toHaveLength(1)
    expect(r.soloSistema[0].detalle).toBe('ARBA')
  })
})

describe('pagosDelSistema', () => {
  const vacio = { orders: [], pedidos: [], tasks: [], pagos: [], pagosSueldos: [], servicios: [] }

  it('toma los sueldos del mes con su fecha y el nombre del empleado', () => {
    const pagosSueldos: PagoSueldo[] = [{
      id: '1', empleadoId: 'e1', empleadoNombre: 'FLORES ROXANA', mes: '2026-07',
      tipo: 'sueldo', monto: 1984135, fecha: '2026-07-06', medio: 'transferencia',
    }]
    const r = pagosDelSistema(2026, 7, { ...vacio, pagosSueldos })
    expect(r).toEqual([{ fuente: 'Sueldos', fecha: '2026-07-06', monto: 1984135, detalle: 'FLORES ROXANA' }])
  })

  it('los impuestos sin pagar no cuentan: el libro sí los tendría', () => {
    const servicios: ImpuestoServicio[] = [
      { id: 's1', nombre: 'EDEA', nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '', categoria: 'servicio' },
    ]
    const pagos: PagoMensual[] = [
      { id: 'p1', impuestoId: 's1', mes: '2026-07', monto: 1555946, vtoActual: '2026-07-14', vtoSiguiente: '', pagado: true },
      { id: 'p2', impuestoId: 's1', mes: '2026-07', monto: 999, vtoActual: '2026-07-20', vtoSiguiente: '', pagado: false },
    ]
    const r = pagosDelSistema(2026, 7, { ...vacio, pagos, servicios })
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({ fuente: 'Servicios', fecha: '2026-07-14', monto: 1555946, detalle: 'EDEA' })
  })
})
