import type { PromoAnticipada, PromoEstadia, TipoPromo } from './tarifaDiaria'

// Promos de la cotización de DionSys (Recepción → Tarifas y el mensaje de
// WhatsApp). Son configuración en la nube ('dionsys_promos'), no código: las
// edita SOLO el dueño desde la pantalla Promos y cada cambio queda en el
// historial. No se publican en Booking ni en TodoAlojamiento.
//
// Mientras la nube no tenga la lista, se cotiza con PROMOS_INICIALES (las que
// estaban fijas en el código hasta la etapa 2) más la reserva anticipada vieja
// ('dionsys_promo_anticipada'): así el deploy no cambia ningún precio.
//
// ORDEN DE APLICACIÓN (fijo):
//   1. Precio de lista de cada noche (tarifa, finde largo, ajustes del dueño).
//   2. Descuento general de las tarifas pactadas (conDescuento).
//   3. Promos que NO se suman (por noches, anticipada, último momento): cada una
//      se calcula sobre la lista y queda la de menor total. Solo se ofrece si
//      deja la estadía más barata que el paso 2.
//   4. Promos que SÍ se suman: encima del resultado del paso 3, en este orden:
//      anticipada → último momento → por noches.
//   5. El efectivo es una alternativa aparte (se muestra si sale más barato);
//      no se suma a ninguna promo.

export const KEY_PROMOS = 'dionsys_promos'

export type TipoPromoConfig = 'noches' | 'anticipada' | 'ultimo_momento'

interface PromoBase {
  id: string
  nombre: string
  activa: boolean
  /** Por noches: rango de la fecha de LLEGADA. Con %: noches que llevan el descuento. */
  desde: string
  hasta: string
  minNoches: number           // estadía de al menos estas noches
  maxNoches: number | null    // y como mucho estas (null = sin tope)
  seSuma: boolean             // true = se aplica encima de otra promo (paso 4)
  texto: string               // línea del mensaje al huésped
}

/** Descuenta la ÚLTIMA noche de la estadía (por precio de lista), una sola vez. */
export interface PromoNoches extends PromoBase {
  tipo: 'noches'
  ultima: 'mitad' | 'gratis'
}

/** % sobre las noches del rango si se cotiza con X días o más de anticipación. */
export interface PromoAnticipadaConfig extends PromoBase {
  tipo: 'anticipada'
  porcentaje: number          // fracción: 0.15 = 15%
  diasAnticipacion: number    // llegada − hoy >= esto
  validez: string             // "{fecha}" = llegada − diasAnticipacion (DD/MM)
  /** Texto cuando la estadía tiene noches dentro y fuera del rango. "{rango}" = "desde el DD/MM"… */
  textoParcial: string
}

/** % sobre las noches del rango si faltan MENOS de X días para la llegada. */
export interface PromoUltimoMomento extends PromoBase {
  tipo: 'ultimo_momento'
  porcentaje: number
  diasMaximos: number         // 0 <= llegada − hoy < esto
}

export type Promo = PromoNoches | PromoAnticipadaConfig | PromoUltimoMomento

export const TEXTO_NOCHES: Record<'mitad' | 'gratis', string> = {
  mitad: 'Promo 5 noches: la última noche a mitad de precio',
  gratis: 'Promo 7 noches: la última noche gratis',
}

export const TEXTO_PARCIAL_ANTICIPADA = 'Reserva anticipada: {porcentaje}% de descuento en las noches {rango}'

/** Las promos de estadía que estaban fijas en el código (temporada 2026/2027). */
export const PROMOS_INICIALES: readonly Promo[] = [
  {
    id: 'mitad-2026', tipo: 'noches', nombre: '5 noches: última a mitad', activa: true,
    desde: '2026-12-01', hasta: '2027-02-28', minNoches: 5, maxNoches: null, seSuma: false,
    ultima: 'mitad', texto: TEXTO_NOCHES.mitad,
  },
  {
    id: 'gratis-2027', tipo: 'noches', nombre: '7 noches: última gratis', activa: true,
    desde: '2027-01-01', hasta: '2027-02-28', minNoches: 7, maxNoches: null, seSuma: false,
    ultima: 'gratis', texto: TEXTO_NOCHES.gratis,
  },
]

/** La reserva anticipada vieja ('dionsys_promo_anticipada') como promo de la lista. */
export function desdeAnticipadaVieja(a: PromoAnticipada): PromoAnticipadaConfig {
  return {
    id: 'anticipada', tipo: 'anticipada', nombre: a.nombre, activa: a.activo,
    desde: a.desde, hasta: a.hasta, minNoches: 1, maxNoches: null, seSuma: false,
    porcentaje: a.porcentaje, diasAnticipacion: a.diasAnticipacion,
    texto: a.texto, validez: a.validez, textoParcial: TEXTO_PARCIAL_ANTICIPADA,
  }
}

// ── Validación ──────────────────────────────────────────────────────────────

const esFecha = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
const esTexto = (s: unknown): s is string => typeof s === 'string'
const esEntero = (n: unknown, min: number): n is number => Number.isInteger(n) && (n as number) >= min
const esPorcentaje = (n: unknown): n is number => typeof n === 'number' && n > 0 && n < 1

