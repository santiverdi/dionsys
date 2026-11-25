import { useEffect, useState } from 'react'
import type { Employee } from '../types'
import { supabase } from './supabase'
import { aplicarGuardadoEnNube, isTarifaKey, type SyncedKey } from './cloudStore'

// Quién puede cambiar precios, promos y mínimos: SOLO el dueño.
//
// El permiso no vive en la lista de usuarios (que cualquier admin edita), sino
// en la tabla permisos_tarifa de Supabase, que se carga por SQL. Para guardar,
// la función guardar_tarifa() vuelve a verificar el PIN del dueño en el
// servidor y registra el cambio en tarifas_historial; la escritura directa de
// esas claves está cerrada para la anon key (supabase/etapa1_tarifas.sql).
//
// esDuenoTarifas() solo decide qué botones se ven: aunque alguien lo fuerce en
// su navegador, la base le rechaza el guardado.

const cache = new Map<string, Promise<boolean>>()

/** ¿Este usuario es el dueño? (para mostrar u ocultar la edición). */
export function esDuenoTarifas(employeeId: string | null | undefined): Promise<boolean> {
  if (!employeeId || !supabase) return Promise.resolve(false)
  let p = cache.get(employeeId)
  if (!p) {
    const sb = supabase
    p = Promise.resolve(sb.rpc('es_dueno_tarifas', { p_emp: employeeId }))
      .then(({ data, error }) => !error && data === true)
      .catch(() => false)
    // Un error de red no puede dejar al dueño afuera hasta recargar.
    void p.then(ok => { if (!ok) cache.delete(employeeId) })
    cache.set(employeeId, p)
  }
  return p
}

/** Hook: true/false según el servidor; null mientras todavía no respondió. */
export function useEsDuenoTarifasEstado(employee: Employee | null): boolean | null {
  const id = employee?.id ?? null
  const [res, setRes] = useState<{ id: string | null; ok: boolean } | null>(null)
  useEffect(() => {
    let activo = true
    void esDuenoTarifas(id).then(ok => { if (activo) setRes({ id, ok }) })
    return () => { activo = false }
  }, [id])
  return res && res.id === id ? res.ok : null
}

/** Hook: true solo cuando el servidor confirmó que el usuario logueado es el dueño. */
export function useEsDuenoTarifas(employee: Employee | null): boolean {
  return useEsDuenoTarifasEstado(employee) === true
}

export interface OpcionesGuardado {
  motivo?: string
  /** Si este guardado deshace un cambio del historial, su id. */
  revierteId?: number
}

export interface ResultadoGuardado {
  error: string | null
  /** id en tarifas_historial; null si no había nada que cambiar. */
  historialId: number | null
}

/**
 * Guarda una clave de tarifas en la nube con el PIN del usuario logueado. Si la
 * base lo acepta, lo deja también en este equipo y avisa a los Context.
 */
export async function guardarTarifa(
  employee: Employee | null,
  clave: SyncedKey,
  valor: unknown,
  opciones: OpcionesGuardado = {},
): Promise<ResultadoGuardado> {
  if (!isTarifaKey(clave)) return { error: `La clave ${clave} no es de tarifas.`, historialId: null }
  if (!employee) return { error: 'Tenés que iniciar sesión.', historialId: null }
  if (!supabase) return { error: 'La nube no está configurada: no se puede guardar.', historialId: null }
  if (valor === null || valor === undefined) return { error: 'Falta el valor a guardar.', historialId: null }
  try {
    const { data, error } = await supabase.rpc('guardar_tarifa', {
      p_emp: employee.id,
      p_pin: employee.pin,
      p_clave: clave,
      p_valor: valor,
      p_motivo: opciones.motivo ?? null,
      p_revierte_id: opciones.revierteId ?? null,
    })
    if (error) return { error: mensajeDeError(error), historialId: null }
    // La base responde {ok, id} o {ok: false, error} (un PIN incorrecto no es un
    // error de Postgres: así queda registrado el intento para el bloqueo).
    const res = (data ?? {}) as { ok?: boolean; id?: number | null; error?: string }
    if (res.ok !== true) return { error: res.error ?? 'Solo el dueño puede cambiar tarifas.', historialId: null }
    aplicarGuardadoEnNube(clave, valor)
    return { error: null, historialId: typeof res.id === 'number' ? res.id : null }
  } catch {
    return { error: 'No se pudo llegar a la nube. Revisá la conexión y probá de nuevo.', historialId: null }
  }
}

function mensajeDeError(e: { message?: string; code?: string }): string {
  if (e.code === 'PGRST202') return 'Falta instalar el guardado seguro en Supabase (supabase/etapa1_tarifas.sql).'
  if (e.code === '42501' || e.code === '28000' || e.code === '22023') return e.message ?? 'No autorizado.'
  return `No se pudo guardar: ${e.message ?? 'error desconocido'}`
}
