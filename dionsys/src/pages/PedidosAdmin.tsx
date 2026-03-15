import { useMemo } from 'react'
import { Send, Clock, Package, MessageCircle } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { depositoSuppliers, depositoItemSupplier } from '../data/mock'
import type { PedidoSemanal } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function PedidoCard({ pedido }: { pedido: PedidoSemanal }) {
  // Group items by supplier
  const supplierGroups = useMemo(() => {
    const groups = new Map<string, { supplier: typeof depositoSuppliers[0]; items: typeof pedido.items }>()

    for (const item of pedido.items) {
      if (item.aPedir <= 0) continue
      const supplierId = depositoItemSupplier[item.itemId] ?? 'sup-alim'
      const supplier = depositoSuppliers.find(s => s.id === supplierId) ?? depositoSuppliers[0]

      if (!groups.has(supplierId)) {
        groups.set(supplierId, { supplier, items: [] })
      }
      groups.get(supplierId)!.items.push(item)
    }

    return Array.from(groups.values())
  }, [pedido.items])

  function buildWhatsAppUrl(supplierName: string, phone: string, items: typeof pedido.items) {
    const fecha = new Date(pedido.date).toLocaleDateString('es-AR', {
      weekday: 'long', day: '2-digit', month: '2-digit',
    })
    const lines = [
      `Hola *${supplierName}*! Pedido de Hotel Dion:`,
      `Fecha: ${fecha}`,
      '',
      ...items.map(i => `- ${i.name}: ${i.aPedir} ${i.unit}`),
      '',
      'Gracias!',
    ]
    const text = lines.join('\n')
    const cleanPhone = phone.replace(/\D/g, '')
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-navy-800">Pedido Semanal</p>
          <p className="text-xs text-navy-400 flex items-center gap-1">
            <Clock size={11} /> {formatDate(pedido.date)} — {pedido.createdBy}
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-gold-100 text-gold-700">
          {pedido.status}
        </span>
      </div>

      {supplierGroups.map(({ supplier, items }) => {
        const waUrl = buildWhatsAppUrl(supplier.name, supplier.phone, items)
        return (
          <div key={supplier.id} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-navy-500" />
                <span className="text-sm font-semibold text-navy-700">{supplier.name}</span>
                <span className="text-xs text-navy-400">({supplier.category})</span>
              </div>
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
              >
                <MessageCircle size={14} /> WhatsApp
              </a>
            </div>

            <div className="bg-navy-50 rounded-lg p-3">
              <ul className="space-y-1">
                {items.map(item => (
                  <li key={item.itemId} className="flex items-center justify-between text-sm">
                    <span className="text-navy-700">{item.name}</span>
                    <span className="font-semibold text-navy-800">{item.aPedir} {item.unit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PedidosAdmin() {
  const { pedidos } = useStock()

  const activePedidos = useMemo(
    () => pedidos.filter(p => p.status === 'enviado'),
    [pedidos]
  )

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-1">Pedidos por Proveedor</h2>
      <p className="text-sm text-navy-500 mb-6">
        Pedidos semanales agrupados por distribuidor. Envia cada pedido por WhatsApp.
      </p>

      {activePedidos.length === 0 ? (
        <div className="text-center py-16">
          <Send size={48} className="mx-auto text-navy-200 mb-3" />
          <p className="text-navy-400 font-medium">No hay pedidos pendientes</p>
          <p className="text-sm text-navy-300 mt-1">Los pedidos aparecen cuando se generan desde Deposito.</p>
        </div>
      ) : (
        activePedidos.map(pedido => (
          <PedidoCard key={pedido.id} pedido={pedido} />
        ))
      )}
    </div>
  )
}
