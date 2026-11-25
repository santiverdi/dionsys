import { useCallback, useEffect, useState } from 'react'
import type { Employee } from '../types'
import { supabase } from './supabase'
import type { AjustesTarifa } from './tarifasEspeciales'

// Propuestas de los conserjes (Recepción → Tarifas → "Proponer cambio") y la
// bandeja del dueño (/propuestas). La tabla propuestas_tarifa está cerrada para
// la anon key: todo pasa por las funciones de supabase/etapa2_tarifas.sql.
//
// Límite: los PIN de los conserjes no viven en el servidor, así que la base no
// puede comprobar quién propone. Una propuesta es solo una sugerencia; aplicar o
// rechazar pide el PIN del dueño en el servidor.

export type EstadoPropuesta = 'pendiente' | 'aplicada' | 'rechazada'

export interface Propuesta {
  id: number
  autor_id: string
  autor_nombre: string
  desde: string                  // primera noche (YYYY-MM-DD)
  hasta: string                  // última noche
  precio_propuesto: number | null   // por persona por noche
  promo_propuesta: string | null
  motivo: string
  estado: EstadoPropuesta
  respuesta: string | null
  creado_en: string
  actualizado_en: string
  historial_id: number | null
  resuelto_por: string | null
  resuelto_en: string | null
}

export interface NuevaPropuesta {
  desde: string
  hasta: string
  precio: number | null
  promo: string
  motivo: string
}

