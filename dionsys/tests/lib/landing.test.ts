import { describe, it, expect } from 'vitest'
import {
  diaSiguiente, expandirRango, fechaValida, normalizarTarifario, ordenarLeads,
  validarTarifario, type Lead, type TarifarioPublico,
} from '../../src/lib/landing'

// Tarifario mínimo VÁLIDO con la forma real de tarifario_publico.data.
function base(): TarifarioPublico {
  return {
    temporadas: [
      {
        nombre: 'Baja', desde: '2026-08-01', hasta: '2026-10-31',
        tarifas: { 1: 60000, 2: 35000, 3: 35000, 4: 35000, 5: 35000 }, tarifasCaras: null,
        diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.2, minNoches: 1, sena: 0,
      },
      {
        nombre: 'Verano', desde: '2026-11-01', hasta: '2027-02-28',
        tarifas: { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 },
        tarifasCaras: { 1: 100000, 2: 60000, 3: 60000, 4: 60000, 5: 60000 },
        diasCaros: [5, 6], efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 3, sena: 0.3,
      },
    ],
    findesLargos: [{ n: 'Carnaval', desde: '2027-02-05', hasta: '2027-02-08', recargo: 0.2 }],
    bloqueadas: ['2026-08-15', '2026-08-16'],
    config: { tope_por_persona: 60000, cuotas: [3, 6], vigencia: { desde: '2026-08-01', hasta: '2027-02-28' } },
    promociones: [{ titulo: 'Fin de semana', diaInicio: 5, noches: 2, nota: '' }],
  }
}

describe('fechas', () => {
  it('valida el formato y que el día exista de verdad', () => {
    expect(fechaValida('2026-08-15')).toBe(true)
    expect(fechaValida('2026-02-30')).toBe(false)  // febrero no tiene 30
    expect(fechaValida('15/08/2026')).toBe(false)
    expect(fechaValida('')).toBe(false)
  })

  it('el día siguiente cruza el fin de año', () => {
    expect(diaSiguiente('2026-12-31')).toBe('2027-01-01')
  })

  it('expande un rango inclusive y rechaza rangos rotos', () => {
    expect(expandirRango('2026-08-15', '2026-08-17')).toEqual(['2026-08-15', '2026-08-16', '2026-08-17'])
    expect(expandirRango('2026-08-15', '2026-08-15')).toEqual(['2026-08-15'])
    expect(expandirRango('2026-08-17', '2026-08-15')).toEqual([])
    expect(expandirRango('mala', '2026-08-15')).toEqual([])
  })
})

describe('validarTarifario', () => {
  it('un tarifario completo y bien cerrado no tiene problemas', () => {
    expect(validarTarifario(base())).toEqual([])
  })

  it('detecta temporadas superpuestas, con nombre y apellido', () => {
    const t = base()
    t.temporadas[1].desde = '2026-10-15'
    const errores = validarTarifario(t)
    expect(errores.some(e => e.includes('"Baja"') && e.includes('"Verano"') && e.includes('superponen'))).toBe(true)
  })

  it('detecta huecos dentro de la vigencia: esos días se cobrarían mal', () => {
    const t = base()
    t.temporadas[1].desde = '2026-11-05'  // 1 al 4 de noviembre sin temporada
    const errores = validarTarifario(t)
    expect(errores.some(e => e.includes('2026-11-01') && e.includes('2026-11-04'))).toBe(true)
  })

  it('detecta el hueco al final de la vigencia', () => {
    const t = base()
    t.temporadas[1].hasta = '2027-02-20'
    const errores = validarTarifario(t)
    expect(errores.some(e => e.includes('2027-02-21') && e.includes('2027-02-28'))).toBe(true)
  })

  it('un precio en cero no se puede publicar', () => {
    const t = base()
    t.temporadas[0].tarifas[3] = 0
    expect(validarTarifario(t).some(e => e.includes('"Baja"') && e.includes('precio'))).toBe(true)
  })

  it('la vigencia invertida es un error', () => {
    const t = base()
    t.config.vigencia = { desde: '2027-02-28', hasta: '2026-08-01' }
    expect(validarTarifario(t).some(e => e.startsWith('Vigencia'))).toBe(true)
  })

  it('una fecha bloqueada con formato roto se avisa', () => {
    const t = base()
    t.bloqueadas.push('15/08/2026')
    expect(validarTarifario(t).some(e => e.includes('15/08/2026'))).toBe(true)
  })

  it('sin temporadas no hay nada que publicar', () => {
    const t = base()
    t.temporadas = []
    expect(validarTarifario(t).length).toBeGreaterThan(0)
  })
})

describe('normalizarTarifario', () => {
  it('ordena temporadas por fecha y deduplica las bloqueadas', () => {
    const t = base()
    t.temporadas.reverse()
    t.bloqueadas = ['2026-08-16', '2026-08-15', '2026-08-16']
    const n = normalizarTarifario(t)
    expect(n.temporadas.map(x => x.nombre)).toEqual(['Baja', 'Verano'])
    expect(n.bloqueadas).toEqual(['2026-08-15', '2026-08-16'])
  })
})

describe('ordenarLeads', () => {
  it('la consulta más nueva queda primera', () => {
    const leads: Lead[] = [
      { id: 1, created_at: '2026-08-01T10:00:00Z', nombre: 'Ana', telefono: '223', fecha_in: '', fecha_out: '', noches: 1, personas: 2, camas: '', total: 1, fue_a_wa: true },
      { id: 2, created_at: '2026-08-09T10:00:00Z', nombre: 'Beto', telefono: '223', fecha_in: '', fecha_out: '', noches: 1, personas: 2, camas: '', total: 1, fue_a_wa: false },
    ]
    expect(ordenarLeads(leads).map(l => l.nombre)).toEqual(['Beto', 'Ana'])
  })
})
