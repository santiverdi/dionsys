import { useMemo, useState } from 'react'
import { FileText, Receipt, Package, Clock, CheckCircle2, CalendarDays, PlusCircle, ChevronDown, ChevronUp, CreditCard, Check, Calculator, Copy, Camera } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { useAuth } from '../context/AuthContext'
import { resolveSupplierId } from '../utils/deposito'
import { formatMontoCurrency } from '../utils/validators'
import { downloadUrl, uploadFactura } from '../lib/facturaStorage'
import { scanImageFile } from '../lib/scanDocument'
import { fileToPdf } from '../lib/imageToPdf'
import FacturaProveedorModal from '../components/FacturaProveedorModal'
import type { PedidoSemanal, FacturaProveedor, DepositoSupplier } from '../types'

type Tab = 'recibidas' | 'gasto' | 'cuentacorriente' | 'contadora'

// Neto / IVA / percepciones de una factura, a partir de sus renglones.
function desglosar(f: FacturaProveedor) {
  let neto = 0, iva = 0, percep = 0
  for (const it of f.items ?? []) {
    if (it.concepto === 'impuesto') {
      if (it.descripcion.toUpperCase().includes('IVA')) iva += it.importe
      else percep += it.importe
    } else neto += it.importe
  }
  return { neto, iva, percep }
}

