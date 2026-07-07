import { useMemo, useState } from 'react'
import { FileText, Receipt, Package, Clock, CheckCircle2, CalendarDays, PlusCircle, ChevronDown, ChevronUp, CreditCard, Check, Calculator, Copy, Camera, RotateCcw, ConciergeBell, X, Trash2 } from 'lucide-react'
import { useStock } from '../context/StockContext'
import { useOrders } from '../context/OrdersContext'
import { useAuth } from '../context/AuthContext'
import { resolveSupplierId } from '../utils/deposito'
import { formatMontoCurrency } from '../utils/validators'
import { downloadUrl, uploadFactura } from '../lib/facturaStorage'
import { scanImageFile } from '../lib/scanDocument'
import { fileToPdf } from '../lib/imageToPdf'
import FacturaProveedorModal from '../components/FacturaProveedorModal'
import { generateId } from '../utils/imageCompressor'
import type { PedidoSemanal, FacturaProveedor, FacturaManual, DepositoSupplier, Order } from '../types'

type Tab = 'recibidas' | 'gasto' | 'cuentacorriente' | 'contadora' | 'recepcion'

// Una factura junto con su "contenedor": el pedido semanal del que salió, o la
// boleta suelta (manual) si se cargó a mano sin pedido asociado.
type FacturaEntry = { factura: FacturaProveedor; pedido?: PedidoSemanal; manual?: FacturaManual }