/** Por qué una promo no se puede guardar; null si está bien. */
export function errorDePromo(p: unknown): string | null {
  if (!p || typeof p !== 'object') return 'no es una promo'
  const x = p as Promo
  if (!esTexto(x.id) || !x.id) return 'falta el id'
  if (!esTexto(x.nombre) || !x.nombre.trim()) return 'falta el nombre'
  if (typeof x.activa !== 'boolean' || typeof x.seSuma !== 'boolean') return 'faltan activa / se suma'
  if (!esFecha(x.desde) || !esFecha(x.hasta) || x.hasta < x.desde) return 'las fechas no son válidas'
  if (!esEntero(x.minNoches, 1)) return 'el mínimo de noches tiene que ser 1 o más'
  if (x.maxNoches !== null && (!esEntero(x.maxNoches, 1) || x.maxNoches < x.minNoches)) {
    return 'el máximo de noches tiene que ser mayor o igual al mínimo'
  }
  if (!esTexto(x.texto) || !x.texto.trim()) return 'falta el texto para el huésped'
  switch (x.tipo) {
    case 'noches':
      return x.ultima === 'mitad' || x.ultima === 'gratis' ? null : 'la última noche tiene que ser mitad o gratis'
    case 'anticipada':
      if (!esPorcentaje(x.porcentaje)) return 'el porcentaje tiene que estar entre 0 y 100'
      if (!esEntero(x.diasAnticipacion, 0)) return 'los días de anticipación tienen que ser 0 o más'
      return esTexto(x.validez) && esTexto(x.textoParcial) ? null : 'faltan los textos de la anticipada'
    case 'ultimo_momento':
      if (!esPorcentaje(x.porcentaje)) return 'el porcentaje tiene que estar entre 0 y 100'
      return esEntero(x.diasMaximos, 1) ? null : 'los días tienen que ser 1 o más'
    default:
      return 'tipo de promo desconocido'
  }
}

/** La lista guardada, sin las promos mal formadas; null si no hay lista. */
export function validarPromos(v: unknown): Promo[] | null {
  if (!Array.isArray(v)) return null
  return v.filter(p => errorDePromo(p) === null) as Promo[]
}

/** 'dionsys_promos' de este equipo; null si la nube todavía no la tiene. */
export function leerPromosGuardadas(): Promo[] | null {
  try {
    return validarPromos(JSON.parse(globalThis.localStorage?.getItem(KEY_PROMOS) ?? 'null'))
  } catch {
    return null
  }
}

