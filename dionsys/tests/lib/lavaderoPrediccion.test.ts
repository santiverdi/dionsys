import { describe, it, expect } from 'vitest'
import {
  partesPorNoche, driversDelPeriodo, retiradasDelPeriodo,
  calibrarRatios, compararPeriodo, desviosRelevantes,
} from '../../src/lib/lavaderoPrediccion'
import type { ParteHabitaciones, LavaderoMovimiento } from '../../src/types'

function mkParte(dia: string, ocupadas: Array<[string, string, number]>, turno: 'noche' | 'manana' = 'noche'): ParteHabitaciones {
  return {
    id: `p${dia}${turno}`, nroCaja: 1, usuario: 'X', fechaCaja: `${dia}T23:00:00.000Z`, turno,
    ocupadas: ocupadas.map(([habitacion, reserva, plazas]) => ({ habitacion, reserva, plazas, canal: 'Walk In' })),
    libres: [], totalOcupadas: ocupadas.length, totalPlazas: 0, totalLibres: 0,
    sucias: 0, limpias: 0, mantenimiento: 0, importedBy: 'X', importedAt: `${dia}T23:30:00.000Z`,
  }
}

function mkRemito(fecha: string, prendas: Array<[string, number]>, tipo: LavaderoMovimiento['tipo'] = 'envio_sucia'): LavaderoMovimiento {
  return {
    id: `m${fecha}${tipo}`, fecha, tipo,
    prendas: prendas.map(([prenda, cantidad]) => ({ prenda, cantidad })),
    createdBy: 'X', createdAt: `${fecha}T10:00:00.000Z`,
  }
}

describe('partesPorNoche', () => {
  it('toma solo el turno noche, uno por día, el de más ocupadas', () => {
    const partes = [
      mkParte('2026-07-01', [['101', 'A', 2]], 'manana'),
      mkParte('2026-07-01', [['101', 'A', 2], ['102', 'B', 3]]),
      mkParte('2026-07-01', [['101', 'A', 2]]),
      mkParte('2026-07-02', [['201', 'C', 2]]),
    ]
    const m = partesPorNoche(partes)
    expect([...m.keys()].sort()).toEqual(['2026-07-01', '2026-07-02'])
    expect(m.get('2026-07-01')!.ocupadas).toHaveLength(2)
  })
})

describe('driversDelPeriodo', () => {
  const partes = [
    mkParte('2026-07-01', [['101', 'A', 2], ['102', 'B', 3]]),
    mkParte('2026-07-02', [['101', 'A', 2]]),                    // salió B
    mkParte('2026-07-03', [['101', 'A', 2], ['103', 'C', 4]]),
  ]

  it('acumula noches-habitación y noches-plaza', () => {
    const d = driversDelPeriodo('2026-07-01', '2026-07-03', partes)
    expect(d.nochesHabitacion).toBe(5)   // 2 + 1 + 2
    expect(d.nochesPlaza).toBe(13)       // 5 + 2 + 6
    expect(d.dias).toBe(3)
    expect(d.nochesConParte).toBe(3)
    expect(d.coberturaPct).toBe(100)
  })

  it('cuenta las salidas por reserva que desaparece', () => {
    expect(driversDelPeriodo('2026-07-01', '2026-07-03', partes).salidas).toBe(1)
  })

  it('avisa la cobertura cuando faltan noches', () => {
    const d = driversDelPeriodo('2026-07-01', '2026-07-10', partes)
    expect(d.dias).toBe(10)
    expect(d.nochesConParte).toBe(3)
    expect(d.coberturaPct).toBe(30)
  })
})

describe('retiradasDelPeriodo', () => {
  const movs = [
    mkRemito('2026-07-02', [['Sábanas grandes (SG)', 10], ['Sábanas chicas (SCH)', 5], ['Fundas', 8]]),
    mkRemito('2026-07-05', [['Sábanas', 6]]),
    mkRemito('2026-07-05', [['Fundas', 99]], 'recibo_limpia'),   // vuelve limpia: no cuenta
    mkRemito('2026-07-20', [['Fundas', 40]]),                     // fuera del período
  ]

  it('suma solo los retiros del período y agrupa SG+SCH en sábanas', () => {
    const r = retiradasDelPeriodo('2026-07-01', '2026-07-10', movs)
    expect(r.get('sábanas')).toBe(21)   // 10 + 5 + 6
    expect(r.get('fundas')).toBe(8)     // el recibo_limpia no suma
  })
})

