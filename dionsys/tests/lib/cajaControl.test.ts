import { describe, it, expect } from 'vitest'
import { getCajaFlags, faltantesAntesDe, fmtFaltantes, getCajaResumen, ingresosNetos, ingresosNoEfectivo, descuadrePorNoEfectivo } from '../../src/lib/cajaControl'
import type { CajaParte, CajaMovimiento } from '../../src/types'

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '2026-07-12T00:49:00.000Z', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}

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

describe('ingresosNetos + getCajaResumen — anulación de pago', () => {
  // Caso real (caja 66): cobro tipeado $5.817.583 en vez de $58.175,83, anulado
  // al minuto por el PMS ("Egreso por anulación de pago") y vuelto a cargar bien.
  const caja = mkCaja({
    nroCaja: 66,
    ingresos: [
      mov({ observacion: 'Pago Reserva 678 / #305. C66.', efectivo: 63000, total: 63000 }),
      mov({ observacion: 'Pago Reserva 682 / #702. C66', efectivo: 5817583, total: 5817583 }), // mal tipeado
      mov({ observacion: 'Pago Reserva 682 / #702. C66', tarjetas: 58175.83, total: 58175.83 }), // el correcto
    ],
    egresos: [
      mov({ observacion: 'Egreso por anulación de pago en', efectivo: 5817583, total: 5817583 }),
    ],
  })

  it('descarta el cobro anulado (mismo monto que la anulación)', () => {
    const netos = ingresosNetos(caja)
    expect(netos).toHaveLength(2)
    expect(netos.some(m => m.total === 5817583)).toBe(false)
    expect(netos.some(m => m.total === 58175.83)).toBe(true) // el re-cargado queda
  })

  it('el resumen no cuenta el cobro anulado ni la anulación como retiro', () => {
    const r = getCajaResumen(caja)
    expect(r.totalCobrado).toBeCloseTo(63000 + 58175.83)
    expect(r.cantIngresos).toBe(2)
    expect(r.totalRetiros).toBe(0) // la anulación no es plata que salió
  })

  it('sin anulaciones devuelve los ingresos tal cual', () => {
    const simple = mkCaja({ nroCaja: 1, ingresos: [mov({ total: 1000 })], egresos: [mov({ observacion: 'verduleria', total: 200 })] })
    expect(ingresosNetos(simple)).toBe(simple.ingresos)
  })

  it('anulación sin cobro que matchee en la caja (anulación cruzada) no descarta nada', () => {
    const cruzada = mkCaja({ nroCaja: 2, ingresos: [mov({ total: 1000 })],
      egresos: [mov({ observacion: 'Egreso por anulación de pago en', total: 999999 })] })
    expect(ingresosNetos(cruzada)).toHaveLength(1)
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

// Caso real: caja 8 del 26/07/2026. Santiago dejó la caja 7 sin cerrar y Gastón
// abrió la 8 contando el cajón. Los $59.528,37 que "faltaban" eran justo lo que
// la 7 había cobrado con tarjeta: plata que el PMS suma al saldo pero que nunca
// estuvo en el cajón.
describe('descuadre de apertura por contar solo el efectivo', () => {
  // 7: abre 1.453.390,26 + cobra 1.030.028,37 (970.500 en efectivo) - retiro 1.600.000
  const c7 = mkCaja({
    nroCaja: 7,
    cierreAt: undefined,
    aperturaMonto: 1_453_390.26,
    saldoFinal: 883_418.63,
    ingresos: [
      mov({ efectivo: 970_500, total: 970_500 }),
      mov({ tarjetas: 59_528.37, total: 59_528.37 }),
    ],
    egresos: [mov({ observacion: 'RETIRO EFECTIVO', total: 1_600_000 })],
  })
  const c8 = mkCaja({ nroCaja: 8, aperturaMonto: 823_890.26, saldoFinal: 886_890.26 })

  it('ingresosNoEfectivo suma lo que no entró al cajón', () => {
    expect(ingresosNoEfectivo(c7)).toBeCloseTo(59_528.37, 2)
  })

  it('reconoce que la diferencia es exactamente lo cobrado sin efectivo', () => {
    expect(descuadrePorNoEfectivo(c8, c7)).toBe(true)
  })

  it('lo explica en el flag en vez de dejar un descuadre pelado', () => {
    const flag = getCajaFlags(c8, c7).find(f => f.tipo === 'continuidad')
    expect(flag?.level).toBe('error')
    expect(flag?.mensaje).toContain('tarjeta o transferencia')
    expect(flag?.mensaje).toContain('No es plata que falte')
    expect(flag?.mensaje).toContain('quedó sin cerrar')
  })

  it('un descuadre que NO cuadra con el no-efectivo queda como estaba', () => {
    const otra = mkCaja({ nroCaja: 8, aperturaMonto: 800_000 })
    expect(descuadrePorNoEfectivo(otra, c7)).toBe(false)
    const flag = getCajaFlags(otra, c7).find(f => f.tipo === 'continuidad')
    expect(flag?.mensaje).toContain('no coincide')
    expect(flag?.mensaje).not.toContain('No es plata que falte')
  })

  it('si la caja anterior cobró todo en efectivo, no aplica la explicación', () => {
    const soloEfectivo = mkCaja({ nroCaja: 7, saldoFinal: 100_000, ingresos: [mov({ efectivo: 5_000, total: 5_000 })] })
    const sig = mkCaja({ nroCaja: 8, aperturaMonto: 95_000 })
    expect(descuadrePorNoEfectivo(sig, soloEfectivo)).toBe(false)
  })
})
