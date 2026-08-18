import { describe, it, expect } from 'vitest'
import { pct, resumirEventos } from '../../src/lib/metricasLanding'
import type { EventoDiario } from '../../src/lib/landing'

function ev(p: Partial<EventoDiario>): EventoDiario {
  return { dia: '2026-08-17', tipo: 'visita', fuente: 'directo', dispositivo: 'movil', cantidad: 1, ...p }
}

describe('resumirEventos', () => {
  it('arma el embudo sumando cada tipo', () => {
    const m = resumirEventos([
      ev({ tipo: 'visita', cantidad: 100 }),
      ev({ tipo: 'visita', cantidad: 50, dia: '2026-08-18' }),
      ev({ tipo: 'cotizo', cantidad: 30 }),
      ev({ tipo: 'reservar', cantidad: 8 }),
      ev({ tipo: 'wa_directo', cantidad: 5 }),
    ])
    expect(m).toMatchObject({ visitas: 150, cotizaron: 30, reservaron: 8, waDirecto: 5 })
  })

  it('la serie diaria queda ordenada por fecha con visitas y leads', () => {
    const m = resumirEventos([
      ev({ dia: '2026-08-18', tipo: 'visita', cantidad: 20 }),
      ev({ dia: '2026-08-17', tipo: 'visita', cantidad: 10 }),
      ev({ dia: '2026-08-17', tipo: 'reservar', cantidad: 2 }),
    ])
    expect(m.porDia).toEqual([
      { dia: '2026-08-17', visitas: 10, leads: 2 },
      { dia: '2026-08-18', visitas: 20, leads: 0 },
    ])
  })

  it('las fuentes suman visitas y leads por separado, la más visitada primero', () => {
    const m = resumirEventos([
      ev({ fuente: 'instagram', tipo: 'visita', cantidad: 80 }),
      ev({ fuente: 'instagram', tipo: 'reservar', cantidad: 4 }),
      ev({ fuente: 'directo', tipo: 'visita', cantidad: 120 }),
      // un cotizo no cuenta ni como visita ni como lead en la tabla de fuentes
      ev({ fuente: 'instagram', tipo: 'cotizo', cantidad: 10 }),
    ])
    expect(m.fuentes).toEqual([
      { fuente: 'directo', visitas: 120, leads: 0 },
      { fuente: 'instagram', visitas: 80, leads: 4 },
    ])
  })

  it('los dispositivos cuentan solo visitas', () => {
    const m = resumirEventos([
      ev({ dispositivo: 'movil', tipo: 'visita', cantidad: 70 }),
      ev({ dispositivo: 'escritorio', tipo: 'visita', cantidad: 30 }),
      ev({ dispositivo: 'movil', tipo: 'reservar', cantidad: 3 }),
    ])
    expect(m.dispositivos).toEqual([
      { dispositivo: 'movil', visitas: 70 },
      { dispositivo: 'escritorio', visitas: 30 },
    ])
  })

  it('sin eventos devuelve todo en cero', () => {
    expect(resumirEventos([])).toMatchObject({ visitas: 0, cotizaron: 0, reservaron: 0, waDirecto: 0, porDia: [], fuentes: [] })
  })
})

describe('pct', () => {
  it('redondea los grandes y da un decimal en los chicos', () => {
    expect(pct(30, 150)).toBe('20%')
    expect(pct(8, 150)).toBe('5,3%')
    expect(pct(3, 100)).toBe('3%')
    expect(pct(5, 0)).toBe('—')
  })
})
