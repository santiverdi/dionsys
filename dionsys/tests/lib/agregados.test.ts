import { describe, it, expect } from 'vitest'
import { cotizarEstadia } from '../../src/lib/tarifaDiaria'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import { PROMOS_INICIALES, type Promo } from '../../src/lib/promos'
import {
  cotizarAgregados, errorDeAgregado, margenDe, margenPct, nuevoAgregado, seOfrece, validarAgregados, type Agregado,
} from '../../src/lib/agregados'
import { armarMensaje } from '../../src/components/CotizacionMensaje'
import tarifarioProd from '../fixtures/produccion_2026-11-25/tarifario_publico.json'
import ajustesProd from '../fixtures/produccion_2026-11-25/tarifas_dia.json'

// Agregados de pensión (etapa 2, fase 3), con la foto de producción del 25/11.

const t = tarifarioProd as unknown as TarifarioPublico
const esp = especialesConAjustes(ajustesProd as AjustesTarifa)
const CUOTAS = t.config.cuotas

const MP: Agregado = {
  id: 'mp', nombre: 'Media pensión', detalle: 'cena con bebida', precioPorPersona: 25_000, costoPorPersona: 15_000,
  desde: '2026-12-01', hasta: '2027-02-28', activo: true, admitePromos: false,
}
const PC: Agregado = { ...MP, id: 'pc', nombre: 'Pensión completa', detalle: '', precioPorPersona: 45_000, costoPorPersona: 30_000 }

function cotizar(llegada: string, salida: string, pax: number, elegidos: Agregado[], promos: readonly Promo[] = PROMOS_INICIALES, hoy = '2026-12-30') {
  const c = cotizarEstadia(llegada, salida, pax, t, esp, [], { promos, hoy })
  const ag = cotizarAgregados(elegidos, { llegada, salida, pax, tarifario: t, especiales: esp, promos, hoy, cotizacion: c })
  return { c, ag, mensaje: armarMensaje(llegada, salida, pax, c, CUOTAS, ag) }
}

