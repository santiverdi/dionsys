import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { getCurrentTurno, type Turno } from './OccupancyContext'

export type { Turno }

// Titular por defecto de cada turno.
export const DEFAULT_SHIFTS: Record<Turno, string> = {
  manana: 'Leandro',
  tarde: 'Santiago',
  noche: 'Gaston',
}

// Conserjes que pueden cubrir cualquier turno.
export const CONSERJES = ['Leandro', 'Santiago', 'Gaston', 'Valentin']

export interface TurnoOverride {
  date: string   // YYYY-MM-DD
  turno: Turno   // 'manana' | 'tarde' | 'noche'
  name: string   // quién hace ese turno ese día (override del titular)
}

interface TurnosContextType {
  getShiftEmployee: (date: string, turno: Turno) => string
  setShift: (date: string, turno: Turno, name: string) => void
  getMonthOverrides: (year: number, month: number) => TurnoOverride[]
  getCurrentShiftName: () => string
}

const STORAGE_KEY = 'dionsys_turnos'

function loadOverrides(): TurnoOverride[] {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return []
  // Migración: el formato viejo {date, turno} (sin name) significaba "lo cubre Valentin".
  const parsed: (TurnoOverride & { name?: string })[] = JSON.parse(saved)
  let changed = false
  const migrated = parsed.map(o => {
    if (!o.name) { changed = true; return { ...o, name: 'Valentin' } }
    return o as TurnoOverride
  })
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
  return migrated
}

function saveOverrides(overrides: TurnoOverride[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TurnosContext = createContext<TurnosContextType | null>(null)

export function TurnosProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<TurnoOverride[]>(loadOverrides)

  const findOverride = useCallback((date: string, turno: Turno): TurnoOverride | undefined => {
    return overrides.find(o => o.date === date && o.turno === turno)
  }, [overrides])

  const getShiftEmployee = useCallback((date: string, turno: Turno): string => {
    return findOverride(date, turno)?.name ?? DEFAULT_SHIFTS[turno]
  }, [findOverride])

  // Asigna `name` a (date, turno). Si es el titular por defecto, quita el override.
  const setShift = useCallback((date: string, turno: Turno, name: string) => {
    setOverrides(prev => {
      const rest = prev.filter(o => !(o.date === date && o.turno === turno))
      const updated = name === DEFAULT_SHIFTS[turno] ? rest : [...rest, { date, turno, name }]
      saveOverrides(updated)
      return updated
    })
  }, [])

  const getMonthOverrides = useCallback((year: number, month: number): TurnoOverride[] => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return overrides.filter(o => o.date.startsWith(prefix))
  }, [overrides])

  const getCurrentShiftName = useCallback((): string => {
    const turno = getCurrentTurno()
    return findOverride(todayStr(), turno)?.name ?? DEFAULT_SHIFTS[turno]
  }, [findOverride])

  return (
    <TurnosContext.Provider value={{ getShiftEmployee, setShift, getMonthOverrides, getCurrentShiftName }}>
      {children}
    </TurnosContext.Provider>
  )
}

export function useTurnos() {
  const ctx = useContext(TurnosContext)
  if (!ctx) throw new Error('useTurnos must be used within TurnosProvider')
  return ctx
}
