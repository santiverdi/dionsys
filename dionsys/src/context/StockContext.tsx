import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DepositoItem, StockMovement, PedidoSemanal, PedidoSemanalItem } from '../types'
import { generateId } from '../utils/imageCompressor'
import { depositoItems as mockItems, depositoSuppliers, depositoItemSupplier } from '../data/mock'
import { getOrderUnit, getPackSize } from '../utils/deposito'

const LS_DEPOSITO = 'dionsys_deposito'
const LS_MOVEMENTS = 'dionsys_stock_movements'
const LS_PEDIDOS = 'dionsys_pedidos_semanales'

interface StockContextType {
  items: DepositoItem[]
  movements: StockMovement[]
  pedidos: PedidoSemanal[]
  addMovement: (itemId: string, type: 'entrada' | 'salida', quantity: number, createdBy: string, notes?: string, pedidoId?: string) => void
  savePedido: (createdBy: string, pedidoItems: PedidoSemanalItem[]) => PedidoSemanal
  deletePedido: (id: string, deletedBy: string) => void
  setPedidoMonto: (pedidoId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => void
  recibirPedido: (pedidoId: string, recibidoBy: string, recibidos: { itemId: string; cantidad: number }[]) => void
  addItem: (data: Omit<DepositoItem, 'id'>) => void
  updateItem: (id: string, data: Partial<Omit<DepositoItem, 'id'>>) => void
  deleteItem: (id: string) => void
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
    // Find current item name + clamp the recorded quantity to what's actually available
    // on a salida, so the movement never claims more than the stock could drop.
    let itemName = ''
    let effectiveQty = quantity
    setItems(prev => {
      const updated = prev.map(item => {
        if (item.id !== itemId) return item
        itemName = item.name
        if (type === 'salida') {
          effectiveQty = Math.min(quantity, item.stock)
          return { ...item, stock: +(item.stock - effectiveQty).toFixed(1) }
        }
        return { ...item, stock: +(item.stock + quantity).toFixed(1) }
      })
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })

    if (effectiveQty <= 0) return // nothing to record (salida sobre stock 0)

    const movement: StockMovement = {
      id: generateId(),
      itemId,
      itemName,
      type,
      quantity: effectiveQty,
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
    // recibidos.cantidad viene en unidad de COMPRA (packs/bolsas/cajas).
    const packsMap = new Map(recibidos.map(r => [r.itemId, r.cantidad]))
    const fecha = new Date()
    const fechaIso = fecha.toISOString()
    const fechaLabel = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

    // Bump stock (en unidad de consumo) convirtiendo packs -> base con el packSize de cada item.
    const itemNameById = new Map<string, string>()
    const baseDeltaById = new Map<string, number>()
    const orderUnitById = new Map<string, string>()
    setItems(prev => {
      const updated = prev.map(item => {
        const packs = packsMap.get(item.id)
        if (!packs || packs <= 0) return item
        const base = +(packs * getPackSize(item)).toFixed(2)
        itemNameById.set(item.id, item.name)
        baseDeltaById.set(item.id, base)
        orderUnitById.set(item.id, getOrderUnit(item))
        return { ...item, stock: +(item.stock + base).toFixed(2) }
      })
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })

    // Create one entrada movement per item received (>0), quantity in consume units.
    const newMovements: StockMovement[] = []
    for (const [itemId, base] of baseDeltaById) {
      const packs = packsMap.get(itemId) ?? 0
      const orderUnit = orderUnitById.get(itemId) ?? ''
      const packNote = base !== packs ? ` (${packs} ${orderUnit})` : ''
      newMovements.push({
        id: generateId(),
        itemId,
        itemName: itemNameById.get(itemId) ?? '',
        type: 'entrada',
        quantity: base,
        date: fechaIso,
        createdBy: recibidoBy,
        notes: `Pedido semanal del ${fechaLabel}${packNote}`,
        pedidoId,
      })
    }
    if (newMovements.length > 0) {
      setMovements(prev => {
        const updated = [...newMovements, ...prev]
        localStorage.setItem(LS_MOVEMENTS, JSON.stringify(updated))
        return updated
      })
    }

    // Mark pedido as recibido and store per-item recibido (en unidad de compra).
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
            recibido: packsMap.get(it.itemId) ?? 0,
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

  const addItem = useCallback((data: Omit<DepositoItem, 'id'>) => {
    const item: DepositoItem = { ...data, id: generateId() }
    setItems(prev => {
      const updated = [...prev, item]
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })
  }, [])

  const updateItem = useCallback((id: string, data: Partial<Omit<DepositoItem, 'id'>>) => {
    setItems(prev => {
      const updated = prev.map(it => (it.id === id ? { ...it, ...data } : it))
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
      return updated
    })
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems(prev => {
      const updated = prev.filter(it => it.id !== id)
      localStorage.setItem(LS_DEPOSITO, JSON.stringify(updated))
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
      addMovement, savePedido, deletePedido, setPedidoMonto, recibirPedido,
      addItem, updateItem, deleteItem, resetStock,
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

export function generatePedidoText(
  pedidoItems: PedidoSemanalItem[],
  createdBy: string,
  items?: DepositoItem[],
): string {
  if (pedidoItems.length === 0) return ''

  const supplierById = new Map((items ?? []).map(i => [i.id, i.supplierId]))

  // Group by supplier (item override first, then static map)
  const groups = new Map<string, { supplierName: string; items: PedidoSemanalItem[] }>()
  for (const item of pedidoItems) {
    const supplierId = supplierById.get(item.itemId) ?? depositoItemSupplier[item.itemId] ?? 'sup-alim'
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
      lines.push(`  - ${item.name}: ${item.aPedir} ${item.orderUnit ?? item.unit}`)
    }
    lines.push('')
  }

  lines.push('Gracias!')
  return lines.join('\n')
}
