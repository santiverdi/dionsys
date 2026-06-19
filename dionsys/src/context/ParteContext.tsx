import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ParteHabitaciones } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'
import { parteAnteriorDe } from '../lib/parteControl'

const LS_PARTES = 'dionsys_partes'

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
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<ParteHabitaciones[]>(LS_PARTES, setPartes)

  const addParte = useCallback((parte: ParteHabitaciones) => {
    setPartes(prev => {
      // Dedup por Nro. de Caja: re-importar el mismo parte lo reemplaza.
      const rest = prev.filter(p => p.nroCaja !== parte.nroCaja)
      // Orden por nroCaja desc (la fechaCaja puede venir vacía/mal de la IA).
      const updated = [parte, ...rest].sort((a, b) => b.nroCaja - a.nroCaja)
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
