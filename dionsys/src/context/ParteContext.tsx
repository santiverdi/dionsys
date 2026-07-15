import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ParteHabitaciones } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'
import { parteAnteriorDe } from '../lib/parteControl'
import { fechaConfiable } from '../lib/cajaControl'
import { usuarioLimpio, turnoDeApertura, conserjeFrom } from '../lib/parseCaja'

const LS_PARTES = 'dionsys_partes'

// Migración idempotente: partes viejos guardados con el "usuario" roto (el
// parser pegaba la fecha del encabezado: "Fecha caja: 22/06/2026 06:46…" —
// cada uno aparecía como un "conserje" fantasma en el ranking). Se limpia el
// usuario y se re-derivan turno/conserje de lo que quede.
function migratePartes(list: ParteHabitaciones[]): ParteHabitaciones[] {
  let changed = false
  const next = list.map(p => {
    const limpio = usuarioLimpio(p.usuario ?? '')
    if (limpio === (p.usuario ?? '')) return p
    changed = true
    const turno = p.turno ?? turnoDeApertura(limpio, p.fechaCaja)
    const conserje = p.conserje ?? conserjeFrom(limpio)
    return { ...p, usuario: limpio, ...(turno ? { turno } : {}), ...(conserje ? { conserje } : {}) }
  })
  if (changed) localStorage.setItem(LS_PARTES, JSON.stringify(next))
  return next
}

// Mismo Nº con fechas a menos de esto = el mismo parte (re-import). El contador
// del PMS da la vuelta en 100 (~33 días a 3 turnos/día): un mismo Nº de otro
// ciclo es OTRO turno y no hay que pisarlo.
const MISMO_CICLO_MS = 15 * 24 * 3_600_000

interface ParteContextType {
  partes: ParteHabitaciones[]
  addParte: (parte: ParteHabitaciones) => void
  deleteParte: (id: string) => void
  // Parte de una caja puntual (match por nroCaja).
  getParteByCaja: (nroCaja: number) => ParteHabitaciones | undefined
  // Parte inmediatamente anterior (por fecha de caja) — para los check-outs por diferencia.
  getParteAnterior: (parte: ParteHabitaciones) => ParteHabitaciones | undefined
}

const ParteContext = createContext<ParteContextType | null>(null)

export function ParteProvider({ children }: { children: ReactNode }) {
  const [partes, setPartes] = useState<ParteHabitaciones[]>(() => {
    const saved = localStorage.getItem(LS_PARTES)
    return migratePartes(saved ? JSON.parse(saved) : [])
  })

  // Los cambios remotos también pasan por la migración (otro dispositivo puede
  // tener guardados los partes con el usuario roto).
  useCloudSync<ParteHabitaciones[]>(LS_PARTES, remote => setPartes(migratePartes(remote)))

  const addParte = useCallback((parte: ParteHabitaciones) => {
    setPartes(prev => {
      // Dedup por Nro. de Caja SOLO dentro del mismo ciclo (ver MISMO_CICLO_MS):
      // re-importar el mismo parte lo reemplaza; uno de otro ciclo se conserva.
      const f = fechaConfiable(parte.fechaCaja, parte.importedAt)
      const rest = prev.filter(p =>
        p.nroCaja !== parte.nroCaja ||
        Math.abs(new Date(fechaConfiable(p.fechaCaja, p.importedAt)).getTime() - new Date(f).getTime()) > MISMO_CICLO_MS,
      )
      // Orden por fecha confiable desc (por Nº quedaría el 100 viejo arriba del 37 nuevo).
      const updated = [parte, ...rest].sort((a, b) =>
        fechaConfiable(b.fechaCaja, b.importedAt).localeCompare(fechaConfiable(a.fechaCaja, a.importedAt)))
      persist(LS_PARTES, updated)
      return updated
    })
  }, [])

  const deleteParte = useCallback((id: string) => {
    setPartes(prev => {
      const updated = prev.filter(p => p.id !== id)
      persist(LS_PARTES, updated)
      return updated
    })
  }, [])

  const getParteByCaja = useCallback(
    // La lista está ordenada por fecha desc → con Nº repetido entre ciclos, gana el más reciente.
    (nroCaja: number) => partes.find(p => p.nroCaja === nroCaja),
    [partes],
  )

  const getParteAnterior = useCallback(
    (parte: ParteHabitaciones) => parteAnteriorDe(parte, partes),
    [partes],
  )

  return (
    <ParteContext.Provider value={{ partes, addParte, deleteParte, getParteByCaja, getParteAnterior }}>
      {children}
    </ParteContext.Provider>
  )
}

export function usePartes() {
  const ctx = useContext(ParteContext)
  if (!ctx) throw new Error('usePartes must be used within ParteProvider')
  return ctx
}
