import { describe, it, expect } from 'vitest'
import {
  impuestosDelLibro, matchServicio, pendienteDe, puedeIrAImpuestos, yaPagadoDe,
} from '../../src/lib/libroCajaImpuestos'
import { claveMovimiento } from '../../src/lib/libroCajaMarcas'
import type { ImpuestoServicio, LibroCajaMovimiento, PagoMensual } from '../../src/types'

const mov = (over: Partial<LibroCajaMovimiento> = {}): LibroCajaMovimiento => ({
  fecha: '2026-07-10',
  conceptoCod: '040',
  concepto: 'SERVICIOS',
  medioCod: '003',
  medio: 'BANCOS',
  monto: -5000,
  detalle: 'EDEA 07/26',
  ...over,
})

const srv = (id: string, nombre: string, over: Partial<ImpuestoServicio> = {}): ImpuestoServicio => ({
  id, nombre, nroCuenta: '', urlPago: '', frecuencia: 'mensual', diaVto: 10, observaciones: '', ...over,
})

const SERVICIOS = [
  srv('s1', 'EDEA'),
  srv('s2', 'OSSE'),
  srv('s3', 'Contadora', { categoria: 'profesional' }),
]

const pago = (over: Partial<PagoMensual> = {}): PagoMensual => ({
  id: 'x', impuestoId: 's1', mes: '2026-07', monto: 5000,
  vtoActual: '2026-07-10', vtoSiguiente: '', pagado: false, ...over,
})

describe('matchServicio', () => {
  it('encuentra el servicio nombrado en el detalle', () => {
    expect(matchServicio(mov(), SERVICIOS)?.id).toBe('s1')
    expect(matchServicio(mov({ detalle: 'OSSE AGUA' }), SERVICIOS)?.id).toBe('s2')
  })

  it('también lo encuentra por el concepto', () => {
    expect(matchServicio(mov({ concepto: 'CONTADORA', detalle: 'F:123' }), SERVICIOS)?.id).toBe('s3')
  })

  it('las muletillas no matchean con nada', () => {
    expect(matchServicio(mov({ concepto: 'SERVICIOS', detalle: 'PAGO JULIO' }), SERVICIOS)).toBeNull()
  })
})

describe('puedeIrAImpuestos', () => {
  it('deja pasar una salida que es gasto', () => {
    expect(puedeIrAImpuestos(mov())).toBe(true)
  })

  it('no deja pasar entradas, movimientos internos ni sueldos', () => {
    expect(puedeIrAImpuestos(mov({ monto: 5000 }))).toBe(false)
    expect(puedeIrAImpuestos(mov({ conceptoCod: '029', concepto: 'CAMBIO' }))).toBe(false)
    expect(puedeIrAImpuestos(mov({ conceptoCod: '010', concepto: 'SUELDOS' }))).toBe(false)
    expect(puedeIrAImpuestos(mov({ concepto: 'CARGAS SOCIALES', detalle: 'VEP' }))).toBe(false)
  })
})

describe('pendienteDe / yaPagadoDe', () => {
  const pagos = [
    pago({ id: 'p1', vtoActual: '2026-06-30' }),
    pago({ id: 'p2', vtoActual: '2026-07-10' }),
    pago({ id: 'p3', vtoActual: '2026-07-10', pagado: true }),
  ]

  it('elige el vencimiento pendiente más cercano al pago', () => {
    expect(pendienteDe('s1', '2026-07-12', pagos)?.id).toBe('p2')
    expect(pendienteDe('s1', '2026-06-28', pagos)?.id).toBe('p1')
  })

  it('ignora los que ya están pagados y los que están lejos', () => {
    expect(pendienteDe('s1', '2026-12-01', pagos)).toBeNull()
    expect(pendienteDe('s2', '2026-07-12', pagos)).toBeNull()
  })

  it('encuentra el pago ya pagado del mes', () => {
    expect(yaPagadoDe('s1', '2026-07', pagos)?.id).toBe('p3')
    expect(yaPagadoDe('s1', '2026-08', pagos)).toBeNull()
  })
})

describe('impuestosDelLibro', () => {
  const movimientos = [
    mov(),                                                            // EDEA: matchea
    mov({ fecha: '2026-07-11', concepto: 'LIBRERIA', detalle: 'RESMAS', monto: -800 }),
    mov({ conceptoCod: '010', concepto: 'SUELDOS', detalle: 'FLORES ROXANA', monto: -2000 }),
    mov({ conceptoCod: '029', concepto: 'CAMBIO', detalle: '', monto: -100 }),
  ]

  it('deja solo lo que parece impuesto o servicio y propone el servicio', () => {
    const filas = impuestosDelLibro(movimientos, SERVICIOS, [])
    expect(filas).toHaveLength(1)
    expect(filas[0].servicioSugerido?.id).toBe('s1')
    expect(filas[0].monto).toBe(5000)
    expect(filas[0].mes).toBe('2026-07')
  })

  it('con "ver todas" aparecen también las salidas sin pista, menos sueldos e internos', () => {
    const filas = impuestosDelLibro(movimientos, SERVICIOS, [], true)
    expect(filas.map(f => f.mov.concepto)).toEqual(['SERVICIOS', 'LIBRERIA'])
    expect(filas[1].servicioSugerido).toBeNull()
  })

  it('avisa que hay un vencimiento pendiente para marcar', () => {
    const filas = impuestosDelLibro(movimientos, SERVICIOS, [pago({ id: 'p1' })])
    expect(filas[0].pendienteAMarcar?.id).toBe('p1')
    expect(filas[0].yaPagado).toBeNull()
  })

  it('avisa cuando ese servicio ya figura pagado ese mes', () => {
    const filas = impuestosDelLibro(movimientos, SERVICIOS, [pago({ id: 'p1', pagado: true })])
    expect(filas[0].pendienteAMarcar).toBeNull()
    expect(filas[0].yaPagado?.id).toBe('p1')
  })

  it('reconoce lo que ya se mandó desde el libro', () => {
    const clave = claveMovimiento(movimientos[0])
    const filas = impuestosDelLibro(movimientos, SERVICIOS, [
      pago({ id: 'p1', pagado: true, origenLibro: clave, creadoDesdeLibro: true }),
    ])
    expect(filas[0].enviado?.id).toBe('p1')
    expect(filas[0].yaPagado).toBeNull()
  })
})
