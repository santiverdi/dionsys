import { describe, it, expect } from 'vitest'
import { cotizarEstadia, cuadraConTarifarioPublico } from '../../src/lib/tarifaDiaria'
import { armarMensaje } from '../../src/components/CotizacionMensaje'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import ajustesReales from '../fixtures/tarifas_dia_2026_2027.json'

// Promo de temporada 2026/2027: 5+ noches la más barata a mitad (primera noche
// del 1/12 al 28/2), 7+ noches la más barata gratis (primera noche del 1/1 al 28/2).
//
// Precios REALES: la tabla de ajustes por día de producción ('dionsys_tarifas_dia',
// con precio por persona, single, 10% en efectivo y mínimo de noches en todas
// las noches de dic a feb). Por persona: dic $48.000 (vie/sáb $53.000),
// Inmaculada 4-7/12 $56.000, 24/12 $54.000; enero $80.000 (vie $84.000, sáb $88.000).
const esp = especialesConAjustes(ajustesReales as AjustesTarifa)

// Solo hace falta la vigencia y la seña: el precio de cada noche sale de los ajustes.
function tarifario(): TarifarioPublico {
  const tarifas = { 1: 80000, 2: 40000, 3: 40000, 4: 40000, 5: 40000 }
  const temp = (nombre: string, desde: string, hasta: string) => ({
    nombre, desde, hasta, tarifas, tarifasCaras: null, diasCaros: [5, 6],
    efectivoCaro: 0.1, efectivoBarato: 0.1, minNoches: 1, sena: 0.3,
  })
  return {
    temporadas: [temp('Noviembre', '2026-11-01', '2026-11-30'), temp('Verano', '2026-12-01', '2027-02-28')],
    findesLargos: [{ n: 'Inmaculada', desde: '2026-12-04', hasta: '2026-12-07', recargo: 0.5 }],
    bloqueadas: [],
    config: { tope_por_persona: 60000, cuotas: [3, 6], vigencia: { desde: '2026-11-01', hasta: '2027-02-28' } },
    promociones: [],
  }
}

const t = tarifario()
const cotizar = (llegada: string, salida: string, pax = 2) => cotizarEstadia(llegada, salida, pax, t, esp, [])
const mensaje = (llegada: string, salida: string, pax = 2) =>
  armarMensaje(llegada, salida, pax, cotizar(llegada, salida, pax), t.config.cuotas)

describe('promo de temporada — cotizarEstadia', () => {
  it('4 noches: sin promo', () => {
    const c = cotizar('2027-01-11', '2027-01-15')   // lun a jue, $160.000 la noche
    expect(c.promo).toBeNull()
    expect(c).toMatchObject({ total: 640_000, efectivo: 576_000, minNoches: 3 })
  })

  it('5 noches: la más barata a mitad de precio', () => {
    const c = cotizar('2027-01-10', '2027-01-15')   // dom a jue, todas a $160.000
    expect(c.promo).toEqual({ tipo: 'mitad', total: 800_000 - 80_000 })
  })

  it('5 noches en diciembre (14/12 al 19/12): la más barata es de $96.000, no la del vie 18', () => {
    const c = cotizar('2026-12-14', '2026-12-19')
    expect(c.total).toBe(4 * 96_000 + 106_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 490_000 - 48_000 })
    expect(c.minNoches).toBe(1)
  })

  it('6 noches: la más barata a mitad, aunque la última sea un viernes más caro', () => {
    const c = cotizar('2027-01-10', '2027-01-16')   // dom a vie; el vie vale $168.000
    expect(c.total).toBe(968_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 968_000 - 80_000 })
  })

  it('7 noches en enero: la más barata gratis, no el sábado', () => {
    const c = cotizar('2027-01-10', '2027-01-17')   // dom a sáb; el sáb vale $176.000
    expect(c.total).toBe(1_144_000)
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_144_000 - 160_000 })
  })

  it('10 noches en enero: una sola noche gratis, la más barata', () => {
    const c = cotizar('2027-01-10', '2027-01-20')
    expect(c.total).toBe(1_624_000)
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_624_000 - 160_000 })
  })

  it('7 noches en diciembre: la más barata a mitad, no gratis', () => {
    const c = cotizar('2026-12-14', '2026-12-21')   // la más barata: $96.000
    expect(c.total).toBe(692_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 692_000 - 48_000 })
  })

  it('cuenta la primera noche: 7 noches del 26/12 al 2/1 llevan la de diciembre', () => {
    const c = cotizar('2026-12-26', '2027-01-02')   // la más barata es el 27/12 a $55.000
    expect(c.total).toBe(112_000 + 110_000 + 3 * 118_000 + 140_000 + 168_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 884_000 - 55_000 })
  })

  it('Inmaculada: 5 noches del 03/12 al 08/12 sí llevan la promo (la más barata, 03/12 a $48.000)', () => {
    const c = cotizar('2026-12-03', '2026-12-08')
    expect(c.total).toBe(96_000 + 4 * 112_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 544_000 - 48_000 })
    expect(c.efectivo).toBe(489_600)   // el 10% en efectivo, para comparar
    expect(c.minNoches).toBe(2)
  })

  it('Navidad: la más barata no es el 24/12 ($54.000) sino las de $48.000', () => {
    const c = cotizar('2026-12-20', '2026-12-25')
    expect(c.promo).toEqual({ tipo: 'mitad', total: 4 * 96_000 + 108_000 - 48_000 })
  })

  it('antes del 1/12 no hay promo', () => {
    expect(cotizar('2026-11-24', '2026-11-30').promo).toBeNull()
  })

  it('nunca se suma con el efectivo: el efectivo sigue siendo el 10% sobre la lista', () => {
    const c = cotizar('2027-01-10', '2027-01-17')
    expect(c.efectivo).toBe(Math.round(1_144_000 * 0.9))
    expect(c.promo?.total).toBe(984_000)
  })

  it('la single descuenta la habitación más barata', () => {
    const c = cotizar('2027-01-10', '2027-01-17', 1)   // 5 × 135.000 + 168.000 + 176.000
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_019_000 - 135_000 })
  })
})

