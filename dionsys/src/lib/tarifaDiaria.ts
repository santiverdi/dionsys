// El MISMO cálculo de precios que hace el script de la landing pública, portado
// para el calendario de tarifas de Recepción. Si la landing cambia su fórmula,
// esto tiene que cambiar igual (los tests cruzan contra los ejemplos del
// tarifario del dueño).
//
// Reglas (en el orden en que se aplican por noche):
//   1. Temporada por fecha → precio base según personas (1 = single por
//      habitación; 2 a 5 = por persona). Si la temporada tiene tarifasCaras y el
//      día es "caro" (vie/sáb), el base sale de ahí.
//   2. Finde largo → recargo sobre el base (redondeado).
//   3. Tope por persona: de 2 a 5 nunca se cobra más que el tope. La single
//      queda afuera (es habitación completa).
//   4. Descuento por efectivo: en finde largo SIEMPRE el de día caro; si no,
//      el de día caro o barato según el día.
//
// Excepción que manda sobre todo lo anterior: las TARIFAS ESPECIALES pactadas
// por administración (src/lib/tarifasEspeciales.ts). Si la noche cae en una, el
// precio es el de esa fila —sin recargo de finde largo y sin tope— y su
// descuento vale con cualquier medio de pago, no solo en efectivo.

import type { TarifarioPublico, TemporadaPublica } from './landing'
import {
  descuentoGeneralDe, especialesVigentes, leerEstadiasMinimas, minNochesEspecialDe, precioEspecialDe,
  tarifaEspecialDe, type EstadiaMinima, type TarifaEspecial,
} from './tarifasEspeciales'
import { elegirPromo, leerPromosGuardadas, PROMOS_INICIALES, desdeAnticipadaVieja, type Promo } from './promos'

function aDia(s: string): number {
  return Date.parse(s + 'T00:00:00Z')
}

/** Día de la semana como getDay(): 0=domingo … 6=sábado (sin depender del huso). */
export function diaSemana(fecha: string): number {
  return new Date(aDia(fecha)).getUTCDay()
}

export interface InfoDia {
  fecha: string
  enVigencia: boolean
  bloqueada: boolean
  temporada: string | null
  caro: boolean               // vie/sáb (o lo que la temporada marque como caro)
  findeLargo: string | null   // nombre del finde largo si la noche cae en uno
  especial: string | null     // etiqueta de la tarifa especial pactada, si tiene
  precio: number | null       // por persona/noche (2-5, con tope) o por habitación (single)
  descGeneral: number         // fracción de descuento con CUALQUIER medio de pago
  descEfectivo: number        // fracción de descuento pagando en efectivo (incluye descGeneral)
}

function temporadaDe(fecha: string, t: TarifarioPublico): TemporadaPublica | undefined {
  return t.temporadas.find(x => x.desde <= fecha && fecha <= x.hasta)
}

/** Estadía mínima que exige esa noche: la fijada a mano o, si no, la de la temporada. */
export function minNochesDia(
  fecha: string,
  t: TarifarioPublico,
  especiales: TarifaEspecial[] = especialesVigentes(),
): number {
  return minNochesEspecialDe(fecha, especiales) ?? temporadaDe(fecha, t)?.minNoches ?? 1
}

/** La estadía mínima por fechas (activa) más exigente que toca esa noche. */
export function estadiaMinimaDe(
  fecha: string,
  estadias: EstadiaMinima[] = leerEstadiasMinimas(),
): EstadiaMinima | null {
  let mejor: EstadiaMinima | null = null
  for (const e of estadias) {
    if (!e.activo || fecha < e.desde || fecha > e.hasta) continue
    if (!mejor || e.minNoches > mejor.minNoches) mejor = e
  }
  return mejor
}

export interface MinimoEstadia {
  minNoches: number
  /** La estadía mínima por fechas que fija el mínimo; null si lo fija la temporada (o un ajuste). */
  regla: EstadiaMinima | null
}

