import type { TarifarioPublico } from './landing'
import { infoDia, type Cotizacion } from './tarifaDiaria'
import type { TarifaEspecial } from './tarifasEspeciales'
import { aplicarMismasPromos, promosAplicadas, type Promo } from './promos'

// Agregados de pensión (media pensión, pensión completa y los que cree el
// dueño): un precio por persona por noche que el conserje suma a la cotización
// y el mensaje muestra en una línea aparte. Configuración en la nube
// ('dionsys_agregados', clave protegida: solo el dueño, con historial).
//
// Descuentos: por defecto el agregado se cobra entero, sin promos ni efectivo.
// Si el dueño marca "admite promos", se le aplican las MISMAS promos que a la
// estadía (por ejemplo, la última noche gratis también en la pensión) y el %
// de efectivo de cada noche.
//
// El costo es solo para que el dueño vea el margen en la pantalla Promos; el
// conserje no lo ve en ninguna pantalla.

export const KEY_AGREGADOS = 'dionsys_agregados'

export interface Agregado {
  id: string
  nombre: string              // lo que lee el huésped: "Media pensión"
  detalle: string             // opcional, entre paréntesis en el mensaje: "cena con bebida"
  precioPorPersona: number    // por persona por noche
  costoPorPersona: number     // por persona por noche (solo para el margen)
  desde: string               // noches en que se ofrece (inclusive)
  hasta: string
  activo: boolean
  admitePromos: boolean
}

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Por qué un agregado no se puede guardar; null si está bien. */
export function errorDeAgregado(a: unknown): string | null {
  if (!a || typeof a !== 'object') return 'no es un agregado'
  const x = a as Agregado
  if (typeof x.id !== 'string' || !x.id) return 'falta el id'
  if (typeof x.nombre !== 'string' || !x.nombre.trim()) return 'falta el nombre'
  if (typeof x.detalle !== 'string') return 'falta el detalle'
  if (typeof x.precioPorPersona !== 'number' || !(x.precioPorPersona > 0)) return 'el precio tiene que ser mayor a 0'
  if (typeof x.costoPorPersona !== 'number' || !(x.costoPorPersona >= 0)) return 'el costo tiene que ser 0 o más'
  if (!esFecha(x.desde) || !esFecha(x.hasta) || x.hasta < x.desde) return 'las fechas no son válidas'
  if (typeof x.activo !== 'boolean' || typeof x.admitePromos !== 'boolean') return 'faltan activo / admite promos'
  return null
}

/** La lista guardada, sin los agregados mal formados ([] si no hay lista). */
export function validarAgregados(v: unknown): Agregado[] {
  return Array.isArray(v) ? (v.filter(a => errorDeAgregado(a) === null) as Agregado[]) : []
}

export function leerAgregados(): Agregado[] {
  try {
    return validarAgregados(JSON.parse(globalThis.localStorage?.getItem(KEY_AGREGADOS) ?? 'null'))
  } catch {
    return []
  }
}

/** Uno nuevo, pausado, para completar (los de siempre arrancan con su nombre). */
export function nuevoAgregado(nombre: string, hoy: string, hasta: string): Agregado {
  return {
    id: `agr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre, detalle: '', precioPorPersona: 0, costoPorPersona: 0,
    desde: hoy, hasta: hasta >= hoy ? hasta : hoy, activo: false, admitePromos: false,
  }
}

export const margenDe = (a: Agregado) => a.precioPorPersona - a.costoPorPersona
export const margenPct = (a: Agregado) => (a.precioPorPersona > 0 ? margenDe(a) / a.precioPorPersona : 0)

// ── En la cotización ────────────────────────────────────────────────────────

const DIA = 86_400_000
const aDia = (s: string) => Date.parse(s + 'T00:00:00Z')

function nochesDe(llegada: string, salida: string): string[] {
  const out: string[] = []
  for (let d = aDia(llegada); d < aDia(salida); d += DIA) out.push(new Date(d).toISOString().slice(0, 10))
  return out
}

/** ¿Se ofrece en alguna noche de la estadía? (para mostrarlo en la cotización) */
export function seOfrece(a: Agregado, llegada: string, salida: string): boolean {
  return a.activo && nochesDe(llegada, salida).some(f => a.desde <= f && f <= a.hasta)
}

export interface CotizacionAgregado {
  id: string
  nombre: string
  detalle: string
  pax: number
  noches: number        // noches de la estadía en que se ofrece
  porPersona: number
  lista: number         // sin descuentos
  conPromo: number      // con las promos de la estadía si las admite (si no, = lista)
  efectivo: number      // con el % de efectivo de cada noche si admite promos (si no, = lista)
}

export interface DatosCotizacion {
  llegada: string
  salida: string
  pax: number
  tarifario: TarifarioPublico
  especiales: TarifaEspecial[]
  promos: readonly Promo[]
  hoy: string
  cotizacion: Cotizacion
}

/** Cada agregado elegido para esa estadía (los que no se ofrecen en ninguna noche quedan afuera). */
export function cotizarAgregados(elegidos: readonly Agregado[], d: DatosCotizacion): CotizacionAgregado[] {
  const fechas = nochesDe(d.llegada, d.salida)
  const infos = fechas.map(f => infoDia(f, d.pax, d.tarifario, d.especiales))
  const subsEstadia = infos.map(i => (i.precio ?? 0) * (d.pax === 1 ? 1 : d.pax))
  const estadia = { llegada: d.llegada, fechas, hoy: d.hoy }
  // Las mismas promos que ganaron en la estadía (si no hubo promo, ninguna).
  const aplicadas = d.cotizacion.promo && !d.cotizacion.incompleta
    ? promosAplicadas({ ...estadia, subs: subsEstadia }, d.promos, d.cotizacion.conDescuento)
    : []

  return elegidos.flatMap(a => {
    if (!seOfrece(a, d.llegada, d.salida)) return []
    const subs = fechas.map(f => (a.desde <= f && f <= a.hasta ? a.precioPorPersona * d.pax : 0))
    const lista = subs.reduce((x, y) => x + y, 0)
    const conPromo = a.admitePromos && aplicadas.length ? aplicarMismasPromos(aplicadas, { ...estadia, subs }) : lista
    const efectivo = a.admitePromos
      ? Math.round(subs.reduce((s, x, i) => s + x * (1 - infos[i].descEfectivo), 0))
      : lista
    return [{
      id: a.id, nombre: a.nombre, detalle: a.detalle, pax: d.pax,
      noches: subs.filter(x => x > 0).length, porPersona: a.precioPorPersona,
      lista, conPromo, efectivo,
    }]
  })
}
