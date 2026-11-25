import { describe, it, expect } from 'vitest'
import { cotizarEstadia, validarPromoAnticipada, type PromoAnticipada } from '../../src/lib/tarifaDiaria'
import { armarMensaje } from '../../src/components/CotizacionMensaje'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import {
  PROMOS_INICIALES, desdeAnticipadaVieja, errorDePromo, promosVigentes, validarPromos,
  type Promo, type PromoAnticipadaConfig, type PromoUltimoMomento,
} from '../../src/lib/promos'
import { peorDescuento } from '../../src/lib/proteccionesTarifa'
import tarifarioProd from '../fixtures/produccion_2026-11-25/tarifario_publico.json'
import ajustesProd from '../fixtures/produccion_2026-11-25/tarifas_dia.json'
import promoProd from '../fixtures/produccion_2026-11-25/promo_anticipada.json'

// Motor de promos configurable (etapa 2), con la foto de producción del 25/11.
// Que la lista migrada cotice IGUAL que antes lo prueba cotizacionReferencia.test.ts.

const t = tarifarioProd as unknown as TarifarioPublico
const esp = especialesConAjustes(ajustesProd as AjustesTarifa)
const vieja = validarPromoAnticipada(promoProd) as PromoAnticipada
const MIGRADAS = promosVigentes(null, vieja)
const anticipada = MIGRADAS.find(p => p.tipo === 'anticipada') as PromoAnticipadaConfig

const cotizar = (llegada: string, salida: string, promos: readonly Promo[], hoy = '2026-11-25', pax = 2) =>
  cotizarEstadia(llegada, salida, pax, t, esp, [], { promos, hoy })
const mensaje = (llegada: string, salida: string, promos: readonly Promo[], hoy = '2026-11-25', pax = 2) =>
  armarMensaje(llegada, salida, pax, cotizar(llegada, salida, promos, hoy, pax), t.config.cuotas)

const ULTIMO_MOMENTO: PromoUltimoMomento = {
  id: 'um', tipo: 'ultimo_momento', nombre: 'Último momento', activa: true,
  desde: '2026-12-01', hasta: '2027-02-28', minNoches: 1, maxNoches: null, seSuma: false,
  porcentaje: 0.12, diasMaximos: 7, texto: 'Último momento: {porcentaje}% de descuento',
}

describe('migración de las promos', () => {
  it('sin lista guardada: las dos de siempre + la anticipada vieja', () => {
    expect(MIGRADAS.map(p => p.id)).toEqual(['mitad-2026', 'gratis-2027', 'anticipada'])
    expect(PROMOS_INICIALES).toMatchObject([
      { tipo: 'noches', ultima: 'mitad', desde: '2026-12-01', hasta: '2027-02-28', minNoches: 5 },
      { tipo: 'noches', ultima: 'gratis', desde: '2027-01-01', hasta: '2027-02-28', minNoches: 7 },
    ])
    expect(anticipada).toMatchObject({ porcentaje: 0.15, diasAnticipacion: 20, desde: '2027-01-04', hasta: '2027-01-31' })
  })

  it('sin anticipada vieja: solo las de estadía', () => {
    expect(promosVigentes(null, null)).toEqual([...PROMOS_INICIALES])
  })

  it('con lista guardada, manda la lista (aunque esté vacía)', () => {
    expect(promosVigentes([], vieja)).toEqual([])
    expect(cotizar('2027-02-20', '2027-02-27', []).promo).toBeNull()
  })

  it('la lista guardada pasa por JSON y vuelve igual', () => {
    expect(validarPromos(JSON.parse(JSON.stringify(MIGRADAS)))).toEqual(MIGRADAS)
  })
})

describe('reserva anticipada con noches dentro y fuera del rango', () => {
  it('todas las noches adentro: el texto de siempre', () => {
    const m = mensaje('2027-01-10', '2027-01-13', MIGRADAS)
    expect(m).toContain('🎁 Reserva anticipada: 15% de descuento ya aplicado en tu tarifa')
  })

  it('arranca antes del rango (2 al 6/1): "en las noches desde el 04/01"', () => {
    const c = cotizar('2027-01-02', '2027-01-06', MIGRADAS)
    // sáb 2 $176.000 + dom 3 $160.000 + 4 y 5 a $160.000; el 15% solo el 4 y el 5.
    expect(c.total).toBe(656_000)
    expect(c.promo).toEqual({
      tipo: 'anticipada',
      total: 608_000,
      titulo: 'Reserva anticipada: 15% de descuento en las noches desde el 04/01',
      validez: 'Válido reservando con seña hasta el 13/12.',
    })
    expect(mensaje('2027-01-02', '2027-01-06', MIGRADAS))
      .toContain('🎁 Reserva anticipada: 15% de descuento en las noches desde el 04/01\n~$656.000~ → *$608.000*')
  })

  it('termina después del rango (29/1 al 2/2): "en las noches hasta el 31/01"', () => {
    expect(cotizar('2027-01-29', '2027-02-02', MIGRADAS).promo?.titulo)
      .toBe('Reserva anticipada: 15% de descuento en las noches hasta el 31/01')
  })

  it('lo cubre de punta a punta (2/1 al 2/2): "del 04/01 al 31/01"', () => {
    expect(cotizar('2027-01-02', '2027-02-02', [anticipada]).promo?.titulo)
      .toBe('Reserva anticipada: 15% de descuento en las noches del 04/01 al 31/01')
  })
})

