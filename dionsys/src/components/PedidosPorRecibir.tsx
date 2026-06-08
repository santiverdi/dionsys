import { useState } from 'react'
import { PackageCheck, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { useAuth } from '../context/AuthContext'
import RecibirPedidoModal from './RecibirPedidoModal'
import type { PedidoSemanal } from '../types'

// Roles que reciben mercadería (no admin: ese pide desde Proveedores).
const RECEIVER_ROLES = new Set(['concierge', 'mucama', 'encargada'])

export default function PedidosPorRecibir() {
  const { employee } = useAuth()
  const { pedidos, recibirPedido } = useStock()
  const [expanded, setExpanded] = useState(false)
  const [target, setTarget] = useState<PedidoSemanal | null>(null)

  const role = employee?.role
  const porRecibir = pedidos.filter(p => p.status === 'pedido')
  if (!role || !RECEIVER_ROLES.has(role) || porRecibir.length === 0) return null

  function handleConfirm(recibidos: { itemId: string; cantidad: number }[]) {
    if (!target || !employee) return
    recibirPedido(target.id, employee.name, recibidos)
    setTarget(null)
  }

  return (
    <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-3 mb-4">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <PackageCheck size={20} className="text-blue-600 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-sm font-bold text-blue-900">
              {porRecibir.length} {porRecibir.length === 1 ? 'pedido' : 'pedidos'} para recibir
            </p>
            <p className="text-xs text-blue-700">¿Llegó la mercadería? Cargala al depósito.</p>
          </div>
        </div>
        {expanded
          ? <ChevronUp size={18} className="text-blue-600 shrink-0" />
          : <ChevronDown size={18} className="text-blue-600 shrink-0" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {porRecibir.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 bg-white rounded-lg p-2.5 border border-blue-100">
              <div className="min-w-0">
                <p className="text-sm font-medium text-navy-800">Pedido semanal</p>
                <p className="text-xs text-navy-400 flex items-center gap-1">
                  <Clock size={10} />
                  {p.items.filter(i => i.aPedir > 0).length} items
                  {p.pedidoBy ? ` · pedido por ${p.pedidoBy}` : ''}
                </p>
              </div>
              <button
                onClick={() => setTarget(p)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shrink-0"
              >
                Recibir
              </button>
            </div>
          ))}
        </div>
      )}

      {target && (
        <RecibirPedidoModal
          pedido={target}
          onClose={() => setTarget(null)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}
