import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Order, OrderItem } from '../types'
import { generateId } from '../utils/imageCompressor'

interface OrdersContextType {
  orders: Order[]
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => Order
  deleteOrder: (id: string, deletedBy: string) => void
}

const OrdersContext = createContext<OrdersContextType | null>(null)

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('dionsys_orders')
    return saved ? JSON.parse(saved) : []
  })

  const addOrder = useCallback((data: Omit<Order, 'id' | 'createdAt'>): Order => {
    const order: Order = {
      ...data,
      id: generateId(),
      createdAt: new Date().toISOString(),
    }
    setOrders(prev => {
      const updated = [order, ...prev]
      localStorage.setItem('dionsys_orders', JSON.stringify(updated))
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
      localStorage.setItem('dionsys_orders', JSON.stringify(updated))
      return updated
    })
  }, [])

  return (
    <OrdersContext.Provider value={{ orders, addOrder, deleteOrder }}>
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
