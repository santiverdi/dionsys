import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DepositoItem, StockMovement, PedidoSemanal, PedidoSemanalItem, DepositoSupplier, FacturaProveedor, FacturaManual } from '../types'
import { generateId } from '../utils/imageCompressor'
import { depositoItems as mockItems, depositoSuppliers as mockSuppliers, depositoItemSupplier } from '../data/mock'
import { getOrderUnit, getPackSize, resolveSupplierId } from '../utils/deposito'
import { persist, useCloudSync } from '../lib/cloudStore'

const LS_DEPOSITO = 'dionsys_deposito'
const LS_MOVEMENTS = 'dionsys_stock_movements'
const LS_PEDIDOS = 'dionsys_pedidos_semanales'
const LS_SUPPLIERS = 'dionsys_deposito_suppliers'
const LS_FACTURAS_MANUALES = 'dionsys_facturas_manuales'

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
  'lim-4':  { unit: 'unidad',  packUnit: 'caja',    packSize: 280, scale: true },  // Jaboncitos x280
  'lim-6':  { unit: 'unidad',  packUnit: 'bolson',  packSize: 50,  scale: true },  // Bolsa camiseta x50
  'lim-14': { unit: 'unidad',  packUnit: 'paquete', packSize: 50,  scale: true },  // Bolsa consorcio x50
  'des-27': { unit: 'paquete', packUnit: 'caja',    packSize: 18,  scale: true },  // Galletas de arroz: sale por paquete, ingresa por caja x18
  'des-13': { unit: 'paquete', packUnit: 'caja',    packSize: 12,  scale: true },  // Tapitas de alfajor: sale por paquete, ingresa por caja x12
  'des-30': { unit: 'kg',      packUnit: 'balde',   packSize: 10,  scale: true },  // Dulce de leche repostero: balde de 10kg
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

// Items que ya no van al deposito (se piden por pilon desde Recepcion y van directo al desayunador).
const ITEM_REMOVE = new Set(['des-34', 'des-35']) // Jamon, Queso

// Correcciones de packSize para items YA migrados (la migración por packs no re-aplica
// si el item ya tiene packUnit; esto fuerza el valor correcto sobre datos viejos).
const PACK_SIZE_FIX: Record<string, number> = {
  'lim-4': 280, // Jabones: la caja trae 280 unidades, no 500
}

