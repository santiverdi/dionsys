import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DepositoItem, StockMovement, PedidoSemanal, PedidoSemanalItem } from '../types'
import { generateId } from '../utils/imageCompressor'
import { depositoItems as mockItems, depositoSuppliers, depositoItemSupplier } from '../data/mock'

const LS_DEPOSITO = 'dionsys_deposito'
const LS_MOVEMENTS = 'dionsys_stock_movements'
const LS_PEDIDOS = 'dionsys_pedidos_semanales'

interface StockContextType {
  items: DepositoItem[]
  movements: StockMovement[]
  pedidos: PedidoSemanal[]
  addMovement: (itemId: string, type: 'entrada' | 'salida', quantity: number, createdBy: string, notes?: string, pedidoId?: string) => void
  generatePedidoItems: () => PedidoSemanalItem[]
  savePedido: (createdBy: string, pedidoItems: PedidoSemanalItem[]) => PedidoSemanal
  deletePedido: (id: string, deletedBy: string) => void
  setPedidoMonto: (pedidoId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => void
  recibirPedido: (pedidoId: string, recibidoBy: string, recibidos: { itemId: string; cantidad: number }[]) => void
  resetStock: () => void
}

const StockContext = createContext<StockContextType | null>(null)

export function StockProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DepositoItem[]>(() => {
    const saved = localStorage.getItem(LS_DEPOSITO)
    return saved ? JSON.parse(saved) : mockItems
  })

