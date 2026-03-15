import { useState, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'
import { useStock, generatePedidoText } from '../context/StockContext'
import type { PedidoSemanalItem } from '../types'
import {
  Package, ClipboardList, Clock, Coffee, SprayCanIcon,
  Minus, Plus, X, Copy, Check, ChevronLeft, Trash2,
  ArrowDownCircle, ArrowUpCircle, Send,
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { canDelete } from '../utils/permissions'
import { depositoSuppliers, depositoItemSupplier } from '../data/mock'

type MainTab = 'deposito' | 'pedido' | 'historial'
type CategoryFilter = 'todos' | 'desayunador' | 'limpieza'
type HistorialTab = 'pedidos' | 'movimientos'

export default function Stock() {
  const { employee } = useAuth()
  const {
    items, movements, pedidos,
    addMovement, generatePedidoItems, savePedido, deletePedido,
  } = useStock()

  const isAdmin = canDelete(employee?.role ?? 'mucama')
  const [deleteTargetPedidoId, setDeleteTargetPedidoId] = useState<string | null>(null)
  const [tab, setTab] = useState<MainTab>('deposito')
  const [catFilter, setCatFilter] = useState<CategoryFilter>('todos')
  const [histTab, setHistTab] = useState<HistorialTab>('pedidos')

  // Movement modal
  const [movModal, setMovModal] = useState<{
    itemId: string; itemName: string; type: 'entrada' | 'salida'; stock: number; unit: string
  } | null>(null)
  const [movQty, setMovQty] = useState(1)
  const [movNotes, setMovNotes] = useState('')

  // Pedido state
  const [pedidoView, setPedidoView] = useState<'edit' | 'preview'>('edit')
  const [pedidoItems, setPedidoItems] = useState<PedidoSemanalItem[]>([])
  const [copied, setCopied] = useState(false)

  // Filtered items
  const filteredItems = useMemo(() => {
    if (catFilter === 'todos') return items
    return items.filter(i => i.category === catFilter)
  }, [items, catFilter])

  const lowStockCount = useMemo(
    () => items.filter(i => i.stock < i.stockIdeal).length,
    [items]
  )

  // ---- Movement handlers ----
  function openMovement(itemId: string, itemName: string, type: 'entrada' | 'salida', stock: number, unit: string) {
    setMovModal({ itemId, itemName, type, stock, unit })
    setMovQty(1)
    setMovNotes('')
  }

  function confirmMovement() {
    if (!movModal || !employee || movQty <= 0) return
    addMovement(movModal.itemId, movModal.type, movQty, employee.name, movNotes)
    setMovModal(null)
  }

  // ---- Pedido handlers ----
  function initPedido() {
    const suggested = generatePedidoItems()
    setPedidoItems(suggested)
    setPedidoView('edit')
    setTab('pedido')
  }

  function updatePedidoQty(itemId: string, qty: number) {
    setPedidoItems(prev => prev.map(i => i.itemId === itemId ? { ...i, aPedir: qty } : i))
  }

  function removePedidoItem(itemId: string) {
    setPedidoItems(prev => prev.filter(i => i.itemId !== itemId))
  }

  function handleSavePedido() {
    if (!employee || pedidoItems.length === 0) return
    const filtered = pedidoItems.filter(i => i.aPedir > 0)
    savePedido(employee.name, filtered)
    setPedidoItems([])
    setPedidoView('edit')
    setTab('historial')
    setHistTab('pedidos')
  }

  async function handleCopyPedido() {
    if (!employee) return
    const filtered = pedidoItems.filter(i => i.aPedir > 0)
    const text = generatePedidoText(filtered, employee.name)
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
          {/* Category filter */}
          <div className="flex gap-2 mb-4">
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
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {item.category === 'desayunador'
                        ? <Coffee size={14} className="text-gold-500 shrink-0" />
                        : <SprayCanIcon size={14} className="text-navy-500 shrink-0" />
                      }
                      <span className="font-medium text-navy-800 text-sm">{item.name}</span>
                    </div>
                    <span className={`text-sm font-bold ${stockColor(item.stock, item.stockIdeal)}`}>
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
                      onClick={() => openMovement(item.id, item.name, 'salida', item.stock, item.unit)}
                      disabled={item.stock === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus size={14} /> Salida
                    </button>
                    <button
                      onClick={() => openMovement(item.id, item.name, 'entrada', item.stock, item.unit)}
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
          <h2 className="text-lg font-bold text-navy-800 mb-1">Pedido Semanal</h2>
          <p className="text-xs text-navy-400 mb-4">
            Articulos con stock menor al ideal. Ajusta cantidades y genera el pedido.
          </p>

          {pedidoItems.length === 0 ? (
            <div className="text-center py-12">
              <Check size={48} className="mx-auto text-green-400 mb-3" />
              <p className="text-navy-500 font-medium">Todo el stock esta al dia!</p>
              <p className="text-xs text-navy-400 mt-1">No hay articulos que necesiten reposicion</p>
            </div>
          ) : (
            <>
              {/* Desktop header */}
              <div className="hidden sm:grid grid-cols-[1fr_70px_70px_80px_32px] gap-2 px-3 pb-2 text-[10px] font-bold text-navy-500 uppercase tracking-wider">
                <span>Articulo</span>
                <span className="text-center">Stock</span>
                <span className="text-center">Ideal</span>
                <span className="text-center">A pedir</span>
                <span />
              </div>

              <div className="space-y-1.5">
                {pedidoItems.map(item => (
                  <div key={item.itemId} className="rounded-lg border border-navy-100 bg-white p-2.5">
                    {/* Mobile layout */}
                    <div className="sm:hidden">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-navy-800 text-sm">{item.name}</span>
                        <button onClick={() => removePedidoItem(item.itemId)} className="text-navy-400 hover:text-red-500">
                          <X size={16} />
                        </button>
                      </div>
                      <p className="text-[10px] text-indigo-500 font-medium mb-1">
                        {depositoSuppliers.find(s => s.id === depositoItemSupplier[item.itemId])?.name ?? 'Proveedor'}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-navy-400">
                          Stock: <span className="font-semibold text-red-600">{item.stockActual}</span> / {item.stockIdeal} {item.unit}
                        </span>
                        <div className="flex items-center gap-1 ml-auto">
                          <span className="text-xs text-navy-500">Pedir:</span>
                          <input
                            type="number"
                            value={item.aPedir}
                            onChange={e => updatePedidoQty(item.itemId, Math.max(0, Number(e.target.value)))}
                            className="w-16 px-2 py-1 rounded border border-gold-300 text-sm text-center font-bold text-navy-800 focus:outline-none focus:border-gold-500"
                            min={0}
                            step={0.5}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[1fr_70px_70px_80px_32px] gap-2 items-center">
                      <div className="truncate">
                        <span className="font-medium text-navy-800 text-sm">{item.name}</span>
                        <span className="ml-2 text-[10px] text-indigo-500 font-medium">
                          {depositoSuppliers.find(s => s.id === depositoItemSupplier[item.itemId])?.name ?? ''}
                        </span>
                      </div>
                      <span className="text-center text-sm font-semibold text-red-600">{item.stockActual}</span>
                      <span className="text-center text-sm text-navy-500">{item.stockIdeal}</span>
                      <input
                        type="number"
                        value={item.aPedir}
                        onChange={e => updatePedidoQty(item.itemId, Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-1 rounded border border-gold-300 text-sm text-center font-bold text-navy-800 focus:outline-none focus:border-gold-500"
                        min={0}
                        step={0.5}
                      />
                      <button onClick={() => removePedidoItem(item.itemId)} className="text-navy-400 hover:text-red-500">
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom action */}
              <div className="sticky bottom-0 bg-cream pt-3 pb-2 border-t border-navy-100 mt-4 -mx-4 px-4 md:-mx-6 md:px-6">
                <button
                  onClick={() => setPedidoView('preview')}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-gold-400 text-navy-900 hover:bg-gold-500 transition-all"
                >
                  <Send size={18} />
                  Ver pedido ({pedidoItems.filter(i => i.aPedir > 0).length} articulos)
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
              {generatePedidoText(pedidoItems.filter(i => i.aPedir > 0), employee?.name ?? '')}
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
              onClick={handleSavePedido}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm transition-all bg-gold-400 text-navy-900 hover:bg-gold-500"
            >
              <ClipboardList size={18} /> Guardar pedido
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
                  return (
                    <div key={pedido.id} className={`rounded-xl p-4 shadow-sm border ${isBorrado ? 'bg-red-50 border-red-200 opacity-70' : 'bg-white border-navy-100'}`}>
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
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                            isBorrado ? 'bg-red-100 text-red-600' : 'bg-gold-100 text-gold-700'
                          }`}>
                            {pedido.status}
                          </span>
                          {!isBorrado && isAdmin && (
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
                      {(() => {
                        // Group by supplier
                        const groups = new Map<string, { label: string; items: typeof pedido.items }>()
                        for (const item of pedido.items) {
                          const suppId = depositoItemSupplier[item.itemId] ?? 'sup-alim'
                          const sup = depositoSuppliers.find(s => s.id === suppId)
                          const label = sup?.name ?? (item.itemId.startsWith('des-') ? 'Desayunador' : 'Limpieza')
                          if (!groups.has(suppId)) groups.set(suppId, { label, items: [] })
                          groups.get(suppId)!.items.push(item)
                        }
                        return Array.from(groups.values()).map(section => (
                          <div key={section.label} className="mt-2">
                            <p className={`text-xs font-semibold ${isBorrado ? 'text-navy-400' : 'text-indigo-600'}`}>{section.label}</p>
                            <ul className={`text-sm space-y-0.5 ml-2 ${isBorrado ? 'text-navy-400 line-through' : 'text-navy-600'}`}>
                              {section.items.map(item => (
                                <li key={item.itemId}>- {item.name}: {item.aPedir} {item.unit}</li>
                              ))}
                            </ul>
                          </div>
                        ))
                      })()}
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

            <label className="block text-xs font-semibold text-navy-500 mb-1">Cantidad</label>
            <div className="flex items-center gap-3 mb-4">
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
              Registrar {movModal.type === 'entrada' ? 'entrada' : 'salida'} de {movQty} {movModal.unit}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
