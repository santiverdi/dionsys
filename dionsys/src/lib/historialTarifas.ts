import { supabase } from './supabase'
import type { AjusteDia, AjustesTarifa } from './tarifasEspeciales'

// Historial de cambios de tarifas (tabla tarifas_historial). Lo escribe un
// trigger de la base cada vez que cambia una clave de tarifas en app_state, con
// la foto completa antes y después. Desde acá se arma el "volver atrás":
//   - revertirCambio(): deshace SOLO lo que cambió esa entrada (en precios por
//     día, solo esas noches), dejando como están los cambios posteriores.
//   - versionDe(): la foto completa tal como quedó después de esa entrada.
// Las dos se guardan como un cambio nuevo (con guardarTarifa), que también
// queda en el historial.

export interface EntradaHistorial {
  id: number
  creado_en: string
  autor_id: string | null
  autor_nombre: string
  clave: string
  fechas: string[] | null
  valor_anterior: unknown
  valor_nuevo: unknown
  motivo: string | null
  revierte_id: number | null
}

export const NOMBRE_CLAVE: Record<string, string> = {
  dionsys_tarifas_dia: 'Precios y mínimos por día',
  dionsys_estadias_minimas: 'Estadías mínimas por fechas',
  dionsys_promo_anticipada: 'Reserva anticipada',
  dionsys_tarifas_protecciones: 'Protecciones al guardar',
  dionsys_promos: 'Promos',
  dionsys_agregados: 'Agregados (pensión)',
  dionsys_tarifas: 'Tarifas pactadas (control de caja)',
  tarifario_publico: 'Tarifario público (página web)',
}

/** Las claves que se pueden volver atrás desde la app (el tarifario público se republica desde Web). */
export const CLAVES_REVERTIBLES = [
  'dionsys_tarifas_dia', 'dionsys_estadias_minimas', 'dionsys_promo_anticipada',
  'dionsys_tarifas_protecciones', 'dionsys_tarifas', 'dionsys_promos', 'dionsys_agregados',
] as const

export const esRevertible = (clave: string) => (CLAVES_REVERTIBLES as readonly string[]).includes(clave)

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
// La base (jsonb) reordena las claves: comparar sin depender del orden.
function estable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estable)
  if (esObjeto(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, estable(v[k])]))
  return v ?? null
}
const igual = (a: unknown, b: unknown) => JSON.stringify(estable(a)) === JSON.stringify(estable(b))

export interface DiferenciaDia {
  fecha: string
  antes: AjusteDia | null
  despues: AjusteDia | null
}

/** Noche por noche, qué cambió entre dos versiones de los precios por día. */
export function diferenciasPorDia(antes: unknown, despues: unknown): DiferenciaDia[] {
  const a = (esObjeto(antes) ? antes : {}) as AjustesTarifa
  const d = (esObjeto(despues) ? despues : {}) as AjustesTarifa
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter(f => !igual(a[f], d[f]))
    .sort()
    .map(f => ({ fecha: f, antes: a[f] ?? null, despues: d[f] ?? null }))
}

export interface Reversion {
  valor: unknown
  /** Noches que cambiaron DESPUÉS de esta entrada y que revertir va a pisar. */
  pisa: string[]
}

/**
 * Deshace esta entrada sobre lo que hay hoy. En precios por día se tocan solo
 * las noches de esa entrada; en las demás claves vuelve la foto anterior.
 * null = no hay nada a qué volver (era la primera vez que se guardaba).
 */
export function revertirCambio(actual: unknown, e: EntradaHistorial): Reversion | null {
  if (e.clave === 'dionsys_tarifas_dia') {
    const hoy = { ...((esObjeto(actual) ? actual : {}) as AjustesTarifa) }
    const ant = (esObjeto(e.valor_anterior) ? e.valor_anterior : {}) as AjustesTarifa
    const nue = (esObjeto(e.valor_nuevo) ? e.valor_nuevo : {}) as AjustesTarifa
    const pisa: string[] = []
    for (const { fecha } of diferenciasPorDia(ant, nue)) {
      if (!igual(hoy[fecha], nue[fecha])) pisa.push(fecha)
      if (ant[fecha]) hoy[fecha] = ant[fecha]
      else delete hoy[fecha]
    }
    return { valor: hoy, pisa }
  }
  let anterior = e.valor_anterior
  // La primera lista de estadías mínimas se deshace dejando la lista vacía.
  if ((anterior === null || anterior === undefined) && e.clave === 'dionsys_estadias_minimas') anterior = []
  if (anterior === null || anterior === undefined) return null
  return { valor: anterior, pisa: igual(actual, e.valor_nuevo) ? [] : ['(cambió después)'] }
}

