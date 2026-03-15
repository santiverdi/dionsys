import { useState, useMemo } from 'react'
import { ChevronLeft, Copy, Check, Send, Minus, Plus } from 'lucide-react'
import { verduleriaSupplier, verduleriaProducts } from '../data/mock'
import { useAuth } from '../context/AuthContext'
import { useOrders, generateWhatsAppMessage } from '../context/OrdersContext'

interface Props {
  onBack: () => void
}

export default function VerduleriaOrder({ onBack }: Props) {
  const { employee } = useAuth()
  const { addOrder } = useOrders()
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())
  const [copied, setCopied] = useState(false)
  const [notes, setNotes] = useState('')

  const supplier = verduleriaSupplier

  function updateQuantity(productId: string, delta: number) {
    setQuantities(prev => {
      const next = new Map(prev)
      const current = next.get(productId) ?? 0
      const newVal = Math.max(0, +(current + delta).toFixed(1))
      if (newVal === 0) next.delete(productId)
      else next.set(productId, newVal)
      return next
    })
  }

  const activeItems = useMemo(() => {
    return verduleriaProducts
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

    addOrder({
      distributorId: 'verduleria',
      distributorName: supplier.name,
      createdBy: employee.name,
      items: activeItems,
      status: 'enviado',
      notes,
      type: 'recepcion',
    })

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

      <h2 className="text-xl font-bold text-navy-800 mb-1">Gustavo - Verduleria</h2>
      <p className="text-sm text-navy-500 mb-6">{supplier.notes}</p>

      {/* Products list */}
      <div className="space-y-2 mb-4">
        {verduleriaProducts.map(product => {
          const qty = quantities.get(product.id) ?? 0
          return (
            <div
              key={product.id}
              className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                qty > 0 ? 'bg-green-50 border-green-300' : 'bg-white border-navy-100'
              }`}
            >
              <div>
                <p className="font-medium text-navy-800">{product.name}</p>
                <p className="text-xs text-navy-400">{qty > 0 ? `${qty} kg` : 'Sin pedir'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(product.id, -0.5)}
                  disabled={qty === 0}
                  className="w-9 h-9 rounded-lg bg-navy-100 text-navy-600 flex items-center justify-center hover:bg-navy-200 transition-colors disabled:opacity-30"
                >
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center font-bold text-navy-800 text-lg">
                  {qty > 0 ? qty : '-'}
                </span>
                <button
                  onClick={() => updateQuantity(product.id, 0.5)}
                  className="w-9 h-9 rounded-lg bg-navy-800 text-cream flex items-center justify-center hover:bg-navy-700 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-navy-400 text-center mb-4">Incrementos de medio kilo (0.5 kg)</p>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notas adicionales (opcional)"
        className="w-full p-3 rounded-xl border border-navy-200 text-sm resize-none h-16 focus:outline-none focus:border-gold-400 mb-4"
      />

      {activeItems.length > 0 && (
        <>
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
