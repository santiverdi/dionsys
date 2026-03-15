import { useState, useMemo } from 'react'
import { ChevronLeft, Copy, Check, Send, Users, Calendar, AlertTriangle } from 'lucide-react'
import { receptionSuppliers } from '../data/mock'
import { useAuth } from '../context/AuthContext'
import { useOrders, generateWhatsAppMessage } from '../context/OrdersContext'

const RATIO_PER_GUEST = 1.7

function roundToHalfDozen(n: number): number {
  return Math.ceil(n / 6) * 6
}

function formatDocenas(qty: number): string {
  const docenas = Math.floor(qty / 12)
  const media = (qty % 12) >= 6 ? 1 : 0
  const sueltas = qty - (docenas * 12) - (media * 6)

  const parts: string[] = []
  if (docenas > 0) parts.push(`${docenas} doc.`)
  if (media > 0) parts.push(`1/2 doc.`)
  if (sueltas > 0) parts.push(`${sueltas} un.`)
  return parts.join(' + ') || '0'
}

interface Props {
  onBack: () => void
}

export default function PanaderiaCalc({ onBack }: Props) {
  const { employee } = useAuth()
  const { addOrder } = useOrders()
  const [guests, setGuests] = useState<number>(0)
  const [copied, setCopied] = useState(false)

  const today = new Date()
  const dayOfWeek = today.getDay()
  const isSaturday = dayOfWeek === 6
  const isSunday = dayOfWeek === 0
  const dayName = today.toLocaleDateString('es-AR', { weekday: 'long' })

  const calc = useMemo(() => {
    if (guests <= 0) return null

    let rawTotal = Math.ceil(guests * RATIO_PER_GUEST)
    if (isSaturday) rawTotal *= 2

    const total = roundToHalfDozen(rawTotal)

    // Facturas: siempre presentes
    // Menos de 2 docenas (24) de medialunas → 1/2 doc surtidas (6)
    // 2 docenas (24+) de medialunas → 1 doc surtidas (12)
    // Cada 50 piezas: 12 son facturas (si da mas que el minimo)
    const calculatedFacturas = Math.floor(total / 50) * 12
    const minFacturas = (total - 6) < 24 ? 6 : 12
    const facturas = Math.max(minFacturas, calculatedFacturas)
    const medialunas = total - facturas

    return { total, medialunas, facturas, isDouble: isSaturday }
  }, [guests, isSaturday])

  const supplier = receptionSuppliers.panaderia

  function getWhatsAppData() {
    if (!calc) return null
    const items = []
    if (calc.medialunas > 0) {
      items.push({
        productId: 'pan-medialunas',
        productName: `Medialunas (${formatDocenas(calc.medialunas)})`,
        quantity: calc.medialunas,
        unit: 'unidades',
        notes: '',
      })
    }
    items.push({
      productId: 'pan-facturas',
      productName: `Facturas surtidas (${formatDocenas(calc.facturas)})`,
      quantity: calc.facturas,
      unit: 'unidades',
      notes: '',
    })
    // Sin cantidad de huespedes en el mensaje
    const dayNote = calc.isDouble ? 'PEDIDO DOBLE (sabado + domingo)' : ''
    return generateWhatsAppMessage(supplier.name, supplier.phone, items, dayNote)
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
    if (!data || !calc || !employee) return
    addOrder({
      distributorId: 'panaderia',
      distributorName: supplier.name,
      createdBy: employee.name,
      items: [
        { productId: 'pan-med', productName: 'Medialunas', quantity: calc.medialunas, unit: 'unidades', notes: '' },
        { productId: 'pan-fac', productName: 'Facturas surtidas', quantity: calc.facturas, unit: 'unidades', notes: '' },
      ],
      status: 'enviado',
      notes: `${guests} huespedes${calc.isDouble ? ' - DOBLE (sab+dom)' : ''}`,
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

      <h2 className="text-xl font-bold text-navy-800 mb-1">Piazza - Panaderia</h2>
      <p className="text-sm text-navy-500 mb-6">{supplier.notes}</p>

      {isSunday && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">Hoy es domingo, la panaderia no abre. El pedido se hace los sabados (doble).</p>
        </div>
      )}

      {isSaturday && (
        <div className="bg-gold-50 border border-gold-300 rounded-xl p-4 mb-4 flex items-start gap-3">
          <Calendar size={20} className="text-gold-600 shrink-0 mt-0.5" />
          <p className="text-sm text-gold-800">Sabado: pedido doble automatico (cubre sabado + domingo).</p>
        </div>
      )}

      {/* Guest input */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-navy-100 mb-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-navy-700 mb-3">
          <Users size={18} /> Cantidad de huespedes para manana
        </label>
        <input
          type="number"
          min={0}
          max={500}
          value={guests || ''}
          onChange={e => setGuests(parseInt(e.target.value) || 0)}
          placeholder="Ej: 45"
          className="w-full px-4 py-3 rounded-xl border border-navy-200 text-2xl font-bold text-center text-navy-800 focus:outline-none focus:border-gold-400"
        />
        <p className="text-xs text-navy-400 text-center mt-2">
          Hoy: {dayName} | Formula: {RATIO_PER_GUEST} por huesped, redondeado a media docena
        </p>
      </div>

      {/* Calculation result */}
      {calc && (
        <>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-navy-100 mb-4">
            <h3 className="text-sm font-semibold text-navy-600 mb-3">Calculo del pedido</h3>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 rounded-lg bg-gold-50 border border-gold-200">
                <div>
                  <p className="font-semibold text-navy-800">Medialunas</p>
                  <p className="text-xs text-navy-500">{formatDocenas(calc.medialunas)}</p>
                </div>
                <span className="text-2xl font-bold text-navy-800">{calc.medialunas}</span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-lg bg-gold-50 border border-gold-200">
                <div>
                  <p className="font-semibold text-navy-800">Facturas surtidas</p>
                  <p className="text-xs text-navy-500">{formatDocenas(calc.facturas)}</p>
                </div>
                <span className="text-2xl font-bold text-navy-800">{calc.facturas}</span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-lg bg-navy-50 border border-navy-200">
                <p className="font-semibold text-navy-700">Total piezas</p>
                <span className="text-2xl font-bold text-navy-800">{calc.total}</span>
              </div>

              {calc.isDouble && (
                <p className="text-xs text-gold-700 font-medium text-center">
                  Pedido doble aplicado (sabado)
                </p>
              )}
            </div>

            <div className="mt-4 text-xs text-navy-400 bg-navy-50 rounded-lg p-3">
              <p>{guests} huespedes x {RATIO_PER_GUEST} = {Math.ceil(guests * RATIO_PER_GUEST)} → redondeado a {calc.total}{calc.isDouble ? ' (x2 sabado)' : ''}</p>
              <p>Surtidas: {calc.medialunas < 24 ? '1/2 doc. (menos de 2 doc. medialunas)' : '1 doc. (2+ doc. medialunas)'} | Cada 50: 38 med. + 12 surt.</p>
            </div>
          </div>

          {/* WhatsApp preview */}
          <div className="bg-white rounded-xl p-5 shadow-sm border border-navy-100 mb-4">
            <p className="text-sm text-navy-500 mb-2">Mensaje para WhatsApp:</p>
            <pre className="whitespace-pre-wrap text-navy-800 text-sm font-sans bg-navy-50 rounded-lg p-4">
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
