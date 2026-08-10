// La landing pública (hotel-dion-landing.vercel.app) vive en otro repo, pero se
// alimenta de este Supabase:
//   - tarifario_publico: VISTA de solo lectura que arma un JSON único desde las
//     tablas reales (temporadas, tarifas, findes_largos, fechas_bloqueadas,
//     promociones, config_tarifario). El calculador de la landing la lee al
//     cargar (cada visitante la cachea 30 min).
//   - leads: cada consulta con nombre y teléfono que la landing inserta cuando
//     alguien toca "Reservar por WhatsApp" (o se va con el formulario completo).
// Las tablas NO se pueden escribir con la anon key (a propósito: nadie puede
// tocar los precios desde el navegador). Publicar y leer leads pasa por los
// endpoints /api/tarifario y /api/leads, que usan la service role key y piden
// el código de acceso (LANDING_TOKEN). Acá viven los tipos de ese contrato, la
// validación antes de publicar y el acceso a datos. La ESTRUCTURA la define el
// script de la landing: cambiarla acá sin cambiar la landing rompe el calculador.

import { supabase } from './supabase'

// Día de la semana como lo usa la landing (Date.getDay()): 0=domingo … 6=sábado.
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

export const PAXES = [1, 2, 3, 4, 5] as const

// Precio por noche según personas: con 1 persona es por HABITACIÓN (la "single"
// del hotel), de 2 a 5 es POR PERSONA (misma regla que las tarifas internas).
export type TarifasPorPax = Record<number, number>

export interface TemporadaPublica {
  nombre: string
  desde: string   // YYYY-MM-DD inclusive
  hasta: string   // YYYY-MM-DD inclusive
  tarifas: TarifasPorPax
  tarifasCaras?: TarifasPorPax | null   // viernes/sábado (diasCaros) si difieren
  diasCaros: number[]                   // getDay(): [5,6] = viernes y sábado
  efectivoCaro: number                  // desc. efectivo en días caros (0.10 = 10%)
  efectivoBarato: number                // desc. efectivo el resto de los días
  minNoches: number
  sena: number                          // 0.30 = pide 30% de seña; 0 = sin seña
}

export interface FindeLargo {
  n: string       // nombre ("Carnaval")
  desde: string
  hasta: string
  recargo: number // 0.20 = +20% sobre la tarifa de la temporada
}

// Atajo "Fechas con buen precio" del calculador: la landing busca la próxima
// ventana libre que arranque ese día de semana y dure esas noches.
export interface PromocionPublica {
  titulo: string
  diaInicio: number  // getDay(): 0=domingo … 6=sábado
  noches: number
  nota?: string
}

export interface TarifarioPublico {
  temporadas: TemporadaPublica[]
  findesLargos: FindeLargo[]
  bloqueadas: string[]   // días SIN disponibilidad (YYYY-MM-DD)
  config: {
    tope_por_persona: number
    cuotas: number[]
    vigencia: { desde: string; hasta: string }
  }
  promociones?: PromocionPublica[]
}

// Una consulta guardada por la landing. id/created_at los pone la base.
export interface Lead {
  id?: number
  created_at?: string
  nombre: string
  telefono: string
  fecha_in: string
  fecha_out: string
  noches: number
  personas: number
  camas: string
  total: number
  fue_a_wa: boolean   // true = abrió WhatsApp; false = se fue sin abrirlo
}

export const LANDING_URL = 'https://hotel-dion-landing.vercel.app'

// Código de acceso de los endpoints /api/tarifario y /api/leads (el LANDING_TOKEN
// configurado en Vercel). Se guarda por dispositivo, a propósito FUERA del sync
// en la nube: la tabla app_state es legible con la anon key y quedaría público.
export const LS_LANDING_TOKEN = 'dionsys_landing_leads_token'

export function landingToken(): string {
  return (localStorage.getItem(LS_LANDING_TOKEN) ?? '').trim()
}

export function guardarLandingToken(token: string) {
  localStorage.setItem(LS_LANDING_TOKEN, token.trim())
}

