import { describe, it, expect } from 'vitest'
import { getAnalisisTarifa, tipoDeNoche, FERIADOS } from '../../src/lib/analisisTarifa'
import { cuadraConTarifa, type TarifaPeriodo } from '../../src/lib/tarifas'
import type { CajaParte, CajaMovimiento, ParteHabitaciones } from '../../src/types'

// Tarifas de julio 2026 (las reales): 35.000 hasta el 17, 37.500 desde el 18.
const TARIFAS: TarifaPeriodo[] = [
  {
    desde: '2026-07-01', hasta: '2026-07-17',
    single: { lista: 60_000, efectivo: 54_000 },
    porPersona: { lista: 35_000, efectivo: 31_500 },
  },
  {
    desde: '2026-07-18', hasta: '2026-07-31',
    single: { lista: 60_000, efectivo: 54_000 },
    porPersona: { lista: 37_500, efectivo: 33_750 },
  },
]

// Parte del turno noche: `ocupadas` habitaciones con 2 personas cada una y el
// resto libres, sobre 53 vendibles. La 101 lleva la reserva 500 para los cobros.
function parteNoche(fecha: string, ocupadas: number, nroCaja = 1): ParteHabitaciones {
  const libres = 53 - ocupadas
  return {
    id: `p-${fecha}`, nroCaja, usuario: 'X',
    fechaCaja: `${fecha}T23:30:00.000Z`, turno: 'noche',
    ocupadas: [{ habitacion: '101', reserva: '500', plazas: 2, canal: 'Booking.com' }],
    libres: [], totalOcupadas: ocupadas, totalPlazas: ocupadas * 2, totalLibres: libres,
    sucias: 0, limpias: libres, mantenimiento: 0,
    importedBy: 'X', importedAt: `${fecha}T23:45:00.000Z`,
  }
}

function mov(p: Partial<CajaMovimiento>): CajaMovimiento {
  return {
    fechaHora: '2026-07-05T12:00:00.000Z', usuario: 'X', comp: '', habitacion: '', observacion: '',
    efectivo: 0, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 0, ...p,
  }
}

function mkCaja(ingresos: CajaMovimiento[]): CajaParte {
  return {
    id: 'c1', nroCaja: 1, puntoVenta: 'Recepcion', moneda: 'AR$',
    usuarioApertura: 'X', aperturaAt: '2026-07-05T07:00:00.000Z', cierreAt: '2026-07-05T15:00:00.000Z',
    aperturaMonto: 0, saldoFinal: 0, ingresos, egresos: [], retiros: [],
    importedBy: 'X', importedAt: '2026-07-05T15:30:00.000Z',
  }
}

describe('tipoDeNoche', () => {
  it('viernes y sábado comunes son finde; el domingo a la noche ya es semana', () => {
    expect(tipoDeNoche('2026-07-03')).toBe('finde')    // viernes
    expect(tipoDeNoche('2026-07-04')).toBe('finde')    // sábado
    expect(tipoDeNoche('2026-07-05')).toBe('semana')   // domingo
    expect(tipoDeNoche('2026-07-07')).toBe('semana')   // martes
  })

  it('el finde largo de agosto (sáb 15 a lun 17 feriado) marca las noches del vie 14 al dom 16', () => {
    expect(FERIADOS).toContain('2026-08-17')
    expect(tipoDeNoche('2026-08-14')).toBe('finde-largo')  // víspera: la noche de entrada
    expect(tipoDeNoche('2026-08-15')).toBe('finde-largo')
    expect(tipoDeNoche('2026-08-16')).toBe('finde-largo')
    expect(tipoDeNoche('2026-08-17')).toBe('semana')       // noche del check-out
  })

  it('un feriado suelto entre semana no arma finde largo', () => {
    expect(tipoDeNoche('2026-12-08')).toBe('semana')   // martes feriado aislado
  })
})

describe('cuadraConTarifa', () => {
  const periodo = TARIFAS[0]
  it('detecta lista, efectivo y fuera', () => {
    expect(cuadraConTarifa(70_000, 2, periodo)).toBe('lista')       // 1 noche × 2 × 35.000
    expect(cuadraConTarifa(126_000, 2, periodo)).toBe('efectivo')   // 2 noches × 2 × 31.500
    expect(cuadraConTarifa(80_000, 2, periodo)).toBeUndefined()
  })
})

