import { useState, useRef, useMemo } from 'react'
import {
  ChevronLeft, Users, BedDouble, Upload, Save, Edit3,
  ChevronDown, ChevronUp, TrendingUp, BarChart3, FileSpreadsheet,
  LogIn, LogOut, Home, Sun, Sunset, Moon, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOccupancy, HOTEL_CAPACITY, TURNO_LABELS, type Turno } from '../context/OccupancyContext'
import { useTurnos } from '../context/TurnosContext'

const TURNO_ICONS: Record<Turno, typeof Sun> = {
  manana: Sun,
  tarde: Sunset,
  noche: Moon,
}

const TURNO_ORDER: Turno[] = ['manana', 'tarde', 'noche']

interface Props {
  onBack: () => void
}

export default function OccupancyPanel({ onBack }: Props) {
  const { employee } = useAuth()
  const { currentTurno, setToday, getTodayAllTurnos, getHistory, getAvgConsumption, getProjection, parseExcel } = useOccupancy()
  const { getCurrentShiftName } = useTurnos()

  const todayTurnos = getTodayAllTurnos()
  // Default: edit current turno if not loaded yet
  const [editingTurno, setEditingTurno] = useState<Turno | null>(() =>
    todayTurnos[currentTurno] ? null : currentTurno
  )
  const editingRecord = editingTurno ? todayTurnos[editingTurno] : null

  const [guests, setGuests] = useState(editingRecord?.guests ?? 0)
  const [rooms, setRooms] = useState(editingRecord?.rooms ?? 0)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [breakdown, setBreakdown] = useState<{ inhouse: number; out: number; checkIn: number } | null>(
    editingRecord?.inhouse != null ? { inhouse: editingRecord.inhouse, out: editingRecord.out ?? 0, checkIn: editingRecord.checkIn ?? 0 } : null
  )
  const [showMetrics, setShowMetrics] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const occupancyPct = rooms > 0 ? Math.round((rooms / HOTEL_CAPACITY) * 100) : 0
  const history = useMemo(() => getHistory(14), [getHistory])

  function startEditTurno(turno: Turno) {
    const rec = todayTurnos[turno]
    setGuests(rec?.guests ?? 0)
    setRooms(rec?.rooms ?? 0)
    setBreakdown(rec?.inhouse != null ? { inhouse: rec.inhouse, out: rec.out ?? 0, checkIn: rec.checkIn ?? 0 } : null)
    setImportError('')
    setEditingTurno(turno)
  }

  function cancelEdit() {
    setEditingTurno(null)
    setImportError('')
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportError('')
    try {
      const result = await parseExcel(file)
      setGuests(result.guests)
      setRooms(result.rooms)
      setBreakdown({ inhouse: result.inhouse, out: result.out, checkIn: result.checkIn })
    } catch {
      setImportError('Error al leer el archivo. Verifica que sea el Excel de proyeccion.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSave() {
    if (!employee || !editingTurno) return
    setToday(guests, rooms, employee.name, {
      turno: editingTurno,
      ...(breakdown ? {
        inhouse: breakdown.inhouse,
        out: breakdown.out,
        checkIn: breakdown.checkIn,
      } : {}),
    })
    setEditingTurno(null)
  }

  const latestToday = useMemo(() => {
    const candidates = [todayTurnos.manana, todayTurnos.tarde, todayTurnos.noche].filter(Boolean)
    if (candidates.length === 0) return undefined
    return candidates.reduce((latest, r) =>
      new Date(r!.createdAt) > new Date(latest!.createdAt) ? r : latest
    )
  }, [todayTurnos])

  const avgConsumption = useMemo(() => getAvgConsumption(), [getAvgConsumption])
  const projection = useMemo(() => {
    const g = latestToday?.guests ?? guests
    return g > 0 ? getProjection(g) : []
  }, [latestToday, guests, getProjection])

  const maxHistoryGuests = useMemo(() => {
    return Math.max(...history.map(h => h.guests), 1)
  }, [history])

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
      >
        <ChevronLeft size={18} /> Pedidos Recepcion
      </button>

      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-navy-800">Ocupacion del dia</h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
          currentTurno === 'manana' ? 'bg-amber-100 text-amber-700' :
          currentTurno === 'tarde' ? 'bg-orange-100 text-orange-700' :
          'bg-indigo-100 text-indigo-700'
        }`}>
          {TURNO_LABELS[currentTurno]} — {getCurrentShiftName()}
        </span>
      </div>
      <p className="text-sm text-navy-500 mb-4">
        {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Daily load section — 3 turnos per day */}
      <div className="mb-4">
        {editingTurno ? (
          /* EDIT FORM for editingTurno */
          <div className="bg-white rounded-xl p-5 shadow-sm border-2 border-gold-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = TURNO_ICONS[editingTurno]
                  return <Icon size={20} className="text-gold-600" />
                })()}
                <span className="text-base font-bold text-navy-800">
                  {todayTurnos[editingTurno] ? 'Editar' : 'Cargar'} turno {TURNO_LABELS[editingTurno].split(' ')[0]}
                </span>
              </div>
              <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-navy-50">
                <X size={18} className="text-navy-400" />
              </button>
            </div>

            {/* Excel import */}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileImport}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="w-full mb-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-navy-200 text-navy-600 hover:border-gold-400 hover:text-gold-700 transition-colors text-sm font-medium"
            >
              {importing ? (
                <span className="animate-pulse">Leyendo archivo...</span>
              ) : (
                <>
                  <FileSpreadsheet size={18} />
                  Importar Excel de proyeccion
                </>
              )}
            </button>
            <p className="text-xs text-navy-400 mb-4 text-center leading-relaxed">
              Reservas → Ingresos → Impresora → Proyeccion de huespedes Hoy:Hoy
            </p>
            {importError && (
              <p className="text-xs text-red-500 mb-3 -mt-2">{importError}</p>
            )}

            {breakdown && (
              <div className="flex gap-3 text-xs text-navy-500 justify-center mb-3 bg-navy-50 rounded-lg p-2">
                <span className="flex items-center gap-1"><Home size={12} className="text-blue-500" /> {breakdown.inhouse} inhouse</span>
                <span className="flex items-center gap-1"><LogOut size={12} className="text-red-400" /> {breakdown.out} out</span>
                <span className="flex items-center gap-1"><LogIn size={12} className="text-green-500" /> {breakdown.checkIn} in (no desayunan)</span>
              </div>
            )}

            <p className="text-xs text-navy-400 mb-2 text-center">o carga manual:</p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-navy-600 mb-1">
                  <Users size={14} /> Huespedes desayuno *
                </label>
                <input
                  type="number"
                  min={0}
                  max={300}
                  value={guests || ''}
                  onChange={e => setGuests(parseInt(e.target.value) || 0)}
                  placeholder="Ej: 40"
                  className="w-full px-3 py-3 rounded-xl border border-navy-200 text-2xl font-bold text-navy-800 text-center focus:outline-none focus:border-gold-400"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-semibold text-navy-600 mb-1">
                  <BedDouble size={14} /> Habitaciones *
                </label>
                <input
                  type="number"
                  min={0}
                  max={HOTEL_CAPACITY}
                  value={rooms || ''}
                  onChange={e => setRooms(parseInt(e.target.value) || 0)}
                  placeholder={`Max ${HOTEL_CAPACITY}`}
                  className="w-full px-3 py-3 rounded-xl border border-navy-200 text-2xl font-bold text-navy-800 text-center focus:outline-none focus:border-gold-400"
                />
              </div>
            </div>

            {rooms > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-xs text-navy-500 mb-1">
                  <span>{rooms} / {HOTEL_CAPACITY} hab.</span>
                  <span className="font-semibold">{occupancyPct}%</span>
                </div>
                <div className="w-full h-3 bg-navy-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, occupancyPct)}%`,
                      backgroundColor: occupancyPct > 85 ? '#ef4444' : occupancyPct > 60 ? '#f59e0b' : '#22c55e'
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={cancelEdit}
                className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-600 font-semibold text-sm hover:bg-navy-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={guests <= 0 || rooms <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-400 text-navy-900 font-semibold text-sm hover:bg-gold-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={16} /> Guardar turno
              </button>
            </div>
          </div>
        ) : (
          /* 3 TURNO CARDS */
          <div className="space-y-2">
            {TURNO_ORDER.map(turno => {
              const rec = todayTurnos[turno]
              const isCurrent = turno === currentTurno
              const Icon = TURNO_ICONS[turno]
              const turnoLabel = TURNO_LABELS[turno]
              const pct = rec && rec.rooms > 0 ? Math.round((rec.rooms / HOTEL_CAPACITY) * 100) : 0

              return (
                <div
                  key={turno}
                  className={`rounded-xl p-4 shadow-sm border transition-colors ${
                    isCurrent && !rec
                      ? 'bg-gold-50 border-gold-300 ring-2 ring-gold-200'
                      : isCurrent
                        ? 'bg-white border-gold-300'
                        : rec
                          ? 'bg-white border-navy-100'
                          : 'bg-navy-50 border-navy-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                        rec ? 'bg-emerald-100 text-emerald-600' : isCurrent ? 'bg-gold-100 text-gold-600' : 'bg-navy-100 text-navy-400'
                      }`}>
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-navy-800 text-sm">{turnoLabel}</p>
                        {rec ? (
                          <p className="text-xs text-navy-500">
                            por {rec.createdBy} · {new Date(rec.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        ) : (
                          <p className="text-xs text-navy-400">{isCurrent ? 'Tu turno · sin cargar' : 'Sin cargar'}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => startEditTurno(turno)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                        rec
                          ? 'bg-navy-100 text-navy-700 hover:bg-navy-200'
                          : 'bg-navy-800 text-cream hover:bg-navy-700'
                      }`}
                    >
                      {rec ? <><Edit3 size={12} /> Editar</> : 'Cargar'}
                    </button>
                  </div>

                  {rec && (
                    <>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div className="bg-navy-50 rounded-lg p-2">
                          <div className="flex items-center gap-1.5 text-navy-500">
                            <Users size={12} />
                            <span className="text-[10px] font-semibold uppercase">huéspedes</span>
                          </div>
                          <p className="text-xl font-bold text-navy-800">{rec.guests}</p>
                        </div>
                        <div className="bg-navy-50 rounded-lg p-2">
                          <div className="flex items-center gap-1.5 text-navy-500">
                            <BedDouble size={12} />
                            <span className="text-[10px] font-semibold uppercase">hab</span>
                          </div>
                          <p className="text-xl font-bold text-navy-800">
                            {rec.rooms}
                            <span className="text-xs text-navy-400 font-normal"> / {HOTEL_CAPACITY} · {pct}%</span>
                          </p>
                        </div>
                      </div>

                      {rec.inhouse != null && (
                        <div className="flex gap-2 text-[10px] text-navy-500 mt-2">
                          <span className="flex items-center gap-0.5"><Home size={10} className="text-blue-500" /> {rec.inhouse} inhouse</span>
                          <span className="flex items-center gap-0.5"><LogOut size={10} className="text-red-400" /> {rec.out} out</span>
                          <span className="flex items-center gap-0.5"><LogIn size={10} className="text-green-500" /> {rec.checkIn} in</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Metrics & projection - collapsible */}
      <button
        onClick={() => setShowMetrics(!showMetrics)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-white border border-navy-100 shadow-sm mb-2 text-sm font-semibold text-navy-700 hover:bg-navy-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <TrendingUp size={16} className="text-gold-600" />
          Metricas y proyeccion
        </span>
        {showMetrics ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {showMetrics && (
        <div className="space-y-4">
          {/* Average consumption per guest */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
            <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
              <Users size={14} /> Consumo promedio por huesped
            </h3>
            {avgConsumption.length > 0 ? (
              <div className="space-y-1.5">
                {avgConsumption.map(a => (
                  <div key={`${a.source}-${a.productName}`} className="flex items-center justify-between text-sm">
                    <span className="text-navy-600">
                      {a.productName}
                      <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                        a.source === 'panaderia' ? 'bg-gold-100 text-gold-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {a.source}
                      </span>
                    </span>
                    <span className="font-medium text-navy-800">{a.avgPerGuest} {a.unit}/pax</span>
                  </div>
                ))}
                <p className="text-xs text-navy-400 mt-2">Basado en ultimos 30 dias con huespedes cargados</p>
              </div>
            ) : (
              <p className="text-sm text-navy-400">
                Sin datos aun. Los promedios se calculan cuando hay pedidos con huespedes cargados.
              </p>
            )}
          </div>

          {/* Purchase projection */}
          {projection.length > 0 && (latestToday?.guests ?? guests) > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
              <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                <Upload size={14} /> Proyeccion de compra ({latestToday?.guests ?? guests} huespedes)
              </h3>
              <div className="space-y-1.5">
                {projection.map(p => (
                  <div key={`${p.source}-${p.productName}`} className="flex items-center justify-between text-sm">
                    <span className="text-navy-600">{p.productName}</span>
                    <span className="font-bold text-navy-800">{p.suggested} {p.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 14-day history */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
            <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
              <BarChart3 size={14} /> Ultimos 14 dias
            </h3>
            {history.length > 0 ? (
              <div className="space-y-1.5">
                {history.map(h => {
                  const pct = (h.guests / maxHistoryGuests) * 100
                  const occPct = Math.round((h.rooms / HOTEL_CAPACITY) * 100)
                  const d = new Date(h.date + 'T12:00:00')
                  return (
                    <div key={h.date} className="flex items-center gap-2 text-xs">
                      <span className="w-16 text-navy-500 shrink-0">
                        {d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })}
                      </span>
                      <div className="flex-1 h-5 bg-navy-50 rounded overflow-hidden relative">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: occPct > 85 ? '#ef4444' : occPct > 60 ? '#f59e0b' : '#22c55e'
                          }}
                        />
                      </div>
                      <span className="w-20 text-right text-navy-700 font-medium shrink-0">
                        {h.guests} pax · {occPct}%
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-navy-400">Sin historial aun.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
