import { describe, it, expect } from 'vitest'
import {
  esMovimientoSueldo, matchEmpleado, medioSugerido, normalizarNombre,
  sueldosDelLibro, tipoSugerido,
} from '../../src/lib/libroCajaSueldos'
import type { EmpleadoNomina, LibroCajaMovimiento, PagoSueldo } from '../../src/types'

const mov = (over: Partial<LibroCajaMovimiento> = {}): LibroCajaMovimiento => ({
  fecha: '2026-07-07',
  conceptoCod: '010',
  concepto: 'SUELDOS',
  medioCod: '003',
  medio: 'BANCOS',
  monto: -2000,
  detalle: 'FLORES ROXANA',
  ...over,
})

const emp = (id: string, nombre: string): EmpleadoNomina => ({ id, nombre, puesto: '', activo: true })

const NOMINA = [
  emp('e1', 'Roxana Flores'),
  emp('e2', 'Gastón Pérez'),
  emp('e3', 'Julio Martínez'),
]

describe('normalizarNombre', () => {
  it('saca acentos y deja solo letras', () => {
    expect(normalizarNombre('Gastón Pérez')).toBe('GASTON PEREZ')
    expect(normalizarNombre('FLORES, ROXANA (2)')).toBe('FLORES ROXANA')
  })
})

describe('matchEmpleado', () => {
  it('encuentra el empleado con el nombre dado vuelta', () => {
    expect(matchEmpleado('FLORES ROXANA', NOMINA)?.id).toBe('e1')
  })

  it('con una sola palabra alcanza si nadie más la comparte', () => {
    expect(matchEmpleado('ROXANA 1RA QUINCENA', NOMINA)?.id).toBe('e1')
  })

  it('no elige cuando dos empleados empatan', () => {
    const dos = [emp('a', 'Roxana Flores'), emp('b', 'Roxana Gómez')]
    expect(matchEmpleado('ROXANA', dos)).toBeNull()
  })

  it('las palabras que no son nombre no matchean', () => {
    // "SUELDO JULIO" es el mes, no el empleado Julio Martínez.
    expect(matchEmpleado('SUELDO JULIO', NOMINA)).toBeNull()
  })

  it('sin nada reconocible devuelve null', () => {
    expect(matchEmpleado('', NOMINA)).toBeNull()
    expect(matchEmpleado('PAGO', NOMINA)).toBeNull()
  })
})

describe('tipoSugerido / medioSugerido', () => {
  it('lee del detalle qué clase de pago es', () => {
    expect(tipoSugerido('FLORES ROXANA')).toBe('sueldo')
    expect(tipoSugerido('ADELANTO GASTON')).toBe('adelanto')
    expect(tipoSugerido('AGUINALDO ROXANA')).toBe('aguinaldo')
    expect(tipoSugerido('VACACIONES GASTON')).toBe('vacaciones')
    expect(tipoSugerido('VEP CARGAS SOCIALES')).toBe('cargas')
  })

  it('el efectivo es efectivo y todo lo demás transferencia', () => {
    expect(medioSugerido('EFECTIVO')).toBe('efectivo')
    expect(medioSugerido('BANCOS')).toBe('transferencia')
  })
})

describe('esMovimientoSueldo', () => {
  it('toma el código 010 y también el texto del concepto', () => {
    expect(esMovimientoSueldo(mov())).toBe(true)
    expect(esMovimientoSueldo(mov({ conceptoCod: '099', concepto: 'SUELDOS Y JORNALES' }))).toBe(true)
    expect(esMovimientoSueldo(mov({ conceptoCod: '020', concepto: 'GASTOS POR MANTENIMIENTO' }))).toBe(false)
  })

  it('las cargas sociales también son costo laboral y van a Sueldos', () => {
    expect(esMovimientoSueldo(mov({ conceptoCod: '045', concepto: 'CARGAS SOCIALES' }))).toBe(true)
    expect(esMovimientoSueldo(mov({ conceptoCod: '045', concepto: 'AFIP', detalle: 'F931 06/26' }))).toBe(true)
    // "AFIP" a secas puede ser IVA o Ganancias: eso es impuesto, no costo laboral.
    expect(esMovimientoSueldo(mov({ conceptoCod: '045', concepto: 'AFIP', detalle: 'IVA 06/26' }))).toBe(false)
  })

  it('una entrada de plata nunca es un sueldo', () => {
    expect(esMovimientoSueldo(mov({ monto: 2000 }))).toBe(false)
  })
})

describe('sueldosDelLibro', () => {
  const movimientos = [
    mov(),
    mov({ fecha: '2026-07-08', detalle: 'ADELANTO GASTON', monto: -500 }),
    mov({ conceptoCod: '020', concepto: 'GASTOS POR MANTENIMIENTO', detalle: 'ALFOMBRA', monto: -300 }),
  ]

  it('deja solo los sueldos y propone empleado, tipo, medio y mes', () => {
    const filas = sueldosDelLibro(movimientos, NOMINA, [])
    expect(filas).toHaveLength(2)
    expect(filas[0].empleadoSugerido?.id).toBe('e1')
    expect(filas[0].tipo).toBe('sueldo')
    expect(filas[0].medio).toBe('transferencia')
    expect(filas[0].monto).toBe(2000)          // positivo: lo que salió
    expect(filas[0].mes).toBe('2026-07')
    expect(filas[1].empleadoSugerido?.id).toBe('e2')
    expect(filas[1].tipo).toBe('adelanto')
  })

  it('reconoce lo que ya se mandó desde el libro', () => {
    const filas = sueldosDelLibro(movimientos, NOMINA, [])
    const pago: PagoSueldo = {
      id: 'p1', empleadoId: 'e1', empleadoNombre: 'Roxana Flores', mes: '2026-07',
      tipo: 'sueldo', monto: 2000, fecha: '2026-07-07', medio: 'transferencia',
      origenLibro: filas[0].clave,
    }
    const conPago = sueldosDelLibro(movimientos, NOMINA, [pago])
    expect(conPago[0].enviado?.id).toBe('p1')
    expect(conPago[0].posibleDuplicado).toBeNull()
    expect(conPago[1].enviado).toBeNull()
  })

  it('avisa cuando el mismo pago ya está cargado desde el recibo', () => {
    const delRecibo: PagoSueldo = {
      id: 'p2', empleadoId: 'e1', empleadoNombre: 'Roxana Flores', mes: '2026-07',
      tipo: 'sueldo', monto: 2000, fecha: '2026-07-05', medio: 'efectivo',
    }
    const filas = sueldosDelLibro(movimientos, NOMINA, [delRecibo])
    expect(filas[0].posibleDuplicado?.id).toBe('p2')
    expect(filas[1].posibleDuplicado).toBeNull()   // otro importe
  })

  it('un pago lejos en fecha o en importe no cuenta como duplicado', () => {
    const lejos: PagoSueldo = {
      id: 'p3', empleadoId: 'e1', empleadoNombre: 'Roxana Flores', mes: '2026-06',
      tipo: 'sueldo', monto: 2000, fecha: '2026-06-05', medio: 'efectivo',
    }
    expect(sueldosDelLibro(movimientos, NOMINA, [lejos])[0].posibleDuplicado).toBeNull()
  })
})
