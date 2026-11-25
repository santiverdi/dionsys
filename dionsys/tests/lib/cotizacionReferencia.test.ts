import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { cotizarEstadia, infoDia, validarPromoAnticipada } from '../../src/lib/tarifaDiaria'
import { armarMensaje } from '../../src/components/CotizacionMensaje'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa } from '../../src/lib/tarifasEspeciales'
import tarifarioProd from '../fixtures/produccion_2026-11-25/tarifario_publico.json'
import ajustesProd from '../fixtures/produccion_2026-11-25/tarifas_dia.json'
import promoProd from '../fixtures/produccion_2026-11-25/promo_anticipada.json'
import { promosVigentes, type Promo } from '../../src/lib/promos'

// RED DE SEGURIDAD de Recepción → Tarifas.
//
// Foto de producción del 25/11/2026 (tarifario publicado + ajustes por día +
// reserva anticipada; las estadías mínimas por fechas todavía no existían en la
// nube). Para cada caso real se guardó lo que cotizaba la app ese día —precio
// de cada noche, total, transferencia, efectivo, promo, seña, cuotas y el texto
// del mensaje— en referencia_cotizaciones.json.
//
// Si un cambio altera CUALQUIERA de esos resultados, este test falla. No se
// "arregla" regenerando la referencia: primero hay que confirmar con el dueño
// que el cambio de precio es a propósito. Regenerar (solo con su OK):
//   GENERAR_REFERENCIA=1 npx vitest run tests/lib/cotizacionReferencia.test.ts
//
// Cambios a propósito, con OK del dueño:
//   - Etapa 2: si la estadía tiene noches dentro y fuera del rango de la
//     anticipada, el texto dice en qué noches aplica ("cruza de enero a
//     febrero": "…en las noches hasta el 31/01"). Los montos no cambiaron.
//
// Etapa 2: cada caso se cotiza DOS veces, con la anticipada vieja (como
// cotizaba la app) y con la lista de promos migrada ('dionsys_promos'), y las
// dos tienen que dar exactamente la referencia.

const DIR = path.resolve(__dirname, '../fixtures/produccion_2026-11-25')
const ARCHIVO = path.join(DIR, 'referencia_cotizaciones.json')

const t = tarifarioProd as unknown as TarifarioPublico
const especiales = especialesConAjustes(ajustesProd as AjustesTarifa)
const anticipada = validarPromoAnticipada(promoProd)
const HOY = '2026-11-25'

interface Caso { nombre: string; llegada: string; salida: string; pax: number; hoy?: string }

const CASOS: Caso[] = [
  { nombre: 'semana de diciembre (lun 14 a jue 17)', llegada: '2026-12-14', salida: '2026-12-17', pax: 2 },
  { nombre: 'finde de diciembre (vie 11 y sáb 12)', llegada: '2026-12-11', salida: '2026-12-13', pax: 2 },
  { nombre: 'finde largo Inmaculada 4 al 8/12', llegada: '2026-12-04', salida: '2026-12-08', pax: 2 },
  { nombre: 'finde largo Inmaculada, solo 2 noches (4 y 5/12)', llegada: '2026-12-04', salida: '2026-12-06', pax: 2 },
  { nombre: 'Navidad 24 al 26/12', llegada: '2026-12-24', salida: '2026-12-26', pax: 2 },
  { nombre: 'Año Nuevo 30/12 al 2/1', llegada: '2026-12-30', salida: '2027-01-02', pax: 2 },
  { nombre: 'Año Nuevo 31/12 al 3/1 en pareja', llegada: '2026-12-31', salida: '2027-01-03', pax: 2 },
  { nombre: 'enero con anticipada: cotizado con 20 días justos', llegada: '2027-01-10', salida: '2027-01-13', pax: 2, hoy: '2026-12-21' },
  { nombre: 'enero con 19 días: sin anticipada', llegada: '2027-01-10', salida: '2027-01-13', pax: 2, hoy: '2026-12-22' },
  { nombre: 'enero cotizado hoy (anticipada)', llegada: '2027-01-17', salida: '2027-01-20', pax: 2 },
  { nombre: '5 noches en diciembre: última a mitad', llegada: '2026-12-14', salida: '2026-12-19', pax: 2 },
  { nombre: '5 noches en febrero: última a mitad', llegada: '2027-02-16', salida: '2027-02-21', pax: 2 },
  { nombre: '6 noches en febrero: última a mitad', llegada: '2027-02-15', salida: '2027-02-21', pax: 2 },
  { nombre: '7 noches en febrero: última gratis', llegada: '2027-02-20', salida: '2027-02-27', pax: 2 },
  { nombre: '7 noches en enero sin anticipada: última gratis', llegada: '2027-01-10', salida: '2027-01-17', pax: 2, hoy: '2026-12-30' },
  { nombre: '7 noches en enero cotizado hoy: la última gratis le gana al 15%', llegada: '2027-01-10', salida: '2027-01-17', pax: 2 },
  { nombre: 'single semana de diciembre', llegada: '2026-12-14', salida: '2026-12-17', pax: 1 },
  { nombre: 'single en enero', llegada: '2027-01-10', salida: '2027-01-13', pax: 1, hoy: '2026-12-30' },
  { nombre: 'single 7 noches en febrero', llegada: '2027-02-20', salida: '2027-02-27', pax: 1 },
  { nombre: 'triple en enero', llegada: '2027-01-24', salida: '2027-01-27', pax: 3, hoy: '2026-12-30' },
  { nombre: 'cuádruple finde de diciembre', llegada: '2026-12-11', salida: '2026-12-14', pax: 4 },
  { nombre: 'quíntuple en Carnaval', llegada: '2027-02-05', salida: '2027-02-09', pax: 5 },
  { nombre: 'cruza de enero a febrero', llegada: '2027-01-29', salida: '2027-02-02', pax: 2 },
  { nombre: 'cruza de noviembre a diciembre', llegada: '2026-11-29', salida: '2026-12-02', pax: 2 },
  { nombre: 'Carnaval 5 al 8/2', llegada: '2027-02-05', salida: '2027-02-08', pax: 2 },
]

