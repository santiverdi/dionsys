import { describe, it, expect } from 'vitest'
import {
  diferenciasPorDia, resumenFechas, revertirCambio, textoDiferencia, versionDe, type EntradaHistorial,
  versionesDeAjustes, versionesAlCobrar, cambiosDeLaNoche, textoCambioNoche,
} from '../../src/lib/historialTarifas'

const entrada = (over: Partial<EntradaHistorial>): EntradaHistorial => ({
  id: 1, creado_en: '2026-11-25T12:00:00Z', autor_id: 'u1', autor_nombre: 'Santi',
  clave: 'dionsys_tarifas_dia', fechas: null, valor_anterior: null, valor_nuevo: null,
  motivo: null, revierte_id: null, ...over,
})

describe('diferenciasPorDia', () => {
  it('lista las noches que cambiaron, en orden', () => {
    const d = diferenciasPorDia(
      { '2026-12-02': { porPersona: 42000 }, '2026-12-01': { porPersona: 42000 } },
      { '2026-12-02': { porPersona: 45000 }, '2026-12-01': { porPersona: 42000 }, '2026-12-03': { minNoches: 2 } },
    )
    expect(d.map(x => x.fecha)).toEqual(['2026-12-02', '2026-12-03'])
    expect(textoDiferencia(d[0])).toBe('02/12: pp 42k → 45k')
    expect(textoDiferencia(d[1])).toBe('03/12: mín — → 2')
  })
})

describe('revertir un cambio puntual (precios por día)', () => {
  const e = entrada({
    valor_anterior: { '2026-12-01': { porPersona: 42000, single: 78000 }, '2026-12-02': { porPersona: 42000, single: 78000 } },
    valor_nuevo: { '2026-12-01': { porPersona: 45000, single: 80000 }, '2026-12-02': { porPersona: 42000, single: 78000 }, '2026-12-03': { minNoches: 2 } },
  })

  it('vuelve solo esas noches y deja intacto lo que se cambió después en otras', () => {
    const actual = {
      '2026-12-01': { porPersona: 45000, single: 80000 },
      '2026-12-02': { porPersona: 42000, single: 78000 },
      '2026-12-03': { minNoches: 2 },
      '2026-12-20': { porPersona: 50000, single: 90000 },   // cambio posterior, otra noche
    }
    const r = revertirCambio(actual, e)!
    expect(r.valor).toEqual({
      '2026-12-01': { porPersona: 42000, single: 78000 },
      '2026-12-02': { porPersona: 42000, single: 78000 },
      '2026-12-20': { porPersona: 50000, single: 90000 },
    })
    expect(r.pisa).toEqual([])
  })

  it('avisa qué noches se volvieron a cambiar después (las va a pisar)', () => {
    const actual = { '2026-12-01': { porPersona: 47000, single: 85000 }, '2026-12-03': { minNoches: 2 } }
    expect(revertirCambio(actual, e)!.pisa).toEqual(['2026-12-01'])
  })

  it('el orden de los campos (la base lo reordena) no cuenta como cambio posterior', () => {
    const actual = { '2026-12-01': { single: 80000, porPersona: 45000 }, '2026-12-03': { minNoches: 2 } }
    expect(revertirCambio(actual, e)!.pisa).toEqual([])
  })

  it('no modifica el objeto actual', () => {
    const actual = { '2026-12-01': { porPersona: 45000, single: 80000 } }
    revertirCambio(actual, e)
    expect(actual).toEqual({ '2026-12-01': { porPersona: 45000, single: 80000 } })
  })
})

describe('revertir otras claves', () => {
  it('promo anticipada: vuelve la foto anterior', () => {
    const e = entrada({ clave: 'dionsys_promo_anticipada', valor_anterior: { activo: true, porcentaje: 0.15 }, valor_nuevo: { activo: true, porcentaje: 0.2 } })
    expect(revertirCambio({ activo: true, porcentaje: 0.2 }, e)).toEqual({ valor: { activo: true, porcentaje: 0.15 }, pisa: [] })
  })
  it('la primera lista de estadías mínimas se deshace a lista vacía', () => {
    const e = entrada({ clave: 'dionsys_estadias_minimas', valor_anterior: null, valor_nuevo: [{ id: 'a' }] })
    expect(revertirCambio([{ id: 'a' }], e)!.valor).toEqual([])
  })
  it('promo sin versión anterior: no hay a qué volver', () => {
    expect(revertirCambio({}, entrada({ clave: 'dionsys_promo_anticipada', valor_anterior: null, valor_nuevo: {} }))).toBeNull()
  })
})

