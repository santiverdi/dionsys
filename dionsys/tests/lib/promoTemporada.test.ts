import { describe, it, expect } from 'vitest'
import {
  cotizarEstadia, cuadraConTarifarioPublico, hoyBuenosAires, validarPromoAnticipada, type PromoAnticipada,
} from '../../src/lib/tarifaDiaria'
import { armarMensaje } from '../../src/components/CotizacionMensaje'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import ajustesReales from '../fixtures/tarifas_dia_2026_2027.json'

// Promo de temporada 2026/2027: 5+ noches la ÚLTIMA a mitad (primera noche
// del 1/12 al 28/2), 7+ noches la ÚLTIMA gratis (primera noche del 1/1 al 28/2).
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

  it('5 noches: la última a mitad de precio', () => {
    const c = cotizar('2027-01-10', '2027-01-15')   // dom a jue, todas a $160.000
    expect(c.promo).toEqual({ tipo: 'mitad', total: 800_000 - 80_000 })
  })

  it('5 noches que terminan en sábado (12/01 al 17/01): la mitad cae en el sábado, no en la más barata', () => {
    const c = cotizar('2027-01-12', '2027-01-17')   // mar a jue $160.000, vie $168.000, sáb $176.000
    expect(c.total).toBe(824_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 824_000 - 88_000 })
  })

  it('5 noches en diciembre (14/12 al 19/12): la última es el vie 18 a $106.000', () => {
    const c = cotizar('2026-12-14', '2026-12-19')
    expect(c.total).toBe(4 * 96_000 + 106_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 490_000 - 53_000 })
    expect(c.minNoches).toBe(1)
  })

  it('6 noches: la última (vie, $168.000) a mitad', () => {
    const c = cotizar('2027-01-10', '2027-01-16')
    expect(c.total).toBe(968_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 968_000 - 84_000 })
  })

  it('7 noches en enero: la última (sáb, $176.000) gratis', () => {
    const c = cotizar('2027-01-10', '2027-01-17')
    expect(c.total).toBe(1_144_000)
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_144_000 - 176_000 })
  })

  it('10 noches en enero: una sola noche gratis, la última', () => {
    const c = cotizar('2027-01-10', '2027-01-20')   // la última es el mar 19 a $160.000
    expect(c.total).toBe(1_624_000)
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_624_000 - 160_000 })
  })

  it('7 noches en diciembre: la última a mitad, no gratis', () => {
    const c = cotizar('2026-12-14', '2026-12-21')   // la última, dom 20/12: $96.000
    expect(c.total).toBe(692_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 692_000 - 48_000 })
  })

  it('cuenta la primera noche: 7 noches del 26/12 al 2/1 llevan la de diciembre', () => {
    const c = cotizar('2026-12-26', '2027-01-02')   // la última es el 1/1 a $168.000
    expect(c.total).toBe(112_000 + 110_000 + 3 * 118_000 + 140_000 + 168_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 884_000 - 84_000 })
  })

  it('Inmaculada: 5 noches del 03/12 al 08/12, la última (7/12, $112.000) a mitad', () => {
    const c = cotizar('2026-12-03', '2026-12-08')
    expect(c.total).toBe(96_000 + 4 * 112_000)
    expect(c.promo).toEqual({ tipo: 'mitad', total: 544_000 - 56_000 })
    expect(c.efectivo).toBe(489_600)   // el 10% en efectivo, para comparar
    expect(c.minNoches).toBe(2)
  })

  it('Navidad (20/12 al 25/12): la última es el 24/12 a $108.000', () => {
    const c = cotizar('2026-12-20', '2026-12-25')
    expect(c.promo).toEqual({ tipo: 'mitad', total: 4 * 96_000 + 108_000 - 54_000 })
  })

  it('antes del 1/12 no hay promo', () => {
    expect(cotizar('2026-11-24', '2026-11-30').promo).toBeNull()
  })

  it('nunca se suma con el efectivo: el efectivo sigue siendo el 10% sobre la lista', () => {
    const c = cotizar('2027-01-10', '2027-01-17')
    expect(c.efectivo).toBe(Math.round(1_144_000 * 0.9))
    expect(c.promo?.total).toBe(968_000)
  })

  it('la single descuenta la última habitación', () => {
    const c = cotizar('2027-01-10', '2027-01-17', 1)   // 5 × 135.000 + 168.000 + 176.000
    expect(c.promo).toEqual({ tipo: 'gratis', total: 1_019_000 - 176_000 })
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
    const m = mensaje('2027-01-10', '2027-01-17')   // promo $968.000, efectivo $1.029.600
    expect(m).toContain('🎁 Promo 7 noches: la última noche gratis → *$968.000* (transferencia o efectivo)')
    expect(m).not.toContain('💵')
    expect(m).not.toContain('No son acumulables')
    expect(m).not.toContain('🏦')
  })

  it('5 noches en diciembre (14/12 al 19/12): promo $437.000 más barata que el efectivo $441.000, una sola línea', () => {
    const m = mensaje('2026-12-14', '2026-12-19')
    expect(m).toContain('🎁 Promo 5 noches: la última noche a mitad de precio → *$437.000*')
    expect(m).not.toContain('💵')
  })

  it('nunca muestra la promo con el 10% de efectivo encima', () => {
    expect(mensaje('2027-01-10', '2027-01-17')).not.toContain('$871.200')   // 968.000 × 0,9
  })

  it('si el efectivo da igual que la promo, una sola línea', () => {
    const m = mensaje('2027-01-10', '2027-01-15')   // promo y efectivo: $720.000
    expect(m).toContain('🎁 Promo 5 noches: la última noche a mitad de precio → *$720.000*')
    expect(m).not.toContain('💵')
    expect(m).not.toContain('No son acumulables')
  })

  it('Inmaculada (03/12 al 08/12): promo $488.000 más barata que el efectivo $489.600', () => {
    const m = mensaje('2026-12-03', '2026-12-08')
    expect(m).toContain('🎁 Promo 5 noches: la última noche a mitad de precio → *$488.000*')
    expect(m).not.toContain('💵')
  })

  it('solo si el efectivo sale más barato que la promo se muestran las dos', () => {
    const m = mensaje('2027-01-10', '2027-01-16')   // promo $884.000, efectivo $871.200
    expect(m).toContain('→ *$884.000*')
    expect(m).toContain('💵 En efectivo: *$871.200*')
    expect(m).toContain('No son acumulables: se aplica el que más te convenga.')
  })

  it('la seña sale del total con la promo; las cuotas, del de lista', () => {
    const m = mensaje('2027-01-10', '2027-01-17')
    expect(m).toContain('seña del 30% ($290.400)')       // 30% de 968.000
    expect(m).toContain('3 cuotas de $381.333')          // 1.144.000 / 3
  })
})

