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

// Carga existente para faltantesAntesDe: nro + cuándo se importó (día de junio 2026).
function carga(nroCaja: number, dia: number): { nroCaja: number; importedAt: string } {
  return { nroCaja, importedAt: `2026-06-${String(dia).padStart(2, '0')}T12:00:00.000Z` }
}

describe('faltantesAntesDe', () => {
  it('sin cajas cargadas no bloquea (primera carga histórica)', () => {
    expect(faltantesAntesDe(32, [])).toEqual([])
  })

  it('la caja consecutiva a la última cargada no deja hueco', () => {
    expect(faltantesAntesDe(31, [carga(29, 1), carga(30, 2)])).toEqual([])
  })

  it('saltear un número devuelve el faltante', () => {
    expect(faltantesAntesDe(32, [carga(29, 1), carga(30, 2)])).toEqual([31])
  })

  it('saltear varios números los devuelve todos', () => {
    expect(faltantesAntesDe(35, [carga(30, 1)])).toEqual([31, 32, 33, 34])
  })

  it('re-importar una caja existente o rellenar un hueco viejo siempre está permitido', () => {
    expect(faltantesAntesDe(32, [carga(28, 1), carga(30, 2), carga(32, 3)])).toEqual([]) // re-import de la última
    expect(faltantesAntesDe(31, [carga(30, 1), carga(32, 2)])).toEqual([])               // rellena el hueco
    expect(faltantesAntesDe(29, [carga(30, 1), carga(32, 2)])).toEqual([])               // caja vieja (va para atrás)
  })

  it('entiende la vuelta del contador: después de la 100 viene la 1', () => {
    expect(faltantesAntesDe(1, [carga(99, 1), carga(100, 2)])).toEqual([])      // consecutiva con vuelta
    expect(faltantesAntesDe(2, [carga(99, 1), carga(100, 2)])).toEqual([1])     // salteó la 1
    expect(faltantesAntesDe(3, [carga(99, 1)])).toEqual([100, 1, 2])            // salteó cruzando la vuelta
  })

  it('compara contra la ÚLTIMA carga aunque haya números más altos de un ciclo viejo', () => {
    // Ciclo viejo 99-100 (importado hace un mes) + ciclo nuevo hasta la 36 (hoy):
    // guardar la 38 tiene que reclamar la 37, no creerse que "rellena un hueco viejo".
    const existentes = [carga(99, 1), carga(100, 1), carga(35, 29), carga(36, 30)]
    expect(faltantesAntesDe(38, existentes)).toEqual([37])
    expect(faltantesAntesDe(37, existentes)).toEqual([])
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

  it('la caja 1 es consecutiva de la 100 (vuelta del contador) y concilia la plata', () => {
    const anterior = mkCaja({ nroCaja: 100, saldoFinal: 100 })
    const caja = mkCaja({ nroCaja: 1, aperturaMonto: 999 })
    const flags = getCajaFlags(caja, anterior)
    expect(flags.some(f => f.tipo === 'continuidad')).toBe(true) // compara montos, no marca falta_caja
    expect(flags.some(f => f.tipo === 'falta_caja')).toBe(false)
  })

  it('un salto cruzando la vuelta lista los números que faltan', () => {
    const flags = getCajaFlags(mkCaja({ nroCaja: 2 }), mkCaja({ nroCaja: 99 }))
    const falta = flags.find(f => f.tipo === 'falta_caja')
    expect(falta?.mensaje).toContain('Nº 100')
    expect(falta?.mensaje).toContain('Nº 1')
  })

  it('una "anterior" a más de media vuelta es de otro ciclo: no se concilia nada', () => {
    // Caja vieja 91 contra la nueva 36: distancia circular 55 → ni descuadre ni falta_caja.
    const flags = getCajaFlags(mkCaja({ nroCaja: 91, aperturaMonto: 999 }), mkCaja({ nroCaja: 36, saldoFinal: 5 }))
    expect(flags.some(f => f.tipo === 'continuidad' || f.tipo === 'falta_caja')).toBe(false)
  })
})
