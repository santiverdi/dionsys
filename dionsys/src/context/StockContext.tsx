import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DepositoItem, StockMovement, PedidoSemanal, PedidoSemanalItem, DepositoSupplier } from '../types'
import { generateId } from '../utils/imageCompressor'
import { depositoItems as mockItems, depositoSuppliers as mockSuppliers, depositoItemSupplier } from '../data/mock'
import { getOrderUnit, getPackSize } from '../utils/deposito'

const LS_DEPOSITO = 'dionsys_deposito'
const LS_MOVEMENTS = 'dionsys_stock_movements'
const LS_PEDIDOS = 'dionsys_pedidos_semanales'
const LS_SUPPLIERS = 'dionsys_deposito_suppliers'

// --- Migración idempotente de datos reales (PROVEEDORES HOTEL DION) ---
// Solo completa lo que falte; no pisa ediciones manuales ni toca el stock.
// Teléfonos tal cual el Excel. La Galletera no tenía teléfono (solo el código 14045).
const SUPPLIER_PHONES: Record<string, string> = {
  'tpg': '223582931',
  'la-paulina': '2234363081',
  'gervasi': '01156393651',
  'luseda': '2236345506',
  'reposmar': '2235316184',
  'quimica-dem': '2235060578',
  'papelera-plata': '2236051913',
  'cafe-virginia': '2234363081',
  'digamar': '223447200',
}

// Harina/Azucar: se PIDEN y cuentan en PAQUETES (1 paquete = 1 kg). Sin pack en el
// sistema (el "bulto" es solo físico: cuando reciben un bulto cargan 10 paquetes).
// Se fuerza incluso si una versión anterior les había puesto packUnit 'bulto'.
const ITEM_UNIT_FIX: Record<string, string> = {
  'des-1': 'paquete', // Harina
  'des-2': 'paquete', // Azucar
}

// Items que se compran por pack (se cuentan desglosados en unidad de consumo).
// scale=true => stock y stockIdeal actuales están en packs, se multiplican por packSize
// para pasar a la subunidad (preserva el "pedir N packs para llegar al ideal").
const ITEM_PACKS: Record<string, { unit: string; packUnit: string; packSize: number; scale?: boolean }> = {
  'des-5':  { unit: 'unidad',  packUnit: 'caja',    packSize: 6,   scale: true },  // Cafe x6
  'lim-28': { unit: 'unidad',  packUnit: 'paquete', packSize: 12,  scale: true },  // Esponjas amarillas x12
  'lim-4':  { unit: 'unidad',  packUnit: 'caja',    packSize: 500, scale: true },  // Jaboncitos x500
  'lim-6':  { unit: 'unidad',  packUnit: 'bolson',  packSize: 50,  scale: true },  // Bolsa camiseta x50
  'lim-14': { unit: 'unidad',  packUnit: 'paquete', packSize: 50,  scale: true },  // Bolsa consorcio x50
}

function migrateSuppliers(list: DepositoSupplier[]): DepositoSupplier[] {
  let changed = false
  const next = list.map(s => {
    const phone = SUPPLIER_PHONES[s.id]
    if (phone && !s.phone) { changed = true; return { ...s, phone } }
    return s
  })
  if (changed) localStorage.setItem(LS_SUPPLIERS, JSON.stringify(next))
  return next
}

function migrateItems(list: DepositoItem[]): DepositoItem[] {
  let changed = false
  const next = list.map(it => {
    // Harina/Azucar: forzar unidad 'paquete' y sacar cualquier pack (revierte la versión con bulto).
    const fixUnit = ITEM_UNIT_FIX[it.id]
    if (fixUnit && (it.unit !== fixUnit || it.packUnit)) {
      changed = true
      const { packUnit: _pu, packSize: _ps, ...rest } = it
      void _pu; void _ps
      return { ...rest, unit: fixUnit }
    }
    // Items por pack (idempotente: solo si todavía no tienen packUnit).
    const pack = ITEM_PACKS[it.id]
    if (pack && !it.packUnit) {
      changed = true
      const { scale, unit, packUnit, packSize } = pack
      return {
        ...it,
        unit, packUnit, packSize,
        ...(scale
          ? { stock: +(it.stock * packSize).toFixed(2), stockIdeal: +(it.stockIdeal * packSize).toFixed(2) }
          : {}),
      }
    }
    return it
  })
  if (changed) localStorage.setItem(LS_DEPOSITO, JSON.stringify(next))
  return next
}