// ── Reserva anticipada enero (config 'dionsys_promo_anticipada') ────────────
const ANTICIPADA: PromoAnticipada = {
  activo: true,
  nombre: 'Reserva anticipada enero',
  porcentaje: 0.15,
  desde: '2027-01-04',
  hasta: '2027-01-31',
  diasAnticipacion: 20,
  texto: 'Reserva anticipada: {porcentaje}% de descuento ya aplicado en tu tarifa',
  validez: 'Válido reservando con seña hasta el {fecha}.',
}
const cotizarAnt = (llegada: string, salida: string, hoy = '2026-11-24', pax = 2) =>
  cotizarEstadia(llegada, salida, pax, t, esp, [], { anticipada: ANTICIPADA, hoy })
const mensajeAnt = (llegada: string, salida: string, hoy = '2026-11-24', pax = 2) =>
  armarMensaje(llegada, salida, pax, cotizarAnt(llegada, salida, hoy, pax), t.config.cuotas)

describe('reserva anticipada — cotizarEstadia', () => {
  it('cotizado 24/11, 10/01 al 13/01 (3 noches): aplica el 15%', () => {
    const c = cotizarAnt('2027-01-10', '2027-01-13')   // 3 × $160.000
    expect(c.total).toBe(480_000)
    expect(c.promo).toMatchObject({ tipo: 'anticipada', total: 408_000 })
    expect(c.minNoches).toBe(3)
  })

  it('cotizado 24/11, 02/01 al 06/01: el 15% solo en las noches del 4 y el 5', () => {
    const c = cotizarAnt('2027-01-02', '2027-01-06')   // sáb 176.000 + dom 160.000 + 2 × 160.000
    expect(c.total).toBe(656_000)
    expect(c.promo).toMatchObject({ tipo: 'anticipada', total: 656_000 - 0.15 * 320_000 })
    expect(c.efectivo).toBe(590_400)   // el 10% en efectivo sobre las 4 sale más barato
  })

  it('cotizado 24/11, 05/01 al 12/01 (7 noches): el 15% gana a la última gratis', () => {
    const c = cotizarAnt('2027-01-05', '2027-01-12')
    expect(c.total).toBe(1_144_000)
    // Última gratis (lun 11, $160.000) = $984.000; 15% = $972.400 → queda el 15%.
    expect(c.promo).toMatchObject({ tipo: 'anticipada', total: 972_400 })
  })

  it('si la de estadía deja menos, queda la de estadía', () => {
    // Misma estadía con un 2% de anticipada: $1.121.120 contra $984.000 de la última gratis.
    const c = cotizarEstadia('2027-01-05', '2027-01-12', 2, t, esp, [], { anticipada: { ...ANTICIPADA, porcentaje: 0.02 }, hoy: '2026-11-24' })
    expect(c.promo).toEqual({ tipo: 'gratis', total: 984_000 })
  })

  it('cotizado 25/12, llegada 10/01 (16 días): NO aplica', () => {
    expect(cotizarAnt('2027-01-10', '2027-01-13', '2026-12-25').promo).toBeNull()
  })

  it('cotizado 21/12, llegada 10/01 (20 días justos): aplica', () => {
    expect(cotizarAnt('2027-01-10', '2027-01-13', '2026-12-21').promo).toMatchObject({ tipo: 'anticipada', total: 408_000 })
  })

  it('cotizado 22/12, llegada 10/01 (19 días): NO aplica', () => {
    expect(cotizarAnt('2027-01-10', '2027-01-13', '2026-12-22').promo).toBeNull()
  })

  it('estadía en diciembre o en febrero: no aplica', () => {
    expect(cotizarAnt('2026-12-14', '2026-12-17').promo).toBeNull()
    expect(cotizarAnt('2027-02-02', '2027-02-05').promo).toBeNull()
  })

  it('apagada (activo: false) o sin config: no aplica', () => {
    expect(validarPromoAnticipada({ ...ANTICIPADA, activo: false })).toBeNull()
    expect(validarPromoAnticipada(null)).toBeNull()
    expect(cotizar('2027-01-10', '2027-01-13').promo).toBeNull()
  })

  it('hoy se toma en hora de Buenos Aires', () => {
    // 16/12 01:30 UTC = 15/12 22:30 en Argentina.
    expect(hoyBuenosAires(new Date('2026-12-16T01:30:00Z'))).toBe('2026-12-15')
  })
})

