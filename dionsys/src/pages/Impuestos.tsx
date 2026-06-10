import { useState, useMemo, useRef, useEffect } from 'react'
import { useImpuestos } from '../context/ImpuestosContext'
import { useAuth } from '../context/AuthContext'
import { validateMonto } from '../utils/validators'
import { extractInvoice } from '../lib/invoiceExtract'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import {
  Receipt, ExternalLink, Calendar, ChevronLeft, ChevronRight,
  Check, AlertTriangle, Clock, Edit3, Save, Copy, Plus, Trash2, FileUp, Loader2,
  Paperclip, Eye, Download, X
} from 'lucide-react'
import type { ImpuestoServicio, FrecuenciaVto } from '../types'

// Normaliza un texto para comparar (saca espacios, guiones, mayúsculas).
function normKey(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

// Busca el servicio que corresponde a una factura: primero por nro de cuenta, luego por nombre.
function matchServicio(servicios: ImpuestoServicio[], nroCuenta: string, nombre: string): ImpuestoServicio | null {
  const nro = normKey(nroCuenta)
  if (nro) {
    const byNro = servicios.find(s => s.nroCuenta && normKey(s.nroCuenta) === nro)
    if (byNro) return byNro
  }
  const nom = normKey(nombre)
  if (nom) {
    const byNom = servicios.find(s => {
      const sn = normKey(s.nombre)
      return sn !== '' && (sn.includes(nom) || nom.includes(sn))
    })
    if (byNom) return byNom
  }
  return null
}

function mesLabel(year: number, month: number): string {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  return `${meses[month - 1]} ${year}`
}

function formatMonto(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}

function getMesStr(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Parsear YYYY-MM-DD sin timezone issues
function parseDateStr(s: string): { year: number; month: number; day: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { year: y, month: m, day: d }
}

function formatDateAR(s: string): string {
  const { day, month, year } = parseDateStr(s)
  return `${day}/${month}/${year}`
}

const NUEVO_SERVICIO_VACIO: Omit<ImpuestoServicio, 'id'> = {
  nombre: '',
  nroCuenta: '',
  urlPago: '',
  frecuencia: 'mensual',
  diaVto: 1,
  observaciones: '',
}

export default function Impuestos() {
  const { servicios, pagos, addServicio, deleteServicio, addPago, updatePago, deletePago, togglePagado, updateServicio } = useImpuestos()
  const { employee } = useAuth()

  const now = new Date()
  const [mesActual, setMesActual] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showNuevoForm, setShowNuevoForm] = useState(false)
  const [nuevoServicio, setNuevoServicio] = useState(NUEVO_SERVICIO_VACIO)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editServicio, setEditServicio] = useState<ImpuestoServicio | null>(null)

  // Form para cargar pago mensual
  const [showCargarPago, setShowCargarPago] = useState(false)
  const [pagoServicioId, setPagoServicioId] = useState('')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoVto, setPagoVto] = useState('')
  const [pagoVtoSig, setPagoVtoSig] = useState('')
  const [pagoError, setPagoError] = useState('')
  // Archivo de factura adjunto al pago que se está cargando.
  const [pagoFacturaUrl, setPagoFacturaUrl] = useState('')
  const [pagoFacturaNombre, setPagoFacturaNombre] = useState('')
  const [subiendoFactura, setSubiendoFactura] = useState(false)
  const [facturaUploadError, setFacturaUploadError] = useState('')
  const cargarFacturaInputRef = useRef<HTMLInputElement>(null)

  // Lectura de factura con IA (PDF o foto)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  // Cuando la factura no matchea ningún servicio, guardamos sus datos acá para
  // autocompletar el pago apenas el usuario crea el servicio nuevo.
  const [pendingFactura, setPendingFactura] = useState<
    { nombre: string; nroCuenta: string; monto: string; vtoActual: string; vtoSiguiente: string } | null
  >(null)

  // Mover pago de día en el calendario
  const [movingPagoId, setMovingPagoId] = useState<string | null>(null)

  // Editar / borrar pago desde la lista de abajo
  const [editingPagoId, setEditingPagoId] = useState<string | null>(null)
  const [confirmDeletePagoId, setConfirmDeletePagoId] = useState<string | null>(null)
  const [editPagoVto, setEditPagoVto] = useState('')
  const [editPagoMonto, setEditPagoMonto] = useState('')
  const [editPagoVtoSig, setEditPagoVtoSig] = useState('')
  const [editPagoError, setEditPagoError] = useState('')

  const mesStr = getMesStr(mesActual.year, mesActual.month)

  const pagosDelMes = useMemo(() => {
    return pagos.filter(p => p.mes === mesStr)
  }, [pagos, mesStr])

  // Servicios sin pago cargado: mensuales del mes actual, anuales del año actual
  const sinCargar = useMemo(() => {
    const mesActualStr = getMesStr(now.getFullYear(), now.getMonth() + 1)
    const yearStr = String(now.getFullYear())
    return servicios.filter(srv => {
      if (srv.frecuencia === 'anual') {
        // Anual: solo alertar si no tiene pago en ningún mes del año
        return !pagos.some(p => p.impuestoId === srv.id && p.mes.startsWith(yearStr))
      }
      return !pagos.some(p => p.impuestoId === srv.id && p.mes === mesActualStr)
    })
  }, [servicios, pagos, now.getFullYear(), now.getMonth()])

  // Servicios que todavia no tienen pago cargado en el mes seleccionado (para el dropdown)
  const serviciosSinPagoMesSeleccionado = useMemo(() => {
    return servicios.filter(srv =>
      !pagos.some(p => p.impuestoId === srv.id && p.mes === mesStr)
    )
  }, [servicios, pagos, mesStr])

  function handleMes(delta: number) {
    setMesActual(prev => {
      let m = prev.month + delta
      let y = prev.year
      if (m > 12) { m = 1; y++ }
      if (m < 1) { m = 12; y-- }
      return { year: y, month: m }
    })
  }

  function handleCargarPago() {
    setPagoError('')
    if (!pagoServicioId) {
      setPagoError('Elegí un servicio')
      return
    }
    if (!pagoVto) {
      setPagoError('Indicá la fecha de vencimiento')
      return
    }
    const result = validateMonto(pagoMonto)
    if (!result.ok) {
      setPagoError(result.error ?? 'Monto inválido')
      return
    }
    addPago({
      impuestoId: pagoServicioId,
      mes: mesStr,
      monto: result.value!,
      vtoActual: pagoVto,
      vtoSiguiente: pagoVtoSig || '',
      pagado: false,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
      facturaUrl: pagoFacturaUrl || undefined,
      facturaNombre: pagoFacturaNombre || undefined,
    })
    setPagoServicioId('')
    setPagoMonto('')
    setPagoVto('')
    setPagoVtoSig('')
    clearPagoFactura()
    setShowCargarPago(false)
  }

  function clearPagoFactura() {
    setPagoFacturaUrl('')
    setPagoFacturaNombre('')
    setFacturaUploadError('')
    setSubiendoFactura(false)
  }

  // Sube un archivo adjuntado a mano en el formulario "Cargar Pago".
  async function handleAdjuntarFactura(file: File) {
    setFacturaUploadError('')
    setSubiendoFactura(true)
    try {
      const { url, nombre } = await uploadFactura(file)
      setPagoFacturaUrl(url)
      setPagoFacturaNombre(nombre)
    } catch (e) {
      setFacturaUploadError(e instanceof Error ? e.message : 'No se pudo adjuntar el archivo.')
    } finally {
      setSubiendoFactura(false)
    }
  }

  function handleCopyNroCuenta(nro: string, id: string) {
    navigator.clipboard.writeText(nro)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function handleSaveServicio() {
    if (!editServicio) return
    updateServicio(editServicio)
    setEditServicio(null)
  }

  function handleAgregarServicio() {
    if (!nuevoServicio.nombre.trim()) return
    addServicio(nuevoServicio)
    setNuevoServicio(NUEVO_SERVICIO_VACIO)
    setShowNuevoForm(false)
  }

  function handleDeleteServicio(id: string) {
    deleteServicio(id)
    setConfirmDeleteId(null)
  }

  function handleCalendarClick(dia: number) {
    if (!dia) return

    if (movingPagoId) {
      // Mover el pago al día clickeado
      const pago = pagos.find(p => p.id === movingPagoId)
      if (pago) {
        const nuevaFecha = `${mesActual.year}-${String(mesActual.month).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
        updatePago({ ...pago, vtoActual: nuevaFecha })
      }
      setMovingPagoId(null)
      return
    }

    // Seleccionar pago para mover
    const pagosEnDia = pagosDelMes.filter(p => {
      return parseDateStr(p.vtoActual).day === dia
    })
    if (pagosEnDia.length === 1) {
      setMovingPagoId(pagosEnDia[0].id)
    } else if (pagosEnDia.length > 1) {
      // Si hay varios, mostrar selector
      setPickDayPagos(pagosEnDia.map(p => p.id))
    }
  }

  // Selector cuando hay varios pagos en el mismo día
  const [pickDayPagos, setPickDayPagos] = useState<string[]>([])

  // Click en un recordatorio (vto del mes siguiente): abre "Cargar Pago" precargado
  function handleRecordatorioClick(impuestoId: string, fechaVto: string) {
    setShowNuevoForm(false)
    setShowCargarPago(true)
    setPagoServicioId(impuestoId)
    setPagoVto(fechaVto)
    setPagoMonto('')
    setPagoVtoSig('')
    setPagoError('')
    clearPagoFactura()
  }

  // Precarga el formulario "Cargar Pago" con los datos extraídos de la factura.
  function prefillPagoDesdeFactura(servicioId: string, monto: string, vtoActual: string, vtoSiguiente: string) {
    // El pago se archiva en el mes que muestra el calendario (mesStr). Por eso, al venir
    // de una factura, llevamos el calendario al mes del vencimiento para que NO quede
    // cargado en el mes actual si la factura es de otro mes (ej: factura de mayo en junio).
    if (/^\d{4}-\d{2}-\d{2}$/.test(vtoActual)) {
      const { year, month } = parseDateStr(vtoActual)
      setMesActual({ year, month })
    }
    setShowNuevoForm(false)
    setShowCargarPago(true)
    setPagoServicioId(servicioId)
    setPagoMonto(monto)
    setPagoVto(vtoActual)
    setPagoVtoSig(vtoSiguiente)
    setPagoError('')
  }

  // Lee la factura, extrae los datos y precarga el pago (o propone crear el servicio).
  async function handleFactura(file: File) {
    setExtractError('')
    setFacturaUploadError('')
    setExtracting(true)
    try {
      const data = await extractInvoice(file)
      // Adjuntamos el MISMO archivo que se leyó, para que quede guardado y Charo lo vea.
      // Si la subida falla, igual seguimos con los datos extraídos (el adjunto es opcional).
      try {
        const { url, nombre } = await uploadFactura(file)
        setPagoFacturaUrl(url)
        setPagoFacturaNombre(nombre)
      } catch (up) {
        setFacturaUploadError(up instanceof Error ? up.message : 'Se leyó la factura pero no se pudo adjuntar el archivo.')
      }
      const match = matchServicio(servicios, data.nroCuenta, data.nombre)
      if (match) {
        setPendingFactura(null)
        prefillPagoDesdeFactura(match.id, data.monto, data.vtoActual, data.vtoSiguiente)
      } else {
        // No existe el servicio: lo proponemos cargar con nombre + cuenta ya completos,
        // y guardamos el resto para autocompletar el pago apenas se cree.
        setShowCargarPago(false)
        setNuevoServicio({ ...NUEVO_SERVICIO_VACIO, nombre: data.nombre, nroCuenta: data.nroCuenta })
        setShowNuevoForm(true)
        setPendingFactura(data)
      }
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : 'No se pudo leer la factura.')
    } finally {
      setExtracting(false)
    }
  }

  // Apenas el servicio nuevo (creado desde una factura) aparece en la lista,
  // abrimos "Cargar Pago" autocompletado con los datos de esa factura.
  useEffect(() => {
    if (!pendingFactura) return
    const match = matchServicio(servicios, pendingFactura.nroCuenta, pendingFactura.nombre)
    if (match) {
      prefillPagoDesdeFactura(match.id, pendingFactura.monto, pendingFactura.vtoActual, pendingFactura.vtoSiguiente)
      setPendingFactura(null)
    }
  }, [servicios, pendingFactura])

  function startEditPago(pagoId: string) {
    const pago = pagos.find(p => p.id === pagoId)
    if (!pago) return
    setEditingPagoId(pagoId)
    setEditPagoVto(pago.vtoActual)
    setEditPagoMonto(String(pago.monto))
    setEditPagoVtoSig(pago.vtoSiguiente || '')
  }

  function handleSavePagoEdit() {
    setEditPagoError('')
    if (!editingPagoId) return
    const pago = pagos.find(p => p.id === editingPagoId)
    if (!pago) return
    const result = validateMonto(editPagoMonto)
    if (!result.ok) {
      setEditPagoError(result.error ?? 'Monto inválido')
      return
    }
    updatePago({ ...pago, vtoActual: editPagoVto, monto: result.value!, vtoSiguiente: editPagoVtoSig })
    setEditingPagoId(null)
  }

  // Calendar
  type CalendarEvento = {
    pagoId: string
    impuestoId: string
    nombre: string
    pagado: boolean
    vencido: boolean
    esRecordatorio: boolean
    fechaVto: string
  }

  const calendarData = useMemo(() => {
    const daysInMonth = new Date(mesActual.year, mesActual.month, 0).getDate()
    const firstDayOfWeek = new Date(mesActual.year, mesActual.month - 1, 1).getDay()
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    // Recordatorios: el "Vto. mes siguiente" de pagos previos que cae en este mes,
    // mostrado solo si todavia no se cargo el pago real del servicio en este mes.
    const recordatoriosPorServicio = new Map<string, { dia: number; nombre: string; fechaVto: string }>()
    for (const pago of pagos) {
      if (!pago.vtoSiguiente) continue
      const vs = parseDateStr(pago.vtoSiguiente)
      if (vs.year !== mesActual.year || vs.month !== mesActual.month) continue
      if (pagosDelMes.some(p => p.impuestoId === pago.impuestoId)) continue
      if (recordatoriosPorServicio.has(pago.impuestoId)) continue
      const srv = servicios.find(s => s.id === pago.impuestoId)
      recordatoriosPorServicio.set(pago.impuestoId, {
        dia: vs.day,
        nombre: srv?.nombre ?? '?',
        fechaVto: pago.vtoSiguiente,
      })
    }

    const days: { dia: number | null; eventos: CalendarEvento[] }[] = []

    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push({ dia: null, eventos: [] })
    }

    for (let dia = 1; dia <= daysInMonth; dia++) {
      const fecha = new Date(mesActual.year, mesActual.month - 1, dia)
      fecha.setHours(0, 0, 0, 0)
      const eventos: CalendarEvento[] = []

      for (const pago of pagosDelMes) {
        const vtoParsed = parseDateStr(pago.vtoActual)
        if (vtoParsed.day === dia) {
          const srv = servicios.find(s => s.id === pago.impuestoId)
          eventos.push({
            pagoId: pago.id,
            impuestoId: pago.impuestoId,
            nombre: srv?.nombre ?? '?',
            pagado: pago.pagado,
            vencido: !pago.pagado && fecha < hoy,
            esRecordatorio: false,
            fechaVto: pago.vtoActual,
          })
        }
      }

      for (const [impuestoId, rec] of recordatoriosPorServicio) {
        if (rec.dia === dia) {
          eventos.push({
            pagoId: '',
            impuestoId,
            nombre: rec.nombre,
            pagado: false,
            vencido: fecha < hoy,
            esRecordatorio: true,
            fechaVto: rec.fechaVto,
          })
        }
      }

      days.push({ dia, eventos })
    }

    return days
  }, [mesActual, servicios, pagos, pagosDelMes])

  const totalMes = useMemo(() => pagosDelMes.reduce((sum, p) => sum + p.monto, 0), [pagosDelMes])
  const totalPagado = useMemo(() => pagosDelMes.filter(p => p.pagado).reduce((sum, p) => sum + p.monto, 0), [pagosDelMes])
  const totalPendiente = totalMes - totalPagado

  const isToday = (dia: number) => {
    return dia === now.getDate() && mesActual.month === now.getMonth() + 1 && mesActual.year === now.getFullYear()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Receipt className="text-gold-400" size={28} />
          <h1 className="text-2xl font-bold text-navy-800">Impuestos y Servicios</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFactura(f)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={extracting}
            className="flex items-center gap-1.5 px-4 py-2 bg-gold-400 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-500 disabled:opacity-50 disabled:cursor-wait transition-colors"
            title="Subí un PDF o foto de la factura y completo los datos solo"
          >
            {extracting ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {extracting ? 'Leyendo…' : 'Leer factura'}
          </button>
          <button
            onClick={() => { const opening = !showCargarPago; setShowCargarPago(opening); setShowNuevoForm(false); if (opening) clearPagoFactura() }}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-cream rounded-lg text-sm font-semibold hover:bg-navy-700 transition-colors"
          >
            <Plus size={16} />
            Cargar Pago
          </button>
          <button
            onClick={() => { setShowNuevoForm(!showNuevoForm); setShowCargarPago(false) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-navy-200 text-navy-700 rounded-lg text-sm font-semibold hover:bg-navy-50 transition-colors"
          >
            <Plus size={16} />
            Nuevo Servicio
          </button>
        </div>
      </div>

      {/* Error al leer la factura */}
      {extractError && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-red-700">{extractError}</div>
          <button onClick={() => setExtractError('')} className="text-red-400 text-xs hover:text-red-600">Cerrar</button>
        </div>
      )}

      {/* Factura leída pero el servicio no existe todavía */}
      {pendingFactura && (
        <div className="bg-indigo-50 border border-indigo-300 rounded-xl p-3 flex items-start gap-2">
          <FileUp size={18} className="text-indigo-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-indigo-800">
            Leí la factura de <strong>{pendingFactura.nombre || 'este servicio'}</strong>
            {pendingFactura.nroCuenta && <> (cuenta {pendingFactura.nroCuenta})</>}, pero todavía no tenés ese servicio cargado.
            Revisá los datos abajo y guardá el servicio: apenas lo hagas, completo el pago solo.
          </div>
          <button onClick={() => setPendingFactura(null)} className="text-indigo-400 text-xs hover:text-indigo-600">Descartar</button>
        </div>
      )}

      {/* Alerta: servicios sin cargar del mes actual */}
      {sinCargar.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <h3 className="font-semibold text-amber-800 text-sm">
              Faltan cargar {sinCargar.length} servicio{sinCargar.length > 1 ? 's' : ''} de {mesLabel(now.getFullYear(), now.getMonth() + 1)}
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {sinCargar.map(srv => (
              <span
                key={srv.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-medium"
              >
                <Clock size={12} />
                {srv.nombre}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Form: Cargar pago mensual */}
      {showCargarPago && (
        <div className="bg-white rounded-xl shadow-sm border border-navy-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Cargar Pago - {mesLabel(mesActual.year, mesActual.month)}</h3>
          {serviciosSinPagoMesSeleccionado.length === 0 ? (
            <p className="text-sm text-navy-400">Todos los servicios ya tienen pago cargado en este mes.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-navy-500 font-medium">Servicio *</label>
                  <select
                    value={pagoServicioId}
                    onChange={e => setPagoServicioId(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    <option value="">Elegir servicio...</option>
                    {serviciosSinPagoMesSeleccionado.map(srv => (
                      <option key={srv.id} value={srv.id}>{srv.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Importe *</label>
                  <div className="relative mt-0.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={pagoMonto}
                      onChange={e => setPagoMonto(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 border border-navy-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Fecha de Vencimiento *</label>
                  <input
                    type="date"
                    value={pagoVto}
                    onChange={e => setPagoVto(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                  />
                </div>
              </div>
              <div className="md:w-1/3">
                <label className="text-xs text-navy-400">Vto. mes siguiente (opcional)</label>
                <input
                  type="date"
                  value={pagoVtoSig}
                  onChange={e => setPagoVtoSig(e.target.value)}
                  className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                />
              </div>

              {/* Adjuntar archivo de la factura (para que Charo lo vea y lo descargue) */}
              <div>
                <label className="text-xs text-navy-500 font-medium">Archivo de la factura (PDF o foto)</label>
                <input
                  ref={cargarFacturaInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleAdjuntarFactura(f)
                    e.target.value = ''
                  }}
                />
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {pagoFacturaUrl ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-300 rounded-lg text-xs text-green-700 max-w-full">
                      <Paperclip size={13} className="shrink-0" />
                      <span className="truncate">{pagoFacturaNombre || 'Archivo adjunto'}</span>
                      <button
                        type="button"
                        onClick={clearPagoFactura}
                        className="text-green-500 hover:text-green-700 shrink-0"
                        title="Quitar adjunto"
                      >
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => cargarFacturaInputRef.current?.click()}
                      disabled={subiendoFactura}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy-200 text-navy-600 rounded-lg text-xs font-medium hover:bg-navy-50 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {subiendoFactura ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                      {subiendoFactura ? 'Subiendo…' : 'Adjuntar archivo'}
                    </button>
                  )}
                </div>
                {facturaUploadError && (
                  <p className="text-xs text-amber-600 mt-1">{facturaUploadError}</p>
                )}
              </div>

              {pagoError && (
                <p className="text-xs text-red-600 -mt-1">{pagoError}</p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setShowCargarPago(false); setPagoError(''); clearPagoFactura() }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-navy-500 hover:bg-navy-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCargarPago}
                  disabled={!pagoServicioId || !pagoMonto || !pagoVto || subiendoFactura}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={14} /> Cargar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Form: Nuevo servicio */}
      {showNuevoForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Nuevo Servicio</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-navy-500 font-medium">Nombre *</label>
              <input
                value={nuevoServicio.nombre}
                onChange={e => setNuevoServicio({ ...nuevoServicio, nombre: e.target.value })}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: EDEA (ELECTRICIDAD)"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-navy-500 font-medium">Nro de Cuenta</label>
              <input
                value={nuevoServicio.nroCuenta}
                onChange={e => setNuevoServicio({ ...nuevoServicio, nroCuenta: e.target.value })}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: 73-9002479"
              />
            </div>
            <div>
              <label className="text-xs text-navy-500 font-medium">Frecuencia</label>
              <select
                value={nuevoServicio.frecuencia}
                onChange={e => setNuevoServicio({ ...nuevoServicio, frecuencia: e.target.value as FrecuenciaVto })}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
              >
                <option value="mensual">Mensual</option>
                <option value="anual">Anual</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-navy-500 font-medium">URL de Pago</label>
              <input
                value={nuevoServicio.urlPago}
                onChange={e => setNuevoServicio({ ...nuevoServicio, urlPago: e.target.value })}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="https://..."
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-navy-500 font-medium">Observaciones</label>
              <input
                value={nuevoServicio.observaciones}
                onChange={e => setNuevoServicio({ ...nuevoServicio, observaciones: e.target.value })}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setShowNuevoForm(false); setNuevoServicio(NUEVO_SERVICIO_VACIO) }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-navy-500 hover:bg-navy-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleAgregarServicio}
              disabled={!nuevoServicio.nombre.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} /> Guardar Servicio
            </button>
          </div>
        </div>
      )}

      {/* Month navigation + totals */}
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => handleMes(-1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronLeft size={20} className="text-navy-600" />
          </button>
          <h2 className="text-lg font-bold text-navy-800">{mesLabel(mesActual.year, mesActual.month)}</h2>
          <button onClick={() => handleMes(1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronRight size={20} className="text-navy-600" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-navy-50 rounded-lg p-3">
            <p className="text-xs text-navy-500 font-medium">Total Mes</p>
            <p className="text-lg font-bold text-navy-800">{formatMonto(totalMes)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600 font-medium">Pagado</p>
            <p className="text-lg font-bold text-green-700">{formatMonto(totalPagado)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-xs text-red-500 font-medium">Pendiente</p>
            <p className="text-lg font-bold text-red-600">{formatMonto(totalPendiente)}</p>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-gold-400" />
            <h3 className="font-semibold text-navy-800">Calendario de Vencimientos</h3>
          </div>
          {movingPagoId && (
            <button
              onClick={() => setMovingPagoId(null)}
              className="text-xs text-red-500 font-medium hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
            >
              Cancelar mover
            </button>
          )}
        </div>
        {movingPagoId && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-xs text-blue-700 font-medium">
            Hace click en el dia donde quieras mover el vencimiento
          </div>
        )}
        <div className="grid grid-cols-7 gap-1 text-center">
          {['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'].map(d => (
            <div key={d} className="text-xs font-semibold text-navy-500 py-1">{d}</div>
          ))}
          {calendarData.map((cell, i) => {
            const hasMoving = cell.eventos.some(ev => ev.pagoId === movingPagoId)
            return (
              <div
                key={i}
                onClick={() => cell.dia !== null && (movingPagoId || cell.eventos.length > 0) && handleCalendarClick(cell.dia)}
                className={`min-h-[60px] md:min-h-[80px] rounded-lg p-1 text-xs border transition-colors ${
                  cell.dia === null
                    ? 'border-transparent'
                    : hasMoving
                      ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-300'
                      : movingPagoId && cell.dia !== null
                        ? 'border-navy-200 bg-navy-50/50 cursor-pointer hover:bg-blue-50 hover:border-blue-300'
                        : isToday(cell.dia)
                          ? 'border-gold-400 bg-gold-50'
                          : cell.eventos.length > 0
                            ? 'border-navy-200 bg-navy-50 cursor-pointer hover:bg-navy-100'
                            : 'border-navy-100'
                }`}
              >
                {cell.dia !== null && (
                  <>
                    <span className={`font-medium ${isToday(cell.dia) ? 'text-gold-600' : 'text-navy-600'}`}>
                      {cell.dia}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {cell.eventos.map((ev, j) => (
                        <div
                          key={j}
                          onClick={ev.esRecordatorio && !movingPagoId ? (e) => { e.stopPropagation(); handleRecordatorioClick(ev.impuestoId, ev.fechaVto) } : undefined}
                          className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                            ev.esRecordatorio
                              ? 'bg-indigo-50 text-indigo-600 border border-dashed border-indigo-300 cursor-pointer hover:bg-indigo-100'
                              : ev.pagoId === movingPagoId
                                ? 'bg-blue-200 text-blue-800 ring-1 ring-blue-400'
                                : ev.pagado
                                  ? 'bg-green-100 text-green-700'
                                  : ev.vencido
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                          }`}
                          title={
                            ev.esRecordatorio
                              ? `Vto. del mes que viene — click para cargar el pago de ${ev.nombre}`
                              : movingPagoId ? 'Click en otro dia para mover' : `Click para mover ${ev.nombre}`
                          }
                        >
                          {ev.nombre.split('(')[0].trim()}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-4 mt-3 text-xs text-navy-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Pagado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" /> Pendiente</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Vencido</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-50 border border-dashed border-indigo-300" /> Próx. (a cargar)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" /> Moviendo</span>
        </div>
      </div>

      {/* Selector de pago a mover (cuando hay varios en un día) */}
      {pickDayPagos.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-800 font-medium mb-2">Cual queres mover?</p>
          <div className="flex flex-wrap gap-2">
            {pickDayPagos.map(pid => {
              const p = pagos.find(x => x.id === pid)
              const srv = servicios.find(s => s.id === p?.impuestoId)
              return (
                <button
                  key={pid}
                  onClick={() => { setMovingPagoId(pid); setPickDayPagos([]) }}
                  className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                >
                  {srv?.nombre ?? '?'}
                </button>
              )
            })}
            <button
              onClick={() => setPickDayPagos([])}
              className="px-3 py-1.5 text-navy-400 rounded-lg text-xs hover:bg-navy-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Pagos del mes - abajo del calendario */}
      {pagosDelMes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-navy-800">Pagos de {mesLabel(mesActual.year, mesActual.month)}</h3>
          {pagosDelMes.map(pago => {
            const srv = servicios.find(s => s.id === pago.impuestoId)
            if (!srv) return null
            const vtoParsed = parseDateStr(pago.vtoActual)
            const hoy = new Date()
            const hoyNum = hoy.getFullYear() * 10000 + (hoy.getMonth() + 1) * 100 + hoy.getDate()
            const vtoNum = vtoParsed.year * 10000 + vtoParsed.month * 100 + vtoParsed.day
            const vencido = !pago.pagado && vtoNum < hoyNum
            const isEditingThis = editingPagoId === pago.id

            return (
              <div
                key={pago.id}
                className={`bg-white rounded-xl shadow-sm border p-4 ${
                  pago.pagado
                    ? 'border-green-200'
                    : vencido
                      ? 'border-red-300 bg-red-50/30'
                      : 'border-navy-100'
                }`}
              >
                {isEditingThis ? (
                  <div className="space-y-3">
                    <h4 className="font-bold text-navy-800 text-sm">{srv.nombre}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-navy-500 font-medium">Importe</label>
                        <div className="relative mt-0.5">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editPagoMonto}
                            onChange={e => setEditPagoMonto(e.target.value)}
                            className="w-full pl-7 pr-3 py-2 border border-navy-200 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-navy-500 font-medium">Fecha Vencimiento</label>
                        <input
                          type="date"
                          value={editPagoVto}
                          onChange={e => setEditPagoVto(e.target.value)}
                          className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-navy-400">Vto siguiente (opcional)</label>
                        <input
                          type="date"
                          value={editPagoVtoSig}
                          onChange={e => setEditPagoVtoSig(e.target.value)}
                          className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                        />
                      </div>
                    </div>
                    {editPagoError && (
                      <p className="text-xs text-red-600">{editPagoError}</p>
                    )}
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingPagoId(null); setEditPagoError('') }} className="px-3 py-1.5 rounded-lg text-xs font-medium text-navy-500 hover:bg-navy-50">
                        Cancelar
                      </button>
                      <button onClick={handleSavePagoEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy-800 text-cream hover:bg-navy-700">
                        <Save size={12} /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-navy-800 text-sm">{srv.nombre}</h4>
                        {pago.pagado && <Check size={16} className="text-green-600 shrink-0" />}
                        {vencido && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
                        {!pago.pagado && !vencido && <Clock size={16} className="text-yellow-500 shrink-0" />}
                      </div>

                      <div className="flex items-baseline gap-3 mb-1.5">
                        <span className="text-xl font-bold text-navy-800">{formatMonto(pago.monto)}</span>
                        <span className={`text-xs font-medium ${vencido ? 'text-red-500' : 'text-navy-400'}`}>
                          Vto: {formatDateAR(pago.vtoActual)}
                        </span>
                      </div>
                      {pago.vtoSiguiente && (
                        <p className="text-xs text-navy-400 mb-1.5">
                          Prox vto: {formatDateAR(pago.vtoSiguiente)}
                        </p>
                      )}

                      {pago.facturaUrl && (
                        <div className="flex items-center gap-3 mb-1.5">
                          <a
                            href={pago.facturaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            <Eye size={13} /> Ver factura
                          </a>
                          <a
                            href={downloadUrl(pago.facturaUrl, pago.facturaNombre || 'factura')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            <Download size={13} /> Descargar
                          </a>
                        </div>
                      )}

                      {srv.nroCuenta && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-navy-500">Cta:</span>
                          <code className="text-xs bg-navy-50 px-2 py-0.5 rounded font-mono text-navy-700">{srv.nroCuenta}</code>
                          <button
                            onClick={() => handleCopyNroCuenta(srv.nroCuenta, pago.id)}
                            className="p-0.5 rounded hover:bg-navy-100 transition-colors"
                            title="Copiar nro de cuenta"
                          >
                            {copiedId === pago.id
                              ? <Check size={12} className="text-green-500" />
                              : <Copy size={12} className="text-navy-400" />
                            }
                          </button>
                        </div>
                      )}

                      {srv.observaciones && (
                        <p className="text-xs text-navy-400 italic mt-1">{srv.observaciones}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0 items-end">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditPago(pago.id)}
                          className="p-1.5 rounded-lg hover:bg-navy-50 transition-colors"
                          title="Editar pago"
                        >
                          <Edit3 size={14} className="text-navy-400" />
                        </button>
                        {confirmDeletePagoId === pago.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { deletePago(pago.id); setConfirmDeletePagoId(null) }}
                              className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600"
                            >
                              Borrar
                            </button>
                            <button
                              onClick={() => setConfirmDeletePagoId(null)}
                              className="px-2 py-1 text-navy-400 rounded text-xs hover:bg-navy-50"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeletePagoId(pago.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Borrar pago"
                          >
                            <Trash2 size={14} className="text-navy-300" />
                          </button>
                        )}
                      </div>
                      {srv.urlPago && (
                        <a
                          href={srv.urlPago}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-4 py-2 bg-gold-400 text-navy-900 rounded-lg text-sm font-semibold hover:bg-gold-500 transition-colors"
                        >
                          Ir a Pagar <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => togglePagado(pago.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors w-full ${
                          pago.pagado
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-navy-800 text-cream hover:bg-navy-700'
                        }`}
                      >
                        {pago.pagado ? 'Pagado' : 'Marcar Pagado'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lista de servicios cargados (gestion) */}
      {servicios.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-navy-800 text-sm flex items-center gap-2">
            <Receipt size={16} className="text-navy-400" />
            Servicios registrados ({servicios.length})
          </h3>
          <div className="bg-white rounded-xl shadow-sm border border-navy-100 divide-y divide-navy-100">
            {servicios.map(srv => {
              const isEditingServicio = editServicio?.id === srv.id
              const isConfirmingDelete = confirmDeleteId === srv.id

              return (
                <div key={srv.id} className="p-3">
                  {isEditingServicio && editServicio ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-navy-500 font-medium">Nombre</label>
                          <input
                            value={editServicio.nombre}
                            onChange={e => setEditServicio({ ...editServicio, nombre: e.target.value })}
                            className="w-full text-sm border border-navy-200 rounded-lg px-2 py-1.5 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-navy-500 font-medium">Nro Cuenta</label>
                          <input
                            value={editServicio.nroCuenta}
                            onChange={e => setEditServicio({ ...editServicio, nroCuenta: e.target.value })}
                            className="w-full text-sm border border-navy-200 rounded-lg px-2 py-1.5 mt-0.5"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-navy-500 font-medium">URL de Pago</label>
                          <input
                            value={editServicio.urlPago}
                            onChange={e => setEditServicio({ ...editServicio, urlPago: e.target.value })}
                            className="w-full text-sm border border-navy-200 rounded-lg px-2 py-1.5 mt-0.5"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="text-xs text-navy-500 font-medium">Frecuencia</label>
                          <select
                            value={editServicio.frecuencia}
                            onChange={e => setEditServicio({ ...editServicio, frecuencia: e.target.value as FrecuenciaVto })}
                            className="w-full text-sm border border-navy-200 rounded-lg px-2 py-1.5 mt-0.5"
                          >
                            <option value="mensual">Mensual</option>
                            <option value="anual">Anual</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-navy-500 font-medium">Observaciones</label>
                        <input
                          value={editServicio.observaciones}
                          onChange={e => setEditServicio({ ...editServicio, observaciones: e.target.value })}
                          className="w-full text-sm border border-navy-200 rounded-lg px-2 py-1.5 mt-0.5"
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditServicio(null)} className="px-3 py-1 rounded-lg text-xs font-medium text-navy-500 hover:bg-navy-100">
                          Cancelar
                        </button>
                        <button onClick={handleSaveServicio} className="flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold bg-navy-800 text-cream hover:bg-navy-700">
                          <Save size={12} /> Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-navy-800">{srv.nombre}</span>
                          <span className="text-[10px] bg-navy-100 text-navy-500 px-1.5 py-0.5 rounded-full">
                            {srv.frecuencia}
                          </span>
                        </div>
                        {srv.nroCuenta && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-navy-400">Cta:</span>
                            <code className="text-xs bg-navy-50 px-1.5 py-0.5 rounded font-mono text-navy-600">{srv.nroCuenta}</code>
                            <button
                              onClick={() => handleCopyNroCuenta(srv.nroCuenta, srv.id)}
                              className="p-0.5 rounded hover:bg-navy-100 transition-colors"
                              title="Copiar nro de cuenta"
                            >
                              {copiedId === srv.id
                                ? <Check size={12} className="text-green-500" />
                                : <Copy size={12} className="text-navy-400" />
                              }
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditServicio({ ...srv })}
                          className="p-1.5 rounded-lg hover:bg-navy-50 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={14} className="text-navy-400" />
                        </button>
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDeleteServicio(srv.id)} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600">
                              Si
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 text-navy-400 rounded text-xs hover:bg-navy-50">
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(srv.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} className="text-navy-300" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Estado vacio */}
      {servicios.length === 0 && !showNuevoForm && (
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-8 text-center">
          <Receipt size={40} className="text-navy-200 mx-auto mb-3" />
          <p className="text-navy-500 text-sm">No hay servicios cargados todavia.</p>
          <button
            onClick={() => setShowNuevoForm(true)}
            className="mt-3 text-sm text-gold-600 font-semibold hover:text-gold-700"
          >
            + Agregar el primero
          </button>
        </div>
      )}
    </div>
  )
}
