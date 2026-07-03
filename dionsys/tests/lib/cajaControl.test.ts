import { describe, it, expect } from 'vitest'
import { getCajaFlags, faltantesAntesDe, fmtFaltantes } from '../../src/lib/cajaControl'
import type { CajaParte } from '../../src/types'

function mkCaja(p: Partial<CajaParte>): CajaParte {
  return {
    id: `c${p.nroCaja}`, nroCaja: p.nroCaja ?? 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-06-20T07:00:00.000Z', cierreAt: '2026-06-20T15:00:00.000Z',
    aperturaMonto: 0, saldoFinal: 0, ingresos: [], egresos: [], retiros: [],
    importedBy: 'X', importedAt: '2026-06-20T15:30:00.000Z', ...p,
  }
}

describe('faltantesAntesDe', () => {
  it('sin cajas cargadas no bloquea (primera carga histórica)', () => {
    expect(faltantesAntesDe(32, [])).toEqual([])
  })

  it('la caja consecutiva no deja hueco', () => {
    expect(faltantesAntesDe(31, [29, 30])).toEqual([])
  })

  it('saltear un número devuelve el faltante', () => {
    expect(faltantesAntesDe(32, [29, 30])).toEqual([31])
  })

  it('saltear varios números los devuelve todos', () => {
    expect(faltantesAntesDe(35, [30])).toEqual([31, 32, 33, 34])
  })

  it('re-importar una caja existente o rellenar un hueco viejo siempre está permitido', () => {
    expect(faltantesAntesDe(30, [28, 30, 32])).toEqual([]) // re-import
    expect(faltantesAntesDe(31, [30, 32])).toEqual([])     // rellena el hueco
    expect(faltantesAntesDe(29, [30, 32])).toEqual([])     // caja vieja
  })
})

describe('fmtFaltantes', () => {
  it('lista pocos números y resume cuando son muchos', () => {
    expect(fmtFaltantes([31])).toBe('Nº 31')
    expect(fmtFaltantes([31, 32])).toBe('Nº 31, Nº 32')
    expect(fmtFaltantes([31, 32, 33, 34, 35])).toBe('5 cajas (Nº 31 a Nº 35)')
  })
})

describe('getCajaFlags — numeración y continuidad', () => {
  it('con la anterior consecutiva y montos que no cierran marca descuadre de continuidad', () => {
    const anterior = mkCaja({ nroCaja: 30, saldoFinal: 100 })
    const caja = mkCaja({ nroCaja: 31, aperturaMonto: 999 })
    const flags = getCajaFlags(caja, anterior)
    expect(flags.some(f => f.tipo === 'continuidad' && f.level === 'error')).toBe(true)
    expect(flags.some(f => f.tipo === 'falta_caja')).toBe(false)
  })

  it('con la anterior consecutiva y montos que cierran no marca nada de continuidad', () => {
    const anterior = mkCaja({ nroCaja: 30, saldoFinal: 100 })
    const caja = mkCaja({ nroCaja: 31, aperturaMonto: 100 })
    const flags = getCajaFlags(caja, anterior)
    expect(flags.some(f => f.tipo === 'continuidad')).toBe(false)
  })

  it('con un hueco en el medio marca falta_caja y NO el descuadre falso', () => {
    // Falta la 31: comparar la apertura de la 32 contra el cierre de la 30 daría
    // un descuadre confuso; el diagnóstico correcto es "falta la caja 31".
    const anterior = mkCaja({ nroCaja: 30, saldoFinal: 100 })
    const caja = mkCaja({ nroCaja: 32, aperturaMonto: 999 })
    const flags = getCajaFlags(caja, anterior)
    const falta = flags.find(f => f.tipo === 'falta_caja')
    expect(falta?.level).toBe('error')
    expect(falta?.mensaje).toContain('Nº 31')
    expect(flags.some(f => f.tipo === 'continuidad')).toBe(false)
  })

  it('sin caja anterior no marca numeración ni continuidad', () => {
    const flags = getCajaFlags(mkCaja({ nroCaja: 32, aperturaMonto: 999 }))
    expect(flags.some(f => f.tipo === 'continuidad' || f.tipo === 'falta_caja')).toBe(false)
  })
})
