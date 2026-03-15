import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { getCurrentTurno, type Turno } from './OccupancyContext'

export type { Turno }

const DEFAULT_SHIFTS: Record<Turno, string> = {
  manana: 'Leandro',
  tarde: 'Santiago',
  noche: 'Gaston',
}

export interface TurnoOverride {
  date: string   // YYYY-MM-DD
  turno: Turno   // 'manana' | 'tarde' | 'noche'
}

interface TurnosContextType {
  getShiftEmployee: (date: string, turno: Turno) => string
  toggleOverride: (date: string, turno: Turno) => void
  getMonthOverrides: (year: number, month: number) => TurnoOverride[]
  getCurrentShiftName: () => string
}

const STORAGE_KEY = 'dionsys_turnos'

function loadOverrides(): TurnoOverride[] {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
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

  const hasOverride = useCallback((date: string, turno: Turno): boolean => {
    return overrides.some(o => o.date === date && o.turno === turno)
  }, [overrides])

  const getShiftEmployee = useCallback((date: string, turno: Turno): string => {
    return hasOverride(date, turno) ? 'Valentin' : DEFAULT_SHIFTS[turno]
  }, [hasOverride])

  const toggleOverride = useCallback((date: string, turno: Turno) => {
    setOverrides(prev => {
      const idx = prev.findIndex(o => o.date === date && o.turno === turno)
      const updated = idx >= 0
        ? prev.filter((_, i) => i !== idx)
        : [...prev, { date, turno }]
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
    const date = todayStr()
    return hasOverride(date, turno) ? 'Valentin' : DEFAULT_SHIFTS[turno]
  }, [hasOverride])

  return (
    <TurnosContext.Provider value={{ getShiftEmployee, toggleOverride, getMonthOverrides, getCurrentShiftName }}>
      {children}
    </TurnosContext.Provider>
  )
}

export function useTurnos() {
  const ctx = useContext(TurnosContext)
  if (!ctx) throw new Error('useTurnos must be used within TurnosProvider')
  return ctx
}
