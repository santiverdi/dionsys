import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { EmpleadoNomina, PagoSueldo } from '../types'
import { persist, useCloudSync, setAdminAccess, pullAdminOnlyKeys, purgeAdminOnlyKeys } from '../lib/cloudStore'
import { useAuth } from './AuthContext'

interface SueldosContextType {
  empleados: EmpleadoNomina[]
  pagos: PagoSueldo[]
  // Devuelve el empleado creado (con su id) para poder asignarlo en el acto: el
  // alta desde un recibo escaneado necesita saber a quién acaba de crear.
  addEmpleado: (empleado: Omit<EmpleadoNomina, 'id'>) => EmpleadoNomina
  updateEmpleado: (empleado: EmpleadoNomina) => void
  deleteEmpleado: (id: string) => void
  addPago: (pago: Omit<PagoSueldo, 'id'>) => void
  updatePago: (pago: PagoSueldo) => void
  deletePago: (pagoId: string) => void
  getPagosByMes: (mes: string) => PagoSueldo[]
}

const EMPLEADOS_KEY = 'dionsys_nomina_empleados'
const PAGOS_KEY = 'dionsys_sueldos_pagos'

function loadEmpleados(): EmpleadoNomina[] {
  const saved = localStorage.getItem(EMPLEADOS_KEY)
  return saved ? JSON.parse(saved) : []
}

function saveEmpleados(empleados: EmpleadoNomina[]) {
  persist(EMPLEADOS_KEY, empleados)
}

function loadPagos(): PagoSueldo[] {
  const saved = localStorage.getItem(PAGOS_KEY)
  return saved ? JSON.parse(saved) : []
}

function savePagos(pagos: PagoSueldo[]) {
  persist(PAGOS_KEY, pagos)
}

const SueldosContext = createContext<SueldosContextType | null>(null)

export function SueldosProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'

  // Sin admin no cargamos nada en memoria (los datos de sueldos son solo-admin).
  const [empleados, setEmpleados] = useState<EmpleadoNomina[]>(() => isAdmin ? loadEmpleados() : [])
  const [pagos, setPagos] = useState<PagoSueldo[]>(() => isAdmin ? loadPagos() : [])

  useCloudSync<EmpleadoNomina[]>(EMPLEADOS_KEY, setEmpleados)
  useCloudSync<PagoSueldo[]>(PAGOS_KEY, setPagos)

  // El sync de sueldos se activa/desactiva según el rol del usuario logueado.
  // - Admin: habilitamos el acceso y bajamos las keys bajo demanda desde la nube.
  // - No admin (o logout): purgamos las keys de localStorage y vaciamos el estado,
  //   para no dejar residuos de sueldos en equipos compartidos.
  useEffect(() => {
    let active = true
    if (isAdmin) {
      setAdminAccess(true)
      void pullAdminOnlyKeys().then(() => {
        if (!active) return
        setEmpleados(loadEmpleados())
        setPagos(loadPagos())
      })
    } else {
      setAdminAccess(false)
      purgeAdminOnlyKeys()
      setEmpleados([])
      setPagos([])
    }
    return () => { active = false }
  }, [isAdmin])

  const addEmpleado = useCallback((empleado: Omit<EmpleadoNomina, 'id'>): EmpleadoNomina => {
    // El id se genera FUERA del updater: así se puede devolver al que llama, y de
    // paso el updater queda idempotente si React lo corre dos veces.
    const nuevo: EmpleadoNomina = { ...empleado, id: crypto.randomUUID() }
    setEmpleados(prev => {
      const updated = [...prev, nuevo]
      saveEmpleados(updated)
      return updated
    })
    return nuevo
  }, [])

  const updateEmpleado = useCallback((empleado: EmpleadoNomina) => {
    setEmpleados(prev => {
      const updated = prev.map(e => e.id === empleado.id ? empleado : e)
      saveEmpleados(updated)
      return updated
    })
  }, [])

  // Baja lógica: dejamos de mostrarlo en la nómina activa pero NO borramos sus pagos
  // (el histórico del mes debe seguir sumando). El snapshot del nombre en cada pago
  // hace que se sigan viendo aunque el empleado desaparezca.
  const deleteEmpleado = useCallback((id: string) => {
    setEmpleados(prev => {
      const updated = prev.filter(e => e.id !== id)
      saveEmpleados(updated)
      return updated
    })
  }, [])

  const addPago = useCallback((pago: Omit<PagoSueldo, 'id'>) => {
    setPagos(prev => {
      const nuevo: PagoSueldo = { ...pago, id: crypto.randomUUID() }
      const updated = [nuevo, ...prev]
      savePagos(updated)
      return updated
    })
  }, [])

  const updatePago = useCallback((pago: PagoSueldo) => {
    setPagos(prev => {
      const updated = prev.map(p => p.id === pago.id ? pago : p)
      savePagos(updated)
      return updated
    })
  }, [])

  const deletePago = useCallback((pagoId: string) => {
    setPagos(prev => {
      const updated = prev.filter(p => p.id !== pagoId)
      savePagos(updated)
      return updated
    })
  }, [])

  const getPagosByMes = useCallback((mes: string): PagoSueldo[] => {
    return pagos.filter(p => p.mes === mes)
  }, [pagos])

  return (
    <SueldosContext.Provider value={{
      empleados, pagos, addEmpleado, updateEmpleado, deleteEmpleado, addPago, updatePago, deletePago, getPagosByMes
    }}>
      {children}
    </SueldosContext.Provider>
  )
}

export function useSueldos() {
  const ctx = useContext(SueldosContext)
  if (!ctx) throw new Error('useSueldos must be used within SueldosProvider')
  return ctx
}