/** Por qué no se puede mandar; null si está bien (la base vuelve a validar todo). */
export function errorDePropuesta(p: NuevaPropuesta, hoy: string): string | null {
  if (!p.desde || !p.hasta || p.hasta < p.desde) return 'Elegí las noches (desde ≤ hasta).'
  if (p.hasta < hoy) return 'Las fechas ya pasaron.'
  if (p.precio === null && !p.promo.trim()) return 'Poné un precio por persona o describí la promo.'
  if (p.precio !== null && !(p.precio > 0)) return 'El precio tiene que ser mayor a 0.'
  if (!p.motivo.trim()) return 'Contá el motivo (por ejemplo, qué cobra la competencia).'
  if (p.motivo.length > 500 || p.promo.length > 300) return 'El texto es demasiado largo.'
  return null
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

/** "$60.000 por persona · 3x2 — noches del 10/01 al 12/01" */
export function resumenPropuesta(p: Pick<Propuesta, 'desde' | 'hasta' | 'precio_propuesto' | 'promo_propuesta'>): string {
  const noches = p.desde === p.hasta ? `noche del ${dm(p.desde)}` : `noches del ${dm(p.desde)} al ${dm(p.hasta)}`
  const que = [
    p.precio_propuesto !== null ? `${money(p.precio_propuesto)} por persona` : null,
    p.promo_propuesta,
  ].filter(Boolean).join(' · ')
  return `${que} — ${noches}`
}

const numero = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Normaliza una fila (numeric de Postgres llega como string). */
export function aPropuesta(r: Record<string, unknown>): Propuesta {
  return {
    ...(r as unknown as Propuesta),
    id: Number(r.id),
    precio_propuesto: numero(r.precio_propuesto),
    historial_id: numero(r.historial_id),
  }
}

function mensajeDeError(e: { message?: string; code?: string }): string {
  if (e.code === 'PGRST202') return 'Falta instalar las propuestas en Supabase (supabase/etapa2_tarifas.sql).'
  return e.message ?? 'Error desconocido.'
}

const SIN_NUBE = 'La nube no está configurada.'

/** El conserje manda una propuesta. Devuelve el id o el error. Después avisa por mail al dueño. */
export async function crearPropuesta(employee: Employee | null, p: NuevaPropuesta): Promise<{ id: number | null; error: string | null }> {
  if (!employee) return { id: null, error: 'Tenés que iniciar sesión.' }
  if (!supabase) return { id: null, error: SIN_NUBE }
  try {
    const { data, error } = await supabase.rpc('crear_propuesta_tarifa', {
      p_emp: employee.id, p_nombre: employee.name, p_desde: p.desde, p_hasta: p.hasta,
      p_precio: p.precio, p_promo: p.promo.trim() || null, p_motivo: p.motivo.trim(),
    })
    if (error) return { id: null, error: mensajeDeError(error) }
    const id = Number(data)
    if (avisoPorMailActivo()) void avisarPorMail(id)
    return { id, error: null }
  } catch {
    return { id: null, error: 'No se pudo llegar a la nube. Revisá la conexión y probá de nuevo.' }
  }
}

/**
 * El aviso por mail (fase 5, api/aviso-propuesta.js) está APAGADO: el dueño no
 * cargó las variables de Resend en Vercel. Con el aviso apagado la app no hace
 * ningún pedido a /api/aviso-propuesta (ni deja errores en la consola). Para
 * prenderlo: cargar RESEND_API_KEY, AVISO_PROPUESTAS_A y APP_URL en Vercel y
 * además VITE_AVISO_PROPUESTAS_MAIL=si, y volver a deployar.
 */
export const avisoPorMailActivo = () => import.meta.env.VITE_AVISO_PROPUESTAS_MAIL === 'si'

/** Pide el mail al dueño (api/aviso-propuesta.js). Si falla, la propuesta igual quedó guardada. */
export async function avisarPorMail(id: number): Promise<void> {
  try {
    await fetch('/api/aviso-propuesta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  } catch {
    // Sin mail: el contador del menú igual la muestra.
  }
}

export async function misPropuestas(employee: Employee | null): Promise<{ propuestas: Propuesta[]; error: string | null }> {
  if (!employee || !supabase) return { propuestas: [], error: null }
  try {
    const { data, error } = await supabase.rpc('mis_propuestas_tarifa', { p_emp: employee.id })
    if (error) return { propuestas: [], error: mensajeDeError(error) }
    return { propuestas: ((data ?? []) as Record<string, unknown>[]).map(aPropuesta), error: null }
  } catch {
    return { propuestas: [], error: 'No se pudo llegar a la nube.' }
  }
}

/** Bandeja del dueño (con su PIN, verificado en el servidor). */
export async function listarPropuestas(employee: Employee | null): Promise<{ propuestas: Propuesta[]; error: string | null }> {
  if (!employee) return { propuestas: [], error: 'Tenés que iniciar sesión.' }
  if (!supabase) return { propuestas: [], error: SIN_NUBE }
  try {
    const { data, error } = await supabase.rpc('listar_propuestas_tarifa', { p_emp: employee.id, p_pin: employee.pin })
    if (error) return { propuestas: [], error: mensajeDeError(error) }
    const r = (data ?? {}) as { ok?: boolean; error?: string; propuestas?: Record<string, unknown>[] }
    if (r.ok !== true) return { propuestas: [], error: r.error ?? 'Solo el dueño ve las propuestas.' }
    return { propuestas: (r.propuestas ?? []).map(aPropuesta), error: null }
  } catch {
    return { propuestas: [], error: 'No se pudo llegar a la nube.' }
  }
}

export async function resolverPropuesta(
  employee: Employee | null, id: number, estado: 'aplicada' | 'rechazada', respuesta: string, historialId: number | null = null,
): Promise<string | null> {
  if (!employee) return 'Tenés que iniciar sesión.'
  if (!supabase) return SIN_NUBE
  try {
    const { data, error } = await supabase.rpc('resolver_propuesta_tarifa', {
      p_emp: employee.id, p_pin: employee.pin, p_id: id, p_estado: estado,
      p_respuesta: respuesta.trim() || null, p_historial_id: historialId,
    })
    if (error) return mensajeDeError(error)
    const r = (data ?? {}) as { ok?: boolean; error?: string }
    return r.ok === true ? null : r.error ?? 'No se pudo resolver.'
  } catch {
    return 'No se pudo llegar a la nube.'
  }
}

export async function contarPendientes(): Promise<number> {
  if (!supabase) return 0
  try {
    const { data, error } = await supabase.rpc('contar_propuestas_pendientes')
    return error ? 0 : Number(data) || 0
  } catch {
    return 0
  }
}

const EVENTO = 'dionsys-propuestas'
/** Avisa a los contadores que algo cambió (después de crear o resolver). */
export const avisarCambioPropuestas = () => window.dispatchEvent(new Event(EVENTO))

/** Contador de pendientes para el menú del dueño: al abrir, cada minuto, al volver a la app y tras un cambio. */
export function usePropuestasPendientes(activo: boolean): number {
  const [n, setN] = useState(0)
  const refrescar = useCallback(() => { void contarPendientes().then(setN) }, [])
  useEffect(() => {
    if (!activo) return
    refrescar()
    const t = setInterval(refrescar, 60_000)
    const alVolver = () => { if (document.visibilityState === 'visible') refrescar() }
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener(EVENTO, refrescar)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener(EVENTO, refrescar)
    }
  }, [activo, refrescar])
  return activo ? n : 0
}

// ── Aviso en Inicio (solo el dueño) ─────────────────────────────────────────

export interface ResumenPendientes {
  cantidad: number
  ultima: Propuesta | null   // la pendiente más reciente
}

export const SIN_PENDIENTES: ResumenPendientes = { cantidad: 0, ultima: null }

/**
 * Cuántas pendientes hay y cuál es la más reciente. El número sale de
 * contar_propuestas_pendientes() (sin PIN); el detalle se pide a la bandeja
 * (con el PIN del dueño) SOLO cuando el número cambió: así refrescar cada pocos
 * minutos no suma intentos de PIN si algún día el PIN no coincide.
 */
export async function resumenPendientes(employee: Employee | null, previo: ResumenPendientes): Promise<ResumenPendientes> {
  const cantidad = await contarPendientes()
  if (cantidad === 0) return SIN_PENDIENTES
  if (cantidad === previo.cantidad && previo.ultima) return previo
  const r = await listarPropuestas(employee)
  const ultima = r.propuestas
    .filter(p => p.estado === 'pendiente')
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0] ?? null
  return { cantidad, ultima }
}

