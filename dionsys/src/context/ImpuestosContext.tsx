import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { ImpuestoServicio, PagoMensual } from '../types'

interface ImpuestosContextType {
  servicios: ImpuestoServicio[]
  pagos: PagoMensual[]
  addServicio: (servicio: Omit<ImpuestoServicio, 'id'>) => void
  updateServicio: (servicio: ImpuestoServicio) => void
  deleteServicio: (id: string) => void
  addPago: (pago: Omit<PagoMensual, 'id'>) => void
  updatePago: (pago: PagoMensual) => void
  togglePagado: (pagoId: string) => void
  getPagosByMes: (mes: string) => PagoMensual[]
  getVencimientosMes: (year: number, month: number) => { dia: number; servicios: { nombre: string; pagado: boolean; vencido: boolean }[] }[]
}

const SERVICIOS_KEY = 'dionsys_impuestos_servicios'
const PAGOS_KEY = 'dionsys_impuestos_pagos'


function loadServicios(): ImpuestoServicio[] {
  const saved = localStorage.getItem(SERVICIOS_KEY)
  return saved ? JSON.parse(saved) : []
}

function saveServicios(servicios: ImpuestoServicio[]) {
  localStorage.setItem(SERVICIOS_KEY, JSON.stringify(servicios))
}

function loadPagos(): PagoMensual[] {
  const saved = localStorage.getItem(PAGOS_KEY)
  return saved ? JSON.parse(saved) : []
}

function savePagos(pagos: PagoMensual[]) {
  localStorage.setItem(PAGOS_KEY, JSON.stringify(pagos))
}

const ImpuestosContext = createContext<ImpuestosContextType | null>(null)

export function ImpuestosProvider({ children }: { children: ReactNode }) {
  const [servicios, setServicios] = useState<ImpuestoServicio[]>(loadServicios)
  const [pagos, setPagos] = useState<PagoMensual[]>(loadPagos)

  const addServicio = useCallback((servicio: Omit<ImpuestoServicio, 'id'>) => {
    setServicios(prev => {
      const nuevo: ImpuestoServicio = { ...servicio, id: crypto.randomUUID() }
      const updated = [...prev, nuevo]
      saveServicios(updated)
      return updated
    })
  }, [])

  const deleteServicio = useCallback((id: string) => {
    setServicios(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveServicios(updated)
      return updated
    })
    setPagos(prev => {
      const updated = prev.filter(p => p.impuestoId !== id)
      savePagos(updated)
      return updated
    })
  }, [])

  const updateServicio = useCallback((servicio: ImpuestoServicio) => {
    setServicios(prev => {
      const updated = prev.map(s => s.id === servicio.id ? servicio : s)
      saveServicios(updated)
      return updated
    })
  }, [])

  const addPago = useCallback((pago: Omit<PagoMensual, 'id'>) => {
    setPagos(prev => {
      const exists = prev.find(p => p.impuestoId === pago.impuestoId && p.mes === pago.mes)
      if (exists) {
        const updated = prev.map(p =>
          p.impuestoId === pago.impuestoId && p.mes === pago.mes
            ? { ...p, monto: pago.monto, vtoActual: pago.vtoActual, vtoSiguiente: pago.vtoSiguiente }
            : p
        )
        savePagos(updated)
        return updated
      }
      const nuevo: PagoMensual = { ...pago, id: crypto.randomUUID() }
      const updated = [nuevo, ...prev]
      savePagos(updated)
      return updated
    })
  }, [])

  const updatePago = useCallback((pago: PagoMensual) => {
    setPagos(prev => {
      const updated = prev.map(p => p.id === pago.id ? pago : p)
      savePagos(updated)
      return updated
    })
  }, [])

  const togglePagado = useCallback((pagoId: string) => {
    setPagos(prev => {
      const updated = prev.map(p =>
        p.id === pagoId
          ? { ...p, pagado: !p.pagado, fechaPago: !p.pagado ? new Date().toISOString() : undefined }
          : p
      )
      savePagos(updated)
      return updated
    })
  }, [])

  const getPagosByMes = useCallback((mes: string): PagoMensual[] => {
    return pagos.filter(p => p.mes === mes)
  }, [pagos])

  const getVencimientosMes = useCallback((year: number, month: number) => {
    const mesStr = `${year}-${String(month).padStart(2, '0')}`
    const hoy = new Date()
    const daysInMonth = new Date(year, month, 0).getDate()
    const result: { dia: number; servicios: { nombre: string; pagado: boolean; vencido: boolean }[] }[] = []

    for (let dia = 1; dia <= daysInMonth; dia++) {
      const serviciosDelDia: { nombre: string; pagado: boolean; vencido: boolean }[] = []
      const fecha = new Date(year, month - 1, dia)

      for (const srv of servicios) {
        if (srv.frecuencia === 'anual') continue
        if (srv.diaVto === dia) {
          const pago = pagos.find(p => p.impuestoId === srv.id && p.mes === mesStr)
          serviciosDelDia.push({
            nombre: srv.nombre,
            pagado: pago?.pagado ?? false,
            vencido: !pago?.pagado && fecha < hoy,
          })
        }
      }

      if (serviciosDelDia.length > 0) {
        result.push({ dia, servicios: serviciosDelDia })
      }
    }

    return result
  }, [servicios, pagos])

  return (
    <ImpuestosContext.Provider value={{
      servicios, pagos, addServicio, updateServicio, deleteServicio, addPago, updatePago, togglePagado, getPagosByMes, getVencimientosMes
    }}>
      {children}
    </ImpuestosContext.Provider>
  )
}

export function useImpuestos() {
  const ctx = useContext(ImpuestosContext)
  if (!ctx) throw new Error('useImpuestos must be used within ImpuestosProvider')
  return ctx
}