/** Las promos con las que se cotiza: la lista guardada o, si no hay, las de siempre. */
export function promosVigentes(guardadas: Promo[] | null, anticipadaVieja: PromoAnticipada | null): Promo[] {
  if (guardadas) return guardadas
  return anticipadaVieja ? [...PROMOS_INICIALES, desdeAnticipadaVieja(anticipadaVieja)] : [...PROMOS_INICIALES]
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

const DIA = 86_400_000
const aDia = (s: string) => Date.parse(s + 'T00:00:00Z')
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const sumarDias = (f: string, n: number) => new Date(aDia(f) + n * DIA).toISOString().slice(0, 10)
const conPct = (texto: string, p: number) => texto.replace('{porcentaje}', String(Math.round(p * 100)))

export interface EstadiaParaPromo {
  llegada: string
  fechas: string[]     // noches de la estadía, en orden
  subs: number[]       // subtotal de LISTA de cada noche (todas con precio)
  hoy: string          // fecha de la cotización
}

interface Aplicada {
  promo: Promo
  descuento: number
  /** Subtotales por noche después de aplicarla (para las que se suman encima). */
  subs: number[]
  parcial: boolean     // con %: alguna noche de la estadía quedó fuera del rango
}

/** La promo sobre unos subtotales por noche, o null si no corresponde. */
function aplicar(p: Promo, e: EstadiaParaPromo, subs: number[]): Aplicada | null {
  const noches = e.fechas.length
  if (!p.activa || noches < p.minNoches || (p.maxNoches !== null && noches > p.maxNoches)) return null
  const anticipacion = (aDia(e.llegada) - aDia(e.hoy)) / DIA
  if (p.tipo === 'noches') {
    if (e.llegada < p.desde || e.llegada > p.hasta) return null
    const k = p.ultima === 'gratis' ? 1 : 0.5
    const ultima = subs[subs.length - 1]
    const nuevos = subs.slice()
    nuevos[nuevos.length - 1] = ultima - k * ultima
    return { promo: p, descuento: k * ultima, subs: nuevos, parcial: false }
  }
  if (p.tipo === 'anticipada' && anticipacion < p.diasAnticipacion) return null
  if (p.tipo === 'ultimo_momento' && !(anticipacion >= 0 && anticipacion < p.diasMaximos)) return null
  let descuento = 0
  let fuera = false
  const nuevos = subs.map((s, i) => {
    const f = e.fechas[i]
    if (f < p.desde || f > p.hasta) {
      fuera = true
      return s
    }
    descuento += s * p.porcentaje
    return s - s * p.porcentaje
  })
  return descuento > 0 ? { promo: p, descuento, subs: nuevos, parcial: fuera } : null
}

/** "desde el 04/01", "hasta el 31/01" o "del 04/01 al 31/01": las noches con descuento. */
function rangoParcial(p: PromoAnticipadaConfig, e: EstadiaParaPromo): string {
  const antes = e.fechas[0] < p.desde
  const despues = e.fechas[e.fechas.length - 1] > p.hasta
  if (antes && despues) return `del ${dm(p.desde)} al ${dm(p.hasta)}`
  return antes ? `desde el ${dm(p.desde)}` : `hasta el ${dm(p.hasta)}`
}

function tipoDe(p: Promo): TipoPromo {
  return p.tipo === 'noches' ? p.ultima : p.tipo
}

function tituloDe(a: Aplicada, e: EstadiaParaPromo): string {
  const p = a.promo
  if (p.tipo === 'noches') return p.texto
  if (p.tipo === 'anticipada' && a.parcial) {
    return conPct(p.textoParcial, p.porcentaje).replace('{rango}', rangoParcial(p, e))
  }
  return conPct(p.texto, p.porcentaje)
}

const ORDEN_SE_SUMA: TipoPromoConfig[] = ['anticipada', 'ultimo_momento', 'noches']

/** Pasos 3 y 4 del orden de aplicación: las promos aplicadas y el total; null si ninguna mejora `conDescuento`. */
function calcular(e: EstadiaParaPromo, promos: readonly Promo[], conDescuento: number): { aplicadas: Aplicada[]; total: number } | null {
  const lista = e.subs.reduce((a, b) => a + b, 0)
  const sueltas = promos.filter(p => !p.seSuma)
  const orden: TipoPromoConfig[] = ['noches', 'anticipada', 'ultimo_momento']
  const candidatas = orden.flatMap(t => sueltas.filter(p => p.tipo === t))
    .map(p => aplicar(p, e, e.subs))
    .filter((a): a is Aplicada => a !== null)

  // Paso 3: la de menor total; ante un empate, la primera.
  let mejor: Aplicada | null = null
  for (const a of candidatas) if (!mejor || Math.round(lista - a.descuento) < Math.round(lista - mejor.descuento)) mejor = a

  // Paso 4: las que se suman, encima.
  const aplicadas: Aplicada[] = mejor ? [mejor] : []
  let subs = mejor ? mejor.subs : e.subs
  for (const t of ORDEN_SE_SUMA) {
    for (const p of promos.filter(x => x.seSuma && x.tipo === t)) {
      const a = aplicar(p, e, subs)
      if (a) {
        aplicadas.push(a)
        subs = a.subs
      }
    }
  }
  if (!aplicadas.length) return null

  const total = aplicadas.length === 1
    ? Math.round(lista - aplicadas[0].descuento)
    : Math.round(subs.reduce((x, y) => x + y, 0))
  return total < conDescuento ? { aplicadas, total } : null
}

/** Las promos que se aplican a la estadía, en el orden en que se aplican ([] = ninguna). */
export function promosAplicadas(e: EstadiaParaPromo, promos: readonly Promo[], conDescuento: number): Promo[] {
  return calcular(e, promos, conDescuento)?.aplicadas.map(a => a.promo) ?? []
}

/**
 * Lo que queda de otros subtotales por noche (p. ej. un agregado de pensión)
 * después de aplicarles, en orden, las mismas promos que a la estadía. `e.subs`
 * son esos otros subtotales; las fechas, la llegada y "hoy" son los de la estadía.
 */
export function aplicarMismasPromos(aplicadas: readonly Promo[], e: EstadiaParaPromo): number {
  let subs = e.subs
  for (const p of aplicadas) subs = aplicar(p, e, subs)?.subs ?? subs
  return Math.round(subs.reduce((x, y) => x + y, 0))
}

/**
 * La promo que corresponde a la estadía (pasos 3 y 4 del orden de aplicación),
 * o null si ninguna deja la estadía más barata que `conDescuento`.
 */
export function elegirPromo(e: EstadiaParaPromo, promos: readonly Promo[], conDescuento: number): PromoEstadia | null {
  const r = calcular(e, promos, conDescuento)
  if (!r) return null
  const { aplicadas, total } = r
  const primera = aplicadas[0]
  const p = primera.promo
  // Misma forma que antes de la etapa 2 para las promos de siempre: el título
  // de una promo por noches solo va si no es el texto de siempre.
  const res: PromoEstadia = { tipo: tipoDe(p), total }
  const titulo = aplicadas.map(a => tituloDe(a, e)).join(' + ')
  if (aplicadas.length > 1 || p.tipo !== 'noches' || titulo !== TEXTO_NOCHES[p.ultima]) res.titulo = titulo
  const anticipada = aplicadas.find(a => a.promo.tipo === 'anticipada')?.promo as PromoAnticipadaConfig | undefined
  if (anticipada) {
    const limite = sumarDias(e.llegada, -anticipada.diasAnticipacion)
    res.validez = anticipada.validez.replace('{fecha}', dm(limite))
  }
  return res
}