/**
 * LA regla del mínimo de noches de Recepción. Para las noches [llegada, salida)
 * se exige el MAYOR entre:
 *   a) el de cada noche según la temporada —o el fijado a mano por el admin en
 *      Recepción → Tarifas, que pisa al de la temporada y puede bajarlo—, y
 *   b) el de cualquier estadía mínima activa cuyo rango toque alguna noche.
 */
export function minimoEstadia(
  llegada: string,
  salida: string,
  t: TarifarioPublico,
  especiales: TarifaEspecial[] = especialesVigentes(),
  estadias: EstadiaMinima[] = leerEstadiasMinimas(),
): MinimoEstadia {
  let base = 1
  let regla: EstadiaMinima | null = null
  for (let d = aDia(llegada); d < aDia(salida); d += 86_400_000) {
    const fecha = new Date(d).toISOString().slice(0, 10)
    base = Math.max(base, minNochesDia(fecha, t, especiales))
    const e = estadiaMinimaDe(fecha, estadias)
    if (e && (!regla || e.minNoches > regla.minNoches)) regla = e
  }
  // Si la temporada pide lo mismo o más, el aviso es el de la temporada.
  if (regla && regla.minNoches > base) return { minNoches: regla.minNoches, regla }
  return { minNoches: base, regla: null }
}

const diaMes = (s: string) => `${Number(s.slice(8, 10))}/${Number(s.slice(5, 7))}`

/** "Mínimo 3 noches por Año Nuevo, 30/12 al 2/1" (o el genérico si manda la temporada). */
export function textoMinimo(m: MinimoEstadia): string {
  if (!m.regla) return `Para esas fechas la estadía mínima es de ${m.minNoches} noches.`
  const { nombre, desde, hasta } = m.regla
  const fechas = desde === hasta ? diaMes(desde) : `${diaMes(desde)} al ${diaMes(hasta)}`
  return `Mínimo ${m.minNoches} noches por ${nombre}, ${fechas}.`
}

/** Precio y condiciones de UNA noche para esa cantidad de personas. */
export function infoDia(
  fecha: string,
  pax: number,
  t: TarifarioPublico,
  especiales: TarifaEspecial[] = especialesVigentes(),
): InfoDia {
  const v = t.config.vigencia
  const enVigencia = v.desde <= fecha && fecha <= v.hasta
  const bloqueada = t.bloqueadas.includes(fecha)
  const temp = enVigencia ? temporadaDe(fecha, t) : undefined
  if (!temp) {
    return {
      fecha, enVigencia, bloqueada, temporada: null, caro: false,
      findeLargo: null, especial: null, precio: null, descGeneral: 0, descEfectivo: 0,
    }
  }
  const dia = diaSemana(fecha)
  const caro = temp.diasCaros.includes(dia)

  // Tarifa pactada aparte: el precio ya es el final, así que no pasa por el
  // recargo del finde largo ni por el tope por persona.
  const esp = tarifaEspecialDe(fecha, especiales)
  const fl = t.findesLargos.find(f => f.desde <= fecha && fecha <= f.hasta) ?? null
  if (esp) {
    const descGeneral = descuentoGeneralDe(esp, dia)
    // Un ajuste del admin cambia el precio, pero la noche sigue siendo la misma
    // fecha: conserva la marca que tenía (finde largo o tarifa pactada).
    const debajo = esp.esAjuste ? tarifaEspecialDe(fecha, especiales.filter(e => !e.esAjuste)) : undefined
    return {
      fecha, enVigencia, bloqueada, temporada: temp.nombre, caro,
      findeLargo: esp.esAjuste && !debajo ? fl?.n ?? null : null,
      especial: (debajo ?? esp).etiqueta ?? null,
      precio: precioEspecialDe(esp, dia, pax),
      descGeneral,
      descEfectivo: descGeneral + (esp.descuentoEfectivo ?? 0),
    }
  }

  const base = (caro && temp.tarifasCaras && temp.tarifasCaras[pax]) ? temp.tarifasCaras[pax] : temp.tarifas[pax]
  const conRecargo = fl ? Math.round(base * (1 + fl.recargo)) : base
  const precio = pax === 1 ? conRecargo : Math.min(conRecargo, t.config.tope_por_persona)
  const descEfectivo = fl ? temp.efectivoCaro : (caro ? temp.efectivoCaro : temp.efectivoBarato)
  return {
    fecha, enVigencia, bloqueada, temporada: temp.nombre, caro,
    findeLargo: fl?.n ?? null, especial: null, precio, descGeneral: 0, descEfectivo,
  }
}

