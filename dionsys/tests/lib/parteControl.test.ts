import { describe, it, expect } from 'vitest'
import { parteAnteriorDe, getCheckouts, getEstadiasOcultas, getParteFlags, getCoberturaParte } from '../../src/lib/parteControl'
import { HABITACIONES, TOTAL_HABITACIONES } from '../../src/data/hotel'
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
    expect(co?.cobro?.porHabitacion).toBeUndefined() // match exacto por reserva
  })

  it('concilia por habitación cuando la reserva de la caja no coincide (caso 901)', () => {
    // La 905 se cobró pero la Observación de la caja trae OTRA reserva (497, no 408).
    // El cruce por reserva falla; el fallback por habitación lo rescata como probable.
    const cajas = [mkCaja(95, [mkCobro('497', '905', 227500)]), mkCaja(97, [])]
    const co = getCheckouts(p97, parteAnteriorDe(p97, todos), cajas).find(c => c.reserva === '408')
    expect(co?.cobro?.nroCaja).toBe(95)
    expect(co?.cobro?.monto).toBe(227500)
    expect(co?.cobro?.porHabitacion).toBe(true)
  })

  it('matchea habitaciones combinadas ("905/906" del cobro contra la 905 del parte)', () => {
    const cajas = [mkCaja(95, [mkCobro('497', '905/906', 227500)]), mkCaja(97, [])]
    const co = getCheckouts(p97, parteAnteriorDe(p97, todos), cajas).find(c => c.reserva === '408')
    expect(co?.cobro?.porHabitacion).toBe(true)
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

// El PMS debería listar TODAS las habitaciones del hotel, ocupadas o libres.
describe('getCoberturaParte (parte vs maestro de habitaciones)', () => {
  it('un parte completo no reporta faltantes ni desconocidas', () => {
    const activas = HABITACIONES.filter(h => h.activa).map(h => h.numero)
    const parte = mkParte(1, '2026-06-19T09:00:00.000Z',
      [[activas[0], '100']],
      activas.slice(1).map(n => [n, 'limpia'] as [string, EstadoHabitacion]),
    )
    expect(getCoberturaParte(parte)).toEqual({ faltantes: [], desconocidas: [] })
  })

  it('avisa las habitaciones que el parte no reportó', () => {
    const parte = mkParte(1, '2026-06-19T09:00:00.000Z', [['101', '100']])
    const { faltantes } = getCoberturaParte(parte)
    expect(faltantes).toHaveLength(TOTAL_HABITACIONES - 1)
    expect(faltantes).not.toContain('101')
    expect(faltantes).toContain('102')

    const flag = getParteFlags(parte).find(f => f.tipo === 'parte_incompleto')
    expect(flag?.level).toBe('warn')
    expect(flag?.mensaje).toContain('no reporta')
  })

  it('avisa los números que no existen en el hotel', () => {
    const parte = mkParte(1, '2026-06-19T09:00:00.000Z', [['999', '100']], [['106', 'limpia']])
    expect(getCoberturaParte(parte).desconocidas).toEqual(['106', '999'])

    const flag = getParteFlags(parte).find(f => f.tipo === 'hab_desconocida')
    expect(flag?.level).toBe('warn')
    expect(flag?.mensaje).toContain('999')
  })

  it('una habitación fuera de servicio no se exige, pero se acepta si el parte la trae', () => {
    // La 1102 existe pero no se vende: ni falta ni es desconocida.
    const activas = HABITACIONES.filter(h => h.activa).map(h => h.numero)
    const parte = mkParte(1, '2026-06-19T09:00:00.000Z',
      [[activas[0], '100']],
      [...activas.slice(1).map(n => [n, 'limpia'] as [string, EstadoHabitacion]), ['1102', 'mantenimiento']],
    )
    expect(getCoberturaParte(parte)).toEqual({ faltantes: [], desconocidas: [] })
    expect(HABITACIONES.some(h => h.numero === '1102' && !h.activa)).toBe(true)
  })
})
