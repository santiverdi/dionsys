import { describe, it, expect } from 'vitest'
import { diaSemana } from '../../src/lib/tarifaDiaria'
import {
  TARIFAS_ESPECIALES, minNochesEspecialDe, precioEspecialDe, tarifaEspecialDe, type AjustesTarifa,
} from '../../src/lib/tarifasEspeciales'
import ajustesReales from '../fixtures/tarifas_dia_2026_2027.json'

// La tabla de ajustes por día que el admin cargó en producción (app_state,
// key 'dionsys_tarifas_dia', del 01/12/2026 al 28/02/2027). TARIFAS_ESPECIALES
// tiene que dar lo MISMO noche a noche: es lo que cotiza un equipo que todavía
// no bajó los ajustes de la nube. Si cambian los precios en producción, hay que
// actualizar el fixture y TARIFAS_ESPECIALES juntos.
const AJUSTES = ajustesReales as AjustesTarifa

describe('TARIFAS_ESPECIALES contra los ajustes por día de producción', () => {
  it('el fixture cubre todas las noches del 01/12 al 28/02', () => {
    expect(Object.keys(AJUSTES)).toHaveLength(90)
  })

  it('mismo precio por persona, single, 10% en efectivo y mínimo de noches en cada noche', () => {
    const distintas: string[] = []
    for (const [fecha, a] of Object.entries(AJUSTES)) {
      const esp = tarifaEspecialDe(fecha, TARIFAS_ESPECIALES)
      const dia = diaSemana(fecha)
      const codigo = esp && {
        porPersona: precioEspecialDe(esp, dia, 2),
        single: precioEspecialDe(esp, dia, 1),
        descEfectivo: esp.descuentoEfectivo ?? 0,
        minNoches: minNochesEspecialDe(fecha, TARIFAS_ESPECIALES),
      }
      const real = { porPersona: a.porPersona, single: a.single, descEfectivo: a.descEfectivo ?? 0, minNoches: a.minNoches }
      if (JSON.stringify(codigo) !== JSON.stringify(real)) {
        distintas.push(`${fecha}: código ${JSON.stringify(codigo)} ≠ producción ${JSON.stringify(real)}`)
      }
    }
    expect(distintas).toEqual([])
  })

  it('conserva las etiquetas del calendario', () => {
    expect(tarifaEspecialDe('2026-12-05')?.etiqueta).toBe('Inmaculada')
    expect(tarifaEspecialDe('2026-12-24')?.etiqueta).toBe('Navidad')
    expect(tarifaEspecialDe('2026-12-26')?.etiqueta).toBe('Navidad')
    expect(tarifaEspecialDe('2026-12-31')?.etiqueta).toBe('Año Nuevo')
    expect(tarifaEspecialDe('2027-01-12')?.etiqueta).toBeUndefined()
  })
})
