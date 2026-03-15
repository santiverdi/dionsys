import { useState, useMemo } from 'react'
import { distributors, products } from '../data/mock'
import { useAuth } from '../context/AuthContext'
import { useOrders, generateWhatsAppMessage } from '../context/OrdersContext'
import type { OrderItem } from '../types'
import {
  ShoppingCart, Search, Package, Copy, Check,
  Send, ChevronLeft, Clock, Plus, Minus, Trash2
} from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { canDelete } from '../utils/permissions'

type View = 'distributors' | 'order' | 'preview' | 'history'

export default function Pedidos() {
  const { employee } = useAuth()
  const { orders, addOrder, deleteOrder } = useOrders()
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const isAdmin = canDelete(employee?.role ?? 'mucama')
  const [view, setView] = useState<View>('distributors')
  const [selectedDistId, setSelectedDistId] = useState<string | null>(null)
  const [items, setItems] = useState<Map<string, OrderItem>>(new Map())
  const [orderNotes, setOrderNotes] = useState('')
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const selectedDist = distributors.find(d => d.id === selectedDistId)
  const distProducts = useMemo(
    () => products.filter(p => p.distributorId === selectedDistId && p.active),
    [selectedDistId]
  )

  const categories = useMemo(
    () => [...new Set(distributors.map(d => d.category))],
    []
  )

  const filteredDists = useMemo(() => {
    let result = distributors
    if (filterCategory !== 'all') {
      result = result.filter(d => d.category === filterCategory)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(d =>
        d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)
      )
    }
    return result
  }, [search, filterCategory])

  const activeItems = useMemo(
    () => [...items.values()].filter(i => i.quantity > 0),
    [items]
  )

  function selectDistributor(id: string) {
    setSelectedDistId(id)
    setItems(new Map())
    setOrderNotes('')
    setView('order')
  }

  function updateQuantity(productId: string, delta: number) {
    setItems(prev => {
      const next = new Map(prev)
      const product = products.find(p => p.id === productId)!
      const existing = next.get(productId)
      const newQty = Math.max(0, (existing?.quantity ?? 0) + delta)
      if (newQty === 0) {
        next.delete(productId)
      } else {
        next.set(productId, {
          productId,
          productName: product.name,
          quantity: newQty,
          unit: product.unit,
          notes: existing?.notes ?? '',
        })
      }
      return next
    })
  }

  function handlePreview() {
    setView('preview')
  }

  function handleSendOrder() {
    if (!selectedDist || !employee) return
    const { url } = generateWhatsAppMessage(
      selectedDist.name,
      selectedDist.phone,
      activeItems,
      orderNotes
    )
    addOrder({
      distributorId: selectedDist.id,
      distributorName: selectedDist.name,
      createdBy: employee.name,
      items: activeItems,
      status: 'enviado',
      notes: orderNotes,
    })
    window.open(url, '_blank')
    setView('distributors')
    setSelectedDistId(null)
  }

  async function handleCopy() {
    if (!selectedDist) return
    const { text } = generateWhatsAppMessage(
      selectedDist.name,
      selectedDist.phone,
      activeItems,
      orderNotes
    )
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // =================== VIEWS ===================

  if (view === 'history') {
    return (
      <div>
        <button
          onClick={() => setView('distributors')}
          className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
        >
          <ChevronLeft size={18} /> Volver
        </button>
        <h2 className="text-xl font-bold text-navy-800 mb-4">Historial de Pedidos</h2>
        {orders.length === 0 ? (
          <p className="text-navy-400 text-center py-12">No hay pedidos aun</p>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const isBorrado = order.status === 'borrado'
              return (
                <div
                  key={order.id}
                  className={`rounded-xl p-4 shadow-sm border ${
                    isBorrado
                      ? 'bg-red-50 border-red-200 opacity-70'
                      : 'bg-white border-navy-100'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className={`font-semibold ${isBorrado ? 'text-navy-400 line-through' : 'text-navy-800'}`}>
                        {order.distributorName}
                      </p>
                      <p className="text-xs text-navy-400">
                        {new Date(order.createdAt).toLocaleDateString('es-AR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                        {' - '}{order.createdBy}
                      </p>
                      {isBorrado && order.deletedAt && (
                        <p className="text-xs text-red-500 mt-0.5">
                          Borrado el {new Date(order.deletedAt).toLocaleDateString('es-AR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                          {order.deletedBy ? ` por ${order.deletedBy}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        order.status === 'borrado' ? 'bg-red-100 text-red-600' :
                        order.status === 'enviado' ? 'bg-gold-100 text-gold-700' :
                        order.status === 'recibido' ? 'bg-green-100 text-green-700' :
                        'bg-navy-100 text-navy-600'
                      }`}>
                        {order.status}
                      </span>
                      {!isBorrado && isAdmin && (
                        <button
                          onClick={() => setDeleteTargetId(order.id)}
                          className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Borrar pedido"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <ul className={`text-sm space-y-0.5 ${isBorrado ? 'text-navy-400 line-through' : 'text-navy-600'}`}>
                    {order.items.map((item, i) => (
                      <li key={i}>- {item.quantity} x {item.productName} ({item.unit})</li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (view === 'preview' && selectedDist) {
    const { text } = generateWhatsAppMessage(
      selectedDist.name,
      selectedDist.phone,
      activeItems,
      orderNotes
    )
    return (
      <div>
        <button
          onClick={() => setView('order')}
          className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
        >
          <ChevronLeft size={18} /> Volver al pedido
        </button>
        <h2 className="text-xl font-bold text-navy-800 mb-4">Vista previa del pedido</h2>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-navy-100 mb-4">
          <p className="text-sm text-navy-500 mb-2">Mensaje para WhatsApp:</p>
          <pre className="whitespace-pre-wrap text-navy-800 text-sm font-sans bg-navy-50 rounded-lg p-4">
            {text}
          </pre>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-navy-100 text-navy-700 hover:bg-navy-200"
          >
            {copied ? <><Check size={18} /> Copiado!</> : <><Copy size={18} /> Copiar texto</>}
          </button>
          <button
            onClick={handleSendOrder}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-green-600 text-white hover:bg-green-700"
          >
            <Send size={18} /> Abrir WhatsApp y guardar
          </button>
        </div>
      </div>
    )
  }

  if (view === 'order' && selectedDist) {
    return (
      <div>
        <button
          onClick={() => { setView('distributors'); setSelectedDistId(null) }}
          className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
        >
          <ChevronLeft size={18} /> Distribuidores
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-navy-800 text-cream flex items-center justify-center text-lg font-bold">
            {selectedDist.name[0]}
          </div>
          <div>
            <h2 className="text-lg font-bold text-navy-800">{selectedDist.name}</h2>
            <p className="text-xs text-navy-400">{selectedDist.notes}</p>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          {distProducts.map(product => {
            const item = items.get(product.id)
            const qty = item?.quantity ?? 0
            return (
              <div
                key={product.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                  qty > 0 ? 'bg-gold-50 border-gold-300' : 'bg-white border-navy-100'
                }`}
              >
                <div>
                  <p className="font-medium text-navy-800 text-sm">{product.name}</p>
                  <p className="text-xs text-navy-400">{product.unit}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(product.id, -1)}
                    className="w-8 h-8 rounded-lg bg-navy-100 text-navy-600 flex items-center justify-center hover:bg-navy-200 transition-colors"
                    disabled={qty === 0}
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-8 text-center font-semibold text-navy-800">{qty}</span>
                  <button
                    onClick={() => updateQuantity(product.id, 1)}
                    className="w-8 h-8 rounded-lg bg-navy-800 text-cream flex items-center justify-center hover:bg-navy-700 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <textarea
          value={orderNotes}
          onChange={e => setOrderNotes(e.target.value)}
          placeholder="Notas adicionales (opcional)"
          className="w-full p-3 rounded-xl border border-navy-200 text-sm resize-none h-20 focus:outline-none focus:border-gold-400 mb-4"
        />

        {activeItems.length > 0 && (
          <button
            onClick={handlePreview}
            className="w-full py-3 rounded-xl bg-gold-400 text-navy-900 font-bold text-sm hover:bg-gold-500 transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingCart size={18} />
            Ver pedido ({activeItems.length} {activeItems.length === 1 ? 'producto' : 'productos'})
          </button>
        )}
      </div>
    )
  }

  // =================== DISTRIBUTORS LIST ===================
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-navy-800">Pedidos</h2>
        <button
          onClick={() => setView('history')}
          className="flex items-center gap-2 text-sm text-navy-500 hover:text-navy-700 font-medium"
        >
          <Clock size={16} /> Historial
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar distribuidor..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              filterCategory === 'all' ? 'bg-navy-800 text-cream' : 'bg-white text-navy-600 border border-navy-200 hover:bg-navy-50'
            }`}
          >
            Todos
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filterCategory === cat ? 'bg-navy-800 text-cream' : 'bg-white text-navy-600 border border-navy-200 hover:bg-navy-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Distributors grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredDists.map(dist => {
          const prodCount = products.filter(p => p.distributorId === dist.id && p.active).length
          return (
            <button
              key={dist.id}
              onClick={() => selectDistributor(dist.id)}
              className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 hover:border-gold-400 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-navy-800 text-cream flex items-center justify-center text-lg font-bold shrink-0 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
                  {dist.name[0]}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-navy-800 text-sm truncate">{dist.name}</p>
                  <p className="text-xs text-gold-600 font-medium">{dist.category}</p>
                  <p className="text-xs text-navy-400 mt-1 flex items-center gap-1">
                    <Package size={12} /> {prodCount} productos
                  </p>
                  {dist.notes && (
                    <p className="text-xs text-navy-400 mt-0.5 truncate">{dist.notes}</p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="Borrar pedido"
        message="Este pedido se marcara como borrado. Esta accion no se puede deshacer."
        onConfirm={() => {
          if (deleteTargetId) {
            deleteOrder(deleteTargetId, employee?.name ?? '')
            setDeleteTargetId(null)
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