describe('calibrarRatios', () => {
  it('calibra sobre el SOLAPAMIENTO entre partes y remitos', () => {
    // Partes de 3 días, remitos solo el último: si calibrara sobre los 3 días
    // el ratio quedaría diluido (10/6) en vez del real (10/2).
    const partes = [
      mkParte('2026-07-01', [['101', 'A', 2], ['102', 'B', 2]]),
      mkParte('2026-07-02', [['101', 'A', 2], ['102', 'B', 2]]),
      mkParte('2026-07-03', [['101', 'A', 2], ['102', 'B', 2]]),
    ]
    const movs = [mkRemito('2026-07-03', [['Fundas', 10]])]
    const cal = calibrarRatios(movs, partes)
    expect(cal.desde).toBe('2026-07-03')
    expect(cal.hasta).toBe('2026-07-03')
    expect(cal.nochesHabitacion).toBe(2)
    expect(cal.ratios.find(r => r.prenda === 'fundas')!.porNocheHab).toBe(5)
  })

  it('sin partes o sin remitos no calibra nada', () => {
    expect(calibrarRatios([], [mkParte('2026-07-01', [['101', 'A', 2]])]).ratios).toEqual([])
    expect(calibrarRatios([mkRemito('2026-07-01', [['Fundas', 5]])], []).ratios).toEqual([])
  })
})

describe('compararPeriodo', () => {
  // Ratio normal: 2 fundas por noche-habitación.
  const partes = [
    mkParte('2026-07-01', [['101', 'A', 2], ['102', 'B', 2]]),
    mkParte('2026-07-02', [['101', 'A', 2], ['102', 'B', 2]]),
  ]
  const ratios = [{ prenda: 'fundas', porNocheHab: 2 }]

  it('compara lo retirado contra lo que justifica la ocupación', () => {
    const movs = [mkRemito('2026-07-02', [['Fundas', 20]])]   // esperadas 4 noches-hab × 2 = 8
    const p = compararPeriodo('2026-07-01', '2026-07-02', movs, partes, ratios)
    const f = p.prendas.find(x => x.prenda === 'fundas')!
    expect(f.esperadas).toBe(8)
    expect(f.retiradas).toBe(20)
    expect(f.diff).toBe(12)
    expect(f.desvioPct).toBe(150)
    expect(p.confiable).toBe(true)
  })

  it('marca NO confiable el período con muchas noches sin parte', () => {
    const p = compararPeriodo('2026-07-01', '2026-07-31', [], partes, ratios)
    expect(p.confiable).toBe(false)
    expect(desviosRelevantes(p)).toEqual([])   // sin datos no se acusa a nadie
  })

  it('lista las prendas de los remitos que nunca tuvieron ratio', () => {
    const movs = [mkRemito('2026-07-01', [['Tapices', 14]])]
    expect(compararPeriodo('2026-07-01', '2026-07-02', movs, partes, ratios).sinRatio).toEqual(['tapices'])
  })
})

describe('desviosRelevantes', () => {
  const partes = [mkParte('2026-07-01', [['101', 'A', 2], ['102', 'B', 2]])]

  it('ignora los desvíos chicos', () => {
    const movs = [mkRemito('2026-07-01', [['Fundas', 104]])]   // esperadas 100 → +4%
    const p = compararPeriodo('2026-07-01', '2026-07-01', movs, partes, [{ prenda: 'fundas', porNocheHab: 50 }])
    expect(desviosRelevantes(p)).toEqual([])
  })

  it('ignora los porcentajes enormes sobre cantidades chicas', () => {
    // Caso real "Tapices": 14 unidades en un solo remito daban +133% y no
    // significaba nada.
    const movs = [mkRemito('2026-07-01', [['Tapices', 14]])]
    const p = compararPeriodo('2026-07-01', '2026-07-01', movs, partes, [{ prenda: 'tapices', porNocheHab: 3 }])
    expect(p.prendas.find(x => x.prenda === 'tapices')!.desvioPct).toBe(133)
    expect(desviosRelevantes(p)).toEqual([])
  })

  it('marca el desvío grande con volumen real', () => {
    const movs = [mkRemito('2026-07-01', [['Fundas', 150]])]   // esperadas 100 → +50%
    const p = compararPeriodo('2026-07-01', '2026-07-01', movs, partes, [{ prenda: 'fundas', porNocheHab: 50 }])
    expect(desviosRelevantes(p).map(d => d.prenda)).toEqual(['fundas'])
  })
})
