import { useMemo, useState } from 'react'
import { X, PackageCheck, CheckCircle2 } from 'lucide-react'
import type { PedidoSemanal, PedidoSemanalItem } from '../types'
import { depositoItemSupplier, depositoSuppliers } from '../data/mock'

interface RecibirPedidoModalProps {
  pedido: PedidoSemanal
  onClose: () => void
  onConfirm: (recibidos: { itemId: string; cantidad: number }[]) => void
}

type Editable = PedidoSemanalItem & { recibidoInput: number }

export default function RecibirPedidoModal({
  pedido, onClose, onConfirm,
}: RecibirPedidoModalProps) {
  const [editable, setEditable] = useState<Editable[]>(() =>
    pedido.items
      .filter(i => i.aPedir > 0)
      .map(i => ({ ...i, recibidoInput: i.aPedir }))
  )
  const [submitting, setSubmitting] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Editable[] }>()
    for (const item of editable) {
      const suppId = depositoItemSupplier[item.itemId] ?? 'sup-alim'
      const supplier = depositoSuppliers.find(s => s.id === suppId)
      const label = supplier?.name ?? 'Otro'
      if (!map.has(suppId)) map.set(suppId, { label, items: [] })
      map.get(suppId)!.items.push(item)
    }
    return Array.from(map.values())
  }, [editable])

  const totalPedido = editable.length
  const totalRecibido = editable.filter(i => i.recibidoInput > 0).length

  function updateQty(itemId: string, qty: number) {
    setEditable(prev => prev.map(i => i.itemId === itemId ? { ...i, recibidoInput: Math.max(0, qty) } : i))
  }

  function setAllToPedido() {
    setEditable(prev => prev.map(i => ({ ...i, recibidoInput: i.aPedir })))
  }

  function handleConfirm() {
    if (submitting) return
    setSubmitting(true)
    const recibidos = editable.map(i => ({ itemId: i.itemId, cantidad: i.recibidoInput }))
    onConfirm(recibidos)
  }

  const fecha = new Date(pedido.date).toLocaleDateString('es-AR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[480px] sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 border-b border-navy-100">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <PackageCheck size={18} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-navy-800">Confirmar recepción</h3>
            </div>
            <p className="text-xs text-navy-500 ml-10 truncate">Pedido del {fecha}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-3 flex-1">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-navy-500">
              Ajustá lo que <span className="font-semibold text-navy-700">realmente llegó</span>. Se va a sumar al depósito.
            </p>
            <button
              onClick={setAllToPedido}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0 ml-2"
            >
              Vino todo
            </button>
          </div>

          {groups.map(g => (
            <div key={g.label} className="mb-4 last:mb-0">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 mb-2">{g.label}</p>
              <div className="space-y-1.5">
                {g.items.map(item => {
                  const completo = item.recibidoInput >= item.aPedir
                  const parcial = item.recibidoInput > 0 && item.recibidoInput < item.aPedir
                  const cero = item.recibidoInput === 0
                  return (
                    <div
                      key={item.itemId}
                      className={`rounded-lg border p-2.5 ${
                        cero ? 'bg-red-50 border-red-200'
                          : parcial ? 'bg-amber-50 border-amber-200'
                          : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-navy-800 truncate">{item.name}</p>
                          <p className="text-[11px] text-navy-500">
                            Pedidas: <span className="font-semibold">{item.aPedir}</span> {item.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            value={item.recibidoInput}
                            onChange={e => updateQty(item.itemId, Number(e.target.value))}
                            className="w-16 px-2 py-1.5 rounded border border-navy-200 text-sm text-center font-bold text-navy-800 focus:outline-none focus:border-gold-400"
                            min={0}
                            step={0.5}
                          />
                          <span className="text-xs text-navy-500 w-10">{item.unit}</span>
                          {completo && <CheckCircle2 size={16} className="text-green-600" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-navy-100 bg-cream/50">
          <p className="text-xs text-navy-500 mb-3 text-center">
            {totalRecibido} de {totalPedido} items con cantidad &gt; 0
          </p>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <PackageCheck size={18} />
            {submitting ? 'Guardando...' : 'Confirmar y sumar al depósito'}
          </button>
        </div>
      </div>
    </div>
  )
}