// La lista migrada, ida y vuelta por JSON como queda guardada en la nube.
const MIGRADAS: Promo[] = JSON.parse(JSON.stringify(promosVigentes(null, anticipada)))

function resultado(c: Caso, promos?: Promo[]) {
  const hoy = c.hoy ?? HOY
  const cot = cotizarEstadia(c.llegada, c.salida, c.pax, t, especiales, [], promos ? { promos, hoy } : { anticipada, hoy })
  const precios: Record<string, number | null> = {}
  for (let d = Date.parse(c.llegada + 'T00:00:00Z'); d < Date.parse(c.salida + 'T00:00:00Z'); d += 86_400_000) {
    const f = new Date(d).toISOString().slice(0, 10)
    precios[f] = infoDia(f, c.pax, t, especiales).precio
  }
  const cuotas = t.config.cuotas
  return {
    hoy,
    precios,
    noches: cot.noches,
    total: cot.total,
    transferencia: cot.conDescuento,
    efectivo: cot.efectivo,
    promo: cot.promo,
    minNoches: cot.minNoches,
    sena: cot.sena,
    senaMonto: Math.round((cot.promo ? cot.promo.total : cot.total) * cot.sena),
    cuotas: cuotas.map(n => ({ n, monto: Math.round(cot.total / n) })),
    mensaje: armarMensaje(c.llegada, c.salida, c.pax, cot, cuotas),
  }
}

const actual = Object.fromEntries(CASOS.map(c => [c.nombre, resultado(c)]))

if (process.env.GENERAR_REFERENCIA === '1') fs.writeFileSync(ARCHIVO, JSON.stringify(actual, null, 2) + '\n')
const referencia: Record<string, unknown> = fs.existsSync(ARCHIVO) ? JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')) : {}

describe('cotizaciones de referencia (producción 25/11/2026)', () => {
  it('la referencia tiene exactamente los mismos casos', () => {
    expect(Object.keys(referencia).sort()).toEqual(CASOS.map(c => c.nombre).sort())
  })

  it('la reserva anticipada de la foto está activa (si no, los casos de enero no prueban nada)', () => {
    expect(anticipada).not.toBeNull()
  })

  for (const c of CASOS) {
    it(c.nombre, () => {
      expect(actual[c.nombre]).toEqual(referencia[c.nombre])
    })
  }
})

describe('cotizaciones de referencia con las promos migradas a configuración (etapa 2)', () => {
  for (const c of CASOS) {
    it(c.nombre, () => {
      expect(resultado(c, MIGRADAS)).toEqual(referencia[c.nombre])
    })
  }
})
