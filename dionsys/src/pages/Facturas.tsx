import { useMemo, useState } from 'react'
import { FileText, Receipt, Package, Clock, CheckCircle2, CalendarDays, PlusCircle } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { useAuth } from '../context/AuthContext'
import { resolveSupplierId } from '../utils/deposito'
import { formatMontoCurrency } from '../utils/validators'
import { downloadUrl } from '../lib/facturaStorage'
import FacturaProveedorModal from '../components/FacturaProveedorModal'
import type { PedidoSemanal, FacturaProveedor, DepositoSupplier } from '../types'

type Tab = 'recibidas' | 'gasto'

function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  if (!y || !m) return yyyymm
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Facturas() {
  const { pedidos, items, suppliers, setFacturaProveedor } = useStock()
  const { employee } = useAuth()
  const [tab, setTab] = useState<Tab>('recibidas')
  const [target, setTarget] = useState<{ pedido: PedidoSemanal; supplier: DepositoSupplier; initial?: FacturaProveedor } | null>(null)

  const recibidos = useMemo(
    () => pedidos
      .filter(p => p.status === 'recibido')
      .sort((a, b) => (b.recibidoAt ?? b.date).localeCompare(a.recibidoAt ?? a.date)),
    [pedidos]
  )

  // Distribuidoras presentes en un pedido (las que tienen items pedidos).
  function suppliersOf(pedido: PedidoSemanal): DepositoSupplier[] {
    const ids = new Set<string>()
    for (const it of pedido.items) {
      if (it.aPedir <= 0) continue
      ids.add(resolveSupplierId(it.itemId, items) || 'otros')
    }
    return Array.from(ids).map(id =>
      suppliers.find(s => s.id === id) ?? { id, name: 'Sin proveedor', phone: '', category: '' }
    )
  }

  function facturaFor(pedido: PedidoSemanal, supplierId: string) {
    return pedido.facturas?.find(f => f.supplierId === supplierId)
  }

  function handleSaveFactura(data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'facturaUrl' | 'facturaNombre'>) {
    if (!target || !employee) return
    setFacturaProveedor(target.pedido.id, {
      supplierId: target.supplier.id,
      supplierName: target.supplier.name,
      ...data,
      cargadoBy: employee.name,
      cargadoAt: new Date().toISOString(),
    })
    setTarget(null)
  }

  // ---- Reporte: gasto por mes ----
  const gastoPorMes = useMemo(() => {
    const meses = new Map<string, { total: number; tipos: Record<string, number>; proveedores: Map<string, number> }>()
    for (const p of pedidos) {
      if (p.status === 'borrado') continue
      for (const f of p.facturas ?? []) {
        const mes = (f.fecha || p.recibidoAt?.slice(0, 10) || '').slice(0, 7)
        if (!mes) continue
        if (!meses.has(mes)) meses.set(mes, { total: 0, tipos: {}, proveedores: new Map() })
        const m = meses.get(mes)!
        m.total += f.monto
        const t = f.tipoFactura || 'Otra'
        m.tipos[t] = (m.tipos[t] ?? 0) + f.monto
        m.proveedores.set(f.supplierName, (m.proveedores.get(f.supplierName) ?? 0) + f.monto)
      }
    }
    return Array.from(meses.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, d]) => ({
        mes,
        total: d.total,
        tipos: d.tipos,
        proveedores: Array.from(d.proveedores.entries()).sort((a, b) => b[1] - a[1]),
      }))
  }, [pedidos])

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-2">Facturas de Proveedores</h2>
      <p className="text-sm text-navy-500 mb-4">Cargá la factura de cada distribuidora cuando llega la mercadería y mirá el gasto por mes.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-navy-100 rounded-xl p-1">
        {([
          { key: 'recibidas' as const, label: 'Recibidas', icon: FileText },
          { key: 'gasto' as const, label: 'Gasto por mes', icon: CalendarDays },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* ============ RECIBIDAS ============ */}
      {tab === 'recibidas' && (
        recibidos.length === 0 ? (
          <div className="text-center py-16">
            <Package size={48} className="mx-auto text-navy-200 mb-3" />
            <p className="text-navy-400 font-medium">No hay pedidos recibidos</p>
            <p className="text-sm text-navy-300 mt-1">Aparecen acá cuando se marca un pedido como recibido.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recibidos.map(pedido => {
              const sups = suppliersOf(pedido)
              return (
                <div key={pedido.id} className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-bold text-navy-800">Pedido semanal</p>
                    <p className="text-xs text-navy-400 flex items-center gap-1">
                      <Clock size={11} />
                      {pedido.recibidoAt ? `Recibido ${shortDate(pedido.recibidoAt)}` : shortDate(pedido.date)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {sups.map(supplier => {
                      const f = facturaFor(pedido, supplier.id)
                      return (
                        <div key={supplier.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-navy-100">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <Package size={13} className="text-navy-500 shrink-0" />
                              <span className="text-sm font-semibold text-navy-700 truncate">{supplier.name}</span>
                            </div>
                            {f ? (
                              <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs">
                                {f.tipoFactura && (
                                  <span className="px-1.5 py-0.5 rounded bg-navy-800 text-cream font-bold">{f.tipoFactura}</span>
                                )}
                                <span className="font-bold text-navy-800">{formatMontoCurrency(f.monto)}</span>
                                {f.fecha && <span className="text-navy-400">· {shortDate(f.fecha)}</span>}
                                {f.facturaUrl && (
                                  <a
                                    href={downloadUrl(f.facturaUrl, f.facturaNombre || 'factura')}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                  >
                                    <FileText size={11} /> archivo
                                  </a>
                                )}
                              </div>
                            ) : (
                              <p className="text-xs text-amber-600 mt-0.5">Sin factura cargada</p>
                            )}
                          </div>
                          <button
                            onClick={() => setTarget({ pedido, supplier, initial: f })}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                              f
                                ? 'bg-white text-navy-700 border border-navy-200 hover:bg-navy-50'
                                : 'bg-gold-400 text-navy-900 hover:bg-gold-500'
                            }`}
                          >
                            {f ? <><CheckCircle2 size={13} /> Editar</> : <><PlusCircle size={13} /> Cargar</>}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ============ GASTO POR MES ============ */}
      {tab === 'gasto' && (
        gastoPorMes.length === 0 ? (
          <div className="text-center py-16">
            <Receipt size={48} className="mx-auto text-navy-200 mb-3" />
            <p className="text-navy-400 font-medium">Todavía no hay facturas cargadas</p>
            <p className="text-sm text-navy-300 mt-1">Cargá facturas en la pestaña "Recibidas" para ver el gasto.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {gastoPorMes.map(m => (
              <div key={m.mes} className="rounded-xl border border-navy-100 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-navy-800">{mesLabel(m.mes)}</h3>
                  <span className="text-lg font-bold text-green-700">{formatMontoCurrency(m.total)}</span>
                </div>
                {/* Por tipo */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(m.tipos).map(([t, v]) => (
                    <span key={t} className="text-xs px-2 py-1 rounded-full bg-navy-100 text-navy-700">
                      <span className="font-bold">{t === 'Otra' ? 'Otras' : `Factura ${t}`}:</span> {formatMontoCurrency(v)}
                    </span>
                  ))}
                </div>
                {/* Por proveedor */}
                <ul className="space-y-1">
                  {m.proveedores.map(([nombre, v]) => (
                    <li key={nombre} className="flex items-center justify-between text-sm">
                      <span className="text-navy-600">{nombre}</span>
                      <span className="font-semibold text-navy-800">{formatMontoCurrency(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}

      {target && (
        <FacturaProveedorModal
          supplierName={target.supplier.name}
          subtitle={`Pedido recibido ${target.pedido.recibidoAt ? shortDate(target.pedido.recibidoAt) : ''}`}
          initial={target.initial}
          onClose={() => setTarget(null)}
          onSave={handleSaveFactura}
        />
      )}
    </div>
  )
}
