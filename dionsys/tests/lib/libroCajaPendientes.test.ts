import { describe, it, expect } from 'vitest'
import {
  clavesDerivadas, pendientesLibro, resumenLibroMes,
} from '../../src/lib/libroCajaPendientes'
import { claveMovimiento } from '../../src/lib/libroCajaMarcas'
import type { SistemaInputs } from '../../src/lib/libroCajaCruce'
import type {
  LibroCajaMes, LibroCajaMovimiento, PagoMensual, PagoSueldo,
} from '../../src/types'

const VACIO: SistemaInputs = {
  orders: [], pedidos: [], tasks: [], pagos: [], pagosSueldos: [], servicios: [],
}

const mov = (over: Partial<LibroCajaMovimiento> = {}): LibroCajaMovimiento => ({
  fecha: '2026-07-05',
  conceptoCod: '040',
  concepto: 'PUBLICIDAD',
  medioCod: '001',
  medio: 'EFECTIVO',
  monto: -1000,
  detalle: 'CARTELERIA',
  ...over,
})

const libro = (movimientos: LibroCajaMovimiento[], mes = '2026-07'): LibroCajaMes => ({
  mes, archivo: 'CAJA.xls', importadoAt: '2026-07-31T00:00:00.000Z',
  medios: [], movimientos, avisos: [],
})

const pagoSueldo = (over: Partial<PagoSueldo> = {}): PagoSueldo => ({
  id: 's1', empleadoId: 'e1', empleadoNombre: 'Roxana Flores', mes: '2026-07',
  tipo: 'sueldo', monto: 2000, fecha: '2026-07-07', medio: 'efectivo', ...over,
})

describe('clavesDerivadas', () => {
  it('junta las claves de origen de Sueldos y de Impuestos', () => {
    const pm: PagoMensual = {
      id: 'i1', impuestoId: 'x', mes: '2026-07', monto: 500,
      vtoActual: '2026-07-10', vtoSiguiente: '', pagado: true, origenLibro: 'B',
    }
    const set = clavesDerivadas([pagoSueldo({ origenLibro: 'A' }), pagoSueldo({ id: 's2' })], [pm])
    expect([...set].sort()).toEqual(['A', 'B'])
  })
})

describe('resumenLibroMes', () => {
  const publicidad = mov()
  const sueldo = mov({ conceptoCod: '010', concepto: 'SUELDOS', detalle: 'FLORES ROXANA', monto: -2000 })
  const cambio = mov({ conceptoCod: '029', concepto: 'CAMBIO', detalle: '', monto: -300 })
  const entrada = mov({ conceptoCod: '001', concepto: 'CAJA', monto: 5000 })
  const mes = libro([publicidad, sueldo, cambio, entrada])

  it('sin marcas ni derivaciones, todo lo que es gasto queda sin decidir', () => {
    const r = resumenLibroMes(mes, {}, new Set(), VACIO)
    expect(r.sinDecidir).toBe(3000)          // 1000 + 2000
    expect(r.cantSinDecidir).toBe(2)
    expect(r.marcado).toBe(0)
    expect(r.derivado).toBe(0)
    // El cambio y la entrada no son plata perdida: no cuentan en ningún lado.
    expect(r.filasSinDecidir.map(f => f.concepto)).toEqual(['SUELDOS', 'PUBLICIDAD'])
  })

  it('lo marcado a mano sale de sin decidir', () => {
    const r = resumenLibroMes(mes, { [claveMovimiento(publicidad)]: true }, new Set(), VACIO)
    expect(r.marcado).toBe(1000)
    expect(r.sinDecidir).toBe(2000)
    expect(r.cantSinDecidir).toBe(1)
  })

  it('lo derivado a Sueldos o Impuestos también sale, y no se cuenta como marcado', () => {
    const derivadas = new Set([claveMovimiento(sueldo)])
    // El pago derivado ya existe en Sueldos, así que además aparea con el
    // sistema: tiene que contar como derivado, no como "ya en el sistema".
    const sistema: SistemaInputs = { ...VACIO, pagosSueldos: [pagoSueldo()] }
    const r = resumenLibroMes(mes, {}, derivadas, sistema)
    expect(r.derivado).toBe(2000)
    expect(r.yaEnSistema).toBe(0)
    expect(r.sinDecidir).toBe(1000)
  })

  it('lo que ya está cargado en otra pantalla no se reclama', () => {
    // Un pago de $1000 cargado en Sueldos que aparea con la fila de publicidad.
    const sistema: SistemaInputs = {
      ...VACIO,
      pagosSueldos: [pagoSueldo({ monto: 1000, fecha: '2026-07-05' })],
    }
    const r = resumenLibroMes(mes, {}, new Set(), sistema)
    expect(r.yaEnSistema).toBe(1000)
    expect(r.sinDecidir).toBe(2000)
  })

  it('los cuatro estados suman todas las salidas que son gasto', () => {
    const sistema: SistemaInputs = { ...VACIO, pagosSueldos: [pagoSueldo({ monto: 1000, fecha: '2026-07-05' })] }
    const r = resumenLibroMes(mes, { [claveMovimiento(sueldo)]: true }, new Set(), sistema)
    expect(r.marcado + r.derivado + r.yaEnSistema + r.sinDecidir).toBe(3000)
  })
})

describe('pendientesLibro', () => {
  it('acumula todos los meses importados y los ordena del más viejo', () => {
    const meses = [
      libro([mov({ fecha: '2026-08-03', monto: -700 })], '2026-08'),
      libro([mov()], '2026-07'),
    ]
    const p = pendientesLibro(meses, {}, new Set(), VACIO)
    expect(p.totalSinDecidir).toBe(1700)
    expect(p.cantSinDecidir).toBe(2)
    expect(p.mesesConPendiente).toEqual(['2026-07', '2026-08'])
  })

  it('un mes resuelto entero no aparece', () => {
    const m = mov()
    const p = pendientesLibro([libro([m])], { [claveMovimiento(m)]: true }, new Set(), VACIO)
    expect(p.totalSinDecidir).toBe(0)
    expect(p.mesesConPendiente).toEqual([])
  })
})
