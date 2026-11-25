import { describe, it, expect } from 'vitest'
import {
  diferenciasPorDia, resumenFechas, revertirCambio, textoDiferencia, versionDe, type EntradaHistorial,
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