describe('promo de temporada — mensaje del conserje', () => {
  it('sin promo, el mensaje sigue igual', () => {
    const m = mensaje('2027-01-11', '2027-01-15')
    expect(m).toContain('🏦 Transferencia: *$640.000*')
    expect(m).toContain('💵 En efectivo: *$576.000*')
    expect(m).not.toContain('🎁')
  })

  it('7 noches en enero (10/01 al 17/01): solo la 🎁, la promo sale más barata que el efectivo', () => {
    const m = mensaje('2027-01-10', '2027-01-17')   // promo $984.000, efectivo $1.029.600
    expect(m).toContain('🎁 Promo 7 noches: la noche más barata gratis → *$984.000* (transferencia o efectivo)')
    expect(m).not.toContain('💵')
    expect(m).not.toContain('No son acumulables')
    expect(m).not.toContain('🏦')
  })

  it('5 noches en diciembre (14/12 al 19/12): el efectivo sale más barato, van las dos', () => {
    const m = mensaje('2026-12-14', '2026-12-19')   // promo $442.000, efectivo $441.000
    expect(m).toContain('🎁 Promo 5 noches: la noche más barata a mitad de precio → *$442.000*')
    expect(m).toContain('💵 En efectivo: *$441.000*')
    expect(m).toContain('No son acumulables: se aplica el que más te convenga.')
  })

  it('nunca muestra la promo con el 10% de efectivo encima', () => {
    expect(mensaje('2027-01-10', '2027-01-17')).not.toContain('$885.600')   // 984.000 × 0,9
  })

  it('si el efectivo da igual que la promo, una sola línea', () => {
    const m = mensaje('2027-01-10', '2027-01-15')   // promo y efectivo: $720.000
    expect(m).toContain('🎁 Promo 5 noches: la noche más barata a mitad de precio → *$720.000*')
    expect(m).not.toContain('💵')
    expect(m).not.toContain('No son acumulables')
  })

  it('Inmaculada (03/12 al 08/12): promo $496.000 y efectivo $489.600, van las dos', () => {
    const m = mensaje('2026-12-03', '2026-12-08')
    expect(m).toContain('🎁 Promo 5 noches: la noche más barata a mitad de precio → *$496.000*')
    expect(m).toContain('💵 En efectivo: *$489.600*')
  })

  it('solo si el efectivo sale más barato que la promo se muestran las dos', () => {
    const m = mensaje('2027-01-10', '2027-01-16')   // promo $888.000, efectivo $871.200
    expect(m).toContain('→ *$888.000*')
    expect(m).toContain('💵 En efectivo: *$871.200*')
    expect(m).toContain('No son acumulables: se aplica el que más te convenga.')
  })

  it('la seña sale del total con la promo; las cuotas, del de lista', () => {
    const m = mensaje('2027-01-10', '2027-01-17')
    expect(m).toContain('seña del 30% ($295.200)')       // 30% de 984.000
    expect(m).toContain('3 cuotas de $381.333')          // 1.144.000 / 3
  })
})

describe('promo de temporada — control de caja', () => {
  it('un cobro con el total de la promo se reconoce como promo, no como error', () => {
    // 7 noches de diciembre con la más barata a mitad: 644.000 no es ninguna estadía de lista.
    const r = cuadraConTarifarioPublico(644_000, 2, '2026-12-21', t, esp)
    expect(r).toMatchObject({ tipo: 'promo', promo: 'mitad', noches: 7, llegada: '2026-12-14' })
  })

  it('con la noche más barata gratis el total suele ser una estadía de lista más corta: igual cuadra', () => {
    // 10 noches con una de $160.000 gratis = las 9 noches del 11 al 19 a precio de lista.
    expect(cuadraConTarifarioPublico(1_464_000, 2, '2027-01-20', t, esp)?.tipo).toBe('lista')
  })
})