interface StockContextType {
  items: DepositoItem[]
  movements: StockMovement[]
  pedidos: PedidoSemanal[]
  suppliers: DepositoSupplier[]
  addMovement: (itemId: string, type: 'entrada' | 'salida', quantity: number, createdBy: string, notes?: string, pedidoId?: string) => void
  savePedido: (createdBy: string, pedidoItems: PedidoSemanalItem[]) => PedidoSemanal
  marcarPedido: (pedidoId: string, by: string) => void
  deletePedido: (id: string, deletedBy: string) => void
  setPedidoMonto: (pedidoId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => void
  recibirPedido: (pedidoId: string, recibidoBy: string, recibidos: { itemId: string; cantidad: number }[]) => void
  addItem: (data: Omit<DepositoItem, 'id'>) => void
  updateItem: (id: string, data: Partial<Omit<DepositoItem, 'id'>>) => void
  deleteItem: (id: string) => void
  addSupplier: (data: Omit<DepositoSupplier, 'id'>) => void
  updateSupplier: (id: string, data: Partial<Omit<DepositoSupplier, 'id'>>) => void
  deleteSupplier: (id: string) => void
  clearAllStock: () => void
  resetStock: () => void
}

const StockContext = createContext<StockContextType | null>(null)

export function StockProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DepositoItem[]>(() => {
    const saved = localStorage.getItem(LS_DEPOSITO)
    return migrateItems(saved ? JSON.parse(saved) : mockItems)
  })

  const [movements, setMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem(LS_MOVEMENTS)
    return saved ? JSON.parse(saved) : []
  })

  const [pedidos, setPedidos] = useState<PedidoSemanal[]>(() => {
    const saved = localStorage.getItem(LS_PEDIDOS)
    if (!saved) return []
    // Migración: el viejo estado 'enviado' (Roxana guardaba) pasa a 'armado'.
    const parsed: PedidoSemanal[] = JSON.parse(saved)
    let changed = false
    const migrated = parsed.map(p => {
      if ((p.status as string) === 'enviado') { changed = true; return { ...p, status: 'armado' as const } }
      return p
    })
    if (changed) localStorage.setItem(LS_PEDIDOS, JSON.stringify(migrated))
    return migrated
  })

  const [suppliers, setSuppliers] = useState<DepositoSupplier[]>(() => {
    const saved = localStorage.getItem(LS_SUPPLIERS)
    return migrateSuppliers(saved ? JSON.parse(saved) : mockSuppliers)
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
      status: 'armado',
    }
    setPedidos(prev => {
      const updated = [pedido, ...prev]
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
    return pedido
  }, [])

  const marcarPedido = useCallback((pedidoId: string, by: string) => {
    setPedidos(prev => {
      const updated = prev.map(p =>
        p.id === pedidoId && p.status === 'armado'
          ? { ...p, status: 'pedido' as const, pedidoAt: new Date().toISOString(), pedidoBy: by }
          : p
      )
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(updated))
      return updated
    })
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

  const addSupplier = useCallback((data: Omit<DepositoSupplier, 'id'>) => {
    const supplier: DepositoSupplier = { ...data, id: generateId() }
    setSuppliers(prev => {
      const updated = [...prev, supplier]
      localStorage.setItem(LS_SUPPLIERS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const updateSupplier = useCallback((id: string, data: Partial<Omit<DepositoSupplier, 'id'>>) => {
    setSuppliers(prev => {
      const updated = prev.map(s => (s.id === id ? { ...s, ...data } : s))
      localStorage.setItem(LS_SUPPLIERS, JSON.stringify(updated))
      return updated
    })
  }, [])

  const deleteSupplier = useCallback((id: string) => {
    setSuppliers(prev => {
      const updated = prev.filter(s => s.id !== id)
      localStorage.setItem(LS_SUPPLIERS, JSON.stringify(updated))
      return updated
    })
  }, [])

  // Pone el stock de todos los items en 0, conservando nombre, formato de compra,
  // stock ideal, proveedor, etc. (no borra items ni configuración).
  const clearAllStock = useCallback(() => {
    setItems(prev => {
      const updated = prev.map(it => ({ ...it, stock: 0 }))
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
      items, movements, pedidos, suppliers,
      addMovement, savePedido, marcarPedido, deletePedido, setPedidoMonto, recibirPedido,
      addItem, updateItem, deleteItem,
      addSupplier, updateSupplier, deleteSupplier, clearAllStock, resetStock,
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
  suppliers: DepositoSupplier[] = mockSuppliers,
): string {
  if (pedidoItems.length === 0) return ''

  const supplierById = new Map((items ?? []).map(i => [i.id, i.supplierId]))

  // Group by supplier (item override first, then static map)
  const groups = new Map<string, { supplierName: string; items: PedidoSemanalItem[] }>()
  for (const item of pedidoItems) {
    const supplierId = supplierById.get(item.itemId) ?? depositoItemSupplier[item.itemId] ?? 'sup-alim'
    const supplier = suppliers.find(s => s.id === supplierId)
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