// ── Promociones ─────────────────────────────────────────────────────────────
// Desde la etapa 2 las promos son configuración del dueño (src/lib/promos.ts,
// almacén 'dionsys_promos'), con el orden de aplicación documentado ahí. Una
// promo NO se suma al descuento por efectivo: vale igual con transferencia o
// efectivo y el huésped se queda con lo que más le convenga (ver armarMensaje
// en CotizacionMensaje.tsx).
//
// La reserva anticipada vieja ('dionsys_promo_anticipada') sigue valiendo
// mientras el dueño no guarde la lista nueva desde la pantalla Promos.

export type TipoPromo = 'mitad' | 'gratis' | 'anticipada' | 'ultimo_momento'

export interface PromoEstadia {
  tipo: TipoPromo
  total: number   // lo que se cobra con la promo, con cualquier medio de pago
  titulo?: string    // línea 🎁 ya armada (en mitad/gratis, solo si no es el texto de siempre)
  validez?: string   // con anticipada: "Válido reservando con seña hasta el DD/MM."
}

export const KEY_PROMO_ANTICIPADA = 'dionsys_promo_anticipada'

export interface PromoAnticipada {
  activo: boolean
  nombre: string
  porcentaje: number        // fracción: 0.15 = 15%
  desde: string             // primera NOCHE con descuento (inclusive)
  hasta: string             // última NOCHE con descuento (inclusive)
  diasAnticipacion: number  // llegada − fecha de cotización tiene que ser >= esto
  texto: string             // "{porcentaje}" se reemplaza por el número
  validez: string           // "{fecha}" se reemplaza por llegada − diasAnticipacion (DD/MM)
}

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** La config guardada si está activa y bien formada; si no, null (sin promo). */
export function validarPromoAnticipada(v: unknown): PromoAnticipada | null {
  if (!v || typeof v !== 'object') return null
  const p = v as PromoAnticipada
  if (p.activo !== true) return null
  if (typeof p.porcentaje !== 'number' || !(p.porcentaje > 0 && p.porcentaje < 1)) return null
  if (!esFecha(p.desde) || !esFecha(p.hasta) || p.hasta < p.desde) return null
  if (!Number.isInteger(p.diasAnticipacion) || p.diasAnticipacion < 0) return null
  if (typeof p.texto !== 'string' || typeof p.validez !== 'string') return null
  return p
}

export function leerPromoAnticipada(): PromoAnticipada | null {
  try {
    return validarPromoAnticipada(JSON.parse(globalThis.localStorage?.getItem(KEY_PROMO_ANTICIPADA) ?? 'null'))
  } catch {
    return null
  }
}

/** Hoy en hora de Buenos Aires (YYYY-MM-DD), sin importar el huso del equipo. */
export function hoyBuenosAires(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(ahora)
}

export interface OpcionesCotizacion {
  /**
   * Todas las promos con las que se cotiza (ver promosVigentes en promos.ts).
   * Sin esto: las promos por noches guardadas (o las de siempre) más la
   * anticipada de abajo, si se pasa (sin ella no hay anticipada: así cotiza la caja).
   */
  promos?: readonly Promo[]
  anticipada?: PromoAnticipada | null
  hoy?: string                          // fecha de la cotización; por defecto hoy en Buenos Aires
}