describe('getAnalisisTarifa', () => {
  it('agrupa la ocupación por período de tarifa (el experimento de julio)', () => {
    const partes = [
      parteNoche('2026-07-06', 30),  // lunes, a 35.000
      parteNoche('2026-07-07', 32),  // martes, a 35.000
      parteNoche('2026-07-20', 51),  // lunes, a 37.500
      parteNoche('2026-07-21', 52),  // martes, a 37.500
    ]
    const a = getAnalisisTarifa([], partes, TARIFAS)
    expect(a.periodos).toHaveLength(2)
    expect(a.periodos[0].tarifaPorPersona).toBe(35_000)
    expect(a.periodos[0].total.ocupacionPromPct).toBe(59)   // (57+60)/2 redondeado
    expect(a.periodos[1].tarifaPorPersona).toBe(37_500)
    expect(a.periodos[1].total.ocupacionPromPct).toBe(97)
    expect(a.periodos[1].total.nochesLlenas).toBe(2)        // 51/53=96% y 52/53=98%
  })

  it('sugiere sobre el último período con datos, por tipo de noche', () => {
    // Semana llena al precio nuevo → subir fuerte.
    const partes = [
      parteNoche('2026-07-20', 51), parteNoche('2026-07-21', 52), parteNoche('2026-07-22', 53),
    ]
    const a = getAnalisisTarifa([], partes, TARIFAS)
    expect(a.referencia?.tarifaPorPersona).toBe(37_500)
    const semana = a.sugerencias.find(s => s.tipo === 'semana')
    expect(semana?.accion).toBe('subir-fuerte')
    expect(semana?.tarifaSugerida).toBe(42_000)   // 37.500 × 1,12 = 42.000
  })

  it('con ocupación floja no sugiere subir', () => {
    const partes = [
      parteNoche('2026-07-20', 20), parteNoche('2026-07-21', 25), parteNoche('2026-07-22', 22),
    ]
    const a = getAnalisisTarifa([], partes, TARIFAS)
    const semana = a.sugerencias.find(s => s.tipo === 'semana')
    expect(semana?.accion).toBe('no-subir')
    expect(semana?.tarifaSugerida).toBe(37_500)
  })

  it('clasifica los cobros en lista / efectivo / fuera', () => {
    const partes = [parteNoche('2026-07-05', 30)]
    const caja = mkCaja([
      mov({ reserva: '500', tarjetas: 70_000, total: 70_000 }),     // 1 noche lista (2 pax)
      mov({ reserva: '500', efectivo: 63_000, total: 63_000 }),     // 1 noche efectivo
      mov({ reserva: '500', efectivo: 80_000, total: 80_000 }),     // fuera
      mov({ reserva: '999', efectivo: 50_000, total: 50_000 }),     // sin parte → sin datos
    ])
    const a = getAnalisisTarifa([caja], partes, TARIFAS)
    expect(a.cobros.controlables).toBe(3)
    expect(a.cobros.aLista).toBe(1)
    expect(a.cobros.aEfectivo).toBe(1)
    expect(a.cobros.fuera).toBe(1)
    expect(a.cobros.sinDatos).toBe(1)
    expect(a.cobros.pctEfectivo).toBe(33)
  })

  it('el piso por persona sale del costo por hab-noche y la gente promedio', () => {
    // 2 personas por habitación → piso = 50.000 / 2 = 25.000.
    const partes = [parteNoche('2026-07-06', 30)]
    const a = getAnalisisTarifa([], partes, TARIFAS, { costoPorHabNoche: 50_000 })
    expect(a.pisoPorPersona).toBe(25_000)
  })

  it('avisa las noches sin tarifa cargada (agosto sin período)', () => {
    const partes = [parteNoche('2026-08-05', 30)]
    const a = getAnalisisTarifa([], partes, TARIFAS)
    expect(a.avisos.some(x => x.includes('sin tarifa'))).toBe(true)
    expect(a.periodos).toHaveLength(0)
  })
})