/** La foto completa tal como quedó después de esta entrada. */
export function versionDe(e: EntradaHistorial): unknown {
  return e.valor_nuevo
}

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const k = (n: number | undefined) => (n ? `${Math.round(n / 100) / 10}k`.replace('.', ',') : '—')

/** "dd/mm: pp 42k → 45k · single 78k → 80k · mín 1 → 2" */
export function textoDiferencia(d: DiferenciaDia): string {
  return `${dm(d.fecha)}: ${textoCambioNoche(d.antes, d.despues)}`
}

/** "pp 42k → 45k · single 78k → 80k · mín 1 → 2" (sin la fecha). */
export function textoCambioNoche(antes: AjusteDia | null, despues: AjusteDia | null): string {
  const a = antes ?? {}, b = despues ?? {}
  const partes: string[] = []
  if (a.porPersona !== b.porPersona) partes.push(`pp ${k(a.porPersona)} → ${k(b.porPersona)}`)
  if (a.single !== b.single) partes.push(`single ${k(a.single)} → ${k(b.single)}`)
  if (a.descEfectivo !== b.descEfectivo) {
    const p = (x?: number) => (x ? `${Math.round(x * 100)}%` : '—')
    partes.push(`efectivo ${p(a.descEfectivo)} → ${p(b.descEfectivo)}`)
  }
  if (a.minNoches !== b.minNoches) partes.push(`mín ${a.minNoches ?? '—'} → ${b.minNoches ?? '—'}`)
  return partes.join(' · ') || 'sin cambios'
}

// ── Registro de una noche: todos los cambios que tuvo esa fecha ─────────────

export interface CambioNoche {
  id: number
  creado_en: string
  autor_nombre: string
  motivo: string | null
  revierte_id: number | null
  antes: AjusteDia | null    // null = sin ajuste (precio de la página)
  despues: AjusteDia | null
}

/** Los cambios de precio/mínimo de esa noche, del más nuevo al más viejo. */
export function cambiosDeLaNoche(fecha: string, entradas: EntradaHistorial[]): CambioNoche[] {
  const de = (v: unknown) => ((esObjeto(v) ? (v as AjustesTarifa)[fecha] : undefined) ?? null)
  return entradas
    .filter(e => e.clave === 'dionsys_tarifas_dia')
    .map(e => ({
      id: e.id, creado_en: e.creado_en, autor_nombre: e.autor_nombre, motivo: e.motivo, revierte_id: e.revierte_id,
      antes: de(e.valor_anterior), despues: de(e.valor_nuevo),
    }))
    .filter(c => !igual(c.antes, c.despues))
    .sort((a, b) => b.id - a.id)
}

/** Los cambios guardados que tocaron esa noche (el trigger anota las fechas de cada cambio). */
export async function cargarCambiosDeLaNoche(fecha: string): Promise<{ cambios: CambioNoche[]; error: string | null }> {
  if (!supabase) return { cambios: [], error: 'La nube no está configurada.' }
  const { data, error } = await supabase
    .from('tarifas_historial')
    .select('*')
    .eq('clave', 'dionsys_tarifas_dia')
    .contains('fechas', [fecha])
    .order('id', { ascending: false })
    .limit(200)
  if (error) return { cambios: [], error: `No se pudo leer el registro: ${error.message}` }
  return { cambios: cambiosDeLaNoche(fecha, (data ?? []) as EntradaHistorial[]), error: null }
}

