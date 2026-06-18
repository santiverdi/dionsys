import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Order, OrderItem, FacturaProveedor } from '../types'
import { generateId } from '../utils/imageCompressor'
import { persist, useCloudSync } from '../lib/cloudStore'

const LS_ORDERS = 'dionsys_orders'

interface OrdersContextType {
  orders: Order[]
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => Order
  deleteOrder: (id: string, deletedBy: string) => void
  setOrderMonto: (orderId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => void
  setOrderFactura: (orderId: string, factura: FacturaProveedor, cargadoBy: string) => void
}

const OrdersContext = createContext<OrdersContextType | null>(null)

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem(LS_ORDERS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<Order[]>(LS_ORDERS, setOrders)

  const addOrder = useCallback((data: Omit<Order, 'id' | 'createdAt'>): Order => {
    const order: Order = {
      ...data,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setOrders(prev => {
      const updated = [order, ...prev]
      persist(LS_ORDERS, updated)
      return updated
    })
    return order
  }, [])

  const deleteOrder = useCallback((id: string, deletedBy: string) => {
    setOrders(prev => {
      const updated = prev.map(o =>
        o.id === id
          ? { ...o, status: 'borrado' as const, deletedAt: new Date().toISOString(), deletedBy }
          : o
      )
      persist(LS_ORDERS, updated)
      return updated
    })
  }, [])

  const setOrderMonto = useCallback((orderId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => {
    setOrders(prev => {
      const updated = prev.map(o =>
        o.id === orderId
          ? {
              ...o,
              monto,
              montoCargadoBy: cargadoBy,
              montoCargadoAt: new Date().toISOString(),
              status: 'recibido' as const,
              ...(receiptPhoto !== undefined ? { receiptPhoto } : {}),
            }
          : o
      )
      persist(LS_ORDERS, updated)
      return updated
    })
  }, [])

  const setOrderFactura = useCallback((orderId: string, factura: FacturaProveedor, cargadoBy: string) => {
    setOrders(prev => {
      const updated = prev.map(o =>
        o.id === orderId
          ? {
              ...o,
              factura,
              monto: factura.monto,
              montoCargadoBy: cargadoBy,
              montoCargadoAt: new Date().toISOString(),
              status: 'recibido' as const,
            }
          : o
      )
      persist(LS_ORDERS, updated)
      return updated
    })
  }, [])

  return (
    <OrdersContext.Provider value={{ orders, addOrder, deleteOrder, setOrderMonto, setOrderFactura }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}

export function generateWhatsAppMessage(
  distributorName: string,
  distributorPhone: string,
  items: OrderItem[],
  notes: string
): { text: string; url: string } {
  const lines = items
    .filter(i => i.quantity > 0)
    .map(i => `- ${i.quantity} x ${i.productName} (${i.unit})${i.notes ? ` [${i.notes}]` : ''}`)

  const text = [
    `Hola *${distributorName}*! Pedido de Hotel Dion:`,
    '',
    ...lines,
    '',
    notes ? `Nota: ${notes}` : '',
    'Gracias!',
  ].filter(Boolean).join('\n')

  const phone = distributorPhone.replace(/\D/g, '')
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`

  return { text, url }
}
