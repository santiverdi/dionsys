import { useState, useMemo } from 'react'
import {
  ChevronLeft, Copy, Check, Send, Plus, Minus,
  Users, TrendingUp, Clock
} from 'lucide-react'
import { generateId } from '../utils/imageCompressor'
import { receptionSuppliers, lacteosProducts } from '../data/mock'
import { useAuth } from '../context/AuthContext'
import { useOrders, generateWhatsAppMessage } from '../context/OrdersContext'
import type { ConsumptionRecord } from '../types'

const STORAGE_KEY = 'dionsys_lacteos_consumption'

function loadConsumption(): ConsumptionRecord[] {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
}

function saveConsumption(records: ConsumptionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

interface Props {
  onBack: () => void
}

export default function LacteosOrder({ onBack }: Props) {
  const { employee } = useAuth()
  const { addOrder } = useOrders()
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())
  const [guests, setGuests] = useState<number>(0)
  const [copied, setCopied] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [notes, setNotes] = useState('')

  const consumption = useMemo(() => loadConsumption(), [])
  const supplier = receptionSuppliers.lacteos

  const today = new Date()
  const dayOfWeek = today.getDay()
  const isOrderDay = dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5
  const dayName = today.toLocaleDateString('es-AR', { weekday: 'long' })

  // Calculate average consumption per guest from history
  const avgPerGuest = useMemo(() => {
    const lactRecords = consumption.filter(r => r.supplier === 'lacteos' && r.guests > 0)
    if (lactRecords.length === 0) return null

    const avgs: Record<string, { total: number; count: number }> = {}
    for (const record of lactRecords) {
      for (const item of record.items) {
        if (!avgs[item.productName]) avgs[item.productName] = { total: 0, count: 0 }
        avgs[item.productName].total += item.quantity / record.guests
        avgs[item.productName].count += 1
      }
    }

    const result: Record<string, number> = {}
    for (const [name, data] of Object.entries(avgs)) {
      result[name] = Math.round((data.total / data.count) * 100) / 100
    }
    return result
  }, [consumption])

  // Suggested quantities based on history
  const suggestions = useMemo(() => {
    if (!avgPerGuest || guests <= 0) return null
    const result: Record<string, number> = {}
    for (const product of lacteosProducts) {
      const avg = avgPerGuest[product.name]
      if (avg) {
        result[product.id] = Math.ceil(avg * guests)
      }
    }
    return result
  }, [avgPerGuest, guests])

  function updateQuantity(productId: string, delta: number) {
    setQuantities(prev => {
      const next = new Map(prev)
      const current = next.get(productId) ?? 0
      const newVal = Math.max(0, current + delta)
      if (newVal === 0) next.delete(productId)
      else next.set(productId, newVal)
      return next
    })
  }

  function applySuggestions() {
    if (!suggestions) return
    const next = new Map<string, number>()
    for (const [id, qty] of Object.entries(suggestions)) {
      if (qty > 0) next.set(id, qty)
    }
    setQuantities(next)
  }

  const activeItems = useMemo(() => {
    return lacteosProducts
      .filter(p => (quantities.get(p.id) ?? 0) > 0)
      .map(p => ({
        productId: p.id,
        productName: p.name,
        quantity: quantities.get(p.id)!,
        unit: p.unit,
        notes: '',
      }))
  }, [quantities])

  function getWhatsAppData() {
    if (activeItems.length === 0) return null
    return generateWhatsAppMessage(supplier.name, supplier.phone, activeItems, notes)
  }

  async function handleCopy() {
    const data = getWhatsAppData()
    if (!data) return
    await navigator.clipboard.writeText(data.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleSend() {
    const data = getWhatsAppData()
    if (!data || !employee) return

    // Save order
    addOrder({
      distributorId: 'lacteos',
      distributorName: supplier.name,
      createdBy: employee.name,
      items: activeItems,
      status: 'enviado',
      notes: guests > 0 ? `${guests} huespedes` : '',
      type: 'recepcion',
    })

    // Save consumption record for analytics
    if (guests > 0) {
      const record: ConsumptionRecord = {
        id: generateId(),
        date: new Date().toISOString(),
        guests,
        supplier: 'lacteos',
        items: activeItems.map(i => ({ productName: i.productName, quantity: i.quantity, unit: i.unit })),
        createdBy: employee.name,
      }
      const updated = [record, ...consumption]
      saveConsumption(updated)
    }

    window.open(data.url, '_blank')
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
      >
        <ChevronLeft size={18} /> Pedidos Recepcion
      </button>

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-navy-800">Lacteos - El Amanecer</h2>
        <button
          onClick={() => setShowStats(!showStats)}
          className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-700 font-medium"
        >
          <TrendingUp size={14} /> {showStats ? 'Ocultar' : 'Ver'} consumo
        </button>
      </div>
      <p className="text-sm text-navy-500 mb-4">{supplier.notes}</p>

      {!isOrderDay && (
        <div className="bg-navy-50 border border-navy-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <Clock size={20} className="text-navy-500 shrink-0 mt-0.5" />
          <p className="text-sm text-navy-600">
            Hoy es {dayName}. Los pedidos se hacen Lunes, Miercoles y Viernes.
            Podes armar el pedido igual.
          </p>
        </div>
      )}

      {/* Consumption stats */}
      {showStats && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
          <h3 className="text-sm font-semibold text-navy-700 mb-2">Consumo promedio por huesped</h3>
          {avgPerGuest && Object.keys(avgPerGuest).length > 0 ? (
            <div className="space-y-1">
              {Object.entries(avgPerGuest).map(([name, avg]) => (
                <div key={name} className="flex justify-between text-sm">
                  <span className="text-navy-600">{name}</span>
                  <span className="font-medium text-navy-800">{avg} por huesped</span>
                </div>
              ))}
              <p className="text-xs text-navy-400 mt-2">
                Basado en {consumption.filter(r => r.supplier === 'lacteos').length} pedidos anteriores
              </p>
            </div>
          ) : (
            <p className="text-sm text-navy-400">
              Sin datos aun. Los promedios se calculan automaticamente a medida que se hacen pedidos con huespedes cargados.
            </p>
          )}
        </div>
      )}

      {/* Guest input for suggestions */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700 mb-2">
          <Users size={16} /> Huespedes (para sugerencias)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            max={500}
            value={guests || ''}
            onChange={e => setGuests(parseInt(e.target.value) || 0)}
            placeholder="Ej: 45"
            className="flex-1 px-4 py-2 rounded-xl border border-navy-200 text-lg font-bold text-navy-800 focus:outline-none focus:border-gold-400"
          />
          {suggestions && (
            <button
              onClick={applySuggestions}
              className="px-4 py-2 rounded-xl bg-gold-400 text-navy-900 font-semibold text-sm hover:bg-gold-500 transition-colors whitespace-nowrap"
            >
              Aplicar sugerencia
            </button>
          )}
        </div>
        {!avgPerGuest && guests > 0 && (
          <p className="text-xs text-navy-400 mt-1">
            Todavia no hay historial para sugerir cantidades. Carga manualmente.
          </p>
        )}
      </div>

      {/* Products list */}
      <div className="space-y-2 mb-4">
        {lacteosProducts.map(product => {
          const qty = quantities.get(product.id) ?? 0
          const suggestion = suggestions?.[product.id]
          return (
            <div
              key={product.id}
              className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${
                qty > 0 ? 'bg-gold-50 border-gold-300' : 'bg-white border-navy-100'
              }`}
            >
              <div>
                <p className="font-medium text-navy-800 text-sm">{product.name}</p>
                <p className="text-xs text-navy-400">
                  {product.unit}
                  {suggestion && qty === 0 && (
                    <span className="ml-2 text-gold-600">sugerido: {suggestion}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(product.id, -1)}
                  disabled={qty === 0}
                  className="w-8 h-8 rounded-lg bg-navy-100 text-navy-600 flex items-center justify-center hover:bg-navy-200 transition-colors disabled:opacity-30"
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
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notas adicionales (opcional)"
        className="w-full p-3 rounded-xl border border-navy-200 text-sm resize-none h-16 focus:outline-none focus:border-gold-400 mb-4"
      />

      {activeItems.length > 0 && (
        <>
          {/* WhatsApp preview */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
            <p className="text-sm text-navy-500 mb-2">Mensaje para WhatsApp:</p>
            <pre className="whitespace-pre-wrap text-navy-800 text-sm font-sans bg-navy-50 rounded-lg p-3">
              {getWhatsAppData()?.text}
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
              onClick={handleSend}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-green-600 text-white hover:bg-green-700"
            >
              <Send size={18} /> Abrir WhatsApp y guardar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
