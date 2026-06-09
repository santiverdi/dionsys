import { useEffect } from 'react'
import { supabase } from './supabase'

// ============================================================================
// Espejo en la nube (KV) para los almacenes de localStorage.
//
// Cada Context/componente ya guarda su estado como un JSON bajo una key de
// localStorage. Esta capa refleja esas mismas keys en una tabla única de
// Supabase `app_state(key text PK, value jsonb, updated_at)` y usa Realtime
// para que todos los dispositivos vean los cambios al instante.
//
// - pullAll()           → al abrir la app baja todos los almacenes a localStorage
// - persist(key, value) → guarda en localStorage y empuja a la nube (reemplaza setItem)
// - subscribeRealtime() → escucha cambios remotos y los aplica a localStorage + avisa a React
// - useCloudSync(...)    → hook que conecta un setState de un Context a los cambios remotos
//
// Conflicto: último-que-guarda-gana por almacén completo. Suficiente para el
// uso del hotel (pocos usuarios, escrituras espaciadas, Realtime refresca rápido).
// ============================================================================

// Almacenes COMPARTIDOS que se sincronizan entre dispositivos.
// (Quedan afuera a propósito: 'dionsys_employee' = sesión local de cada dispositivo,
//  'dionsys_occupancy_reminder_dismissed' = descarte de UI local.)
export const SYNCED_KEYS = [
  'dionsys_orders',
  'dionsys_deposito',
  'dionsys_stock_movements',
  'dionsys_pedidos_semanales',
  'dionsys_deposito_suppliers',
  'dionsys_turnos',
  'dionsys_impuestos_servicios',
  'dionsys_impuestos_pagos',
  'dionsys_maintenance_tasks',
  'dionsys_basura',
  'dionsys_occupancy',
  'dionsys_lacteos_consumption',
] as const

export type SyncedKey = (typeof SYNCED_KEYS)[number]

const TABLE = 'app_state'
const SYNC_EVENT = 'dionsys-cloud-update'

// MODO CONSOLIDACIÓN: mientras unificamos los datos que cada dispositivo cargó
// por separado, NUNCA pisamos automáticamente lo local (ni al abrir la app ni por
// Realtime). Todo el sync pasa a ser MANUAL desde la pantalla /sync (Subir/Bajar).
// Esto evita que un dispositivo con datos buenos los pierda al bajar una versión
// equivocada de la nube. Poner en false (y redeployar) cuando todo esté unificado.
export const CONSOLIDATION_MODE = true

// Recordamos el último JSON que escribimos por key para ignorar el "eco" de
// nuestro propio cambio cuando Realtime nos lo devuelve.
const lastSeen = new Map<string, string>()

function isSyncedKey(k: unknown): k is SyncedKey {
  return typeof k === 'string' && (SYNCED_KEYS as readonly string[]).includes(k)
}

/**
 * Baja todos los almacenes desde la nube a localStorage. Se llama una vez al
 * arrancar, ANTES de montar los Context (que leen localStorage en su init).
 * Tiene timeout para no colgar la app si Supabase está lento/caído.
 */
export async function pullAll(timeoutMs = 5000): Promise<void> {
  if (!supabase) return
  try {
    const query = supabase.from(TABLE).select('key, value').in('key', SYNCED_KEYS as unknown as string[])
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
    const result = await Promise.race([query, timeout])
    if (!result || result.error || !result.data) return
    for (const row of result.data as { key: string; value: unknown }[]) {
      if (!isSyncedKey(row.key)) continue
      // En modo consolidación no pisamos un almacén que este dispositivo ya tiene.
      if (CONSOLIDATION_MODE && localStorage.getItem(row.key) !== null) continue
      const json = JSON.stringify(row.value)
      lastSeen.set(row.key, json)
      localStorage.setItem(row.key, json)
    }
  } catch (err) {
    console.warn('[cloud] pullAll falló, sigo con localStorage:', err)
  }
}

// Empuje con debounce por key (evita ráfagas de upserts en ediciones rápidas).
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()

function pushKey(key: SyncedKey, value: unknown) {
  if (!supabase) return
  lastSeen.set(key, JSON.stringify(value))
  const prev = pushTimers.get(key)
  if (prev) clearTimeout(prev)
  pushTimers.set(
    key,
    setTimeout(() => {
      pushTimers.delete(key)
      supabase!
        .from(TABLE)
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .then(({ error }) => {
          if (error) console.error('[cloud] no se pudo subir', key, error.message)
        })
    }, 400),
  )
}