describe('volver a una versión', () => {
  it('es la foto completa de después de ese cambio', () => {
    const v = { '2026-12-01': { porPersona: 45000 } }
    expect(versionDe(entrada({ valor_nuevo: v }))).toEqual(v)
  })
})

describe('resumenFechas', () => {
  it('agrupa tramos seguidos, también cruzando de mes', () => {
    expect(resumenFechas(['2026-12-31', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-08', '2027-01-01']))
      .toBe('01/12 al 03/12, 08/12, 31/12 al 01/01')
  })
})

describe('versiones de los precios por día', () => {
  const v = versionesDeAjustes({ a: 1 }, [
    { creado_en: '2026-12-09T12:00:00Z', valor_nuevo: { c: 3 } },
    { creado_en: '2026-12-05T12:00:00Z', valor_nuevo: { b: 2 } },
  ])

  it('arma la base y una versión por cambio, en orden, cada una con su "hasta"', () => {
    expect(v.map(x => [x.desde, x.hasta])).toEqual([
      ['', '2026-12-05T12:00:00Z'],
      ['2026-12-05T12:00:00Z', '2026-12-09T12:00:00Z'],
      ['2026-12-09T12:00:00Z', null],
    ])
  })

  it('al cobrar valen la vigente y las anteriores, nunca las posteriores', () => {
    expect(versionesAlCobrar('2026-12-08T10:00:00Z', v).map(x => x.ajustes)).toEqual([{ b: 2 }, { a: 1 }])
    expect(versionesAlCobrar('2026-12-01T10:00:00Z', v).map(x => x.ajustes)).toEqual([{ a: 1 }])
    // Un cambio hecho minutos después del cobro cuenta como ya marcado.
    expect(versionesAlCobrar('2026-12-09T11:50:00Z', v)[0].ajustes).toEqual({ c: 3 })
  })
})

describe('registro de una noche', () => {
  const e1 = entrada({ id: 1, valor_anterior: {}, valor_nuevo: { '2026-12-08': { porPersona: 50000, single: 90000 } } })
  const e2 = entrada({
    id: 2, motivo: 'Guardado con avisos',
    valor_anterior: { '2026-12-08': { porPersona: 50000, single: 90000 } },
    valor_nuevo: { '2026-12-08': { porPersona: 45000, single: 90000 }, '2026-12-09': { minNoches: 2 } },
  })
  // Toca solo otra noche: no figura en el registro del 08/12.
  const e3 = entrada({
    id: 3,
    valor_anterior: { '2026-12-08': { porPersona: 45000, single: 90000 } },
    valor_nuevo: { '2026-12-08': { porPersona: 45000, single: 90000 }, '2026-12-10': { minNoches: 3 } },
  })
  const e4 = entrada({ id: 4, revierte_id: 2, valor_anterior: e2.valor_nuevo, valor_nuevo: e1.valor_nuevo })

  it('lista todos los cambios de esa fecha, del más nuevo al más viejo', () => {
    const c = cambiosDeLaNoche('2026-12-08', [e1, e3, e2, e4])
    expect(c.map(x => x.id)).toEqual([4, 2, 1])
    expect(textoCambioNoche(c[0].antes, c[0].despues)).toBe('pp 45k → 50k')
    expect(textoCambioNoche(c[1].antes, c[1].despues)).toBe('pp 50k → 45k')
    expect(c[2].antes).toBeNull()
    expect(c[1].motivo).toBe('Guardado con avisos')
  })

  it('una noche que nunca se cambió no tiene registro', () => {
    expect(cambiosDeLaNoche('2026-12-20', [e1, e2, e3, e4])).toEqual([])
  })
})
