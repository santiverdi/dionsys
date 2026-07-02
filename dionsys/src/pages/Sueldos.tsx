import { useState, useMemo, useRef } from 'react'
import { useSueldos } from '../context/SueldosContext'
import { useAuth } from '../context/AuthContext'
import { validateMonto, formatMontoCurrency } from '../utils/validators'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import { monthLabel, monthKey, getPreviousMonth, getNextMonth, getCurrentMonth } from '../utils/dateRange'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Users, UserPlus, Plus, Save, Trash2, ChevronLeft, ChevronRight,
  Paperclip, X, Loader2, Eye, Download, Wallet,
} from 'lucide-react'
import type {
  EmpleadoNomina, PagoSueldo, TipoPagoSueldo, MedioPagoSueldo,
} from '../types'
import { TIPO_PAGO_SUELDO_LABELS } from '../types'

const TIPOS: TipoPagoSueldo[] = ['sueldo', 'adelanto', 'aguinaldo', 'extra']

function formatDateAR(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const [y, m, d] = s.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Sueldos() {
  const { empleados, pagos, addEmpleado, deleteEmpleado, addPago, deletePago } = useSueldos()
  const { employee } = useAuth()

  const [mesActual, setMesActual] = useState(() => getCurrentMonth())
  const mesStr = monthKey(mesActual.year, mesActual.month)

  // --- Nómina (alta/baja) ---
  const [showNominaForm, setShowNominaForm] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPuesto, setNuevoPuesto] = useState('')
  const [confirmDeleteEmpleado, setConfirmDeleteEmpleado] = useState<EmpleadoNomina | null>(null)

  // --- Carga de pago ---
  const [showPagoForm, setShowPagoForm] = useState(false)
  const [pagoEmpleadoId, setPagoEmpleadoId] = useState('')
  const [pagoTipo, setPagoTipo] = useState<TipoPagoSueldo>('sueldo')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoFecha, setPagoFecha] = useState(todayStr())
  const [pagoMedio, setPagoMedio] = useState<MedioPagoSueldo>('efectivo')
  const [pagoNotas, setPagoNotas] = useState('')
  const [pagoError, setPagoError] = useState('')
  const [reciboUrl, setReciboUrl] = useState('')
  const [reciboNombre, setReciboNombre] = useState('')
  const [subiendoRecibo, setSubiendoRecibo] = useState(false)
  const [reciboError, setReciboError] = useState('')
  const reciboInputRef = useRef<HTMLInputElement>(null)

  const [confirmDeletePago, setConfirmDeletePago] = useState<PagoSueldo | null>(null)

  const empleadosActivos = useMemo(() => empleados.filter(e => e.activo), [empleados])

  const pagosDelMes = useMemo(() => pagos.filter(p => p.mes === mesStr), [pagos, mesStr])

  const totalMes = useMemo(() => pagosDelMes.reduce((s, p) => s + p.monto, 0), [pagosDelMes])

  // Totales del mes por tipo.
  const totalesPorTipo = useMemo(() => {
    const map: Record<TipoPagoSueldo, number> = { sueldo: 0, adelanto: 0, aguinaldo: 0, extra: 0 }
    for (const p of pagosDelMes) map[p.tipo] += p.monto
    return map
  }, [pagosDelMes])

  // Pagos del mes agrupados por empleado (usa el snapshot del nombre para no perder
  // los pagos de un empleado dado de baja).
  const grupos = useMemo(() => {
    const byEmp = new Map<string, { nombre: string; pagos: PagoSueldo[]; subtotal: number }>()
    for (const p of pagosDelMes) {
      const key = p.empleadoId || p.empleadoNombre
      const g = byEmp.get(key) ?? { nombre: p.empleadoNombre, pagos: [], subtotal: 0 }
      g.pagos.push(p)
      g.subtotal += p.monto
      byEmp.set(key, g)
    }
    return [...byEmp.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [pagosDelMes])

  function handleMes(delta: number) {
    setMesActual(prev => delta < 0 ? getPreviousMonth(prev.year, prev.month) : getNextMonth(prev.year, prev.month))
  }

  function handleAgregarEmpleado() {
    if (!nuevoNombre.trim()) return
    addEmpleado({ nombre: nuevoNombre.trim(), puesto: nuevoPuesto.trim(), activo: true })
    setNuevoNombre('')
    setNuevoPuesto('')
    setShowNominaForm(false)
  }

  function clearRecibo() {
    setReciboUrl('')
    setReciboNombre('')
    setReciboError('')
    setSubiendoRecibo(false)
  }

  async function handleAdjuntarRecibo(file: File) {
    setReciboError('')
    setSubiendoRecibo(true)
    try {
      const { url, nombre } = await uploadFactura(file)
      setReciboUrl(url)
      setReciboNombre(nombre)
    } catch (e) {
      setReciboError(e instanceof Error ? e.message : 'No se pudo adjuntar el recibo.')
    } finally {
      setSubiendoRecibo(false)
    }
  }

  function resetPagoForm() {
    setPagoEmpleadoId('')
    setPagoTipo('sueldo')
    setPagoMonto('')
    setPagoFecha(todayStr())
    setPagoMedio('efectivo')
    setPagoNotas('')
    setPagoError('')
    clearRecibo()
  }

  function handleCargarPago() {
    setPagoError('')
    if (!pagoEmpleadoId) {
      setPagoError('Elegí un empleado')
      return
    }
    if (!pagoFecha) {
      setPagoError('Indicá la fecha del pago')
      return
    }
    const result = validateMonto(pagoMonto)
    if (!result.ok) {
      setPagoError(result.error ?? 'Monto inválido')
      return
    }
    const emp = empleados.find(e => e.id === pagoEmpleadoId)
    addPago({
      empleadoId: pagoEmpleadoId,
      empleadoNombre: emp?.nombre ?? '?',
      mes: mesStr,
      tipo: pagoTipo,
      monto: result.value!,
      fecha: pagoFecha,
      medio: pagoMedio,
      notas: pagoNotas.trim() || undefined,
      reciboUrl: reciboUrl || undefined,
      reciboNombre: reciboNombre || undefined,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
    })
    resetPagoForm()
    setShowPagoForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Users className="text-gold-400" size={28} />
          <h1 className="text-2xl font-bold text-navy-800">Sueldos</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { const o = !showPagoForm; setShowPagoForm(o); setShowNominaForm(false); if (o) resetPagoForm() }}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-cream rounded-lg text-sm font-semibold hover:bg-navy-700 transition-colors"
          >
            <Plus size={16} />
            Cargar Pago
          </button>
          <button
            onClick={() => { setShowNominaForm(!showNominaForm); setShowPagoForm(false) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-navy-200 text-navy-700 rounded-lg text-sm font-semibold hover:bg-navy-50 transition-colors"
          >
            <UserPlus size={16} />
            Gestionar Nómina
          </button>
        </div>
      </div>

      {/* Form: Nueva alta de empleado + lista de nómina */}
      {showNominaForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Nómina del personal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-navy-500 font-medium">Nombre *</label>
              <input
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: Roxana Gómez"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-navy-500 font-medium">Puesto</label>
              <input
                value={nuevoPuesto}
                onChange={e => setNuevoPuesto(e.target.value)}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: Encargada"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleAgregarEmpleado}
              disabled={!nuevoNombre.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} /> Agregar
            </button>
          </div>

          {empleadosActivos.length > 0 ? (
            <div className="divide-y divide-navy-100 border-t border-navy-100 pt-1">
              {empleadosActivos.map(emp => (
                <div key={emp.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-navy-800">{emp.nombre}</span>
                    {emp.puesto && <span className="text-xs text-navy-400 ml-2">{emp.puesto}</span>}
                  </div>
                  <button
                    onClick={() => setConfirmDeleteEmpleado(emp)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                    title="Dar de baja"
                  >
                    <Trash2 size={14} className="text-navy-300" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-navy-400 border-t border-navy-100 pt-3">Todavía no hay empleados en la nómina.</p>
          )}
        </div>
      )}

      {/* Form: Cargar pago */}
      {showPagoForm && (
        <div className="bg-white rounded-xl shadow-sm border border-navy-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Cargar Pago - {monthLabel(mesActual.year, mesActual.month)}</h3>
          {empleadosActivos.length === 0 ? (
            <p className="text-sm text-navy-400">
              Primero agregá empleados en <button onClick={() => { setShowPagoForm(false); setShowNominaForm(true) }} className="text-gold-600 font-semibold hover:text-gold-700">Gestionar Nómina</button>.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-navy-500 font-medium">Empleado *</label>
                  <select
                    value={pagoEmpleadoId}
                    onChange={e => setPagoEmpleadoId(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    <option value="">Elegir empleado...</option>
                    {empleadosActivos.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Tipo</label>
                  <select
                    value={pagoTipo}
                    onChange={e => setPagoTipo(e.target.value as TipoPagoSueldo)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    {TIPOS.map(t => (
                      <option key={t} value={t}>{TIPO_PAGO_SUELDO_LABELS[t]}</option>
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
                  <label className="text-xs text-navy-500 font-medium">Fecha *</label>
                  <input
                    type="date"
                    value={pagoFecha}
                    onChange={e => setPagoFecha(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Medio</label>
                  <select
                    value={pagoMedio}
                    onChange={e => setPagoMedio(e.target.value as MedioPagoSueldo)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Notas (opcional)</label>
                  <input
                    value={pagoNotas}
                    onChange={e => setPagoNotas(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                    placeholder="Ej: primera quincena"
                  />
                </div>
              </div>

              {/* Adjuntar recibo */}
              <div>
                <label className="text-xs text-navy-500 font-medium">Recibo (PDF o foto)</label>
                <input
                  ref={reciboInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleAdjuntarRecibo(f)
                    e.target.value = ''
                  }}
                />
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {reciboUrl ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-300 rounded-lg text-xs text-green-700 max-w-full">
                      <Paperclip size={13} className="shrink-0" />
                      <span className="truncate">{reciboNombre || 'Recibo adjunto'}</span>
                      <button type="button" onClick={clearRecibo} className="text-green-500 hover:text-green-700 shrink-0" title="Quitar adjunto">
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reciboInputRef.current?.click()}
                      disabled={subiendoRecibo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy-200 text-navy-600 rounded-lg text-xs font-medium hover:bg-navy-50 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {subiendoRecibo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                      {subiendoRecibo ? 'Subiendo…' : 'Adjuntar recibo'}
                    </button>
                  )}
                </div>
                {reciboError && <p className="text-xs text-amber-600 mt-1">{reciboError}</p>}
              </div>

              {pagoError && <p className="text-xs text-red-600 -mt-1">{pagoError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setShowPagoForm(false); resetPagoForm() }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-navy-500 hover:bg-navy-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCargarPago}
                  disabled={!pagoEmpleadoId || !pagoMonto || !pagoFecha || subiendoRecibo}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={14} /> Cargar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Navegación por mes + total */}
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => handleMes(-1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronLeft size={20} className="text-navy-600" />
          </button>
          <h2 className="text-lg font-bold text-navy-800">{monthLabel(mesActual.year, mesActual.month)}</h2>
          <button onClick={() => handleMes(1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronRight size={20} className="text-navy-600" />
          </button>
        </div>
        <div className="bg-navy-50 rounded-lg p-3 text-center mb-3">
          <p className="text-xs text-navy-500 font-medium">Total del mes</p>
          <p className="text-2xl font-bold text-navy-800">{formatMontoCurrency(totalMes)}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          {TIPOS.map(t => (
            <div key={t} className="bg-navy-50 rounded-lg p-2">
              <p className="text-[10px] text-navy-500 font-medium">{TIPO_PAGO_SUELDO_LABELS[t]}</p>
              <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(totalesPorTipo[t])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pagos del mes agrupados por empleado */}
      {grupos.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-navy-800">Pagos de {monthLabel(mesActual.year, mesActual.month)}</h3>
          {grupos.map(g => (
            <div key={g.nombre} className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-navy-800 text-sm">{g.nombre}</h4>
                <span className="text-sm font-bold text-navy-800">{formatMontoCurrency(g.subtotal)}</span>
              </div>
              <div className="divide-y divide-navy-100">
                {g.pagos.map(p => (
                  <div key={p.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full font-medium">
                          {TIPO_PAGO_SUELDO_LABELS[p.tipo]}
                        </span>
                        <span className="text-sm font-semibold text-navy-800">{formatMontoCurrency(p.monto)}</span>
                        <span className="text-xs text-navy-400">{formatDateAR(p.fecha)}</span>
                        <span className="text-[10px] bg-navy-100 text-navy-500 px-1.5 py-0.5 rounded-full">{p.medio}</span>
                      </div>
                      {p.notas && <p className="text-xs text-navy-400 italic mt-0.5">{p.notas}</p>}
                      {p.reciboUrl && (
                        <div className="flex items-center gap-3 mt-1">
                          <a href={p.reciboUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            <Eye size={13} /> Ver recibo
                          </a>
                          <a href={downloadUrl(p.reciboUrl, p.reciboNombre || 'recibo')} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            <Download size={13} /> Descargar
                          </a>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmDeletePago(p)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                      title="Borrar pago"
                    >
                      <Trash2 size={14} className="text-navy-300" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-8 text-center">
          <Wallet size={40} className="text-navy-200 mx-auto mb-3" />
          <p className="text-navy-500 text-sm">No hay pagos cargados en {monthLabel(mesActual.year, mesActual.month)}.</p>
        </div>
      )}

      {/* Confirmaciones */}
      <ConfirmDialog
        open={confirmDeleteEmpleado !== null}
        title="Dar de baja empleado"
        message={confirmDeleteEmpleado ? `Se saca a "${confirmDeleteEmpleado.nombre}" de la nómina activa. Sus pagos ya cargados se conservan.` : ''}
        confirmLabel="Dar de baja"
        onConfirm={() => { if (confirmDeleteEmpleado) deleteEmpleado(confirmDeleteEmpleado.id); setConfirmDeleteEmpleado(null) }}
        onCancel={() => setConfirmDeleteEmpleado(null)}
      />
      <ConfirmDialog
        open={confirmDeletePago !== null}
        title="Borrar pago"
        message={confirmDeletePago ? `Se borra el pago de ${formatMontoCurrency(confirmDeletePago.monto)} de "${confirmDeletePago.empleadoNombre}". Esta acción no se puede deshacer.` : ''}
        confirmLabel="Borrar"
        onConfirm={() => { if (confirmDeletePago) deletePago(confirmDeletePago.id); setConfirmDeletePago(null) }}
        onCancel={() => setConfirmDeletePago(null)}
      />
    </div>
  )
}
