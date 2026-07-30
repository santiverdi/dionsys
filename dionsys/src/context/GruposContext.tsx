import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { persist, useCloudSync } from '../lib/cloudStore'
import type { Grupo } from '../types'

const LS_GRUPOS = 'dionsys_grupos'

interface GruposContextType {
  grupos: Grupo[]
  /** Reemplaza TODO por lo que traiga el Excel: la planilla del dueño es la fuente de verdad. */
  importarGrupos: (grupos: Grupo[]) => void
  borrarGrupos: () => void
}

const GruposContext = createContext<GruposContextType | null>(null)

// Grupos que cobra el dueño por fuera de la caja. No se cargan a mano: se
// importa su Excel (misma regla de no doble carga que la caja y el parte). Por
// eso importar REEMPLAZA todo en vez de acumular — así se refleja cualquier
// corrección o pago nuevo que el dueño haya hecho en la planilla.
export function GruposProvider({ children }: { children: ReactNode }) {
  const [grupos, setGrupos] = useState<Grupo[]>(() => {
    const saved = localStorage.getItem(LS_GRUPOS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<Grupo[]>(LS_GRUPOS, setGrupos)

  const importarGrupos = useCallback((nuevos: Grupo[]) => {
    setGrupos(nuevos)
    persist(LS_GRUPOS, nuevos)
  }, [])

  const borrarGrupos = useCallback(() => {
    setGrupos([])
    persist(LS_GRUPOS, [])
  }, [])

  return (
    <GruposContext.Provider value={{ grupos, importarGrupos, borrarGrupos }}>
      {children}
    </GruposContext.Provider>
  )
}

export function useGrupos() {
  const ctx = useContext(GruposContext)
  if (!ctx) throw new Error('useGrupos must be used within GruposProvider')
  return ctx
}