// ── Fechas (aritmética en UTC para no depender del huso del equipo) ─────────

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function aDia(s: string): number {
  return Date.parse(s + 'T00:00:00Z')
}
function deDia(n: number): string {
  return new Date(n).toISOString().slice(0, 10)
}

export function fechaValida(s: string): boolean {
  if (!FECHA_RE.test(s)) return false
  const n = aDia(s)
  return !isNaN(n) && deDia(n) === s   // 2026-02-30 "rueda" a marzo → inválida
}

export function diaSiguiente(s: string): string {
  return deDia(aDia(s) + 86_400_000)
}

/** Todas las fechas de un rango inclusive (para bloquear varios días de una). */
export function expandirRango(desde: string, hasta: string): string[] {
  if (!fechaValida(desde) || !fechaValida(hasta) || hasta < desde) return []
  const dias: string[] = []
  for (let d = desde; d <= hasta; d = diaSiguiente(d)) dias.push(d)
  return dias
}

// ── Validación antes de publicar ────────────────────────────────────────────

function pct(x: number): string {
  return `${Math.round(x * 100)}%`
}

function tarifasConProblema(tarifas: TarifasPorPax | null | undefined): boolean {
  if (!tarifas) return true
  return PAXES.some(p => !(Number(tarifas[p]) > 0))
}

function porcentajeInvalido(x: unknown): boolean {
  return typeof x !== 'number' || isNaN(x) || x < 0 || x >= 1
}

/**
 * Problemas que impiden publicar. Devuelve mensajes para mostrar tal cual.
 * La regla más importante: la vigencia tiene que estar CUBIERTA sin huecos ni
 * solapamientos — un día sin temporada la landing lo cobra con la primera
 * temporada de la lista, silenciosamente y al precio equivocado.
 */
