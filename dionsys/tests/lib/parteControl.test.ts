import { describe, it, expect } from 'vitest'
import { parteAnteriorDe, getCheckouts, getEstadiasOcultas, getParteFlags } from '../../src/lib/parteControl'
import type { ParteHabitaciones, CajaParte, CajaMovimiento, EstadoHabitacion } from '../../src/types'

// Helpers mínimos para armar partes/cajas de prueba.
function mkParte(
  nroCaja: number,
  fechaCaja: string,
  reservas: Array<[string, string]>,
  libres: Array<[string, EstadoHabitacion]> = [],
): ParteHabitaciones {
  return {
    id: `p${nroCaja}`,
    nroCaja,
    usuario: 'X',
    fechaCaja,
    ocupadas: reservas.map(([habitacion, reserva]) => ({ habitacion, reserva, plazas: 2, canal: 'Walk In' })),
    libres: libres.map(([habitacion, estado]) => ({ habitacion, estado })),
    totalOcupadas: reservas.length,
    totalPlazas: reservas.length * 2,
    totalLibres: libres.length,
    sucias: libres.filter(l => l[1] === 'sucia').length,
    limpias: libres.filter(l => l[1] === 'limpia').length,
    mantenimiento: libres.filter(l => l[1] === 'mantenimiento').length,
    importedBy: 'X',
    importedAt: '2026-06-19T12:00:00.000Z',
  }
}

function mkCobro(reserva: string, habitacion: string, total: number): CajaMovimiento {
  return { fechaHora: '', usuario: 'X', comp: '', habitacion, observacion: `Reserva ${reserva}`, efectivo: total, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total, reserva }
}
function mkCaja(nroCaja: number, ingresos: CajaMovimiento[]): CajaParte {
  return { id: `c${nroCaja}`, nroCaja, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'X', aperturaAt: '', aperturaMonto: 0, saldoFinal: 0, ingresos, egresos: [], retiros: [], importedBy: 'X', importedAt: '' }
}

describe('parteAnteriorDe (ordena por nroCaja, robusto a fechaCaja vacía)', () => {
  // El parte 97 tiene fechaCaja VACÍA (lectura por IA): ordenar por fecha no
  // encontraba anterior. Por nroCaja, su anterior es el 96.
  const p95 = mkParte(95, '2026-06-18T09:53:00.000Z', [['905', '408'], ['102', '298']])
  const p96 = mkParte(96, '2026-06-18T12:05:00.000Z', [['905', '408'], ['102', '298'], ['401', '487']])
  const p97 = mkParte(97, '', [['101', '522'], ['102', '298'], ['401', '487']]) // 408 (hab 905) se fue
  const todos = [p97, p95, p96]

  it('encuentra el parte anterior aunque fechaCaja esté vacía', () => {
    expect(parteAnteriorDe(p97, todos)?.nroCaja).toBe(96)
    expect(parteAnteriorDe(p96, todos)?.nroCaja).toBe(95)
    expect(parteAnteriorDe(p95, todos)).toBeUndefined()
  })

  it('detecta el check-out de la reserva que se fue, con su cobro', () => {
    const cajas = [mkCaja(95, [mkCobro('408', '905', 227500)]), mkCaja(97, [])]
    const checkouts = getCheckouts(p97, parteAnteriorDe(p97, todos), cajas)
    const co = checkouts.find(c => c.reserva === '408')
    expect(co).toBeDefined()
    expect(co?.habitaciones).toEqual(['905'])
    expect(co?.cobro?.nroCaja).toBe(95)
    expect(co?.cobro?.monto).toBe(227500)
  })
})

describe('getEstadiasOcultas (estadía corta delatada por el cambio de limpieza)', () => {
  // Caso real: la 1001 figura LIBRE siempre, pero pasa de limpia (96) a sucia
  // (97) → alguien la usó y se fue dentro del turno de Gastón.
  const prev = mkParte(96, '', [['102', '298']], [['1001', 'limpia'], ['1002', 'sucia']])
  const actual = mkParte(97, '', [['102', '298']], [['1001', 'sucia'], ['1002', 'sucia']])

  it('marca la habitación que pasó a sucia sin haber estado ocupada', () => {
    expect(getEstadiasOcultas(actual, prev)).toEqual(['1001'])
  })

  it('no marca una que ya venía sucia (sin uso nuevo)', () => {
    expect(getEstadiasOcultas(actual, prev)).not.toContain('1002')
  })

  it('no marca un check-out normal (estaba ocupada y ahora sucia → ya se concilia por reserva)', () => {
    const ocupadaAntes = mkParte(96, '', [['305', '528']], [['1001', 'limpia']])
    const ahoraSucia = mkParte(97, '', [], [['305', 'sucia'], ['1001', 'limpia']])
    expect(getEstadiasOcultas(ahoraSucia, ocupadaAntes)).toEqual([])
  })

  it('genera un flag de nivel warn con la habitación', () => {
    const flag = getParteFlags(actual, prev).find(f => f.tipo === 'estadia_oculta')
    expect(flag?.level).toBe('warn')
    expect(flag?.mensaje).toContain('1001')
  })
})