function migrateItems(list: DepositoItem[]): DepositoItem[] {
  let changed = false
  const base = list.filter(it => {
    if (ITEM_REMOVE.has(it.id)) { changed = true; return false }
    return true
  })
  const next = base.map(it => {
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
    // Corrección de packSize sobre items ya migrados (no toca stock; los ideales se retunean aparte).
    const sizeFix = PACK_SIZE_FIX[it.id]
    if (sizeFix && it.packUnit && it.packSize !== sizeFix) {
      changed = true
      return { ...it, packSize: sizeFix }
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
  facturasManuales: FacturaManual[]
  addMovement: (itemId: string, type: 'entrada' | 'salida', quantity: number, createdBy: string, notes?: string, pedidoId?: string) => void
  savePedido: (createdBy: string, pedidoItems: PedidoSemanalItem[]) => PedidoSemanal
  marcarPedido: (pedidoId: string, by: string) => void
  cerrarPedidoSinStock: (pedidoId: string, by: string) => void
  deletePedido: (id: string, deletedBy: string) => void
  removeSupplierFromPedido: (pedidoId: string, supplierId: string, by: string) => void
  setFacturaProveedor: (pedidoId: string, factura: FacturaProveedor) => void
  saveFacturaManual: (factura: FacturaManual) => void
  deleteFacturaManual: (id: string) => void
  setPedidoMonto: (pedidoId: string, monto: number, cargadoBy: string, receiptPhoto?: string) => void
  recibirPedido: (pedidoId: string, recibidoBy: string, recibidos: { itemId: string; cantidad: number }[]) => void
  revertirRecepcion: (pedidoId: string) => void
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

  const [facturasManuales, setFacturasManuales] = useState<FacturaManual[]>(() => {
    const saved = localStorage.getItem(LS_FACTURAS_MANUALES)
    return saved ? JSON.parse(saved) : []
  })

  // Sync remoto: cuando otro dispositivo cambia un almacén, refrescamos el estado.
  useCloudSync<DepositoItem[]>(LS_DEPOSITO, setItems)
  useCloudSync<StockMovement[]>(LS_MOVEMENTS, setMovements)
  useCloudSync<PedidoSemanal[]>(LS_PEDIDOS, setPedidos)
  useCloudSync<DepositoSupplier[]>(LS_SUPPLIERS, setSuppliers)
  useCloudSync<FacturaManual[]>(LS_FACTURAS_MANUALES, setFacturasManuales)

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
      persist(LS_DEPOSITO, updated)
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
      persist(LS_MOVEMENTS, updated)
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
      persist(LS_PEDIDOS, updated)
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
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [])

  // Cierra un pedido colgado (armado/pedido) como recibido SIN tocar el stock ni
  // crear movimientos: la mercadería ya se pidió por afuera y se sumó a mano en
  // el depósito. Las facturas se cargan igual que en cualquier pedido recibido.
  const cerrarPedidoSinStock = useCallback((pedidoId: string, by: string) => {
    setPedidos(prev => {
      const updated = prev.map(p =>
        p.id === pedidoId && (p.status === 'armado' || p.status === 'pedido')
          ? {
              ...p,
              status: 'recibido' as const,
              recibidoAt: new Date().toISOString(),
              recibidoBy: by,
              cerradoSinStock: true,
            }
          : p
      )
      persist(LS_PEDIDOS, updated)
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
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [])

  // Saca todos los items de UNA distribuidora del pedido. Si no queda ningún item
  // a pedir, marca el pedido como borrado (para no dejar pedidos vacíos).
  const removeSupplierFromPedido = useCallback((pedidoId: string, supplierId: string, by: string) => {
    setPedidos(prev => {
      const updated = prev.map(p => {
        if (p.id !== pedidoId) return p
        const remaining = p.items.filter(it => resolveSupplierId(it.itemId, items) !== supplierId)
        const facturas = (p.facturas ?? []).filter(f => f.supplierId !== supplierId)
        const quedan = remaining.some(it => it.aPedir > 0)
        if (!quedan) {
          return { ...p, items: remaining, facturas, status: 'borrado' as const, deletedAt: new Date().toISOString(), deletedBy: by }
        }
        return { ...p, items: remaining, facturas }
      })
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [items])

  // Carga / actualiza la factura de una distribuidora dentro de un pedido (upsert por supplierId).
  const setFacturaProveedor = useCallback((pedidoId: string, factura: FacturaProveedor) => {
    setPedidos(prev => {
      const updated = prev.map(p => {
        if (p.id !== pedidoId) return p
        const rest = (p.facturas ?? []).filter(f => f.supplierId !== factura.supplierId)
        return { ...p, facturas: [...rest, factura] }
      })
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [])

  // Carga / actualiza una boleta suelta (upsert por id).
  const saveFacturaManual = useCallback((factura: FacturaManual) => {
    setFacturasManuales(prev => {
      const rest = prev.filter(f => f.id !== factura.id)
      const updated = [factura, ...rest]
      persist(LS_FACTURAS_MANUALES, updated)
      return updated
    })
  }, [])

  const deleteFacturaManual = useCallback((id: string) => {
    setFacturasManuales(prev => {
      const updated = prev.filter(f => f.id !== id)
      persist(LS_FACTURAS_MANUALES, updated)
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
      persist(LS_DEPOSITO, updated)
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
        persist(LS_MOVEMENTS, updated)
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
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [])

  // Deshace una recepción marcada por error. Si el pedido había sumado al
  // depósito, resta de vuelta lo recibido y borra sus movimientos de entrada;
  // si se había cerrado sin stock, no toca el depósito. El pedido vuelve a
  // "esperando recepción" (o "armado" si nunca se había marcado como pedido).
  // Las facturas ya cargadas se conservan.
  const revertirRecepcion = useCallback((pedidoId: string) => {
    let pedido: PedidoSemanal | undefined
    try {
      const saved = JSON.parse(localStorage.getItem(LS_PEDIDOS) || '[]') as PedidoSemanal[]
      pedido = saved.find(p => p.id === pedidoId)
    } catch { /* almacenamiento ilegible: no revertimos a ciegas */ }
    if (!pedido || pedido.status !== 'recibido') return

    if (!pedido.cerradoSinStock) {
      const recibidoPacksById = new Map(
        pedido.items.filter(it => (it.recibido ?? 0) > 0).map(it => [it.itemId, it.recibido as number]),
      )
      setItems(prev => {
        const updated = prev.map(item => {
          const packs = recibidoPacksById.get(item.id)
          if (!packs || packs <= 0) return item
          const base = +(packs * getPackSize(item)).toFixed(2)
          return { ...item, stock: +(item.stock - base).toFixed(2) }
        })
        persist(LS_DEPOSITO, updated)
        return updated
      })
      setMovements(prev => {
        const updated = prev.filter(m => !(m.pedidoId === pedidoId && m.type === 'entrada'))
        persist(LS_MOVEMENTS, updated)
        return updated
      })
    }

    setPedidos(prev => {
      const updated = prev.map(p => {
        if (p.id !== pedidoId) return p
        return {
          ...p,
          status: (p.pedidoAt ? 'pedido' : 'armado') as PedidoSemanal['status'],
          recibidoAt: undefined,
          recibidoBy: undefined,
          cerradoSinStock: undefined,
          items: p.items.map(it => ({ ...it, recibido: undefined })),
        }
      })
      persist(LS_PEDIDOS, updated)
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
      persist(LS_PEDIDOS, updated)
      return updated
    })
  }, [])

  const addItem = useCallback((data: Omit<DepositoItem, 'id'>) => {
    const item: DepositoItem = { ...data, id: generateId() }
    setItems(prev => {
      const updated = [...prev, item]
      persist(LS_DEPOSITO, updated)
      return updated
    })
  }, [])

  const updateItem = useCallback((id: string, data: Partial<Omit<DepositoItem, 'id'>>) => {
    setItems(prev => {
      const updated = prev.map(it => (it.id === id ? { ...it, ...data } : it))
      persist(LS_DEPOSITO, updated)
      return updated
    })
  }, [])

  const deleteItem = useCallback((id: string) => {
    setItems(prev => {
      const updated = prev.filter(it => it.id !== id)
      persist(LS_DEPOSITO, updated)
      return updated
    })
  }, [])

  const addSupplier = useCallback((data: Omit<DepositoSupplier, 'id'>) => {
    const supplier: DepositoSupplier = { ...data, id: generateId() }
    setSuppliers(prev => {
      const updated = [...prev, supplier]
      persist(LS_SUPPLIERS, updated)
      return updated
    })
  }, [])

  const updateSupplier = useCallback((id: string, data: Partial<Omit<DepositoSupplier, 'id'>>) => {
    setSuppliers(prev => {
      const updated = prev.map(s => (s.id === id ? { ...s, ...data } : s))
      persist(LS_SUPPLIERS, updated)
      return updated
    })
  }, [])

  const deleteSupplier = useCallback((id: string) => {
    setSuppliers(prev => {
      const updated = prev.filter(s => s.id !== id)
      persist(LS_SUPPLIERS, updated)
      return updated
    })
  }, [])

  // Pone el stock de todos los items en 0, conservando nombre, formato de compra,
  // stock ideal, proveedor, etc. (no borra items ni configuración).
  const clearAllStock = useCallback(() => {
    setItems(prev => {
      const updated = prev.map(it => ({ ...it, stock: 0 }))
      persist(LS_DEPOSITO, updated)
      return updated
    })
  }, [])

  const resetStock = useCallback(() => {
    setItems(mockItems)
    persist(LS_DEPOSITO, mockItems)
  }, [])

  return (
    <StockContext.Provider value={{
      items, movements, pedidos, suppliers, facturasManuales,
      addMovement, savePedido, marcarPedido, cerrarPedidoSinStock, deletePedido, removeSupplierFromPedido, setFacturaProveedor, saveFacturaManual, deleteFacturaManual, setPedidoMonto, recibirPedido, revertirRecepcion,
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
