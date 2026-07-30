import { describe, it, expect } from 'vitest'
import { parseParteItems, type PdfTextItem } from '../../src/lib/parsePartePdf'
import { getCoberturaParte, getParteFlags } from '../../src/lib/parteControl'
import { TOTAL_HABITACIONES } from '../../src/data/hotel'
import fixture from '../fixtures/parte_caja95.json'

// Parte real (Caja 95) que el parser leía MAL: el bloque de totales cae en las
// mismas filas visuales que las últimas habitaciones libres, así:
//     304@53   Limpia@232      Limpia@291   23@539
//     ↑hab     ↑libre real     ↑totales     ↑nº del total
// Descartar todo estado con "algún número a la derecha" se comía la libre real.
// Se perdían 3 habitaciones (302, 303 y 304) sin ningún aviso.
const ITEMS = fixture as PdfTextItem[]

describe('parseParteItems · totales pegados a las libres (regresión)', () => {
  const parte = parseParteItems(ITEMS, 'Test')

  it('lee TODAS las habitaciones libres que declara el PDF', () => {
    expect(parte.totalLibres).toBe(49)
    expect(parte.libres).toHaveLength(49)
    expect(parte.totalOcupadas).toBe(5)
    expect(parte.ocupadas).toHaveLength(5)
  })

  it('no pierde las habitaciones cuya fila choca con el bloque de totales', () => {
    const libres = parte.libres.map(l => l.habitacion)
    expect(libres).toContain('302')
    expect(libres).toContain('303')
    expect(libres).toContain('304')
  })

  it('los estados suman el total de libres (no se cuela el bloque de totales)', () => {
    expect(parte.sucias + parte.limpias + parte.mantenimiento).toBe(parte.libres.length)
    expect({ sucias: parte.sucias, limpias: parte.limpias, mantenimiento: parte.mantenimiento })
      .toEqual({ sucias: 25, limpias: 23, mantenimiento: 1 })
  })

  it('cubre el hotel entero y no dispara ninguna alerta de lectura', () => {
    expect(parte.ocupadas.length + parte.libres.length).toBe(TOTAL_HABITACIONES + 1) // +1 = la 1102 fuera de servicio
    expect(getCoberturaParte(parte)).toEqual({ faltantes: [], desconocidas: [] })
    expect(getParteFlags(parte).some(f => f.tipo === 'parte_mal_leido')).toBe(false)
  })

  it('si el parte quedó corto, lo avisa como error (red de seguridad)', () => {
    const corto = { ...parte, libres: parte.libres.slice(0, -3) }
    const flag = getParteFlags(corto).find(f => f.tipo === 'parte_mal_leido')
    expect(flag?.level).toBe('error')
    expect(flag?.mensaje).toContain('dice 49, se leyeron 46')
  })
})