export const PROMO_TEXTO: Record<TipoPromo, string> = {
  mitad: 'Promo 5 noches: la última noche a mitad de precio',
  gratis: 'Promo 7 noches: la última noche gratis',
  anticipada: 'Reserva anticipada',
  ultimo_momento: 'Último momento',
}

/** Las promos de una cotización según sus opciones (ver OpcionesCotizacion). */
export function promosDeCotizacion(opciones: OpcionesCotizacion): readonly Promo[] {
  if (opciones.promos) return opciones.promos
  const noches = (leerPromosGuardadas() ?? PROMOS_INICIALES).filter(p => p.tipo === 'noches')
  return opciones.anticipada ? [...noches, desdeAnticipadaVieja(opciones.anticipada)] : noches
}

export interface Cotizacion {
  noches: number
  total: number
  conDescuento: number   // total con los descuentos que valen con cualquier medio
  efectivo: number
  n20: number            // noches con 20%+ de descuento en efectivo
  n10: number            // noches con menos de 20%
  minNoches: number      // la exigencia más alta de la estadía (ver minimoEstadia)
  reglaMin: EstadiaMinima | null   // la estadía mínima por fechas que la fija, si es una
  sena: number           // fracción (0.3 = 30%); la más alta entre las temporadas
  findes: string[]       // findes largos que caen en la estadía
  especiales: string[]   // tarifas especiales etiquetadas que caen en la estadía
  descGeneral: number    // el descuento por cualquier medio más alto de la estadía
  bloqueadas: string[]   // noches de la estadía sin disponibilidad
  incompleta: boolean    // alguna noche quedó fuera de la vigencia (sin precio)
  promo: PromoEstadia | null   // promo de temporada; NO se suma a efectivo ni conDescuento
}

/** Cotiza las noches [llegada, salida) — mismas cuentas que el calculador público. */
export function cotizarEstadia(
  llegada: string,
  salida: string,
  pax: number,
  t: TarifarioPublico,
  especiales: TarifaEspecial[] = especialesVigentes(),
  estadias: EstadiaMinima[] = leerEstadiasMinimas(),
  opciones: OpcionesCotizacion = {},
): Cotizacion {
  let total = 0, conDescuento = 0, efectivo = 0, n20 = 0, n10 = 0, sena = 0
  let noches = 0, incompleta = false, descGeneral = 0
  const fechas: string[] = []   // noches con precio y su subtotal de lista (para las promos)
  const subs: number[] = []
  const findes = new Set<string>()
  const etiquetas = new Set<string>()
  const bloqueadas: string[] = []

  for (let d = aDia(llegada); d < aDia(salida); d += 86_400_000) {
    const fecha = new Date(d).toISOString().slice(0, 10)
    noches++
    const info = infoDia(fecha, pax, t, especiales)
    if (info.bloqueada) bloqueadas.push(fecha)
    if (info.precio === null) {
      incompleta = true
      continue
    }
    if (info.findeLargo) findes.add(info.findeLargo)
    if (info.especial) etiquetas.add(info.especial)
    const temp = temporadaDe(fecha, t)
    if (temp) sena = Math.max(sena, temp.sena)
    const sub = info.precio * (pax === 1 ? 1 : pax)
    if (info.descEfectivo >= 0.2) n20++
    else n10++
    descGeneral = Math.max(descGeneral, info.descGeneral)
    total += sub
    fechas.push(fecha)
    subs.push(sub)
    conDescuento += sub * (1 - info.descGeneral)
    efectivo += sub * (1 - info.descEfectivo)
  }

  const { minNoches, regla } = minimoEstadia(llegada, salida, t, especiales, estadias)

  // Las promos salen del precio de lista y solo con todas las noches cotizadas
  // (orden de aplicación en src/lib/promos.ts).
  const promo = incompleta ? null : elegirPromo(
    { llegada, fechas, subs, hoy: opciones.hoy ?? hoyBuenosAires() },
    promosDeCotizacion(opciones),
    Math.round(conDescuento),
  )

  return {
    noches, total,
    conDescuento: Math.round(conDescuento),
    efectivo: Math.round(efectivo),
    n20, n10, minNoches, reglaMin: regla, sena,
    findes: [...findes], especiales: [...etiquetas], descGeneral,
    bloqueadas, incompleta, promo,
  }
}

