import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStock, generatePedidoText } from '../context/StockContext'
import type { PedidoSemanalItem, DepositoItem, PedidoSemanal } from '../types'
import {
  Package, ClipboardList, Clock, Coffee, SprayCanIcon,
  Minus, Plus, X, Copy, Check, ChevronLeft, Trash2,
  ArrowDownCircle, ArrowUpCircle, Send, Search, RotateCcw, Eraser, Pencil, PackageCheck,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import DepositoItemModal from '../components/DepositoItemModal'
import RecibirPedidoModal from '../components/RecibirPedidoModal'
import { canDelete } from '../utils/permissions'
import { getOrderUnit, getPackSize, packsToReachIdeal, packLabel, resolveSupplierId } from '../utils/deposito'
import { formatMontoCurrency } from '../utils/validators'

type MainTab = 'deposito' | 'pedido' | 'historial'
type CategoryFilter = 'todos' | 'desayunador' | 'limpieza'
type HistorialTab = 'pedidos' | 'movimientos'

export default function Stock() {
  const { employee } = useAuth()
  const {
    items, movements, pedidos, suppliers,
    addMovement, savePedido, deletePedido, recibirPedido,
    addItem, updateItem, deleteItem,
  } = useStock()

  const isAdmin = canDelete(employee?.role ?? 'mucama')
  const isEncargada = employee?.role === 'encargada'
  const [deleteTargetPedidoId, setDeleteTargetPedidoId] = useState<string | null>(null)
  const [recibirTarget, setRecibirTarget] = useState<PedidoSemanal | null>(null)
  // Item editor: undefined = closed, null = nuevo item, DepositoItem = editar
  const [itemModal, setItemModal] = useState<DepositoItem | null | undefined>(undefined)
  const [tab, setTab] = useState<MainTab>(employee?.role === 'encargada' ? 'pedido' : 'deposito')
  const [catFilter, setCatFilter] = useState<CategoryFilter>('todos')
  const [histTab, setHistTab] = useState<HistorialTab>('pedidos')

  // Movement modal
  const [movModal, setMovModal] = useState<{
    itemId: string; itemName: string; type: 'entrada' | 'salida'; stock: number
    unit: string; packUnit?: string; packSize?: number
  } | null>(null)
  const [movQty, setMovQty] = useState(1)
  const [movNotes, setMovNotes] = useState('')
  // Unidad del movimiento: 'base' (consumo, kg) o 'pack' (bulto, bolsa)
  const [movUnit, setMovUnit] = useState<'base' | 'pack'>('base')

  // Pedido state
  const [pedidoView, setPedidoView] = useState<'edit' | 'preview'>('edit')
  const [pedidoItems, setPedidoItems] = useState<PedidoSemanalItem[]>([])
  const [pedidoCat, setPedidoCat] = useState<CategoryFilter>('todos')
  const [pedidoSearch, setPedidoSearch] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savingPedido, setSavingPedido] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)

  // Live stock lookup (avoids stale stockActual snapshot during pedido edit)
  const liveStockById = useMemo(() => {
    const map = new Map<string, number>()
    for (const it of items) map.set(it.id, it.stock)
    return map
  }, [items])

  // Item metadata lookup (category, etc.) for the pedido builder
  const itemById = useMemo(() => {
    const map = new Map<string, DepositoItem>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])

  // Pedido items filtered by category + search, then grouped by supplier
  const pedidoGroups = useMemo(() => {
    const q = pedidoSearch.trim().toLowerCase()
    const visible = pedidoItems.filter(i => {
      const meta = itemById.get(i.itemId)
      if (pedidoCat !== 'todos' && meta?.category !== pedidoCat) return false
      if (onlySelected && i.aPedir <= 0) return false
      if (q && !i.name.toLowerCase().includes(q)) return false
      return true
    })

    const bySupplier = new Map<string, { name: string; items: PedidoSemanalItem[] }>()
    for (const item of visible) {
      const suppId = resolveSupplierId(item.itemId, items) || 'otros'
      const supplier = suppliers.find(s => s.id === suppId)
      if (!bySupplier.has(suppId)) {
        bySupplier.set(suppId, { name: supplier?.name ?? 'Otros', items: [] })
      }
      bySupplier.get(suppId)!.items.push(item)
    }

    // Order groups following suppliers order, leftovers last
    const ordered: { name: string; items: PedidoSemanalItem[] }[] = []
    for (const s of suppliers) {
      const g = bySupplier.get(s.id)
      if (g) { ordered.push(g); bySupplier.delete(s.id) }
    }
    for (const g of bySupplier.values()) ordered.push(g)
    return ordered
  }, [pedidoItems, pedidoCat, pedidoSearch, onlySelected, itemById, items, suppliers])

  const pedidoCount = useMemo(
    () => pedidoItems.filter(i => i.aPedir > 0).length,
    [pedidoItems]
  )

  // Selected count per category (for the segmented control badges)
  const catSelected = useMemo(() => {
    const c = { todos: 0, desayunador: 0, limpieza: 0 }
    for (const i of pedidoItems) {
      if (i.aPedir <= 0) continue
      c.todos++
      const cat = itemById.get(i.itemId)?.category
      if (cat === 'desayunador') c.desayunador++
      else if (cat === 'limpieza') c.limpieza++
    }
    return c
  }, [pedidoItems, itemById])

  // Filtered items
  const filteredItems = useMemo(() => {
    if (catFilter === 'todos') return items
    return items.filter(i => i.category === catFilter)
  }, [items, catFilter])

  const lowStockCount = useMemo(
    () => items.filter(i => i.stock < i.stockIdeal).length,
    [items]
  )

  // La encargada entra directo al armado del pedido, ya precargado.
  useEffect(() => {
    if (isEncargada) initPedido()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Movement handlers ----
  function openMovement(item: DepositoItem, type: 'entrada' | 'salida') {
    setMovModal({
      itemId: item.id, itemName: item.name, type, stock: item.stock,
      unit: item.unit, packUnit: item.packUnit, packSize: item.packSize,
    })
    setMovQty(1)
    setMovNotes('')
    setMovUnit('base')
  }

  function confirmMovement() {
    if (!movModal || !employee || movQty <= 0) return
    const factor = movUnit === 'pack' ? (movModal.packSize ?? 1) : 1
    const baseQty = +(movQty * factor).toFixed(2)
    // Si el movimiento es por bulto, dejamos constancia en la nota.
    const packNote = movUnit === 'pack' ? `${movQty} ${movModal.packUnit}` : ''
    const notes = [movNotes.trim(), packNote].filter(Boolean).join(' · ')
    addMovement(movModal.itemId, movModal.type, baseQty, employee.name, notes)
    setMovModal(null)
  }

  function handleConfirmRecibir(recibidos: { itemId: string; cantidad: number }[]) {
    if (!recibirTarget || !employee) return
    recibirPedido(recibirTarget.id, employee.name, recibidos)
    setRecibirTarget(null)
  }

  // ---- Item editor handlers ----
  function handleSaveItem(data: Omit<DepositoItem, 'id'>) {
    if (itemModal) updateItem(itemModal.id, data)
    else addItem(data)
    setItemModal(undefined)
  }

  function handleDeleteItem() {
    if (itemModal) deleteItem(itemModal.id)
    setItemModal(undefined)
  }

  // ---- Pedido handlers ----
  function initPedido() {
    // Prefill each item's "a pedir" from the last non-deleted pedido, else 0.
    const lastPedido = pedidos.find(p => p.status !== 'borrado')
    const lastQty = new Map<string, number>()
    if (lastPedido) {
      for (const it of lastPedido.items) lastQty.set(it.itemId, it.aPedir)
    }
    const built: PedidoSemanalItem[] = items.map(item => ({
      itemId: item.id,
      name: item.name,
      unit: item.unit,
      stockActual: item.stock,
      stockIdeal: item.stockIdeal,
      aPedir: lastQty.get(item.id) ?? 0,
      orderUnit: getOrderUnit(item),
      packSize: getPackSize(item),
    }))
    setPedidoItems(built)
    setPedidoCat('todos')
    setPedidoSearch('')
    setPedidoView('edit')
    setTab('pedido')
  }

  function updatePedidoQty(itemId: string, qty: number) {
    setPedidoItems(prev => prev.map(i => i.itemId === itemId ? { ...i, aPedir: qty } : i))
  }

  function bumpPedidoQty(itemId: string, delta: number) {
    setPedidoItems(prev => prev.map(i =>
      i.itemId === itemId ? { ...i, aPedir: Math.max(0, +(i.aPedir + delta).toFixed(1)) } : i
    ))
  }

  // Bulk: load ideales / clear, applied only to currently visible (filtered) items.
  // "Ideales" sugiere los packs necesarios para cubrir el faltante hasta el stock ideal.
  function applyBulk(mode: 'ideales' | 'vaciar') {
    const visibleIds = new Set(pedidoGroups.flatMap(g => g.items.map(i => i.itemId)))
    setPedidoItems(prev => prev.map(i => {
      if (!visibleIds.has(i.itemId)) return i
      if (mode === 'vaciar') return { ...i, aPedir: 0 }
      const live = liveStockById.get(i.itemId) ?? i.stockActual
      return { ...i, aPedir: packsToReachIdeal(live, i.stockIdeal, i.packSize) }
    }))
  }

  function handleSavePedido() {
    if (savingPedido || !employee || pedidoItems.length === 0) return
    setSavingPedido(true)
    const filtered = pedidoItems
      .filter(i => i.aPedir > 0)
      .map(i => ({
        ...i,
        // refresh stockActual to current live value at save time
        stockActual: liveStockById.get(i.itemId) ?? i.stockActual,
      }))
    if (filtered.length === 0) {
      setSavingPedido(false)
      setConfirmSave(false)
      return
    }
    savePedido(employee.name, filtered)
    setPedidoItems([])
    setPedidoView('edit')
    setConfirmSave(false)
    setSavingPedido(false)
    setTab('historial')
    setHistTab('pedidos')
  }

  async function handleCopyPedido() {
    if (!employee) return
    const filtered = pedidoItems.filter(i => i.aPedir > 0)
    const text = generatePedidoText(filtered, employee.name, items, suppliers)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ---- Helpers ----
  function stockColor(stock: number, ideal: number) {
    if (stock === 0) return 'text-red-600'
    if (stock < ideal) return 'text-amber-600'
    return 'text-green-600'
  }

  function stockBarBg(stock: number, ideal: number) {
    if (stock === 0) return 'bg-red-500'
    if (stock < ideal) return 'bg-amber-400'
    return 'bg-green-500'
  }

  // =================== RENDER ===================
  return (
    <div>
      {/* ===== Tab navigation ===== */}
      <div className="flex gap-1 mb-4 bg-navy-100 rounded-xl p-1">
        {([
          { key: 'deposito' as const, label: 'Deposito', icon: Package },
          { key: 'pedido' as const, label: 'Pedido', icon: ClipboardList },
          { key: 'historial' as const, label: 'Historial', icon: Clock },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => t.key === 'pedido' ? initPedido() : setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
            {t.key === 'deposito' && lowStockCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
                {lowStockCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* =================== DEPOSITO TAB =================== */}
      {tab === 'deposito' && (
        <div>
          {/* Category filter + add */}
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex gap-2">
              {([
                { key: 'todos' as const, label: 'Todos', icon: null },
                { key: 'desayunador' as const, label: 'Desayuno', icon: Coffee },
                { key: 'limpieza' as const, label: 'Limpieza', icon: SprayCanIcon },
              ]).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCatFilter(c.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    catFilter === c.key
                      ? 'bg-navy-800 text-cream'
                      : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                  }`}
                >
                  {c.icon && <c.icon size={13} />}
                  {c.label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <button
                onClick={() => setItemModal(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-400 text-navy-900 hover:bg-gold-500 transition-colors"
              >
                <Plus size={14} /> Agregar
              </button>
            )}
          </div>

          {/* Items list */}
          <div className="space-y-2">
            {filteredItems.map(item => {
              const pct = item.stockIdeal > 0 ? Math.min(100, (item.stock / item.stockIdeal) * 100) : 0
              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-3 border transition-colors ${
                    item.stock === 0
                      ? 'bg-red-50 border-red-200'
                      : item.stock < item.stockIdeal
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-navy-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.category === 'desayunador'
                        ? <Coffee size={14} className="text-gold-500 shrink-0" />
                        : <SprayCanIcon size={14} className="text-navy-500 shrink-0" />
                      }
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-navy-800 text-sm truncate">{item.name}</span>
                          {isAdmin && (
                            <button
                              onClick={() => setItemModal(item)}
                              className="text-navy-300 hover:text-navy-600 p-0.5 shrink-0"
                              title="Editar articulo"
                            >
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                        {packLabel(item) && (
                          <p className="text-[10px] text-indigo-400">{packLabel(item)}</p>
                        )}
                      </div>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ${stockColor(item.stock, item.stockIdeal)}`}>
                      {item.stock} / {item.stockIdeal} {item.unit}
                    </span>
                  </div>

                  {/* Stock bar */}
                  <div className="w-full h-1.5 bg-navy-100 rounded-full mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${stockBarBg(item.stock, item.stockIdeal)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => openMovement(item, 'salida')}
                      disabled={item.stock === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus size={14} /> Salida
                    </button>
                    <button
                      onClick={() => openMovement(item, 'entrada')}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                    >
                      <Plus size={14} /> Entrada
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* =================== PEDIDO EDIT =================== */}
      {tab === 'pedido' && pedidoView === 'edit' && (
        <div>
          {pedidoItems.length === 0 ? (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-navy-200 mb-3" />
              <p className="text-navy-500 font-medium">No hay artículos en el depósito</p>
            </div>
          ) : (
            <>
              {/* Sticky controls */}
              <div className="sticky top-16 z-30 bg-cream -mx-4 px-4 md:-mx-6 md:px-6 pt-1 pb-3 border-b border-navy-100">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <h2 className="text-lg font-bold text-navy-800">Pedido Semanal</h2>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => applyBulk('ideales')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-navy-600 border border-navy-200 hover:bg-navy-50 active:scale-95 transition-all"
                      title="Cargar lo que falta para llegar al stock ideal"
                    >
                      <RotateCcw size={13} /> Ideales
                    </button>
                    <button
                      onClick={() => applyBulk('vaciar')}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-navy-600 border border-navy-200 hover:bg-navy-50 active:scale-95 transition-all"
                      title="Poner en 0 los articulos visibles"
                    >
                      <Eraser size={13} /> Vaciar
                    </button>
                  </div>
                </div>

                {/* Search */}
                <div className="relative mb-2">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
                  <input
                    type="text"
                    value={pedidoSearch}
                    onChange={e => setPedidoSearch(e.target.value)}
                    placeholder="Buscar articulo..."
                    className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
                  />
                  {pedidoSearch && (
                    <button
                      onClick={() => setPedidoSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-navy-400 hover:text-navy-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Category segmented control */}
                <div className="flex gap-1 bg-navy-100 rounded-xl p-1 mb-2">
                  {([
                    { key: 'todos' as const, label: 'Todos' },
                    { key: 'desayunador' as const, label: 'Desayuno' },
                    { key: 'limpieza' as const, label: 'Limpieza' },
                  ]).map(c => (
                    <button
                      key={c.key}
                      onClick={() => setPedidoCat(c.key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                        pedidoCat === c.key ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
                      }`}
                    >
                      {c.label}
                      {catSelected[c.key] > 0 && (
                        <span className="bg-gold-400 text-navy-900 text-[10px] rounded-full px-1.5 min-w-[18px] text-center">
                          {catSelected[c.key]}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Solo seleccionados */}
                <button
                  onClick={() => setOnlySelected(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    onlySelected ? 'bg-gold-400 text-navy-900' : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                  }`}
                >
                  <Check size={13} /> Solo seleccionados{pedidoCount > 0 ? ` (${pedidoCount})` : ''}
                </button>
              </div>

              {/* Grouped item list */}
              {pedidoGroups.length === 0 ? (
                <p className="text-navy-400 text-center py-16 text-sm">
                  {onlySelected ? 'Todavía no seleccionaste ningún artículo' : 'No hay articulos que coincidan'}
                </p>
              ) : (
                <div className="space-y-5 pt-4 pb-24">
                  {pedidoGroups.map(group => (
                    <div key={group.name}>
                      <div className="flex items-center justify-between mb-2.5 px-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Package size={14} className="text-indigo-500 shrink-0" />
                          <span className="text-sm font-bold text-indigo-700 truncate">{group.name}</span>
                        </div>
                        <span className="text-[11px] text-navy-400 shrink-0">
                          {group.items.filter(i => i.aPedir > 0).length} de {group.items.length}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {group.items.map(item => {
                          const active = item.aPedir > 0
                          const pack = (item.packSize ?? 1) > 1
                          const subtitle = pack
                            ? `${item.orderUnit} de ${item.packSize} ${item.unit}`
                            : (item.orderUnit ?? item.unit)
                          return (
                            <div
                              key={item.itemId}
                              className={`rounded-2xl border p-3.5 transition-colors ${
                                active ? 'bg-gold-50 border-gold-300 shadow-sm' : 'bg-white border-navy-100'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0">
                                  <p className="font-semibold text-navy-800 text-[15px] leading-tight">{item.name}</p>
                                  <p className="text-[11px] text-navy-400 mt-0.5">{subtitle}</p>
                                </div>
                                {active && (
                                  <span className="w-6 h-6 rounded-full bg-gold-400 text-navy-900 flex items-center justify-center shrink-0">
                                    <Check size={14} strokeWidth={3} />
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <button
                                  onClick={() => bumpPedidoQty(item.itemId, -0.5)}
                                  disabled={item.aPedir <= 0}
                                  className="w-12 h-12 rounded-xl bg-white border border-navy-200 text-navy-700 flex items-center justify-center hover:bg-navy-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0"
                                >
                                  <Minus size={20} />
                                </button>
                                <div className="flex items-baseline gap-1.5">
                                  <input
                                    type="number"
                                    value={item.aPedir}
                                    onChange={e => updatePedidoQty(item.itemId, Math.max(0, Number(e.target.value)))}
                                    className={`w-16 text-center text-2xl font-bold bg-transparent focus:outline-none ${
                                      active ? 'text-navy-900' : 'text-navy-300'
                                    }`}
                                    min={0}
                                    step={0.5}
                                  />
                                  <span className="text-sm font-medium text-navy-500">{item.orderUnit ?? item.unit}</span>
                                </div>
                                <button
                                  onClick={() => bumpPedidoQty(item.itemId, 0.5)}
                                  className="w-12 h-12 rounded-xl bg-navy-800 text-cream flex items-center justify-center hover:bg-navy-700 active:scale-95 transition-all shrink-0"
                                >
                                  <Plus size={20} />
                                </button>
                              </div>
                              {pack && active && (
                                <p className="text-[11px] text-indigo-500 text-center mt-2.5">
                                  = {+(item.aPedir * (item.packSize ?? 1)).toFixed(1)} {item.unit} al depósito
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Bottom action */}
              <div className="sticky bottom-0 bg-cream pt-3 pb-2 border-t border-navy-100 -mx-4 px-4 md:-mx-6 md:px-6">
                <button
                  onClick={() => setPedidoView('preview')}
                  disabled={pedidoCount === 0}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-gold-400 text-navy-900 hover:bg-gold-500 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-all"
                >
                  <Send size={18} />
                  Ver pedido
                  {pedidoCount > 0 && (
                    <span className="bg-navy-900 text-cream rounded-full px-2 py-0.5 text-xs min-w-[22px]">
                      {pedidoCount}
                    </span>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* =================== PEDIDO PREVIEW =================== */}
      {tab === 'pedido' && pedidoView === 'preview' && (
        <div>
          <button onClick={() => setPedidoView('edit')} className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium">
            <ChevronLeft size={18} /> Volver a editar
          </button>
          <h2 className="text-lg font-bold text-navy-800 mb-3">Vista previa del pedido</h2>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
            <pre className="whitespace-pre-wrap text-navy-800 text-sm font-sans bg-navy-50 rounded-lg p-4">
              {generatePedidoText(pedidoItems.filter(i => i.aPedir > 0), employee?.name ?? '', items, suppliers)}
            </pre>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleCopyPedido}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-navy-100 text-navy-700 hover:bg-navy-200"
            >
              {copied ? <><Check size={18} /> Copiado!</> : <><Copy size={18} /> Copiar texto</>}
            </button>
            <button
              onClick={() => setConfirmSave(true)}
              disabled={savingPedido || pedidoItems.filter(i => i.aPedir > 0).length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all bg-gold-400 text-navy-900 hover:bg-gold-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ClipboardList size={18} /> {savingPedido ? 'Guardando...' : 'Guardar pedido'}
            </button>
          </div>
        </div>
      )}

      {/* =================== HISTORIAL TAB =================== */}
      {tab === 'historial' && (
        <div>
          <div className="flex gap-2 mb-4">
            {([
              { key: 'pedidos' as const, label: 'Pedidos' },
              { key: 'movimientos' as const, label: 'Movimientos' },
            ]).map(h => (
              <button
                key={h.key}
                onClick={() => setHistTab(h.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  histTab === h.key ? 'bg-navy-800 text-cream' : 'bg-navy-100 text-navy-600'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* Pedidos history */}
          {histTab === 'pedidos' && (
            pedidos.length === 0 ? (
              <p className="text-navy-400 text-center py-12">No hay pedidos semanales aun</p>
            ) : (
              <div className="space-y-3">
                {pedidos.map(pedido => {
                  const isBorrado = pedido.status === 'borrado'
                  const isRecibido = pedido.status === 'recibido'
                  const cardBg = isBorrado
                    ? 'bg-red-50 border-red-200 opacity-70'
                    : isRecibido
                      ? 'bg-green-50/30 border-green-200'
                      : 'bg-white border-navy-100'
                  const badgeClass = isBorrado
                    ? 'bg-red-100 text-red-600'
                    : isRecibido
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gold-100 text-gold-700'
                  return (
                    <div key={pedido.id} className={`rounded-xl p-4 shadow-sm border ${cardBg}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className={`font-semibold ${isBorrado ? 'text-navy-400 line-through' : 'text-navy-800'}`}>
                            Pedido semanal
                          </p>
                          <p className="text-xs text-navy-400">
                            {new Date(pedido.date).toLocaleDateString('es-AR', {
                              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {' - '}{pedido.createdBy}
                          </p>
                          {isRecibido && pedido.recibidoAt && (
                            <p className="text-xs text-green-700 mt-0.5">
                              Recibido {new Date(pedido.recibidoAt).toLocaleDateString('es-AR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                              })}
                              {pedido.recibidoBy ? ` por ${pedido.recibidoBy}` : ''}
                            </p>
                          )}
                          {isBorrado && pedido.deletedAt && (
                            <p className="text-xs text-red-500 mt-0.5">
                              Borrado {new Date(pedido.deletedAt).toLocaleDateString('es-AR', {
                                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                              })}
                              {pedido.deletedBy ? ` por ${pedido.deletedBy}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${badgeClass}`}>
                            {pedido.status}
                          </span>
                          {!isBorrado && !isRecibido && isAdmin && (
                            <button
                              onClick={() => setDeleteTargetPedidoId(pedido.id)}
                              className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Borrar pedido"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                      {pedido.monto != null && (
                        <div className="flex items-center gap-1.5 mb-2 text-sm">
                          <span className="text-[10px] uppercase tracking-wide font-semibold text-green-700">Monto:</span>
                          <span className="font-bold text-navy-800">{formatMontoCurrency(pedido.monto)}</span>
                          {pedido.montoCargadoBy && (
                            <span className="text-xs text-navy-400">· {pedido.montoCargadoBy}</span>
                          )}
                        </div>
                      )}
                      {(() => {
                        // Group by supplier
                        const groups = new Map<string, { label: string; items: typeof pedido.items }>()
                        for (const item of pedido.items) {
                          const suppId = resolveSupplierId(item.itemId, items) || 'sup-alim'
                          const sup = suppliers.find(s => s.id === suppId)
                          const label = sup?.name ?? (item.itemId.startsWith('des-') ? 'Desayunador' : 'Limpieza')
                          if (!groups.has(suppId)) groups.set(suppId, { label, items: [] })
                          groups.get(suppId)!.items.push(item)
                        }
                        return Array.from(groups.values()).map(section => (
                          <div key={section.label} className="mt-2">
                            <p className={`text-xs font-semibold ${isBorrado ? 'text-navy-400' : 'text-indigo-600'}`}>{section.label}</p>
                            <ul className={`text-sm space-y-0.5 ml-2 ${isBorrado ? 'text-navy-400 line-through' : 'text-navy-600'}`}>
                              {section.items.map(item => {
                                const rec = item.recibido
                                const showRec = isRecibido && rec != null
                                const incompleto = showRec && rec < item.aPedir
                                const cero = showRec && rec === 0
                                return (
                                  <li key={item.itemId}>
                                    - {item.name}:{' '}
                                    {showRec ? (
                                      <>
                                        <span className={cero ? 'text-red-600 font-semibold' : incompleto ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                                          {rec}
                                        </span>
                                        <span className="text-xs text-navy-400"> / {item.aPedir} {item.orderUnit ?? item.unit}</span>
                                      </>
                                    ) : (
                                      <>{item.aPedir} {item.orderUnit ?? item.unit}</>
                                    )}
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))
                      })()}
                      {!isBorrado && !isRecibido && (
                        <button
                          onClick={() => setRecibirTarget(pedido)}
                          className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] transition-all"
                        >
                          <PackageCheck size={16} /> Marcar recibido y sumar al depósito
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* Movimientos history */}
          {histTab === 'movimientos' && (
            movements.length === 0 ? (
              <p className="text-navy-400 text-center py-12">No hay movimientos registrados</p>
            ) : (
              <div className="space-y-2">
                {movements.slice(0, 50).map(mov => (
                  <div key={mov.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                    mov.type === 'entrada' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    {mov.type === 'entrada'
                      ? <ArrowDownCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
                      : <ArrowUpCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-navy-800">
                        {mov.type === 'entrada' ? '+' : '-'}{mov.quantity} {mov.itemName}
                      </p>
                      <p className="text-xs text-navy-400">
                        {new Date(mov.date).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                        {' - '}{mov.createdBy}
                      </p>
                      {mov.notes && <p className="text-xs text-navy-500 mt-0.5">{mov.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTargetPedidoId !== null}
        title="Borrar pedido semanal"
        message="Este pedido se marcara como borrado. Esta accion no se puede deshacer."
        onConfirm={() => {
          if (deleteTargetPedidoId) {
            deletePedido(deleteTargetPedidoId, employee?.name ?? '')
            setDeleteTargetPedidoId(null)
          }
        }}
        onCancel={() => setDeleteTargetPedidoId(null)}
      />

      <ConfirmDialog
        open={confirmSave}
        variant="info"
        title="Guardar pedido semanal"
        message={`Vas a guardar el pedido con ${pedidoItems.filter(i => i.aPedir > 0).length} articulos. Despues se gestiona desde Proveedores.`}
        confirmLabel="Guardar"
        onConfirm={handleSavePedido}
        onCancel={() => setConfirmSave(false)}
      />

      {/* =================== MOVEMENT MODAL =================== */}
      {movModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setMovModal(null)}>
          <div
            className="bg-white w-full sm:w-96 sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-navy-800">
                {movModal.type === 'entrada' ? 'Entrada' : 'Salida'} de stock
              </h3>
              <button onClick={() => setMovModal(null)} className="p-1 rounded-lg hover:bg-navy-100 transition-colors">
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-navy-600 mb-1 font-medium">{movModal.itemName}</p>
            <p className="text-xs text-navy-400 mb-4">Stock actual: {movModal.stock} {movModal.unit}</p>

            {/* Unidad: por consumo (kg/unidad) o por bulto (bolsa/caja) */}
            {movModal.packUnit && (movModal.packSize ?? 1) > 1 && (
              <>
                <label className="block text-xs font-semibold text-navy-500 mb-1">
                  ¿En qué lo {movModal.type === 'salida' ? 'sacás' : 'cargás'}?
                </label>
                <div className="flex gap-1 bg-navy-100 rounded-xl p-1 mb-4">
                  {([
                    { key: 'base' as const, label: movModal.unit },
                    { key: 'pack' as const, label: `${movModal.packUnit} (${movModal.packSize} ${movModal.unit})` },
                  ]).map(u => (
                    <button
                      key={u.key}
                      onClick={() => setMovUnit(u.key)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                        movUnit === u.key ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500'
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label className="block text-xs font-semibold text-navy-500 mb-1">
              Cantidad ({movUnit === 'pack' ? movModal.packUnit : movModal.unit})
            </label>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setMovQty(q => Math.max(0.5, +(q - 0.5).toFixed(1)))}
                className="p-2 rounded-lg bg-navy-100 hover:bg-navy-200 transition-colors"
              >
                <Minus size={18} />
              </button>
              <input
                type="number"
                value={movQty}
                onChange={e => setMovQty(Math.max(0, Number(e.target.value)))}
                className="flex-1 text-center text-xl font-bold py-2 rounded-lg border border-navy-200 focus:outline-none focus:border-gold-400"
                min={0}
                step={0.5}
              />
              <button
                onClick={() => setMovQty(q => +(q + 0.5).toFixed(1))}
                className="p-2 rounded-lg bg-navy-100 hover:bg-navy-200 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            {movUnit === 'pack' && (
              <p className="text-xs text-indigo-500 mb-4 text-center">
                = {+(movQty * (movModal.packSize ?? 1)).toFixed(1)} {movModal.unit}
              </p>
            )}
            {movUnit === 'base' && <div className="mb-2" />}

            <label className="block text-xs font-semibold text-navy-500 mb-1">Notas (opcional)</label>
            <input
              type="text"
              value={movNotes}
              onChange={e => setMovNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm mb-4 focus:outline-none focus:border-gold-400"
              placeholder="Ej: Para desayuno del martes"
            />

            <button
              onClick={confirmMovement}
              disabled={movQty <= 0}
              className={`w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${
                movModal.type === 'entrada'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              Registrar {movModal.type === 'entrada' ? 'entrada' : 'salida'} de {movQty} {movUnit === 'pack' ? movModal.packUnit : movModal.unit}
            </button>
          </div>
        </div>
      )}

      {/* =================== ITEM EDITOR MODAL =================== */}
      {itemModal !== undefined && (
        <DepositoItemModal
          item={itemModal}
          suppliers={suppliers}
          onClose={() => setItemModal(undefined)}
          onSave={handleSaveItem}
          onDelete={handleDeleteItem}
        />
      )}

      {/* =================== RECIBIR PEDIDO MODAL =================== */}
      {recibirTarget && (
        <RecibirPedidoModal
          pedido={recibirTarget}
          onClose={() => setRecibirTarget(null)}
          onConfirm={handleConfirmRecibir}
        />
      )}
    </div>
  )
}