describe('agregados en la cotización', () => {
  it('3 noches en enero, 2 personas, media pensión sin promos: $150.000 aparte', () => {
    const { c, ag, mensaje } = cotizar('2027-01-10', '2027-01-13', 2, [MP])
    expect(c.total).toBe(480_000)
    expect(c.promo).toBeNull()
    expect(ag).toEqual([{
      id: 'mp', nombre: 'Media pensión', detalle: 'cena con bebida', pax: 2, noches: 3, porPersona: 25_000,
      lista: 150_000, conPromo: 150_000, efectivo: 150_000,
    }])
    expect(mensaje).toContain([
      '🏦 Transferencia: *$480.000*',
      '💵 En efectivo: *$432.000*',
      '',
      '🍽️ Media pensión (cena con bebida): 2 personas × 3 noches → *$150.000*',
      '💰 Total con media pensión: *$630.000* (transferencia) · *$582.000* en efectivo',
      '💳 Sin interés con Banco Provincia: 4 cuotas de $157.500 o 6 cuotas de $105.000',
    ].join('\n'))
    // Seña sobre alojamiento + agregado: 30% de $630.000.
    expect(mensaje).toContain('Para reservar se abona una seña del 30% ($189.000).')
  })

  it('sin agregados elegidos el mensaje es el de siempre', () => {
    const c = cotizarEstadia('2027-01-10', '2027-01-13', 2, t, esp, [], { promos: PROMOS_INICIALES, hoy: '2026-12-30' })
    expect(cotizar('2027-01-10', '2027-01-13', 2, []).mensaje).toBe(armarMensaje('2027-01-10', '2027-01-13', 2, c, CUOTAS))
  })

  it('dos agregados: una línea cada uno y el total con los dos', () => {
    const { mensaje } = cotizar('2027-01-10', '2027-01-13', 2, [MP, PC])
    expect(mensaje).toContain('🍽️ Pensión completa: 2 personas × 3 noches → *$270.000*')
    expect(mensaje).toContain('💰 Total con media pensión y pensión completa: *$900.000* (transferencia)')
  })

  it('single: 1 persona', () => {
    const { ag } = cotizar('2027-01-10', '2027-01-13', 1, [MP])
    expect(ag[0]).toMatchObject({ pax: 1, lista: 75_000 })
  })

  it('con promo y SIN "admite promos": la promo no toca al agregado', () => {
    // 7 noches en febrero: última gratis en el alojamiento, la pensión entera.
    const { c, ag, mensaje } = cotizar('2027-02-20', '2027-02-27', 2, [MP])
    expect(c.promo?.tipo).toBe('gratis')
    expect(ag[0]).toMatchObject({ lista: 350_000, conPromo: 350_000 })
    expect(mensaje).toContain(`💰 Total con media pensión: *$${(c.promo!.total + 350_000).toLocaleString('es-AR')}* (transferencia o efectivo)`)
    expect(mensaje).toContain(`seña del 30% ($${Math.round((c.promo!.total + 350_000) * 0.3).toLocaleString('es-AR')})`)
  })

  it('con "admite promos": la última noche gratis también en la pensión, y el efectivo', () => {
    const { ag, mensaje } = cotizar('2027-02-20', '2027-02-27', 2, [{ ...MP, admitePromos: true }])
    expect(ag[0]).toMatchObject({ lista: 350_000, conPromo: 300_000, efectivo: 315_000 })
    expect(mensaje).toContain('🍽️ Media pensión (cena con bebida): 2 personas × 7 noches → ~$350.000~ → *$300.000*')
  })

  it('las cuotas van sobre la lista de alojamiento + agregado, sin promo', () => {
    const { c, mensaje } = cotizar('2027-02-20', '2027-02-27', 2, [{ ...MP, admitePromos: true }])
    expect(mensaje).toContain(`4 cuotas de $${Math.round((c.total + 350_000) / 4).toLocaleString('es-AR')}`)
  })

  it('solo cuenta las noches en que se ofrece', () => {
    const { ag } = cotizar('2027-01-10', '2027-01-13', 2, [{ ...MP, desde: '2027-01-12' }])
    expect(ag[0]).toMatchObject({ noches: 1, lista: 50_000 })
  })

  it('fuera de las fechas o pausado: no se ofrece', () => {
    expect(seOfrece({ ...MP, hasta: '2027-01-09' }, '2027-01-10', '2027-01-13')).toBe(false)
    expect(seOfrece({ ...MP, activo: false }, '2027-01-10', '2027-01-13')).toBe(false)
    expect(seOfrece(MP, '2027-01-10', '2027-01-13')).toBe(true)
    expect(cotizar('2027-01-10', '2027-01-13', 2, [{ ...MP, activo: false }]).ag).toEqual([])
  })
})

describe('margen', () => {
  it('precio − costo, en $ y %', () => {
    expect(margenDe(MP)).toBe(10_000)
    expect(margenPct(MP)).toBeCloseTo(0.4)
    expect(margenPct({ ...MP, precioPorPersona: 0 })).toBe(0)
  })
})

describe('validación', () => {
  it('uno nuevo arranca pausado y sin precio: hay que completarlo', () => {
    const a = nuevoAgregado('Media pensión', '2026-11-25', '2027-02-28')
    expect(a).toMatchObject({ nombre: 'Media pensión', activo: false, admitePromos: false, desde: '2026-11-25', hasta: '2027-02-28' })
    expect(errorDeAgregado(a)).toMatch(/precio/)
    expect(errorDeAgregado({ ...a, precioPorPersona: 25_000 })).toBeNull()
  })

  it('rechaza lo mal cargado', () => {
    expect(errorDeAgregado({ ...MP, nombre: '' })).toMatch(/nombre/)
    expect(errorDeAgregado({ ...MP, costoPorPersona: -1 })).toMatch(/costo/)
    expect(errorDeAgregado({ ...MP, hasta: '2026-01-01' })).toMatch(/fechas/)
  })

  it('validarAgregados descarta los mal formados', () => {
    expect(validarAgregados([MP, { basura: 1 }])).toEqual([MP])
    expect(validarAgregados(null)).toEqual([])
  })
})
