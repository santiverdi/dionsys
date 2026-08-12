import { describe, it, expect } from 'vitest'
import { cotizarEstadia, cuadraConTarifarioPublico, diaSemana, infoDia } from '../../src/lib/tarifaDiaria'
import type { TarifarioPublico } from '../../src/lib/landing'

// El tarifario REAL 2026/2027 pasado por el dueño. Los casos de abajo son los
// ejemplos de su propio documento: si estas cuentas cambian, o cambió el
// tarifario o rompimos la fórmula.
function tarifario(): TarifarioPublico {
  const caras = { 1: 100000, 2: 60000, 3: 60000, 4: 60000, 5: 60000 }
  return {
    temporadas: [
      { nombre: 'Baja', desde: '2026-08-01', hasta: '2026-10-31', tarifas: { 1: 60000, 2: 35000, 3: 35000, 4: 35000, 5: 35000 }, tarifasCaras: null, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.2, minNoches: 1, sena: 0 },
      { nombre: 'Noviembre', desde: '2026-11-01', hasta: '2026-11-30', tarifas: { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 }, tarifasCaras: null, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 1, sena: 0 },
      { nombre: 'Diciembre', desde: '2026-12-01', hasta: '2026-12-31', tarifas: { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 }, tarifasCaras: caras, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 3, sena: 0.3 },
      { nombre: 'Enero temprano', desde: '2027-01-01', hasta: '2027-01-05', tarifas: { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 }, tarifasCaras: null, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 3, sena: 0.3 },
      { nombre: 'Alta', desde: '2027-01-06', hasta: '2027-02-15', tarifas: { 1: 80000, 2: 50000, 3: 50000, 4: 50000, 5: 50000 }, tarifasCaras: caras, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 3, sena: 0.3 },
      { nombre: 'Fin de temporada', desde: '2027-02-16', hasta: '2027-02-28', tarifas: { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 }, tarifasCaras: null, diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 1, sena: 0.3 },
    ],
    findesLargos: [
      { n: 'Diversidad Cultural', desde: '2026-10-09', hasta: '2026-10-11', recargo: 0.2 },
      { n: 'Soberanía Nacional', desde: '2026-11-20', hasta: '2026-11-22', recargo: 0.2 },
      { n: 'Inmaculada', desde: '2026-12-04', hasta: '2026-12-07', recargo: 0.5 },
      { n: 'Navidad', desde: '2026-12-24', hasta: '2026-12-26', recargo: 0.5 },
      { n: 'Año Nuevo', desde: '2026-12-31', hasta: '2027-01-02', recargo: 0.5 },
      { n: 'Carnaval', desde: '2027-02-05', hasta: '2027-02-08', recargo: 0.5 },
    ],
    bloqueadas: ['2026-08-15', '2026-08-16', '2026-08-17'],
    config: { tope_por_persona: 60000, cuotas: [3, 6], vigencia: { desde: '2026-08-01', hasta: '2027-02-28' } },
    promociones: [],
  }
}

describe('diaSemana', () => {
  it('coincide con getDay() de la landing, sin depender del huso', () => {
    expect(diaSemana('2026-09-07')).toBe(1)  // lunes
    expect(diaSemana('2026-09-11')).toBe(5)  // viernes
    expect(diaSemana('2026-12-25')).toBe(5)  // Navidad 2026 cae viernes
  })
})

describe('infoDia', () => {
  const t = tarifario()

  it('noche de semana en Baja: $35.000 con 20% en efectivo', () => {
    const i = infoDia('2026-09-08', 2, t)
    expect(i).toMatchObject({ precio: 35000, descEfectivo: 0.2, caro: false, temporada: 'Baja', findeLargo: null })
  })

  it('sábado en Baja: mismo precio pero el efectivo baja al 10%', () => {
    const i = infoDia('2026-09-12', 2, t)
    expect(i).toMatchObject({ precio: 35000, descEfectivo: 0.1, caro: true })
  })

  it('viernes de Navidad: la tarifa cara con +50% pega en el tope de $60.000', () => {
    // base finde $60.000 × 1.5 = $90.000 → tope $60.000
    const i = infoDia('2026-12-25', 2, t)
    expect(i).toMatchObject({ precio: 60000, findeLargo: 'Navidad', descEfectivo: 0.1 })
  })

  it('la single no tiene tope: viernes de Navidad vale $150.000 la habitación', () => {
    // single finde $100.000 × 1.5 — el tope es solo para 2 a 5 personas
    expect(infoDia('2026-12-25', 1, t).precio).toBe(150000)
  })

  it('jueves de Navidad (día barato): $40.000 + 50% = $60.000, efectivo al 10% por finde largo', () => {
    const i = infoDia('2026-12-24', 2, t)
    expect(i).toMatchObject({ precio: 60000, caro: false, findeLargo: 'Navidad', descEfectivo: 0.1 })
  })

  it('una fecha fuera de vigencia no tiene precio', () => {
    const i = infoDia('2027-03-15', 2, t)
    expect(i.precio).toBeNull()
    expect(i.enVigencia).toBe(false)
  })

  it('marca las fechas bloqueadas', () => {
    expect(infoDia('2026-08-15', 2, t).bloqueada).toBe(true)
  })
})