function entryKey(e: FacturaEntry) {
  return e.pedido ? `${e.pedido.id}:${e.factura.supplierId}` : `manual:${e.manual!.id}`
}

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
  const { pedidos, items, suppliers, setFacturaProveedor, facturasManuales, saveFacturaManual, deleteFacturaManual } = useStock()
  const { orders, setOrderFactura } = useOrders()
  const { employee } = useAuth()
  const [tab, setTab] = useState<Tab>('recibidas')
  const [target, setTarget] = useState<{ pedido: PedidoSemanal; supplier: DepositoSupplier; initial?: FacturaProveedor } | null>(null)
  // Pedido de recepción diaria al que se le está cargando la boleta.
  const [recepcionTarget, setRecepcionTarget] = useState<Order | null>(null)
  // Boleta suelta (a mano): primero se elige el proveedor, después se abre el modal.
  const [manualPicker, setManualPicker] = useState(false)
  const [manualNombre, setManualNombre] = useState('')
  const [manualTarget, setManualTarget] = useState<{ supplierId: string; supplierName: string; initial?: FacturaManual } | null>(null)

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

  // ---- Recepción diaria: pedidos de Verdulería / Piazza / Lácteos ----
  const recepcionOrders = useMemo(
    () => orders
      .filter(o => o.type === 'recepcion' && o.status !== 'borrado')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders]
  )

  function handleSaveBoleta(data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'items' | 'pago' | 'vencimiento' | 'facturaUrl' | 'facturaNombre'>) {
    if (!recepcionTarget || !employee) return
    const esCC = data.pago === 'cuenta_corriente'
    const factura: FacturaProveedor = {
      supplierId: recepcionTarget.distributorId,
      supplierName: recepcionTarget.distributorName,
      ...data,
      pagado: esCC ? (recepcionTarget.factura?.pagado ?? false) : undefined,
      fechaPago: esCC ? recepcionTarget.factura?.fechaPago : undefined,
      cargadoBy: employee.name,
      cargadoAt: new Date().toISOString(),
    }
    setOrderFactura(recepcionTarget.id, factura, employee.name)
    setRecepcionTarget(null)
  }

  // ---- Boletas sueltas (cargadas a mano, sin pedido asociado) ----
  const manualesOrdenadas = useMemo(
    () => [...facturasManuales].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.cargadoAt ?? '').localeCompare(a.cargadoAt ?? '')),
    [facturasManuales]
  )

  function elegirProveedorManual(supplierId: string, supplierName: string) {
    setManualPicker(false)
    setManualTarget({ supplierId, supplierName })
  }

  function handleSaveManual(data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'items' | 'pago' | 'vencimiento' | 'facturaUrl' | 'facturaNombre'>) {
    if (!manualTarget || !employee) return
    const esCC = data.pago === 'cuenta_corriente'
    const prev = manualTarget.initial
    saveFacturaManual({
      id: prev?.id ?? generateId(),
      supplierId: manualTarget.supplierId,
      supplierName: manualTarget.supplierName,
      ...data,
      pagado: esCC ? (prev?.pagado ?? false) : undefined,
      fechaPago: esCC ? prev?.fechaPago : undefined,
      cargadoBy: employee.name,
      cargadoAt: new Date().toISOString(),
    })
    setManualTarget(null)
  }

  function borrarManual(f: FacturaManual) {
    if (confirm(`¿Borrar la boleta de ${f.supplierName} por ${formatMontoCurrency(f.monto)}? Deja de contar en el gasto del mes.`)) {
      deleteFacturaManual(f.id)
    }
  }

  // Marca una factura de cuenta corriente como pagada (hoy).
  function marcarPagada(e: FacturaEntry) {
    const pagada = { ...e.factura, pagado: true, fechaPago: new Date().toISOString().slice(0, 10) }
    if (e.pedido) setFacturaProveedor(e.pedido.id, pagada)
    else if (e.manual) saveFacturaManual({ ...e.manual, ...pagada })
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
    const agregar = (f: FacturaProveedor, fechaFallback?: string) => {
      const mes = (f.fecha || fechaFallback || '').slice(0, 7)
      if (!mes) return
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
    // Las facturas son registro financiero: cuentan aunque el pedido se haya borrado.
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) agregar(f, p.recibidoAt?.slice(0, 10))
    }
    // Las boletas sueltas cuentan igual que las de pedidos.
    for (const f of facturasManuales) agregar(f)
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
  }, [pedidos, facturasManuales])

  const hoyStr = new Date().toISOString().slice(0, 10)

  // ---- Para contadora: facturas A por mes (con neto/IVA y archivo) ----
  const contadoraPorMes = useMemo(() => {
    const meses = new Map<string, { entries: FacturaEntry[]; total: number; iva: number; neto: number }>()
    const agregar = (entry: FacturaEntry, fechaFallback?: string) => {
      const f = entry.factura
      if (f.tipoFactura !== 'A') return
      const mes = (f.fecha || fechaFallback || '').slice(0, 7)
      if (!mes) return
      if (!meses.has(mes)) meses.set(mes, { entries: [], total: 0, iva: 0, neto: 0 })
      const m = meses.get(mes)!
      const d = desglosar(f)
      m.entries.push(entry)
      m.total += f.monto
      m.iva += d.iva
      m.neto += d.neto
    }
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) agregar({ pedido: p, factura: f }, p.recibidoAt?.slice(0, 10))
    }
    for (const f of facturasManuales) agregar({ manual: f, factura: f })
    return Array.from(meses.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mes, d]) => ({
        mes,
        entries: d.entries.sort((a, b) => (a.factura.fecha || '').localeCompare(b.factura.fecha || '')),
        total: d.total, iva: d.iva, neto: d.neto,
      }))
  }, [pedidos, facturasManuales])

  // Adjuntar/escaneo del archivo a una factura que quedó sin archivo (misma automatización).
  const [attaching, setAttaching] = useState<string | null>(null)
  // Vista previa de la imagen recién escaneada, ANTES de subir: así se ve al instante
  // que es el último escaneo (no un PDF viejo cacheado) y se puede descartar y reescanear.
  const [scanPreview, setScanPreview] = useState<{ entry: FacturaEntry; file: File; url: string } | null>(null)
  const [uploadingPreview, setUploadingPreview] = useState(false)

  async function attachArchivo(entry: FacturaEntry, file: File) {
    setAttaching(entryKey(entry))
    try {
      let scanError: string | undefined
      const scanned = await scanImageFile(file, info => { if (!info.scanned) scanError = info.error })
      if (scanned.type.startsWith('image/')) {
        // Mostramos la imagen escaneada para confirmar antes de subir.
        if (scanError) alert('No se pudo procesar la imagen; se muestra la foto original.\n\nMotivo: ' + scanError)
        setScanPreview({ entry, file: scanned, url: URL.createObjectURL(scanned) })
      } else {
        // No es imagen (ej. eligió un PDF): subimos directo, sin preview.
        await subirArchivo(entry, scanned)
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo adjuntar el archivo. Probá de nuevo.')
    }
    finally { setAttaching(null) }
  }

  async function subirArchivo(entry: FacturaEntry, archivo: File) {
    const pdf = await fileToPdf(archivo)
    const { url, nombre } = await uploadFactura(pdf)
    if (entry.pedido) setFacturaProveedor(entry.pedido.id, { ...entry.factura, facturaUrl: url, facturaNombre: nombre })
    else if (entry.manual) saveFacturaManual({ ...entry.manual, facturaUrl: url, facturaNombre: nombre })
  }

  function cerrarPreview() {
    if (scanPreview) URL.revokeObjectURL(scanPreview.url)
    setScanPreview(null)
  }

  async function confirmarPreview() {
    if (!scanPreview) return
    setUploadingPreview(true)
    try {
      await subirArchivo(scanPreview.entry, scanPreview.file)
      cerrarPreview()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo subir el archivo. Probá de nuevo.')
    } finally {
      setUploadingPreview(false)
    }
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
    const porProveedor = new Map<string, { nombre: string; total: number; facturas: FacturaEntry[] }>()
    let totalPendiente = 0
    const agregar = (entry: FacturaEntry) => {
      const f = entry.factura
      if (f.pago !== 'cuenta_corriente' || f.pagado) return
      totalPendiente += f.monto
      const g = porProveedor.get(f.supplierId) ?? { nombre: f.supplierName, total: 0, facturas: [] }
      g.total += f.monto
      g.facturas.push(entry)
      porProveedor.set(f.supplierId, g)
    }
    // Las deudas en cuenta corriente siguen vigentes aunque el pedido se haya borrado.
    for (const p of pedidos) {
      for (const f of p.facturas ?? []) agregar({ pedido: p, factura: f })
    }
    for (const f of facturasManuales) agregar({ manual: f, factura: f })
    // Orden por vencimiento (lo que vence antes primero); sin vencimiento al final.
    const vKey = (f: FacturaProveedor) => f.vencimiento || f.fecha || '9999-99-99'
    const grupos = Array.from(porProveedor.values())
      .map(g => ({ ...g, facturas: g.facturas.sort((a, b) => vKey(a.factura).localeCompare(vKey(b.factura))) }))
      .sort((a, b) => b.total - a.total)
    return { totalPendiente, grupos }
  }, [pedidos, facturasManuales])

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold text-navy-800">Facturas de Proveedores</h2>
        <button
          onClick={() => { setManualNombre(''); setManualPicker(true) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-gold-400 text-navy-900 hover:bg-gold-500 active:scale-95 transition-all shrink-0"
        >
          <PlusCircle size={14} /> Cargar boleta
        </button>
      </div>
      <p className="text-sm text-navy-500 mb-4">Cargá la factura de cada distribuidora cuando llega la mercadería y mirá el gasto por mes. Con "Cargar boleta" podés cargar una boleta suelta, sin pedido asociado.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-navy-100 rounded-xl p-1">
        {([
          { key: 'recibidas' as const, label: 'Recibidas', icon: FileText },
          { key: 'recepcion' as const, label: 'Recepción', icon: ConciergeBell },
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
        <div className="space-y-4">
          {/* Boletas sueltas (cargadas a mano, sin pedido asociado) */}
          {manualesOrdenadas.length > 0 && (
            <div className="rounded-xl border border-navy-100 bg-white p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Receipt size={14} className="text-navy-500" />
                <p className="font-bold text-navy-800">Boletas sueltas</p>
              </div>
              <div className="space-y-2">
                {manualesOrdenadas.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-navy-100">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Package size={13} className="text-navy-500 shrink-0" />
                        <span className="text-sm font-semibold text-navy-700 truncate">{f.supplierName}</span>
                      </div>
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
                            href={downloadUrl(f.facturaUrl, f.facturaNombre || 'boleta')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                          >
                            <FileText size={11} /> archivo
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setManualTarget({ supplierId: f.supplierId, supplierName: f.supplierName, initial: f })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-navy-700 border border-navy-200 hover:bg-navy-50 transition-colors"
                      >
                        <CheckCircle2 size={13} /> Editar
                      </button>
                      <button
                        onClick={() => borrarManual(f)}
                        title="Borrar boleta"
                        className="p-1.5 rounded-lg text-navy-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recibidos.length === 0 ? (
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
        )}
        </div>
      )}

      {/* ============ RECEPCIÓN DIARIA ============ */}
      {tab === 'recepcion' && (
        recepcionOrders.length === 0 ? (
          <div className="text-center py-16">
            <ConciergeBell size={48} className="mx-auto text-navy-200 mb-3" />
            <p className="text-navy-400 font-medium">No hay pedidos de recepción</p>
            <p className="text-sm text-navy-300 mt-1">Aparecen acá los pedidos diarios (Verdulería, Piazza, Lácteos) enviados desde Recepción.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recepcionOrders.map(order => {
              const f = order.factura
              return (
                <div key={order.id} className="rounded-xl border border-navy-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-bold text-navy-800 truncate">{order.distributorName}</p>
                      <p className="text-xs text-navy-400 flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(order.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {order.createdBy ? ` · ${order.createdBy}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => setRecepcionTarget(order)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors ${
                        f
                          ? 'bg-white text-navy-700 border border-navy-200 hover:bg-navy-50'
                          : 'bg-gold-400 text-navy-900 hover:bg-gold-500'
                      }`}
                    >
                      {f ? <><CheckCircle2 size={13} /> Editar boleta</> : <><PlusCircle size={13} /> Cargar boleta</>}
                    </button>
                  </div>

                  <ul className="text-sm text-navy-600 space-y-0.5 mb-2">
                    {order.items.map((item, i) => (
                      <li key={i}>- {item.quantity} x {item.productName} ({item.unit})</li>
                    ))}
                  </ul>

                  <div className={`rounded-lg p-2.5 border ${f ? 'bg-green-50 border-green-200' : 'bg-navy-50 border-navy-100'}`}>
                    {f ? (
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs">
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
                            href={downloadUrl(f.facturaUrl, f.facturaNombre || 'boleta')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                          >
                            <FileText size={11} /> archivo
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">Sin boleta cargada</p>
                    )}
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
                  {g.facturas.map((entry, i) => {
                    const factura = entry.factura
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
                          onClick={() => marcarPagada(entry)}
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
                  {m.entries.map((entry, i) => {
                    const f = entry.factura
                    const d = desglosar(f)
                    const key = entryKey(entry)
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-navy-100">
                        <div className="min-w-0 text-xs">
                          <span className="font-semibold text-navy-800">{f.supplierName}</span>
                          {f.fecha && <span className="text-navy-400"> · {shortDate(f.fecha)}</span>}
                          <span className="block text-navy-500">
                            {f.items?.length ? `Neto ${formatMontoCurrency(d.neto)} · IVA ${formatMontoCurrency(d.iva)} · ` : ''}Total {formatMontoCurrency(f.monto)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {f.facturaUrl && (
                            <a
                              href={downloadUrl(f.facturaUrl, f.facturaNombre || 'factura')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                            >
                              <FileText size={13} /> archivo
                            </a>
                          )}
                          <label className={`flex items-center gap-1 text-xs font-semibold cursor-pointer ${attaching === key ? 'text-navy-400' : f.facturaUrl ? 'text-navy-400 hover:text-navy-600' : 'text-amber-600 hover:text-amber-700'}`}>
                            {attaching === key
                              ? <><Camera size={13} /> Escaneando…</>
                              : f.facturaUrl
                                ? <><RotateCcw size={13} /> reescanear</>
                                : <><Camera size={13} /> Escanear</>}
                            <input
                              type="file"
                              accept="image/*,application/pdf"
                              capture="environment"
                              disabled={attaching === key}
                              onChange={e => { const file = e.target.files?.[0]; if (file) attachArchivo(entry, file) }}
                              className="hidden"
                            />
                          </label>
                        </div>
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

      {recepcionTarget && (
        <FacturaProveedorModal
          supplierName={recepcionTarget.distributorName}
          docLabel="Boleta"
          subtitle={`Pedido enviado ${new Date(recepcionTarget.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
          initial={recepcionTarget.factura}
          onClose={() => setRecepcionTarget(null)}
          onSave={handleSaveBoleta}
        />
      )}

      {/* Elegir proveedor para una boleta suelta */}
      {manualPicker && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setManualPicker(false)}
        >
          <div
            className="bg-white w-full sm:w-[420px] rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-lg font-bold text-navy-800">¿De qué proveedor es la boleta?</h3>
              <button onClick={() => setManualPicker(false)} className="p-1 rounded-lg hover:bg-navy-100 transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-navy-500 mb-4">Boleta suelta, sin pedido asociado. Elegí un proveedor o escribí otro.</p>
            <div className="space-y-1.5 mb-4">
              {suppliers.map(s => (
                <button
                  key={s.id}
                  onClick={() => elegirProveedorManual(s.id, s.name)}
                  className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-navy-100 text-sm font-semibold text-navy-700 hover:bg-navy-50 transition-colors text-left"
                >
                  <Package size={13} className="text-navy-500 shrink-0" /> {s.name}
                </button>
              ))}
            </div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Otro proveedor / comercio</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualNombre}
                onChange={e => setManualNombre(e.target.value)}
                placeholder="Nombre del proveedor"
                className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
              />
              <button
                onClick={() => {
                  const nombre = manualNombre.trim()
                  // id estable por nombre: dos boletas del mismo comercio agrupan juntas en cta cte.
                  if (nombre) elegirProveedorManual(`manual:${nombre.toUpperCase()}`, nombre)
                }}
                disabled={!manualNombre.trim()}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Seguir
              </button>
            </div>
          </div>
        </div>
      )}

      {manualTarget && (
        <FacturaProveedorModal
          supplierName={manualTarget.supplierName}
          docLabel="Boleta"
          subtitle="Boleta suelta (sin pedido asociado)"
          initial={manualTarget.initial}
          onClose={() => setManualTarget(null)}
          onSave={handleSaveManual}
        />
      )}

      {scanPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80" onClick={uploadingPreview ? undefined : cerrarPreview}>
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img src={scanPreview.url} alt="Vista previa del escaneo" className="max-w-full h-auto rounded-lg shadow-lg bg-white" />
          </div>
          <div className="bg-white p-4 flex gap-3" onClick={e => e.stopPropagation()}>
            <button
              onClick={cerrarPreview}
              disabled={uploadingPreview}
              className="flex-1 py-3 rounded-xl font-semibold text-navy-700 bg-navy-100 hover:bg-navy-200 disabled:opacity-50"
            >
              Descartar
            </button>
            <button
              onClick={confirmarPreview}
              disabled={uploadingPreview}
              className="flex-1 py-3 rounded-xl font-semibold text-cream bg-navy-800 hover:bg-navy-700 disabled:opacity-50"
            >
              {uploadingPreview ? 'Subiendo…' : 'Usar y subir'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
