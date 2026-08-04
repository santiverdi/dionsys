import { describe, it, expect } from 'vitest'
import { getRendimientoPorHabitacion, getFichaHabitacion } from '../../src/lib/porHabitacion'
import type { CajaParte, CajaMovimiento, ParteHabitaciones, HabitacionOcupada, HabitacionLibre } from '../../src/types'

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '2026-07-10T10:00:00.000Z', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}

function mkCaja(p: Partial<CajaParte>): CajaParte {
  return {
    id: `c${p.nroCaja}`, nroCaja: p.nroCaja ?? 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-07-10T07:00:00.000Z', cierreAt: '2026-07-10T15:00:00.000Z',
    aperturaMonto: 0, saldoFinal: 0, ingresos: [], egresos: [], retiros: [],
    importedBy: 'X', importedAt: '2026-07-10T15:30:00.000Z', ...p,
  }
}

function ocupada(habitacion: string, plazas: number, reserva = ''): HabitacionOcupada {
  return { habitacion, reserva, plazas, canal: 'Booking.com' }
}

// Un parte NOCHE: es el que dice quién durmió (misma regla que el desayuno).
function mkParteNoche(fecha: string, ocupadas: HabitacionOcupada[], libres: HabitacionLibre[] = []): ParteHabitaciones {
  return {
    id: `p${fecha}`, nroCaja: 1, usuario: 'X', fechaCaja: `${fecha}T01:30:00.000Z`, turno: 'noche',
    ocupadas, libres,
    totalOcupadas: ocupadas.length, totalPlazas: ocupadas.reduce((s, o) => s + o.plazas, 0), totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0, importedBy: 'X', importedAt: `${fecha}T02:00:00.000Z`,
  }
}

describe('getRendimientoPorHabitacion', () => {
  it('cuelga cada cobro de la habitación que trae el propio movimiento de caja', () => {
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '301', efectivo: 100000, total: 100000 }),
      mov({ habitacion: '301', tarjetas: 50000, total: 50000 }),
      mov({ habitacion: '905', efectivo: 30000, total: 30000 }),
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, [])

    const h301 = r.habitaciones.find(h => h.numero === '301')!
    expect(h301.ingreso).toBe(150000)
    expect(h301.cobros).toBe(2)
    expect(r.habitaciones[0].numero).toBe('301')          // ordenadas por ingreso
    expect(r.ingresoAtribuido).toBe(180000)
    expect(r.ingresoSinAtribuir).toBe(0)
  })

  it('reparte el cobro combinado "202/205" proporcional a la gente que durmió en cada una', () => {
    // La 202 (5 plazas) durmió 3 y la 205 (2 plazas) durmió 1: la plata sigue a
    // la GENTE, no a la capacidad — si no, la 202 se llevaría 5/7 en vez de 3/4.
    const partes = [mkParteNoche('2026-07-10', [ocupada('202', 3, '900'), ocupada('205', 1, '900')])]
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '202/205', reserva: '900', efectivo: 400000, total: 400000 }),
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, partes)

    expect(r.habitaciones.find(h => h.numero === '202')!.ingreso).toBe(300000)
    expect(r.habitaciones.find(h => h.numero === '205')!.ingreso).toBe(100000)
    expect(r.ingresoAtribuido).toBe(400000)
  })

  it('sin parte que cruzar, reparte el combinado por las plazas del maestro', () => {
    // 202 tiene 5 plazas y 205 tiene 2 → 5/7 y 2/7 de la plata.
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '202/205', efectivo: 700000, total: 700000 }),
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, [])

    expect(r.habitaciones.find(h => h.numero === '202')!.ingreso).toBe(500000)
    expect(r.habitaciones.find(h => h.numero === '205')!.ingreso).toBe(200000)
  })

  it('el cobro sin habitación utilizable no se atribuye y queda a la vista', () => {
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '301', efectivo: 100000, total: 100000 }),
      mov({ observacion: 'Cochera', efectivo: 20000, total: 20000 }),   // sin habitación
      mov({ habitacion: '9999', efectivo: 5000, total: 5000 }),         // no existe en el hotel
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, [])

    expect(r.totalCobrado).toBe(125000)
    expect(r.ingresoAtribuido).toBe(100000)
    expect(r.ingresoSinAtribuir).toBe(25000)
  })

  it('cuenta noches vendidas y el ingreso por noche desde los partes noche', () => {
    const partes = [
      mkParteNoche('2026-07-10', [ocupada('301', 2)]),
      mkParteNoche('2026-07-11', [ocupada('301', 2)]),
      mkParteNoche('2026-07-12', [ocupada('905', 1)]),
    ]
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '301', efectivo: 120000, total: 120000 }),
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, partes)

    const h301 = r.habitaciones.find(h => h.numero === '301')!
    expect(r.nochesMedidas).toBe(3)
    expect(h301.noches).toBe(2)
    expect(h301.plazasVendidas).toBe(4)
    expect(h301.ingresoPorNoche).toBe(60000)
    expect(h301.ocupacionPct).toBe(67)     // 2 de 3 noches medidas
  })

  it('marca la habitación que durmió gente y no tiene plata (grupo cobrado por fuera)', () => {
    const partes = [mkParteNoche('2026-07-10', [ocupada('301', 2), ocupada('905', 3)])]
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '301', efectivo: 100000, total: 100000 }),
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, partes)

    expect(r.sinCobro).toEqual(['905'])
    expect(r.habitaciones.find(h => h.numero === '905')!.ocupadaSinCobro).toBe(true)
    expect(r.habitaciones.find(h => h.numero === '301')!.ocupadaSinCobro).toBe(false)
  })

  it('agrupa por piso y por tipo de habitación', () => {
    const partes = [mkParteNoche('2026-07-10', [ocupada('301', 3), ocupada('305', 2)])]
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '301', efectivo: 90000, total: 90000 }),   // piso 3, triple (3 plazas)
      mov({ habitacion: '305', efectivo: 60000, total: 60000 }),   // piso 3, doble (2 plazas)
      mov({ habitacion: '905', efectivo: 10000, total: 10000 }),   // piso 9
    ] })]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, partes)

    const piso3 = r.porPiso.find(p => p.label === 'Piso 3')!
    expect(piso3.ingreso).toBe(150000)
    expect(piso3.noches).toBe(2)
    expect(piso3.ingresoPorNoche).toBe(75000)
    expect(r.porPiso[0].label).toBe('Piso 3')             // el que más factura primero

    const triple = r.porTipo.find(t => t.label === 'triple')!
    expect(triple.ingreso).toBe(90000)
  })

  it('el ingreso por habitación del mes coincide con el de su ficha', () => {
    // La ficha no puede contradecir a la tabla: comparten el mismo reparto.
    const partes = [mkParteNoche('2026-07-10', [ocupada('202', 3, '900'), ocupada('205', 1, '900')])]
    const cajas = [mkCaja({ nroCaja: 1, ingresos: [
      mov({ habitacion: '202/205', reserva: '900', efectivo: 400000, total: 400000 }),
    ] })]
    const tabla = getRendimientoPorHabitacion(2026, 7, cajas, partes)
    const ficha = getFichaHabitacion('202', cajas, partes)!

    expect(ficha.totales.ingreso).toBe(tabla.habitaciones.find(h => h.numero === '202')!.ingreso)
    expect(ficha.cobros[0].compartido).toBe(true)   // el cobro tocaba dos cuartos
    expect(ficha.meses[0].key).toBe('2026-07')
    expect(ficha.meses[0].ingreso).toBe(300000)
  })

  it('ignora las cajas de otros meses y los cobros anulados', () => {
    const cajas = [
      mkCaja({ nroCaja: 1, ingresos: [mov({ habitacion: '301', efectivo: 100000, total: 100000 })] }),
      mkCaja({ nroCaja: 2, aperturaAt: '2026-06-10T07:00:00.000Z',
        ingresos: [mov({ habitacion: '301', efectivo: 999999, total: 999999 })] }),
      mkCaja({ nroCaja: 3,
        ingresos: [mov({ habitacion: '905', efectivo: 50000, total: 50000 })],
        egresos: [mov({ observacion: 'Egreso por anulación de pago', total: 50000 })] }),
    ]
    const r = getRendimientoPorHabitacion(2026, 7, cajas, [])

    expect(r.habitaciones.find(h => h.numero === '301')!.ingreso).toBe(100000)
    expect(r.habitaciones.find(h => h.numero === '905')!.ingreso).toBe(0)
    expect(r.totalCobrado).toBe(100000)
  })
})