// Los ejemplos "2 personas" del documento del dueño, tal cual.
describe('cotizarEstadia — ejemplos del tarifario', () => {
  const t = tarifario()

  it('2 noches mitad de semana, septiembre: $140.000 / $112.000 efectivo', () => {
    const c = cotizarEstadia('2026-09-07', '2026-09-09', 2, t)  // lun y mar
    expect(c).toMatchObject({ noches: 2, total: 140000, efectivo: 112000, sena: 0 })
  })

  it('2 noches fin de semana, septiembre: $140.000 / $126.000 efectivo', () => {
    const c = cotizarEstadia('2026-09-11', '2026-09-13', 2, t)  // vie y sáb
    expect(c).toMatchObject({ noches: 2, total: 140000, efectivo: 126000 })
  })

  it('3 noches en enero (Alta, días de semana): $300.000 / $270.000 / seña $90.000', () => {
    const c = cotizarEstadia('2027-01-11', '2027-01-14', 2, t)  // lun a mié
    expect(c).toMatchObject({ noches: 3, total: 300000, efectivo: 270000, sena: 0.3, minNoches: 3 })
    expect(Math.round(c.total * c.sena)).toBe(90000)
  })

  it('3 noches en Navidad: $360.000 / $324.000 / seña $108.000 (el tope trabaja)', () => {
    const c = cotizarEstadia('2026-12-24', '2026-12-27', 2, t)
    expect(c).toMatchObject({ noches: 3, total: 360000, efectivo: 324000, sena: 0.3 })
    expect(c.findes).toEqual(['Navidad'])
    expect(Math.round(c.total * c.sena)).toBe(108000)
  })

  it('4 noches en Inmaculada: $480.000 / $432.000', () => {
    const c = cotizarEstadia('2026-12-04', '2026-12-08', 2, t)
    expect(c).toMatchObject({ noches: 4, total: 480000, efectivo: 432000 })
  })

  it('4 noches en Carnaval: $480.000 / $432.000', () => {
    const c = cotizarEstadia('2027-02-05', '2027-02-09', 2, t)
    expect(c).toMatchObject({ noches: 4, total: 480000, efectivo: 432000 })
    expect(c.findes).toEqual(['Carnaval'])
  })

  it('una estadía que pisa el 15 de agosto avisa la noche bloqueada', () => {
    const c = cotizarEstadia('2026-08-14', '2026-08-16', 2, t)
    expect(c.bloqueadas).toEqual(['2026-08-15'])
  })

  it('mezcla de descuentos: cuenta noches al 20% y al 10% por separado', () => {
    const c = cotizarEstadia('2026-09-10', '2026-09-13', 2, t)  // jue (20%) + vie y sáb (10%)
    expect(c.n20).toBe(1)
    expect(c.n10).toBe(2)
  })
})

// El cruce que usa el control de caja: ¿este cobro es lo que la web cotizó?
describe('cuadraConTarifarioPublico', () => {
  const t = tarifario()

  it('reconoce el pago al hacer el check out (las 3 noches de Navidad)', () => {
    const r = cuadraConTarifarioPublico(360_000, 2, '2026-12-27', t)
    expect(r).toMatchObject({ tipo: 'lista', noches: 3, llegada: '2026-12-24' })
  })

  it('reconoce el precio de efectivo', () => {
    expect(cuadraConTarifarioPublico(324_000, 2, '2026-12-27', t)?.tipo).toBe('efectivo')
  })

  it('reconoce el pago al llegar (estadía que empieza el día del cobro)', () => {
    // vie 11 + sáb 12 de sept × 2 pax × 35.000 = 140.000
    const r = cuadraConTarifarioPublico(140_000, 2, '2026-09-11', t)
    expect(r?.tipo).toBe('lista')
    expect(r?.noches).toBe(2)
  })

  it('un total que no es de ninguna estadía posible no cuadra', () => {
    expect(cuadraConTarifarioPublico(123_456, 2, '2026-09-11', t)).toBeUndefined()
  })

  it('más de 5 personas queda fuera del modelo de la landing', () => {
    expect(cuadraConTarifarioPublico(140_000, 6, '2026-09-11', t)).toBeUndefined()
  })

  it('una fecha fuera de la vigencia no cuadra con nada', () => {
    expect(cuadraConTarifarioPublico(140_000, 2, '2027-06-10', t)).toBeUndefined()
  })
})