/**
 * Reemplazo directo de `localStorage.setItem(key, JSON.stringify(value))`:
 * guarda local y además sube a la nube (si está configurada).
 */
export function persist(key: SyncedKey, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
  // En modo consolidación NO subimos automáticamente: la nube solo se toca a mano
  // desde /sync, para que el uso normal no pise datos sin unificar todavía.
  if (CONSOLIDATION_MODE) return
  pushKey(key, value)
}

/**
 * Se suscribe a los cambios de la tabla. Cuando OTRO dispositivo cambia un
 * almacén, lo escribe en localStorage y dispara un evento para que el Context
 * correspondiente actualice su estado de React.
 * Devuelve una función para desuscribirse.
 */
export function subscribeRealtime(): () => void {
  if (!supabase) return () => {}
  const channel = supabase
    .channel('app_state_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      payload => {
        const row = payload.new as { key?: string; value?: unknown } | null
        if (!row || !isSyncedKey(row.key)) return
        // En modo consolidación no aplicamos cambios remotos sobre almacenes que
        // este dispositivo ya tiene (se sincroniza a mano desde /sync).
        if (CONSOLIDATION_MODE && localStorage.getItem(row.key) !== null) return
        const json = JSON.stringify(row.value)
        if (lastSeen.get(row.key) === json) return // es el eco de nuestro propio cambio
        lastSeen.set(row.key, json)
        localStorage.setItem(row.key, json)
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: row.key, value: row.value } }))
      },
    )
    .subscribe()
  return () => {
    supabase!.removeChannel(channel)
  }
}

// ============================================================================
// Herramientas de UNIFICACIÓN (consolidación one-time entre dispositivos).
// Usadas por la pantalla /sync. Operan a mano, nunca automáticamente.
// ============================================================================

export interface StoreMeta {
  key: SyncedKey
  localCount: number | null // null = no existe en este dispositivo
  cloudCount: number | null // null = no existe en la nube
  cloudUpdatedAt: string | null
}

function countOf(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.length
  if (typeof value === 'object') return Object.keys(value as object).length
  return 1
}

function localValue(key: SyncedKey): unknown {
  const raw = localStorage.getItem(key)
  if (raw === null) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

/** Lee el estado local + nube de cada almacén, para mostrarlo lado a lado. */
export async function fetchStoreMeta(): Promise<StoreMeta[]> {
  const cloud = new Map<string, { value: unknown; updated_at: string }>()
  if (supabase) {
    const { data, error } = await supabase.from(TABLE).select('key, value, updated_at')
    if (!error && data) {
      for (const row of data as { key: string; value: unknown; updated_at: string }[]) {
        cloud.set(row.key, { value: row.value, updated_at: row.updated_at })
      }
    }
  }
  return SYNCED_KEYS.map(key => {
    const local = localValue(key)
    const c = cloud.get(key)
    return {
      key,
      localCount: countOf(local),
      cloudCount: c ? countOf(c.value) : null,
      cloudUpdatedAt: c?.updated_at ?? null,
    }
  })
}

/** Sube AHORA (sin debounce) el valor local de este dispositivo a la nube. */
export async function pushNow(key: SyncedKey): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Nube no configurada' }
  const value = localValue(key)
  if (value === undefined) return { error: 'No hay nada local para subir' }
  lastSeen.set(key, JSON.stringify(value))
  const { error } = await supabase
    .from(TABLE)
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return { error: error?.message ?? null }
}

/** Baja AHORA el valor de la nube a este dispositivo (pisa lo local). */
export async function pullNow(key: SyncedKey): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Nube no configurada' }
  const { data, error } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'No hay nada en la nube para este almacén' }
  const json = JSON.stringify(data.value)
  lastSeen.set(key, json)
  localStorage.setItem(key, json)
  window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key, value: data.value } }))
  return { error: null }
}

/**
 * Hook: conecta el estado de un Context con los cambios remotos de su almacén.
 * `onRemote` se llama con el nuevo valor cada vez que otro dispositivo lo cambia.
 */
export function useCloudSync<T>(key: SyncedKey, onRemote: (value: T) => void) {
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ key: string; value: T }>).detail
      if (detail.key === key) onRemote(detail.value)
    }
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [key, onRemote])
}
