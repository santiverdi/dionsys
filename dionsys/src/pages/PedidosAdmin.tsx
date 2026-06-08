import { useMemo, useState } from 'react'
import { Send, Clock, Package, MessageCircle, DollarSign, Edit3, PackageCheck, CheckCircle2, Truck, Plus, Pencil, AlertTriangle } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { useAuth } from '../context/AuthContext'
import { resolveSupplierId } from '../utils/deposito'
import { formatMontoCurrency } from '../utils/validators'
import MontoModal from '../components/MontoModal'
import RecibirPedidoModal from '../components/RecibirPedidoModal'
import SupplierModal from '../components/SupplierModal'
import type { PedidoSemanal, DepositoSupplier } from '../types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function PedidoCard({ pedido, isAdmin, onCargarMonto, onRecibir, onMarcarPedido }: { pedido: PedidoSemanal; isAdmin: boolean; onCargarMonto: () => void; onRecibir: () => void; onMarcarPedido: () => void }) {
  const { items, suppliers } = useStock()
  const isArmado = pedido.status === 'armado'
  const isPedido = pedido.status === 'pedido'
  const isRecibido = pedido.status === 'recibido'

  // Group items by supplier (item override first, then static map)
  const supplierGroups = useMemo(() => {
    const fallback: DepositoSupplier = { id: 'otros', name: 'Sin proveedor', phone: '', category: '' }
    const groups = new Map<string, { supplier: DepositoSupplier; items: typeof pedido.items }>()

    for (const item of pedido.items) {
      if (item.aPedir <= 0) continue
      const supplierId = resolveSupplierId(item.itemId, items) || 'otros'
      const supplier = suppliers.find(s => s.id === supplierId) ?? fallback

      if (!groups.has(supplierId)) {
        groups.set(supplierId, { supplier, items: [] })
      }
      groups.get(supplierId)!.items.push(item)
    }

    return Array.from(groups.values())
  }, [pedido, items, suppliers])

  function buildWhatsAppUrl(supplierName: string, phone: string, items: typeof pedido.items) {
    const fecha = new Date(pedido.date).toLocaleDateString('es-AR', {
      weekday: 'long', day: '2-digit', month: '2-digit',
    })
    const lines = [
      `Hola *${supplierName}*! Pedido de Hotel Dion:`,
      `Fecha: ${fecha}`,
      '',
      ...items.map(i => `- ${i.name}: ${i.aPedir} ${i.orderUnit ?? i.unit}`),
      '',
      'Gracias!',
    ]
    const text = lines.join('\n')
    const cleanPhone = phone.replace(/\D/g, '')
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
  }

  return (
    <div className={`rounded-xl p-4 shadow-sm border mb-4 ${
      isRecibido ? 'bg-green-50/30 border-green-200' : 'bg-white border-navy-100'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-navy-800">Pedido Semanal</p>
          <p className="text-xs text-navy-400 flex items-center gap-1">
            <Clock size={11} /> {formatDate(pedido.date)} — {pedido.createdBy}
          </p>
          {isPedido && pedido.pedidoAt && (
            <p className="text-xs text-blue-700 mt-0.5 flex items-center gap-1">
              <Truck size={11} />
              Pedido {new Date(pedido.pedidoAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {pedido.pedidoBy ? ` por ${pedido.pedidoBy}` : ''}
            </p>
          )}
          {isRecibido && pedido.recibidoAt && (
            <p className="text-xs text-green-700 mt-0.5 flex items-center gap-1">
              <CheckCircle2 size={11} />
              Recibido {new Date(pedido.recibidoAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {pedido.recibidoBy ? ` por ${pedido.recibidoBy}` : ''}
            </p>
          )}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          isRecibido ? 'bg-green-100 text-green-700' : isPedido ? 'bg-blue-100 text-blue-700' : 'bg-gold-100 text-gold-700'
        }`}>
          {pedido.status}
        </span>
      </div>

      {/* Monto recibido */}
      <div className={`rounded-lg p-3 mb-3 border ${
        pedido.monto != null
          ? 'bg-green-50 border-green-200'
          : 'bg-navy-50 border-navy-100'
      }`}>
        {pedido.monto != null ? (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-green-700">Monto recibido</p>
              <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(pedido.monto)}</p>
              <p className="text-xs text-navy-500">
                Cargado por {pedido.montoCargadoBy ?? '?'}
                {pedido.montoCargadoAt && ` — ${new Date(pedido.montoCargadoAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`}
              </p>
            </div>
            {isAdmin && (
              <button
                onClick={onCargarMonto}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white text-navy-700 hover:bg-navy-50 border border-navy-200 shrink-0"
              >
                <Edit3 size={12} /> Editar
              </button>
            )}
          </div>
        ) : isAdmin ? (
          <button
            onClick={onCargarMonto}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 transition-colors"
          >
            <DollarSign size={16} /> Cargar monto recibido
          </button>
        ) : (
          <p className="text-xs text-navy-400 italic text-center">
            Monto pendiente de cargar por administración
          </p>
        )}
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
              {!isRecibido && (
                <div className="flex items-center gap-1.5">
                  {!supplier.phone && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-600" title="Esta distribuidora no tiene teléfono cargado">
                      <AlertTriangle size={11} /> sin tel
                    </span>
                  )}
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                </div>
              )}
            </div>

            <div className="bg-navy-50 rounded-lg p-3">
              <ul className="space-y-1">
                {items.map(item => {
                  const rec = item.recibido
                  const showRecibido = isRecibido && rec != null
                  const incompleto = showRecibido && rec < item.aPedir
                  const cero = showRecibido && rec === 0
                  return (
                    <li key={item.itemId} className="flex items-center justify-between text-sm">
                      <span className="text-navy-700">{item.name}</span>
                      <span className="font-semibold text-navy-800 flex items-center gap-1.5">
                        {showRecibido ? (
                          <>
                            <span className={cero ? 'text-red-600' : incompleto ? 'text-amber-600' : 'text-green-700'}>
                              {rec}
                            </span>
                            <span className="text-xs text-navy-400">/ {item.aPedir} {item.orderUnit ?? item.unit}</span>
                          </>
                        ) : (
                          <>{item.aPedir} {item.orderUnit ?? item.unit}</>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        )
      })}

      {isAdmin && isArmado && (
        <button
          onClick={onMarcarPedido}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          <Truck size={16} />
          Marcar como pedido (avisa al conserje)
        </button>
      )}
      {isAdmin && isPedido && (
        <button
          onClick={onRecibir}
          className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
        >
          <PackageCheck size={16} />
          Marcar como recibido y sumar al depósito
        </button>
      )}
    </div>
  )
}