describe('último momento', () => {
  const promos = [...PROMOS_INICIALES, ULTIMO_MOMENTO]

  it('faltan 4 días (< 7): aplica el % sobre las noches del rango', () => {
    const sin = cotizar('2026-12-14', '2026-12-17', [], '2026-12-10')
    const c = cotizar('2026-12-14', '2026-12-17', promos, '2026-12-10')
    expect(c.promo).toEqual({ tipo: 'ultimo_momento', total: Math.round(sin.total * 0.88), titulo: 'Último momento: 12% de descuento' })
    expect(armarMensaje('2026-12-14', '2026-12-17', 2, c, t.config.cuotas))
      .toContain(`🎁 Último momento: 12% de descuento\n~$${sin.total.toLocaleString('es-AR')}~`)
  })

  it('faltan 7 días o más: no aplica', () => {
    expect(cotizar('2026-12-14', '2026-12-17', promos, '2026-12-07').promo).toBeNull()
  })

  it('la llegada ya pasó: no aplica', () => {
    expect(cotizar('2026-12-14', '2026-12-17', promos, '2026-12-15').promo).toBeNull()
  })

  it('compite con las de estadía: queda la de menor total', () => {
    // 7 noches en febrero: última gratis (1/7 ≈ 14%) contra el 12% → gana la gratis.
    expect(cotizar('2027-02-20', '2027-02-27', promos, '2027-02-18').promo?.tipo).toBe('gratis')
  })
})

describe('promos que se suman', () => {
  it('la anticipada marcada "se suma" va encima de la última gratis', () => {
    const sin = cotizar('2027-01-10', '2027-01-17', [])
    const ultima = 88_000 * 2   // sáb 16/1
    const c = cotizar('2027-01-10', '2027-01-17', [...PROMOS_INICIALES, { ...anticipada, seSuma: true }])
    expect(c.promo).toMatchObject({ tipo: 'gratis', total: Math.round((sin.total - ultima) * 0.85) })
    expect(c.promo?.titulo).toBe(
      'Promo 7 noches: la última noche gratis + Reserva anticipada: 15% de descuento ya aplicado en tu tarifa',
    )
    expect(c.promo?.validez).toBe('Válido reservando con seña hasta el 21/12.')
  })

  it('sin "se suma" compiten (como siempre): la gratis le gana al 15%', () => {
    expect(cotizar('2027-01-10', '2027-01-17', MIGRADAS).promo).toMatchObject({ tipo: 'gratis' })
  })

  it('una que se suma sola (sin otra que gane antes) igual se aplica', () => {
    const c = cotizar('2027-01-10', '2027-01-13', [{ ...anticipada, seSuma: true }])
    expect(c.promo).toMatchObject({ tipo: 'anticipada', total: 408_000 })
  })
})

describe('condiciones de cada promo', () => {
  it('pausada: no se aplica', () => {
    const pausadas = MIGRADAS.map(p => ({ ...p, activa: false }))
    expect(cotizar('2027-02-20', '2027-02-27', pausadas).promo).toBeNull()
  })

  it('rango de noches: con máximo de 6, 7 noches ya no entra', () => {
    const mitad = { ...PROMOS_INICIALES[0], maxNoches: 6 }
    expect(cotizar('2027-02-15', '2027-02-21', [mitad]).promo?.tipo).toBe('mitad')
    expect(cotizar('2027-02-20', '2027-02-27', [mitad]).promo).toBeNull()
  })

  it('un texto propio en una promo por noches va al mensaje', () => {
    const gratis = { ...PROMOS_INICIALES[1], texto: '¡7 noches: la última va de regalo!' }
    expect(mensaje('2027-02-20', '2027-02-27', [gratis])).toContain('🎁 ¡7 noches: la última va de regalo! → *')
  })

  it('la anticipada vieja sigue valiendo por la opción `anticipada`', () => {
    const c = cotizarEstadia('2027-01-10', '2027-01-13', 2, t, esp, [], { anticipada: vieja, hoy: '2026-11-25' })
    expect(c.promo).toMatchObject({ tipo: 'anticipada', total: 408_000 })
    expect(desdeAnticipadaVieja(vieja).seSuma).toBe(false)
  })
})

describe('validación de una promo', () => {
  it('las migradas son válidas', () => {
    for (const p of MIGRADAS) expect(errorDePromo(p)).toBeNull()
    expect(errorDePromo(ULTIMO_MOMENTO)).toBeNull()
  })

  it('rechaza lo mal cargado', () => {
    const p = PROMOS_INICIALES[0]
    expect(errorDePromo({ ...p, nombre: ' ' })).toMatch(/nombre/)
    expect(errorDePromo({ ...p, hasta: '2026-11-01' })).toMatch(/fechas/)
    expect(errorDePromo({ ...p, minNoches: 0 })).toMatch(/mínimo/)
    expect(errorDePromo({ ...p, maxNoches: 3 })).toMatch(/máximo/)
    expect(errorDePromo({ ...anticipada, porcentaje: 15 })).toMatch(/porcentaje/)
    expect(errorDePromo({ ...ULTIMO_MOMENTO, diasMaximos: 0 })).toMatch(/días/)
    expect(errorDePromo({ ...p, tipo: 'otra' })).toMatch(/tipo/)
  })

  it('validarPromos descarta solo las mal formadas', () => {
    expect(validarPromos([PROMOS_INICIALES[0], { basura: true }])).toEqual([PROMOS_INICIALES[0]])
    expect(validarPromos('nada')).toBeNull()
  })
})

describe('protecciones: el descuento combinado mira el último momento', () => {
  it('con un 40% de último momento, el peor descuento llega al 40%', () => {
    const fuerte = { ...ULTIMO_MOMENTO, porcentaje: 0.4 }
    const sin = peorDescuento(['2026-12-15'], t, esp, [], null, [])
    const con = peorDescuento(['2026-12-15'], t, esp, [], null, [fuerte])
    expect(sin!.descuento).toBeCloseTo(0.1)   // solo el 10% en efectivo
    expect(con!.descuento).toBeCloseTo(0.4)
  })
})
