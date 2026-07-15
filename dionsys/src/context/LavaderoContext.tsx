import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { LavaderoMovimiento, LavaderoLiquidacion } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'
import { generateId } from '../utils/imageCompressor'

const LS_MOVS = 'dionsys_lavadero_movs'
const LS_LIQS = 'dionsys_lavadero_liqs'

interface LavaderoContextType {
  movimientos: LavaderoMovimiento[]
  liquidaciones: LavaderoLiquidacion[]
  addMovimiento: (data: Omit<LavaderoMovimiento, 'id' | 'createdAt'>) => void
  deleteMovimiento: (id: string) => void
  addLiquidacion: (data: Omit<LavaderoLiquidacion, 'id' | 'createdAt'>) => void
  deleteLiquidacion: (id: string) => void
  // Marca pagada/impaga (el pago sale en efectivo de la caja fuerte).
  togglePagada: (id: string) => void
}

const LavaderoContext = createContext<LavaderoContextType | null>(null)

// Control del lavadero tercerizado: remitos de ropa (las copias de la
// gobernanta) + liquidaciones quincenales en cuenta corriente. Sincronizado.
export function LavaderoProvider({ children }: { children: ReactNode }) {
  const [movimientos, setMovimientos] = useState<LavaderoMovimiento[]>(() => {
    const saved = localStorage.getItem(LS_MOVS)
    return saved ? JSON.parse(saved) : []
  })
  const [liquidaciones, setLiquidaciones] = useState<LavaderoLiquidacion[]>(() => {
    const saved = localStorage.getItem(LS_LIQS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<LavaderoMovimiento[]>(LS_MOVS, setMovimientos)
  useCloudSync<LavaderoLiquidacion[]>(LS_LIQS, setLiquidaciones)

  const addMovimiento = useCallback((data: Omit<LavaderoMovimiento, 'id' | 'createdAt'>) => {
    setMovimientos(prev => {
      const mov: LavaderoMovimiento = { ...data, id: generateId(), createdAt: new Date().toISOString() }
      const next = [mov, ...prev].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt))
      persist(LS_MOVS, next)
      return next
    })
  }, [])

  const deleteMovimiento = useCallback((id: string) => {
    setMovimientos(prev => {
      const next = prev.filter(m => m.id !== id)
      persist(LS_MOVS, next)
      return next
    })
  }, [])

  const addLiquidacion = useCallback((data: Omit<LavaderoLiquidacion, 'id' | 'createdAt'>) => {
    setLiquidaciones(prev => {
      const liq: LavaderoLiquidacion = { ...data, id: generateId(), createdAt: new Date().toISOString() }
      const next = [...prev, liq].sort((a, b) => b.hasta.localeCompare(a.hasta))
      persist(LS_LIQS, next)
      return next
    })
  }, [])

  const deleteLiquidacion = useCallback((id: string) => {
    setLiquidaciones(prev => {
      const next = prev.filter(l => l.id !== id)
      persist(LS_LIQS, next)
      return next
    })
  }, [])

  const togglePagada = useCallback((id: string) => {
    setLiquidaciones(prev => {
      const next = prev.map(l => {
        if (l.id !== id) return l
        const pagada = !l.pagada
        const { fechaPago: _omit, ...rest } = l
        void _omit
        return { ...rest, pagada, ...(pagada ? { fechaPago: new Date().toISOString().slice(0, 10) } : {}) }
      })
      persist(LS_LIQS, next)
      return next
    })
  }, [])

  return (
    <LavaderoContext.Provider value={{ movimientos, liquidaciones, addMovimiento, deleteMovimiento, addLiquidacion, deleteLiquidacion, togglePagada }}>
      {children}
    </LavaderoContext.Provider>
  )
}

export function useLavadero() {
  const ctx = useContext(LavaderoContext)
  if (!ctx) throw new Error('useLavadero must be used within LavaderoProvider')
  return ctx
}