function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number)
  if (!y || !m) return yyyymm
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function shortDate(iso: string) {
  // Fechas 'YYYY-MM-DD' (sin hora) se formatean a mano para evitar el corrimiento de
  // un día por zona horaria (new Date('YYYY-MM-DD') se interpreta como UTC).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }
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

  function handleSaveFactura(data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'items' | 'pago' | 'vencimiento' | 'facturaUrl' | 'facturaNombre'>) {
    if (!target || !employee) return
    const esCC = data.pago === 'cuenta_corriente'
    setFacturaProveedor(target.pedido.id, {
      supplierId: target.supplier.id,
      supplierName: target.supplier.name,
      ...data,
      // El seguimiento de pago solo aplica a cuenta corriente; se preserva al editar.
      pagado: esCC ? (target.initial?.pagado ?? false) : undefined,
      fechaPago: esCC ? target.initial?.fechaPago : undefined,
      cargadoBy: employee.name,
      cargadoAt: new Date().toISOString(),
    })
    setTarget(null)
  }

  // Marca una factura de cuenta corriente como pagada (hoy).
  function marcarPagada(pedido: PedidoSemanal, f: FacturaProveedor) {
    setFacturaProveedor(pedido.id, { ...f, pagado: true, fechaPago: new Date().toISOString().slice(0, 10) })
  }

  // ---- Reporte: gasto por mes (con desglose por proveedor y por producto) ----
  const gastoPorMes = useMemo(() => {
    interface MesAgg {
      total: number
      tipos: Record<string, number>
      proveedores: Map<string, number>
      productos: Map<string, { display: string; total: number }>
      impuestos: Map<string, { display: string; total: number }>
    }
    const meses = new Map<string, MesAgg>()
    // Las facturas son registro financiero: cuentan aunque el pedido se haya borrado.
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) {
        const mes = (f.fecha || p.recibidoAt?.slice(0, 10) || '').slice(0, 7)
        if (!mes) continue
        if (!meses.has(mes)) meses.set(mes, { total: 0, tipos: {}, proveedores: new Map(), productos: new Map(), impuestos: new Map() })
        const m = meses.get(mes)!
        m.total += f.monto
        const t = f.tipoFactura || 'Otra'
        m.tipos[t] = (m.tipos[t] ?? 0) + f.monto
        m.proveedores.set(f.supplierName, (m.proveedores.get(f.supplierName) ?? 0) + f.monto)
        for (const it of f.items ?? []) {
          const key = it.descripcion.trim().toUpperCase()
          if (!key) continue
          const dest = it.concepto === 'impuesto' ? m.impuestos : m.productos
          const cur = dest.get(key) ?? { display: it.descripcion.trim(), total: 0 }
          cur.total += it.importe
          dest.set(key, cur)
        }
      }
    }
    return Array.from(meses.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, d]) => ({
        mes,
        total: d.total,
        tipos: d.tipos,
        proveedores: Array.from(d.proveedores.entries()).sort((a, b) => b[1] - a[1]),
        productos: Array.from(d.productos.values()).sort((a, b) => b.total - a.total),
        impuestos: Array.from(d.impuestos.values()).sort((a, b) => b.total - a.total),
      }))
  }, [pedidos])

  const hoyStr = new Date().toISOString().slice(0, 10)

  // ---- Para contadora: facturas A por mes (con neto/IVA y archivo) ----
  const contadoraPorMes = useMemo(() => {
    type Entry = { pedido: PedidoSemanal; factura: FacturaProveedor }
    const meses = new Map<string, { entries: Entry[]; total: number; iva: number; neto: number }>()
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) {
        if (f.tipoFactura !== 'A') continue
        const mes = (f.fecha || p.recibidoAt?.slice(0, 10) || '').slice(0, 7)
        if (!mes) continue
        if (!meses.has(mes)) meses.set(mes, { entries: [], total: 0, iva: 0, neto: 0 })
        const m = meses.get(mes)!
        const d = desglosar(f)
        m.entries.push({ pedido: p, factura: f })
        m.total += f.monto
        m.iva += d.iva
        m.neto += d.neto
      }
    }
    return Array.from(meses.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, d]) => ({
        mes,
        entries: d.entries.sort((a, b) => (a.factura.fecha || '').localeCompare(b.factura.fecha || '')),
        total: d.total, iva: d.iva, neto: d.neto,
      }))
  }, [pedidos])

  // Adjuntar/escaneo del archivo a una factura que quedó sin archivo (misma automatización).
  const [attaching, setAttaching] = useState<string | null>(null)
  async function attachArchivo(pedido: PedidoSemanal, factura: FacturaProveedor, file: File) {
    const key = `${pedido.id}:${factura.supplierId}`
    setAttaching(key)
    try {
      const scanned = await scanImageFile(file)
      const pdf = await fileToPdf(scanned)
      const { url, nombre } = await uploadFactura(pdf)
      setFacturaProveedor(pedido.id, { ...factura, facturaUrl: url, facturaNombre: nombre })
    } catch { /* ignore */ }
    finally { setAttaching(null) }
  }

  const [copiedMes, setCopiedMes] = useState<string | null>(null)
  async function copiarMes(mes: string, facturas: FacturaProveedor[]) {
    const lines: string[] = [`*Facturas A — ${mesLabel(mes)}* (Hotel Dion)`, '']
    let tN = 0, tI = 0, tT = 0
    for (const f of facturas) {
      const d = desglosar(f)
      lines.push(`${f.supplierName}${f.fecha ? ` — ${shortDate(f.fecha)}` : ''}`)
      if (f.items?.length) {
        lines.push(`  Neto: ${formatMontoCurrency(d.neto)} · IVA: ${formatMontoCurrency(d.iva)}${d.percep ? ` · Percep.: ${formatMontoCurrency(d.percep)}` : ''} · Total: ${formatMontoCurrency(f.monto)}`)
      } else {
        lines.push(`  Total: ${formatMontoCurrency(f.monto)} (sin desglose)`)
      }
      if (f.facturaUrl) lines.push(`  Archivo: ${downloadUrl(f.facturaUrl, f.facturaNombre || 'factura')}`)
      lines.push('')
      tN += d.neto; tI += d.iva; tT += f.monto
    }
    lines.push(`TOTALES — Neto: ${formatMontoCurrency(tN)} · IVA: ${formatMontoCurrency(tI)} · Total: ${formatMontoCurrency(tT)}`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopiedMes(mes)
      setTimeout(() => setCopiedMes(null), 2000)
    } catch { /* ignore */ }
  }

  const [expandedMes, setExpandedMes] = useState<Set<string>>(new Set())
  function toggleMes(mes: string) {
    setExpandedMes(prev => {
      const next = new Set(prev)
      if (next.has(mes)) next.delete(mes); else next.add(mes)
      return next
    })
  }

  // ---- Cuenta corriente: facturas pendientes de pago, agrupadas por proveedor ----
  const cuentaCorriente = useMemo(() => {
    const porProveedor = new Map<string, { nombre: string; total: number; facturas: { pedido: PedidoSemanal; factura: FacturaProveedor }[] }>()
    let totalPendiente = 0
    // Las deudas en cuenta corriente siguen vigentes aunque el pedido se haya borrado.
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) {
        if (f.pago !== 'cuenta_corriente' || f.pagado) continue
        totalPendiente += f.monto
        const g = porProveedor.get(f.supplierId) ?? { nombre: f.supplierName, total: 0, facturas: [] }
        g.total += f.monto
        g.facturas.push({ pedido: p, factura: f })
        porProveedor.set(f.supplierId, g)
      }
    }
    // Orden por vencimiento (lo que vence antes primero); sin vencimiento al final.
    const vKey = (f: FacturaProveedor) => f.vencimiento || f.fecha || '9999-99-99'
    const grupos = Array.from(porProveedor.values())
      .map(g => ({ ...g, facturas: g.facturas.sort((a, b) => vKey(a.factura).localeCompare(vKey(b.factura))) }))
      .sort((a, b) => b.total - a.total)
    return { totalPendiente, grupos }
  }, [pedidos])

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-2">Facturas de Proveedores</h2>
      <p className="text-sm text-navy-500 mb-4">Cargá la factura de cada distribuidora cuando llega la mercadería y mirá el gasto por mes.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-navy-100 rounded-xl p-1">
        {([
          { key: 'recibidas' as const, label: 'Recibidas', icon: FileText },
          { key: 'gasto' as const, label: 'Gasto', icon: CalendarDays },
          { key: 'cuentacorriente' as const, label: 'Cta cte', icon: CreditCard },
          { key: 'contadora' as const, label: 'Contadora', icon: Calculator },
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
                                {f.items?.length ? <span className="text-navy-400">· {f.items.length} reng.</span> : null}
                                {f.pago === 'cuenta_corriente' && (
                                  f.pagado
                                    ? <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">cta cte · pagada</span>
                                    : <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">cta cte · debe</span>
                                )}
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
            {gastoPorMes.map(m => {
              const open = expandedMes.has(m.mes)
              return (
                <div key={m.mes} className="rounded-xl border border-navy-100 bg-white p-4">
                  <button onClick={() => toggleMes(m.mes)} className="w-full flex items-center justify-between gap-2">
                    <h3 className="font-bold text-navy-800">{mesLabel(m.mes)}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-green-700">{formatMontoCurrency(m.total)}</span>
                      {open ? <ChevronUp size={16} className="text-navy-400" /> : <ChevronDown size={16} className="text-navy-400" />}
                    </div>
                  </button>
                  {/* Por tipo (siempre visible) */}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {Object.entries(m.tipos).map(([t, v]) => (
                      <span key={t} className="text-xs px-2 py-1 rounded-full bg-navy-100 text-navy-700">
                        <span className="font-bold">{t === 'Otra' ? 'Otras' : `Factura ${t}`}:</span> {formatMontoCurrency(v)}
                      </span>
                    ))}
                  </div>

                  {open && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Por proveedor */}
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Por proveedor</p>
                        <ul className="space-y-1">
                          {m.proveedores.map(([nombre, v]) => (
                            <li key={nombre} className="flex items-center justify-between text-sm gap-2">
                              <span className="text-navy-600 truncate">{nombre}</span>
                              <span className="font-semibold text-navy-800 shrink-0">{formatMontoCurrency(v)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {/* Por producto */}
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Por producto</p>
                        {m.productos.length === 0 ? (
                          <p className="text-xs text-navy-300">Sin detalle de renglones cargado.</p>
                        ) : (
                          <ul className="space-y-1">
                            {m.productos.map(p => (
                              <li key={p.display} className="flex items-center justify-between text-sm gap-2">
                                <span className="text-navy-600 truncate">{p.display}</span>
                                <span className="font-semibold text-navy-800 shrink-0">{formatMontoCurrency(p.total)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {m.impuestos.length > 0 && (
                          <>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5 mt-3">Impuestos y percepciones</p>
                            <ul className="space-y-1">
                              {m.impuestos.map(p => (
                                <li key={p.display} className="flex items-center justify-between text-sm gap-2">
                                  <span className="text-navy-600 truncate">{p.display}</span>
                                  <span className="font-semibold text-navy-800 shrink-0">{formatMontoCurrency(p.total)}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ============ CUENTA CORRIENTE ============ */}
      {tab === 'cuentacorriente' && (
        cuentaCorriente.grupos.length === 0 ? (
          <div className="text-center py-16">
            <CreditCard size={48} className="mx-auto text-navy-200 mb-3" />
            <p className="text-navy-400 font-medium">No hay deudas en cuenta corriente</p>
            <p className="text-sm text-navy-300 mt-1">Las facturas marcadas como "cuenta corriente" sin pagar aparecen acá.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">Total pendiente de pago</span>
              <span className="text-xl font-bold text-amber-900">{formatMontoCurrency(cuentaCorriente.totalPendiente)}</span>
            </div>
            {cuentaCorriente.grupos.map(g => (
              <div key={g.nombre} className="rounded-xl border border-navy-100 bg-white p-4">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package size={14} className="text-navy-500 shrink-0" />
                    <span className="font-bold text-navy-800 truncate">{g.nombre}</span>
                  </div>
                  <span className="text-base font-bold text-amber-700 shrink-0">{formatMontoCurrency(g.total)}</span>
                </div>
                <div className="space-y-1.5">
                  {g.facturas.map(({ pedido, factura }, i) => {
                    const vencida = factura.vencimiento && factura.vencimiento < hoyStr
                    return (
                      <div key={i} className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${vencida ? 'border-red-200 bg-red-50' : 'border-navy-100'}`}>
                        <div className="min-w-0 text-xs">
                          <span className="font-bold text-navy-800">{formatMontoCurrency(factura.monto)}</span>
                          {factura.tipoFactura && <span className="ml-1 text-navy-400">Factura {factura.tipoFactura}</span>}
                          {factura.fecha && <span className="text-navy-400"> · {shortDate(factura.fecha)}</span>}
                          {factura.vencimiento && (
                            <span className={`block mt-0.5 font-semibold ${vencida ? 'text-red-600' : 'text-amber-600'}`}>
                              {vencida ? 'Venció' : 'Vence'} {shortDate(factura.vencimiento)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => marcarPagada(pedido, factura)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 active:scale-95 transition-all shrink-0"
                        >
                          <Check size={13} /> Marcar pagada
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ============ CONTADORA (facturas A por mes) ============ */}
      {tab === 'contadora' && (
        contadoraPorMes.length === 0 ? (
          <div className="text-center py-16">
            <Calculator size={48} className="mx-auto text-navy-200 mb-3" />
            <p className="text-navy-400 font-medium">No hay facturas A cargadas</p>
            <p className="text-sm text-navy-300 mt-1">Las facturas tipo A aparecen acá para enviarle a la contadora.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contadoraPorMes.map(m => (
              <div key={m.mes} className="rounded-xl border border-navy-100 bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="font-bold text-navy-800">{mesLabel(m.mes)}</h3>
                  <button
                    onClick={() => copiarMes(m.mes, m.entries.map(e => e.factura))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy-800 text-cream hover:bg-navy-700 active:scale-95 transition-all shrink-0"
                  >
                    {copiedMes === m.mes ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                  </button>
                </div>
                <p className="text-xs text-navy-500 mb-3">
                  {m.entries.length} {m.entries.length === 1 ? 'factura A' : 'facturas A'} · Neto {formatMontoCurrency(m.neto)} · IVA {formatMontoCurrency(m.iva)} · Total {formatMontoCurrency(m.total)}
                </p>
                <div className="space-y-1.5">
                  {m.entries.map(({ pedido, factura: f }, i) => {
                    const d = desglosar(f)
                    const key = `${pedido.id}:${f.supplierId}`
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-navy-100">
                        <div className="min-w-0 text-xs">
                          <span className="font-semibold text-navy-800">{f.supplierName}</span>
                          {f.fecha && <span className="text-navy-400"> · {shortDate(f.fecha)}</span>}
                          <span className="block text-navy-500">
                            {f.items?.length ? `Neto ${formatMontoCurrency(d.neto)} · IVA ${formatMontoCurrency(d.iva)} · ` : ''}Total {formatMontoCurrency(f.monto)}
                          </span>
                        </div>
                        {f.facturaUrl ? (
                          <a
                            href={downloadUrl(f.facturaUrl, f.facturaNombre || 'factura')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 shrink-0"
                          >
                            <FileText size={13} /> archivo
                          </a>
                        ) : (
                          <label className={`flex items-center gap-1 text-xs font-semibold shrink-0 cursor-pointer ${attaching === key ? 'text-navy-400' : 'text-amber-600 hover:text-amber-700'}`}>
                            <Camera size={13} /> {attaching === key ? 'Escaneando…' : 'Escanear'}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              capture="environment"
                              disabled={attaching === key}
                              onChange={e => { const file = e.target.files?.[0]; if (file) attachArchivo(pedido, f, file) }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>
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