  const [movements, setMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem(LS_MOVEMENTS)
    return saved ? JSON.parse(saved) : []
  })

  const [pedidos, setPedidos] = useState<PedidoSemanal[]>(() => {
    const saved = localStorage.getItem(LS_PEDIDOS)
    return saved ? JSON.parse(saved) : []
  })

  const addMovement = useCallback((
    itemId: string,
    type: 'entrada' | 'salida',
    quantity: number,
    createdBy: string,
    notes = '',
    pedidoId?: string,
  ) => {
    // Find current item name before updating
    let itemName = ''
    setItems(prev => {
      const updated = prev.map(item => {
        if (item.id !== itemId) return item
        itemName = item.name
        const newStock = type === 'entrada'
          ? +(item.stock + quantity).toFixed(1)
          : +Math.max(0, item.stock - quantity).toFixed(1)
        return { ...item, stock: newStock }
      })
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })

    const movement: StockMovement = {
      id: generateId(),
      itemId,
      itemName,
      type,
      quantity,
      date: new Date().toISOString(),
      createdBy,
      notes,
      ...(pedidoId ? { pedidoId } : {}),
    }
    setMovements(prev => {
      const updated = [movement, ...prev]
      localStorage.setItem(LS_MOVEMENTS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const generatePedidoItems = useCallback((): PedidoSemanalItem[] => {
    return items
      .filter(item => item.stock < item.stockIdeal)
      .map(item => ({
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        stockActual: item.stock,
        stockIdeal: item.stockIdeal,
        aPedir: +((item.stockIdeal - item.stock).toFixed(1)),
      }))
  }, [items])

  const savePedido = useCallback((createdBy: string, pedidoItems: PedidoSemanalItem[]): PedidoSemanal => {
    const pedido: PedidoSemanal = {
      id: generateId(),
      date: new Date().toISOString(),
      createdBy,
      items: pedidoItems,
      status: 'enviado',
    }
    setPedidos(prev => {
      const updated = [pedido, ...prev]
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
    return pedido
  }, [])

  const deletePedido = useCallback((id: string, deletedBy: string) => {
    setPedidos(prev => {
      const updated = prev.map(p =>
        p.id === id
          ? { ...p, status: 'borrado' as const, deletedAt: new Date().toISOString(), deletedBy }
          : p
      )
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const recibirPedido = useCallback((
    pedidoId: string,
    recibidoBy: string,
    recibidos: { itemId: string; cantidad: number }[],
  ) => {
    if (recibidos.length === 0) return
    const recibidosMap = new Map(recibidos.map(r => [r.itemId, r.cantidad]))
    const positivos = recibidos.filter(r => r.cantidad > 0)
    const fecha = new Date()
    const fechaIso = fecha.toISOString()
    const fechaLabel = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

    // Bump stock for all received items in a single update
    const itemNameById = new Map<string, string>()
    setItems(prev => {
      const updated = prev.map(item => {
        const cant = recibidosMap.get(item.id)
        if (!cant || cant <= 0) return item
        itemNameById.set(item.id, item.name)
        return { ...item, stock: +(item.stock + cant).toFixed(1) }
      })
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })

    // Create entrada movements for each item received (>0), batched
    if (positivos.length > 0) {
      const newMovements: StockMovement[] = positivos.map(r => ({
        id: generateId(),
        itemId: r.itemId,
        itemName: itemNameById.get(r.itemId) ?? '',
        type: 'entrada' as const,
        quantity: r.cantidad,
        date: fechaIso,
        createdBy: recibidoBy,
        notes: `Pedido semanal del ${fechaLabel}`,
        pedidoId,
      }))
      setMovements(prev => {
        const updated = [...newMovements, ...prev]
        localStorage.setItem(LS_MOVEMENTS, JSON.stringify(updated))
        return updated
      })
    }

    // Mark pedido as recibido and store per-item recibido
    setPedidos(prev => {
      const updated = prev.map(p => {
        if (p.id !== pedidoId) return p
        return {
          ...p,
          status: 'recibido' as const,
          recibidoAt: fechaIso,
          recibidoBy,
          items: p.items.map(it => ({
            ...it,
            recibido: recibidosMap.get(it.itemId) ?? 0,
          })),
        }
      })
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const setPedidoMonto = useCallback((pedidoId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => {
    setPedidos(prev => {
      const updated = prev.map(p =>
        p.id === pedidoId
          ? {
              ...p,
              monto,
              montoCargadoBy: cargadoBy,
              montoCargadoAt: new Date().toISOString(),
              ...(receiptPhoto !== undefined ? { receiptPhoto } : {}),
            }
          : p
      )
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const resetStock = useCallback(() => {
    setItems(mockItems)
    localStorage.setItem(LS_DEPOSITO, JSON.stringify(mockItems))
  }, [])

  return (
    <StockContext.Provider value={{
      items, movements, pedidos,
      addMovement, generatePedidoItems, savePedido, deletePedido, setPedidoMonto, recibirPedido, resetStock,
    }}>
      {children}
    </StockContext.Provider>
  )
}

export function useStock() {
  const ctx = useContext(StockContext)
  if (!ctx) throw new Error('useStock must be used within StockProvider')
  return ctx
}

export function generatePedidoText(pedidoItems: PedidoSemanalItem[], createdBy: string): string {
  if (pedidoItems.length === 0) return ''

  // Group by supplier
  const groups = new Map<string, { supplierName: string; items: PedidoSemanalItem[] }>()
  for (const item of pedidoItems) {
    const supplierId = depositoItemSupplier[item.itemId] ?? 'sup-alim'
    const supplier = depositoSuppliers.find(s => s.id === supplierId)
    const name = supplier?.name ?? 'Otro'

    if (!groups.has(supplierId)) {
      groups.set(supplierId, { supplierName: name, items: [] })
    }
    groups.get(supplierId)!.items.push(item)
  }

  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const lines: string[] = []
  lines.push('*PEDIDO SEMANAL - Hotel Dion*')
  lines.push(`Fecha: ${fecha}`)
  lines.push(`Responsable: ${createdBy}`)
  lines.push('')

  for (const [, group] of groups) {
    lines.push(`*${group.supplierName.toUpperCase()}:*`)
    for (const item of group.items) {
      lines.push(`  - ${item.name}: ${item.aPedir} ${item.unit}`)
    }
    lines.push('')
  }

  lines.push('Gracias!')
  return lines.join('\n')
}