describe('reserva anticipada — mensaje del conserje', () => {
  it('10/01 al 13/01: lista tachada, precio con descuento, validez y "no acumulables"', () => {
    const m = mensajeAnt('2027-01-10', '2027-01-13')
    expect(m).toContain(
      '🎁 Reserva anticipada: 15% de descuento ya aplicado en tu tarifa\n' +
      '~$480.000~ → *$408.000* (transferencia o efectivo)\n' +
      'Válido reservando con seña hasta el 21/12.\n' +
      'No son acumulables: se aplica el que más te convenga.',
    )
    expect(m).not.toContain('💵')
    expect(m).toContain('💳 Sin interés con Banco Provincia: 3 cuotas de $160.000 o 6 cuotas de $80.000')
  })

  it('02/01 al 06/01: el efectivo sale más barato, van las dos', () => {
    const m = mensajeAnt('2027-01-02', '2027-01-06')
    expect(m).toContain('~$656.000~ → *$608.000*')
    expect(m).toContain('Válido reservando con seña hasta el 13/12.')
    expect(m).toContain('💵 En efectivo: *$590.400*')
    expect(m).toContain('No son acumulables: se aplica el que más te convenga.')
  })

  it('05/01 al 12/01: muestra la anticipada, no la última gratis', () => {
    const m = mensajeAnt('2027-01-05', '2027-01-12')
    expect(m).toContain('~$1.144.000~ → *$972.400*')
    expect(m).not.toContain('Promo 7 noches')
  })

  it('la seña del 30% sale del total con descuento', () => {
    expect(mensajeAnt('2027-01-10', '2027-01-13')).toContain('seña del 30% ($122.400)')    // 30% de 408.000
    expect(mensajeAnt('2027-01-05', '2027-01-12')).toContain('seña del 30% ($291.720)')    // 30% de 972.400
  })

  it('cotizado 25/12: mensaje sin anticipada', () => {
    const m = mensajeAnt('2027-01-10', '2027-01-13', '2026-12-25')
    expect(m).not.toContain('🎁')
    expect(m).toContain('🏦 Transferencia: *$480.000*')
  })
})

describe('promo de temporada — control de caja', () => {
  it('un cobro con el total de la promo se reconoce como promo, no como error', () => {
    // 7 noches de diciembre con la última a mitad: 644.000 no es ninguna estadía de lista.
    const r = cuadraConTarifarioPublico(644_000, 2, '2026-12-21', t, esp)
    expect(r).toMatchObject({ tipo: 'promo', promo: 'mitad', noches: 7, llegada: '2026-12-14' })
  })

  it('con la última noche gratis el total suele ser una estadía de lista más corta: igual cuadra', () => {
    // 10 noches con la última de $160.000 gratis = las 9 noches del 11 al 19 a precio de lista.
    expect(cuadraConTarifarioPublico(1_464_000, 2, '2027-01-20', t, esp)?.tipo).toBe('lista')
  })
})
