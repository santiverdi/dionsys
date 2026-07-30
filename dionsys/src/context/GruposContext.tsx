import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { persist, useCloudSync } from '../lib/cloudStore'
import { mergeGrupos, type ResultadoImport } from '../lib/grupos'
import type { Grupo } from '../types'

const LS_GRUPOS = 'dionsys_grupos'

interface GruposContextType {
  grupos: Grupo[]
  /** Fusiona lo del Excel con lo guardado y devuelve qué cambió (ver mergeGrupos). */
  importarGrupos: (grupos: Grupo[]) => ResultadoImport
  borrarGrupos: () => void
}

const GruposContext = createContext<GruposContextType | null>(null)

// Grupos que cobra el dueño por fuera de la caja. No se cargan a mano: se
// importa su Excel (misma regla de no doble carga que la caja y el parte).
//
// La planilla SOLO tiene los grupos que vienen (cuando uno se aloja, el dueño
// lo saca), así que importar NO puede reemplazar todo: los grupos que ya se
// alojaron se conservan como historia. La fusión vive en mergeGrupos().
export function GruposProvider({ children }: { children: ReactNode }) {
  const [grupos, setGrupos] = useState<Grupo[]>(() => {
    const saved = localStorage.getItem(LS_GRUPOS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<Grupo[]>(LS_GRUPOS, setGrupos)

  // Se calcula sobre el estado actual y NO dentro del updater de setGrupos: el
  // updater no corre sincrónicamente, así que el resumen del import volvería
  // vacío. Importar es una acción puntual del usuario, no hay carrera.
  const importarGrupos = useCallback((delExcel: Grupo[]): ResultadoImport => {
    const resultado = mergeGrupos(grupos, delExcel)
    setGrupos(resultado.grupos)
    persist(LS_GRUPOS, resultado.grupos)
    return resultado
  }, [grupos])

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