export function validarTarifario(t: TarifarioPublico): string[] {
  const errores: string[] = []

  const v = t.config?.vigencia
  const vigenciaOk = !!v && fechaValida(v.desde) && fechaValida(v.hasta) && v.desde <= v.hasta
  if (!vigenciaOk) {
    errores.push('Vigencia: hacen falta fechas válidas, con el "desde" antes del "hasta".')
  }
  if (!(Number(t.config?.tope_por_persona) > 0)) {
    errores.push('El tope por persona por noche debe ser mayor a 0.')
  }
  const cuotas = t.config?.cuotas
  if (!cuotas?.length || cuotas.some(c => !Number.isInteger(c) || c <= 0)) {
    errores.push('Cuotas: cargá al menos una cantidad de cuotas (números enteros, ej: 3 y 6).')
  }

  if (!t.temporadas?.length) {
    errores.push('Hace falta al menos una temporada con tarifas.')
  }
  let fechasTemporadasOk = true
  for (const [i, temp] of (t.temporadas ?? []).entries()) {
    const quien = temp.nombre?.trim() ? `Temporada "${temp.nombre}"` : `Temporada ${i + 1}`
    if (!temp.nombre?.trim()) errores.push(`${quien}: le falta el nombre.`)
    if (!fechaValida(temp.desde) || !fechaValida(temp.hasta) || temp.hasta < temp.desde) {
      errores.push(`${quien}: fechas inválidas (desde ${temp.desde || '—'} hasta ${temp.hasta || '—'}).`)
      fechasTemporadasOk = false
    }
    if (tarifasConProblema(temp.tarifas)) {
      errores.push(`${quien}: falta el precio para alguna cantidad de personas (1 a 5, todos mayores a 0).`)
    }
    if (temp.tarifasCaras && tarifasConProblema(temp.tarifasCaras)) {
      errores.push(`${quien}: la tarifa de días caros está incompleta (1 a 5 personas, todos mayores a 0).`)
    }
    if (!Number.isInteger(temp.minNoches) || temp.minNoches < 1) {
      errores.push(`${quien}: la estadía mínima debe ser de 1 noche o más.`)
    }
    if (porcentajeInvalido(temp.sena)) {
      errores.push(`${quien}: la seña debe ser un porcentaje entre 0% y 99% (${pct(Number(temp.sena) || 0)}).`)
    }
    if (porcentajeInvalido(temp.efectivoCaro) || porcentajeInvalido(temp.efectivoBarato)) {
      errores.push(`${quien}: los descuentos por efectivo deben estar entre 0% y 99%.`)
    }
  }

  // Solapamientos y huecos: solo si las fechas individuales están bien.
  if (vigenciaOk && fechasTemporadasOk && t.temporadas?.length) {
    const orden = [...t.temporadas].sort((a, b) => a.desde.localeCompare(b.desde))
    for (let i = 1; i < orden.length; i++) {
      const a = orden[i - 1], b = orden[i]
      if (b.desde <= a.hasta) {
        errores.push(`Las temporadas "${a.nombre}" y "${b.nombre}" se superponen (${b.desde} cae dentro de las dos).`)
      }
    }
    let cursor = v!.desde
    for (const temp of orden) {
      if (temp.hasta < cursor) continue
      if (temp.desde > cursor) {
        errores.push(
          `Del ${cursor} al ${diaAnterior(temp.desde)} no hay temporada definida: la landing cobraría esos días con la primera temporada de la lista.`,
        )
      }
      if (temp.hasta >= cursor) cursor = diaSiguiente(temp.hasta)
      if (cursor > v!.hasta) break
    }
    if (cursor <= v!.hasta) {
      errores.push(
        `Del ${cursor} al ${v!.hasta} no hay temporada definida: la landing cobraría esos días con la primera temporada de la lista.`,
      )
    }
  }

  for (const [i, f] of (t.findesLargos ?? []).entries()) {
    const quien = f.n?.trim() ? `Finde largo "${f.n}"` : `Finde largo ${i + 1}`
    if (!f.n?.trim()) errores.push(`${quien}: le falta el nombre.`)
    if (!fechaValida(f.desde) || !fechaValida(f.hasta) || f.hasta < f.desde) {
      errores.push(`${quien}: fechas inválidas.`)
    }
    if (porcentajeInvalido(f.recargo)) {
      errores.push(`${quien}: el recargo debe ser un porcentaje entre 0% y 99%.`)
    }
  }

  for (const d of t.bloqueadas ?? []) {
    if (!fechaValida(d)) errores.push(`Fecha bloqueada inválida: "${d}".`)
  }

  for (const [i, p] of (t.promociones ?? []).entries()) {
    const quien = p.titulo?.trim() ? `Promoción "${p.titulo}"` : `Promoción ${i + 1}`
    if (!p.titulo?.trim()) errores.push(`${quien}: le falta el título.`)
    if (!Number.isInteger(p.diaInicio) || p.diaInicio < 0 || p.diaInicio > 6) {
      errores.push(`${quien}: el día de inicio debe ser un día de la semana.`)
    }
    if (!Number.isInteger(p.noches) || p.noches < 1) {
      errores.push(`${quien}: la cantidad de noches debe ser 1 o más.`)
    }
  }

  return errores
}

function diaAnterior(s: string): string {
  return deDia(aDia(s) - 86_400_000)
}

/** Ordena temporadas por fecha y deduplica/ordena las bloqueadas. No valida. */
export function normalizarTarifario(t: TarifarioPublico): TarifarioPublico {
  return {
    ...t,
    temporadas: [...t.temporadas].sort((a, b) => a.desde.localeCompare(b.desde)),
    findesLargos: [...t.findesLargos].sort((a, b) => a.desde.localeCompare(b.desde)),
    bloqueadas: [...new Set(t.bloqueadas)].sort(),
  }
}

/** Semilla para arrancar de cero si no hay nada publicado ni borrador. */
export function tarifarioVacio(): TarifarioPublico {
  return {
    temporadas: [],
    findesLargos: [],
    bloqueadas: [],
    config: { tope_por_persona: 60_000, cuotas: [3, 6], vigencia: { desde: '', hasta: '' } },
    promociones: [],
  }
}