describe('getFichaHabitacion', () => {
  const partes = [
    mkParteNoche('2026-07-10', [ocupada('301', 2, '11')], [{ habitacion: '905', estado: 'sucia' }]),
    mkParteNoche('2026-07-11', [ocupada('301', 3, '12')], [{ habitacion: '905', estado: 'mantenimiento' }]),
    // El 12 el parte no nombra la 905 ni ocupada ni libre: queda sin control.
    mkParteNoche('2026-07-12', [ocupada('905', 1, '13')], []),
  ]
  const cajas = [mkCaja({ nroCaja: 1, ingresos: [
    mov({ habitacion: '301', efectivo: 200000, total: 200000 }),
    mov({ habitacion: '905', efectivo: 40000, total: 40000 }),
  ] })]

  it('junta noches, plata, canales y controles de una habitación', () => {
    const f = getFichaHabitacion('301', cajas, partes)!

    expect(f.habitacion.piso).toBe(3)
    expect(f.tipo).toBe('triple')                  // 3 plazas
    expect(f.totales.noches).toBe(2)
    expect(f.totales.nochesMedidas).toBe(3)
    expect(f.totales.ocupacionPct).toBe(67)
    expect(f.totales.ingreso).toBe(200000)
    expect(f.totales.ingresoPorNoche).toBe(100000)
    expect(f.estadias[0].fecha).toBe('2026-07-11') // la más nueva primero
    expect(f.canales).toEqual([{ canal: 'Booking.com', noches: 2 }])
  })

  it('cuenta las noches sin dato, sucia y en mantenimiento', () => {
    const f = getFichaHabitacion('905', cajas, partes)!

    expect(f.totales.noches).toBe(1)
    expect(f.totales.sucia).toBe(1)
    expect(f.totales.mantenimiento).toBe(1)
    expect(f.totales.sinDato).toBe(0)
  })

  it('la habitación que ningún parte nombra queda como noche sin dato', () => {
    const f = getFichaHabitacion('401', cajas, partes)!

    expect(f.totales.noches).toBe(0)
    expect(f.totales.sinDato).toBe(3)   // las 3 noches medidas
    expect(f.totales.ingreso).toBe(0)
  })

  it('devuelve undefined si la habitación no existe en el hotel', () => {
    expect(getFichaHabitacion('9999', cajas, partes)).toBeUndefined()
  })
})