/** "Tenés 1 propuesta de tarifa pendiente" / "Tenés 3 propuestas de tarifa pendientes" */
export const textoPendientes = (n: number) =>
  `Tenés ${n} ${n === 1 ? 'propuesta' : 'propuestas'} de tarifa ${n === 1 ? 'pendiente' : 'pendientes'}`

/** "La más reciente: Leandro, noches del 10/12 al 12/12." */
export function textoUltima(p: Propuesta): string {
  const noches = p.desde === p.hasta ? `noche del ${dm(p.desde)}` : `noches del ${dm(p.desde)} al ${dm(p.hasta)}`
  return `La más reciente: ${p.autor_nombre}, ${noches}.`
}

/** Para Inicio: al montar, cada `cadaMs` y tras crear o resolver una propuesta. Inactivo = sin pedidos. */
export function useResumenPendientes(employee: Employee | null, activo: boolean, cadaMs = 120_000): ResumenPendientes {
  const [resumen, setResumen] = useState<ResumenPendientes>(SIN_PENDIENTES)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    let actual = SIN_PENDIENTES
    const refrescar = () => {
      void resumenPendientes(employee, actual).then(r => {
        if (!vivo) return
        actual = r
        setResumen(r)
      })
    }
    refrescar()
    const t = setInterval(refrescar, cadaMs)
    window.addEventListener(EVENTO, refrescar)
    return () => {
      vivo = false
      clearInterval(t)
      window.removeEventListener(EVENTO, refrescar)
    }
  }, [employee, activo, cadaMs])
  return activo ? resumen : SIN_PENDIENTES
}

// ── Aplicar una propuesta de precio ─────────────────────────────────────────

/**
 * Los ajustes con el precio propuesto en cada noche de [desde, hasta]. Conserva
 * el mínimo de noches y el % de efectivo que ya tenía la noche; si no tenía
 * precio cargado, el efectivo sale de `efectivoActual` (lo que se cotiza hoy).
 */
export function aplicarPrecioPropuesta(
  ajustes: AjustesTarifa, fechas: string[], porPersona: number, single: number, efectivoActual: (f: string) => number,
): AjustesTarifa {
  const nuevos: AjustesTarifa = { ...ajustes }
  for (const f of fechas) {
    const a = ajustes[f] ?? {}
    nuevos[f] = { ...a, porPersona, single, descEfectivo: a.descEfectivo ?? efectivoActual(f) }
  }
  return nuevos
}

/** Single sugerida para un precio por persona: la relación de las protecciones, redondeada a $1.000. */
export const singleSugerida = (porPersona: number, relacion: number) => Math.round((porPersona * relacion) / 1000) * 1000
