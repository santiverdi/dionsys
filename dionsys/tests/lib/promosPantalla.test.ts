import { describe, it, expect } from 'vitest'
import { infoDia, validarPromoAnticipada, type PromoAnticipada } from '../../src/lib/tarifaDiaria'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import { PROMOS_INICIALES, errorDePromo, promosVigentes, type Promo, type PromoAnticipadaConfig } from '../../src/lib/promos'
import {
  aplicarEfectivo, costoEfectivo, costoPromo, duplicarPromo, ejemplosVistaPrevia, fechasEntre, nuevaPromo,
  rangosEfectivo, reservaTipo, resumenPromo, textoReservasMas, type Contexto,
} from '../../src/lib/promosPantalla'
import tarifarioProd from '../fixtures/produccion_2026-11-25/tarifario_publico.json'
import ajustesProd from '../fixtures/produccion_2026-11-25/tarifas_dia.json'
import promoProd from '../fixtures/produccion_2026-11-25/promo_anticipada.json'

// Pantalla Promos (etapa 2, fase 2), con la foto de producción del 25/11.

const t = tarifarioProd as unknown as TarifarioPublico
const ajustes = ajustesProd as AjustesTarifa
const esp = especialesConAjustes(ajustes)
const HOY = '2026-11-25'
const ctx: Contexto = { tarifario: t, especiales: esp, estadias: [], hoy: HOY }
const PROMOS = promosVigentes(null, validarPromoAnticipada(promoProd) as PromoAnticipada)
const [MITAD, GRATIS, ANTICIPADA] = PROMOS as [Promo, Promo, PromoAnticipadaConfig]
const precio = (f: string, pax = 2) => (infoDia(f, pax, t, esp).precio as number) * pax

describe('efectivo por rango de fechas (dionsys_tarifas_dia.descEfectivo)', () => {
  it('agrupa las noches con precio en tramos seguidos con el mismo %', () => {
    // Foto del 25/11: todo al 10%. Noviembre tiene noches sin precio (el 29, por
    // ejemplo), así que se corta en tramos; del 30/11 al 28/2 es uno solo.
    const r = rangosEfectivo(ajustes)
    expect(r.every(x => x.porcentaje === 0.1)).toBe(true)
    expect(r[r.length - 1]).toEqual({ desde: '2026-11-30', hasta: '2027-02-28', porcentaje: 0.1, noches: 91 })
    expect(r.find(x => x.desde === '2026-11-16')).toEqual({ desde: '2026-11-16', hasta: '2026-11-28', porcentaje: 0.1, noches: 13 })
  })

  it('cambiar un rango parte el tramo', () => {
    const { ajustes: nuevos } = aplicarEfectivo(ajustes, '2027-01-10', '2027-01-12', 0.15)
    expect(rangosEfectivo(nuevos).filter(x => x.hasta >= '2026-11-30').map(x => [x.desde, x.hasta, x.porcentaje])).toEqual([
      ['2026-11-30', '2027-01-09', 0.1],
      ['2027-01-10', '2027-01-12', 0.15],
      ['2027-01-13', '2027-02-28', 0.1],
    ])
  })

  it('solo escribe descEfectivo; el precio y el mínimo de cada noche quedan igual', () => {
    const { ajustes: nuevos, cambiadas } = aplicarEfectivo(ajustes, '2027-01-10', '2027-01-12', 0.15)
    expect(cambiadas).toEqual(['2027-01-10', '2027-01-11', '2027-01-12'])
    for (const f of cambiadas) expect(nuevos[f]).toEqual({ ...ajustes[f], descEfectivo: 0.15 })
    expect(nuevos['2027-01-13']).toBe(ajustes['2027-01-13'])
    expect(ajustes['2027-01-10'].descEfectivo).toBe(0.1)   // no modifica el original
  })

  it('las noches sin precio en DionSys no se tocan y se informan', () => {
    const r = aplicarEfectivo(ajustes, '2026-11-27', '2026-12-01', 0.2)
    expect(r.sinPrecio).toEqual(['2026-11-29'])
    expect(r.cambiadas).toEqual(['2026-11-27', '2026-11-28', '2026-11-30', '2026-12-01'])
    expect(r.ajustes['2026-11-29']).toBeUndefined()
    const oct = aplicarEfectivo(ajustes, '2026-10-30', '2026-10-31', 0.2)
    expect(oct.sinPrecio).toEqual(fechasEntre('2026-10-30', '2026-10-31'))
    expect(oct.ajustes['2026-10-30']).toEqual(ajustes['2026-10-30'])   // solo tenía el mínimo
  })

  it('mismo %: no hay nada que cambiar', () => {
    expect(aplicarEfectivo(ajustes, '2027-01-10', '2027-01-12', 0.1).cambiadas).toEqual([])
  })

  it('el efectivo cambia lo que se cotiza en efectivo', () => {
    const { ajustes: nuevos } = aplicarEfectivo(ajustes, '2027-01-10', '2027-01-12', 0.2)
    expect(infoDia('2027-01-11', 2, t, especialesConAjustes(nuevos)).descEfectivo).toBe(0.2)
    expect(infoDia('2027-01-13', 2, t, especialesConAjustes(nuevos)).descEfectivo).toBe(0.1)
  })
})