// ── Cuadre de un cobro de caja contra el tarifario de la landing ────────────

const EPS = 1           // los precios publicados son redondos: el cobro debe dar exacto
const MAX_NOCHES = 31   // hasta cuántas noches se prueba la ventana

function sumarDias(fecha: string, n: number): string {
  return new Date(aDia(fecha) + n * 86_400_000).toISOString().slice(0, 10)
}

export interface CuadreWeb {
  tipo: 'lista' | 'efectivo' | 'promo'
  noches: number
  llegada: string
  promo?: TipoPromo   // solo con tipo 'promo'
}

/**
 * ¿El total de un cobro coincide con lo que la landing cotiza para ALGUNA
 * estadía que empiece o termine el día del cobro? Se prueban ventanas de 1 a
 * 31 noches ancladas al día del cobro: [f-n, f) —pago al hacer el check out—
 * y [f, f+n) —pago al llegar—. A diferencia de las tarifas pactadas planas,
 * acá entran los vie/sáb más caros, los findes largos con recargo, el tope por
 * persona y el descuento por efectivo noche a noche.
 * 'lista' gana si cuadra con ambos; después 'promo' (la promo de temporada,
 * que vale con cualquier medio de pago) y por último 'efectivo'.
 * undefined = no cuadra con ninguna ventana.
 *
 * Se prueban las dos versiones del cálculo: con las tarifas especiales pactadas
 * y sin ellas. Mientras la landing siga publicando los precios viejos, una
 * reserva tomada por la web se cobró con esos números y no es un error.
 */
export function cuadraConTarifarioPublico(
  total: number,
  plazas: number,
  fechaCobro: string,
  t: TarifarioPublico,
  especiales: TarifaEspecial[] = especialesVigentes(),
): CuadreWeb | undefined {
  if (!Number.isInteger(plazas) || plazas < 1 || plazas > 5) return undefined
  const f = (fechaCobro || '').slice(0, 10)
  if (!f || isNaN(aDia(f))) return undefined

  const ventanas: Array<[string, string]> = []
  for (let n = 1; n <= MAX_NOCHES; n++) {
    ventanas.push([sumarDias(f, -n), f])   // el cobro es la salida
    ventanas.push([f, sumarDias(f, n)])    // el cobro es la llegada
  }

  // Sin especiales que toquen la ventana, el segundo cálculo daría lo mismo.
  const listas = especiales.length ? [especiales, []] : [especiales]

  let efectivoMatch: CuadreWeb | undefined
  let promoMatch: CuadreWeb | undefined
  for (const lista of listas) {
    for (const [a, b] of ventanas) {
      const c = cotizarEstadia(a, b, plazas, t, lista)
      if (c.incompleta) continue
      // conDescuento vale con cualquier medio de pago: es precio de lista.
      if (Math.abs(total - c.total) <= EPS || Math.abs(total - c.conDescuento) <= EPS) {
        return { tipo: 'lista', noches: c.noches, llegada: a }
      }
      if (!promoMatch && c.promo && Math.abs(total - c.promo.total) <= EPS) {
        promoMatch = { tipo: 'promo', noches: c.noches, llegada: a, promo: c.promo.tipo }
      }
      if (!efectivoMatch && Math.abs(total - c.efectivo) <= EPS) {
        efectivoMatch = { tipo: 'efectivo', noches: c.noches, llegada: a }
      }
    }
  }
  return promoMatch ?? efectivoMatch
}