export function ordenarLeads(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => {
    const ka = a.created_at ?? '', kb = b.created_at ?? ''
    if (ka !== kb) return kb.localeCompare(ka)
    return (b.id ?? 0) - (a.id ?? 0)
  })
}

// ── Acceso a datos ──────────────────────────────────────────────────────────

export async function fetchTarifarioPublicado(): Promise<{ tarifario: TarifarioPublico | null; error: string | null }> {
  if (!supabase) return { tarifario: null, error: 'Nube no configurada.' }
  const { data, error } = await supabase.from('tarifario_publico').select('data').limit(1)
  if (error) return { tarifario: null, error: error.message }
  const fila = data?.[0] as { data?: TarifarioPublico } | undefined
  return { tarifario: fila?.data ?? null, error: null }
}

/**
 * Publica el tarifario vía /api/tarifario, que reescribe las tablas reales con
 * la service role key (la anon key no puede, a propósito). La landing lo toma
 * en la próxima visita (o hasta 30 min después por el caché del visitante).
 * Validar con validarTarifario() ANTES de llamar acá.
 */
export async function publicarTarifario(t: TarifarioPublico): Promise<{ error: string | null }> {
  const token = landingToken()
  if (!token) {
    return { error: 'Falta el código de acceso: cargalo en la pestaña Consultas → "Código de acceso" (es el LANDING_TOKEN configurado en Vercel).' }
  }
  try {
    const r = await fetch('/api/tarifario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-landing-token': token },
      body: JSON.stringify(normalizarTarifario(t)),
    })
    if (r.ok) return { error: null }
    if (r.status === 401) return { error: 'El código de acceso no coincide con el LANDING_TOKEN configurado en Vercel.' }
    if (r.status === 404 || r.status === 501) {
      return { error: 'El endpoint /api/tarifario no está disponible: hace falta deployar en Vercel y configurar SUPABASE_SERVICE_ROLE_KEY y LANDING_TOKEN.' }
    }
    const j = await r.json().catch(() => null) as { error?: string } | null
    return { error: j?.error ?? `Error ${r.status} al publicar.` }
  } catch {
    return { error: 'No se pudo llegar a /api/tarifario. El endpoint solo existe en el sitio deployado en Vercel (con npm run dev no está disponible).' }
  }
}

export interface LeadsResult {
  leads: Lead[]
  via: 'api' | 'directa' | null   // 'directa' = la tabla sigue legible con la anon key
  error: string | null
}

/**
 * Lee las consultas. Primero intenta /api/leads (endpoint con la service role
 * key, protegido por código de acceso). Si el endpoint no está deployado o
 * configurado, cae a leer la tabla directo con la anon key — eso solo funciona
 * mientras las políticas de Supabase la dejen abierta (ver scripts/landing-supabase.sql).
 */
export async function fetchLeads(token: string): Promise<LeadsResult> {
  const t = token.trim()
  if (t) {
    try {
      const r = await fetch('/api/leads', { headers: { 'x-landing-token': t } })
      if (r.ok) {
        const j = await r.json() as { leads?: Lead[] }
        return { leads: ordenarLeads(j.leads ?? []), via: 'api', error: null }
      }
      if (r.status === 401) {
        return { leads: [], via: 'api', error: 'El código de acceso no coincide con el LANDING_TOKEN configurado en Vercel.' }
      }
      // 404 (npm run dev) o 501 (sin variables): probamos la lectura directa.
    } catch {
      // Sin red hacia el endpoint: probamos la lectura directa.
    }
  }
  if (!supabase) return { leads: [], via: null, error: 'Nube no configurada.' }
  const { data, error } = await supabase.from('leads').select('*')
  if (error) {
    return {
      leads: [], via: null,
      error: 'No se pudieron leer las consultas. Si ya cerraste la lectura pública de la tabla, cargá el código de acceso del endpoint /api/leads.',
    }
  }
  return { leads: ordenarLeads((data ?? []) as Lead[]), via: 'directa', error: null }
}