describe('reserva tipo y "qué te cuesta"', () => {
  it('por noches: 2 personas, el mínimo de la promo, la primera llegada del rango', () => {
    expect(reservaTipo(MITAD, ctx)).toEqual({ llegada: '2026-12-01', noches: 5, pax: 2, hoy: HOY })
    expect(reservaTipo(GRATIS, ctx)).toEqual({ llegada: '2027-01-01', noches: 7, pax: 2, hoy: HOY })
  })

  it('anticipada: 3 noches, con la anticipación justa o desde que arranca el rango', () => {
    expect(reservaTipo(ANTICIPADA, ctx)).toEqual({ llegada: '2027-01-04', noches: 3, pax: 2, hoy: HOY })
  })

  it('último momento: se cotiza el día anterior a la llegada', () => {
    const um = { ...nuevaPromo('ultimo_momento', HOY), desde: '2026-12-14', hasta: '2026-12-31' }
    expect(reservaTipo(um, ctx)).toEqual({ llegada: '2026-12-14', noches: 3, pax: 2, hoy: '2026-12-13' })
  })

  it('rango vencido: sin reserva tipo', () => {
    expect(reservaTipo({ ...MITAD, desde: '2026-10-01', hasta: '2026-10-31' }, ctx)).toBeNull()
  })

  it('mitad: medio precio de la última noche; reservas de más = d / (1 − d)', () => {
    const c = costoPromo(MITAD, ctx)!
    const noches = fechasEntre('2026-12-01', '2026-12-05')
    const lista = noches.reduce((s, f) => s + precio(f), 0)
    expect(c.lista).toBe(lista)
    expect(c.descuento).toBe(precio('2026-12-05') / 2)
    expect(c.fraccion).toBeCloseTo(c.descuento / lista)
    expect(c.reservasMas).toBeCloseTo(c.fraccion / (1 - c.fraccion))
  })

  it('anticipada 15%: d = 15% y hacen falta 17,6% más de reservas', () => {
    const c = costoPromo(ANTICIPADA, ctx)!
    expect(c.fraccion).toBeCloseTo(0.15)
    expect(c.reservasMas).toBeCloseTo(0.15 / 0.85)
    expect(textoReservasMas(c.reservasMas)).toBe('18 reservas más cada 100 (17,6%)')
  })

  it('una promo pausada igual muestra lo que costaría', () => {
    expect(costoPromo({ ...ANTICIPADA, activa: false }, ctx)?.fraccion).toBeCloseTo(0.15)
  })

  it('efectivo 10%: 11,1% más de reservas', () => {
    expect(costoEfectivo(0.1).reservasMas).toBeCloseTo(0.1 / 0.9)
  })
})

describe('vista previa', () => {
  it('5 ejemplos para una promo por noches, el último no llega al mínimo', () => {
    const e = ejemplosVistaPrevia(GRATIS, ctx)
    expect(e).toHaveLength(5)
    expect(e[0]).toEqual({ titulo: 'Reserva tipo: 2 personas, 7 noches', llegada: '2027-01-01', salida: '2027-01-08', pax: 2, hoy: HOY })
    expect(e.map(x => x.pax)).toEqual([2, 1, 2, 4, 2])
    expect(e[4].titulo).toBe('6 noches (no llega al mínimo)')
  })

  it('anticipada: el control se cotiza sin la anticipación', () => {
    const e = ejemplosVistaPrevia(ANTICIPADA, ctx)
    expect(e).toHaveLength(5)
    expect(e[4]).toMatchObject({ llegada: '2027-01-04', hoy: '2026-12-16' })
  })

  it('efectivo: ejemplos dentro del rango y uno fuera', () => {
    const e = ejemplosVistaPrevia(null, ctx, { desde: '2027-01-10', hasta: '2027-01-20' })
    expect(e[0]).toMatchObject({ llegada: '2027-01-10', salida: '2027-01-13' })
    expect(e[e.length - 1]).toMatchObject({ titulo: 'Fuera de las fechas', llegada: '2027-01-21' })
  })

  it('sin fechas cotizables: ningún ejemplo', () => {
    expect(ejemplosVistaPrevia({ ...MITAD, desde: '2027-06-01', hasta: '2027-06-30' }, ctx)).toEqual([])
  })
})

describe('crear, duplicar y resumir', () => {
  it('una promo nueva arranca pausada y, con nombre, es válida', () => {
    for (const tipo of ['noches', 'anticipada', 'ultimo_momento'] as const) {
      const p = nuevaPromo(tipo, HOY)
      expect(p.activa).toBe(false)
      expect(errorDePromo({ ...p, nombre: 'x' })).toBeNull()
    }
  })

  it('duplicar: otro id, pausada, "(copia)"', () => {
    const c = duplicarPromo(MITAD)
    expect(c.id).not.toBe(MITAD.id)
    expect(c).toMatchObject({ nombre: '5 noches: última a mitad (copia)', activa: false, ultima: 'mitad', minNoches: 5 })
  })

  it('resumen en una línea', () => {
    expect(resumenPromo(PROMOS_INICIALES[0])).toBe('5+ noches · llegada del 01/12 al 28/02 · última noche a mitad')
    expect(resumenPromo(ANTICIPADA)).toBe('1+ noche · reservando con 20+ días · 15% en las noches del 04/01 al 31/01')
    expect(resumenPromo({ ...nuevaPromo('ultimo_momento', HOY), maxNoches: 4, minNoches: 2 }))
      .toBe('2 a 4 noches · faltando menos de 7 días · 10% en las noches del 25/11 al 25/12')
    expect(resumenPromo({ ...ANTICIPADA, porcentaje: 0.125 })).toContain('12,5% en las noches')
  })
})