/** "1/12 al 3/12, 8/12" — las noches agrupadas en tramos seguidos. */
export function resumenFechas(fechas: string[]): string {
  const ord = [...fechas].sort()
  const tramos: [string, string][] = []
  for (const f of ord) {
    const ult = tramos[tramos.length - 1]
    const sig = ult && new Date(Date.parse(ult[1] + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
    if (ult && sig === f) ult[1] = f
    else tramos.push([f, f])
  }
  return tramos.map(([a, b]) => (a === b ? dm(a) : `${dm(a)} al ${dm(b)}`)).join(', ')
}

export async function cargarHistorial(limite = 50): Promise<{ entradas: EntradaHistorial[]; error: string | null }> {
  if (!supabase) return { entradas: [], error: 'La nube no está configurada.' }
  const { data, error } = await supabase
    .from('tarifas_historial')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite)
  if (error) {
    return {
      entradas: [],
      error: error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta crear el historial en Supabase (supabase/etapa1_tarifas.sql).'
        : `No se pudo leer el historial: ${error.message}`,
    }
  }
  return { entradas: (data ?? []) as EntradaHistorial[], error: null }
}

// ── Qué precios por día tenía marcados DionSys en cada momento ──────────────
// El dueño baja o sube los precios del calendario a medida que pasan los días.
// Un cobro se controla contra lo que DionSys tenía marcado CUANDO se cobró (no
// contra lo de hoy). Si cuadra con una versión anterior, es una reserva que se
// cotizó antes del cambio: se acepta, pero avisando. Lo que no cuadra con
// ninguna versión que ya existiera al cobrar no es una tarifa de DionSys.

export interface VersionAjustes {
  desde: string          // ISO del cambio que la dejó así; '' = desde antes del historial
  hasta: string | null   // ISO del cambio siguiente; null = es la de hoy
  ajustes: AjustesTarifa
}

/** Las versiones en orden: la base (antes del primer cambio cargado) y una por cambio. */
export function versionesDeAjustes(
  base: unknown,
  entradas: Array<Pick<EntradaHistorial, 'creado_en' | 'valor_nuevo'>>,
): VersionAjustes[] {
  const comoAjustes = (v: unknown) => (esObjeto(v) ? v : {}) as AjustesTarifa
  const orden = [...entradas].sort((a, b) => Date.parse(a.creado_en) - Date.parse(b.creado_en))
  const lista: VersionAjustes[] = [
    { desde: '', hasta: null, ajustes: comoAjustes(base) },
    ...orden.map(e => ({ desde: e.creado_en, hasta: null, ajustes: comoAjustes(e.valor_nuevo) })),
  ]
  for (let i = 0; i < lista.length - 1; i++) lista[i].hasta = lista[i + 1].desde
  return lista
}

// Tolerancia entre la hora del cobro (reloj del PMS) y la del cambio (la base):
// un cambio hecho minutos después del cobro igual cuenta como ya marcado.
export const MARGEN_CAMBIO_MS = 30 * 60_000

/** Las versiones que ya existían al momento del cobro: la vigente primero, después las anteriores. */
export function versionesAlCobrar(instante: string, versiones: VersionAjustes[]): VersionAjustes[] {
  const t = Date.parse(instante)
  if (isNaN(t)) return []
  return versiones.filter(v => !v.desde || Date.parse(v.desde) <= t + MARGEN_CAMBIO_MS).reverse()
}

// Hasta cuántos días atrás se traen los cambios (cada foto pesa ~10 KB).
const DIAS_HISTORIAL = 60
let cacheVersiones: Promise<VersionAjustes[] | null> | null = null

/**
 * Las versiones de los precios por día de los últimos DIAS_HISTORIAL días,
 * una sola vez por sesión. null = sin nube o sin historial: el control usa los
 * precios de hoy, como siempre.
 */
export function cargarVersionesAjustes(): Promise<VersionAjustes[] | null> {
  cacheVersiones ??= (async () => {
    if (!supabase) return null
    const corte = new Date(Date.now() - DIAS_HISTORIAL * 86_400_000).toISOString()
    const recientes = await supabase.from('tarifas_historial')
      .select('id, creado_en, valor_nuevo')
      .eq('clave', 'dionsys_tarifas_dia').gte('creado_en', corte)
      .order('id', { ascending: true })
    if (recientes.error || !recientes.data?.length) return null
    // La base: cómo estaba antes del primer cambio de la ventana.
    const previa = await supabase.from('tarifas_historial')
      .select('valor_nuevo')
      .eq('clave', 'dionsys_tarifas_dia').lt('creado_en', corte)
      .order('id', { ascending: false }).limit(1)
    if (previa.error) return null
    let base: unknown = previa.data?.[0]?.valor_nuevo
    if (base === undefined) {
      const primera = await supabase.from('tarifas_historial')
        .select('valor_anterior').eq('id', recientes.data[0].id).limit(1)
      if (primera.error) return null
      base = primera.data?.[0]?.valor_anterior ?? {}
    }
    return versionesDeAjustes(base, recientes.data as Array<Pick<EntradaHistorial, 'creado_en' | 'valor_nuevo'>>)
  })().catch(() => null)
  // Si falló, se reintenta la próxima vez que se pida.
  void cacheVersiones.then(v => { if (!v) cacheVersiones = null })
  return cacheVersiones
}
