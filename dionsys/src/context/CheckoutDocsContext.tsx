import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CheckoutDoc } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'

const LS_DOCS = 'dionsys_checkout_docs'

interface CheckoutDocsContextType {
  docs: CheckoutDoc[]
  getDoc: (reserva: string) => CheckoutDoc | undefined
  setDoc: (doc: CheckoutDoc) => void
  deleteDoc: (reserva: string) => void
}

const CheckoutDocsContext = createContext<CheckoutDocsContextType | null>(null)

export function CheckoutDocsProvider({ children }: { children: ReactNode }) {
  const [docs, setDocs] = useState<CheckoutDoc[]>(() => {
    const saved = localStorage.getItem(LS_DOCS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<CheckoutDoc[]>(LS_DOCS, setDocs)

  const getDoc = useCallback((reserva: string) => docs.find(d => d.reserva === reserva), [docs])

  const setDoc = useCallback((doc: CheckoutDoc) => {
    setDocs(prev => {
      // Dedup por reserva: re-escanear reemplaza la hoja.
      const updated = [doc, ...prev.filter(d => d.reserva !== doc.reserva)]
      persist(LS_DOCS, updated)
      return updated
    })
  }, [])

  const deleteDoc = useCallback((reserva: string) => {
    setDocs(prev => {
      const updated = prev.filter(d => d.reserva !== reserva)
      persist(LS_DOCS, updated)
      return updated
    })
  }, [])

  return (
    <CheckoutDocsContext.Provider value={{ docs, getDoc, setDoc, deleteDoc }}>
      {children}
    </CheckoutDocsContext.Provider>
  )
}

export function useCheckoutDocs() {
  const ctx = useContext(CheckoutDocsContext)
  if (!ctx) throw new Error('useCheckoutDocs must be used within CheckoutDocsProvider')
  return ctx
}