export default function PedidosAdmin() {
  const { employee } = useAuth()
  const {
    pedidos, setPedidoMonto, recibirPedido, marcarPedido,
    suppliers, addSupplier, updateSupplier, deleteSupplier,
  } = useStock()
  const [montoTarget, setMontoTarget] = useState<PedidoSemanal | null>(null)
  const [recibirTarget, setRecibirTarget] = useState<PedidoSemanal | null>(null)
  // Distribuidoras: undefined = panel cerrado-modal cerrado; modal target separado
  const [showDistribuidoras, setShowDistribuidoras] = useState(false)
  const [supplierModal, setSupplierModal] = useState<DepositoSupplier | null | undefined>(undefined)
  const isAdmin = employee?.role === 'admin'

  const paraPedir = useMemo(
    () => pedidos.filter(p => p.status === 'armado'),
    [pedidos]
  )
  const enCamino = useMemo(
    () => pedidos.filter(p => p.status === 'pedido'),
    [pedidos]
  )
  const recibidos = useMemo(
    () => pedidos.filter(p => p.status === 'recibido').slice(0, 10),
    [pedidos]
  )

  function handleSaveMonto({ monto, receiptPhoto }: { monto: number; receiptPhoto?: string }) {
    if (!montoTarget || !employee) return
    setPedidoMonto(montoTarget.id, monto, employee.name, receiptPhoto)
    setMontoTarget(null)
  }

  function handleConfirmRecibir(recibidosItems: { itemId: string; cantidad: number }[]) {
    if (!recibirTarget || !employee) return
    recibirPedido(recibirTarget.id, employee.name, recibidosItems)
    setRecibirTarget(null)
  }

  function handleMarcarPedido(pedido: PedidoSemanal) {
    if (!employee) return
    marcarPedido(pedido.id, employee.name)
  }

  function handleSaveSupplier(data: Omit<DepositoSupplier, 'id'>) {
    if (supplierModal) updateSupplier(supplierModal.id, data)
    else addSupplier(data)
    setSupplierModal(undefined)
  }

  function handleDeleteSupplier() {
    if (supplierModal) deleteSupplier(supplierModal.id)
    setSupplierModal(undefined)
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h2 className="text-xl font-bold text-navy-800">Pedidos por Proveedor</h2>
        {isAdmin && (
          <button
            onClick={() => setShowDistribuidoras(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
              showDistribuidoras ? 'bg-navy-800 text-cream' : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
            }`}
          >
            <Truck size={14} /> Distribuidoras
          </button>
        )}
      </div>
      <p className="text-sm text-navy-500 mb-6">
        Pedidos semanales agrupados por distribuidor. Envia cada pedido por WhatsApp y marcá cuando llegue.
      </p>

      {/* Gestión de distribuidoras */}
      {isAdmin && showDistribuidoras && (
        <div className="bg-white rounded-xl border border-navy-100 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-navy-800">Distribuidoras</h3>
            <button
              onClick={() => setSupplierModal(null)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-400 text-navy-900 hover:bg-gold-500 transition-colors"
            >
              <Plus size={14} /> Agregar
            </button>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-sm text-navy-400 text-center py-4">No hay distribuidoras cargadas.</p>
          ) : (
            <div className="space-y-1.5">
              {suppliers.map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-navy-100">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy-800 truncate">{s.name}</p>
                    <p className="text-xs flex items-center gap-1.5">
                      <span className="text-navy-400">{s.category || 'Sin categoría'}</span>
                      {s.phone
                        ? <span className="text-green-600">· {s.phone}</span>
                        : <span className="text-amber-600 flex items-center gap-0.5"><AlertTriangle size={10} /> sin teléfono</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => setSupplierModal(s)}
                    className="text-navy-400 hover:text-navy-700 p-1.5 shrink-0"
                    title="Editar distribuidora"
                  >
                    <Pencil size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {paraPedir.length === 0 && enCamino.length === 0 && recibidos.length === 0 ? (
        <div className="text-center py-16">
          <Send size={48} className="mx-auto text-navy-200 mb-3" />
          <p className="text-navy-400 font-medium">No hay pedidos</p>
          <p className="text-sm text-navy-300 mt-1">Los pedidos aparecen cuando Roxana los arma desde Deposito.</p>
        </div>
      ) : (
        <>
          {paraPedir.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">
                Para pedir ({paraPedir.length})
              </h3>
              {paraPedir.map(pedido => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  isAdmin={isAdmin}
                  onCargarMonto={() => setMontoTarget(pedido)}
                  onRecibir={() => setRecibirTarget(pedido)}
                  onMarcarPedido={() => handleMarcarPedido(pedido)}
                />
              ))}
            </>
          )}

          {enCamino.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2 mt-6">
                Pedidos hechos — esperando recepción ({enCamino.length})
              </h3>
              {enCamino.map(pedido => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  isAdmin={isAdmin}
                  onCargarMonto={() => setMontoTarget(pedido)}
                  onRecibir={() => setRecibirTarget(pedido)}
                  onMarcarPedido={() => handleMarcarPedido(pedido)}
                />
              ))}
            </>
          )}

          {recibidos.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2 mt-6">
                Recibidos recientes ({recibidos.length})
              </h3>
              {recibidos.map(pedido => (
                <PedidoCard
                  key={pedido.id}
                  pedido={pedido}
                  isAdmin={isAdmin}
                  onCargarMonto={() => setMontoTarget(pedido)}
                  onRecibir={() => setRecibirTarget(pedido)}
                  onMarcarPedido={() => handleMarcarPedido(pedido)}
                />
              ))}
            </>
          )}
        </>
      )}

      <MontoModal
        open={montoTarget !== null}
        title={montoTarget?.monto != null ? 'Editar monto del pedido' : 'Cargar monto recibido'}
        subtitle={montoTarget ? `Pedido semanal del ${new Date(montoTarget.date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}
        initialMonto={montoTarget?.monto}
        initialReceiptPhoto={montoTarget?.receiptPhoto}
        onClose={() => setMontoTarget(null)}
        onSave={handleSaveMonto}
      />

      {recibirTarget && (
        <RecibirPedidoModal
          pedido={recibirTarget}
          onClose={() => setRecibirTarget(null)}
          onConfirm={handleConfirmRecibir}
        />
      )}

      {supplierModal !== undefined && (
        <SupplierModal
          supplier={supplierModal}
          onClose={() => setSupplierModal(undefined)}
          onSave={handleSaveSupplier}
          onDelete={handleDeleteSupplier}
        />
      )}
    </div>
  )
}
