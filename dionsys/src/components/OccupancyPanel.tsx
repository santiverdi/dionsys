import { useState, useRef, useMemo } from 'react'
import {
  ChevronLeft, Users, BedDouble, Upload, Save, Edit3,
  ChevronDown, ChevronUp, TrendingUp, BarChart3, FileSpreadsheet,
  LogIn, LogOut, Home
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOccupancy, HOTEL_CAPACITY, TURNO_LABELS } from '../context/OccupancyContext'
import { useTurnos } from '../context/TurnosContext'

interface Props {
  onBack: () => void
}

export default function OccupancyPanel({ onBack }: Props) {
  const { employee } = useAuth()
  const { currentTurno, setToday, getToday, getHistory, getAvgConsumption, getProjection, parseExcel } = useOccupancy()
  const { getCurrentShiftName } = useTurnos()

  const today = getToday()
  const [editing, setEditing] = useState(!today)
  const [guests, setGuests] = useState(today?.guests ?? 0)
  const [rooms, setRooms] = useState(today?.rooms ?? 0)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [breakdown, setBreakdown] = useState<{ inhouse: number; out: number; checkIn: number } | null>(
    today?.inhouse != null ? { inhouse: today.inhouse, out: today.out ?? 0, checkIn: today.checkIn ?? 0 } : null
  )
  const [showMetrics, setShowMetrics] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const occupancyPct = rooms > 0 ? Math.round((rooms / HOTEL_CAPACITY) * 100) : 0
  const history = useMemo(() => getHistory(14), [getHistory])

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
      setEditing(true)
    } catch (err) {
      setImportError('Error al leer el archivo. Verifica que sea el Excel de proyeccion.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handleSave() {
    if (!employee) return
    setToday(guests, rooms, employee.name, breakdown ? {
      inhouse: breakdown.inhouse,
      out: breakdown.out,
      checkIn: breakdown.checkIn,
    } : undefined)
    setEditing(false)
  }

  const avgConsumption = useMemo(() => getAvgConsumption(), [getAvgConsumption])
  const projection = useMemo(() => {
    const g = today?.guests ?? guests
    return g > 0 ? getProjection(g) : []
  }, [today, guests, getProjection])

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

      {/* Daily load section */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-navy-100 mb-4">
        {!editing && today ? (
          /* Already loaded - show summary */
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-semibold text-green-600 uppercase tracking-wide">Cargado hoy</span>
                {today.turno && (
                  <span className="ml-2 text-xs text-navy-400">
                    por {today.createdBy} · turno {TURNO_LABELS[today.turno].split(' ')[0].toLowerCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-700 font-medium"
              >
                <Edit3 size={14} /> Editar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users size={18} className="text-gold-600" />
                  <span className="text-3xl font-bold text-navy-800">{today.guests}</span>
                </div>
                <p className="text-xs text-navy-500">huespedes desayunan</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <BedDouble size={18} className="text-blue-600" />
                  <span className="text-3xl font-bold text-navy-800">{today.rooms}</span>
                </div>
                <p className="text-xs text-navy-500">habitaciones</p>
              </div>
            </div>

            {/* Breakdown if from Excel */}
            {today.inhouse != null && (
              <div className="flex gap-3 text-xs text-navy-500 justify-center mb-3">
                <span className="flex items-center gap-1"><Home size={12} className="text-blue-500" /> {today.inhouse} inhouse</span>
                <span className="flex items-center gap-1"><LogOut size={12} className="text-red-400" /> {today.out} out</span>
                <span className="flex items-center gap-1"><LogIn size={12} className="text-green-500" /> {today.checkIn} in</span>
              </div>
            )}

            {/* Occupancy bar */}
            <div>
              <div className="flex justify-between text-xs text-navy-500 mb-1">
                <span>{today.rooms} / {HOTEL_CAPACITY} hab.</span>
                <span className="font-semibold">{Math.round((today.rooms / HOTEL_CAPACITY) * 100)}%</span>
              </div>
              <div className="w-full h-3 bg-navy-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (today.rooms / HOTEL_CAPACITY) * 100)}%`,
                    backgroundColor: (today.rooms / HOTEL_CAPACITY) > 0.85 ? '#ef4444' :
                      (today.rooms / HOTEL_CAPACITY) > 0.6 ? '#f59e0b' : '#22c55e'
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Edit / new entry */
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-navy-700">
                {today ? 'Editar ocupacion' : 'Cargar ocupacion de hoy'}
              </span>
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

            {/* Breakdown from Excel */}
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
                  <Users size={14} /> Huespedes desayuno
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
                  <BedDouble size={14} /> Habitaciones
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

            {/* Occupancy bar preview */}
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
              {today && (
                <button
                  onClick={() => { setEditing(false); setGuests(today.guests); setRooms(today.rooms) }}
                  className="flex-1 py-3 rounded-xl border border-navy-200 text-navy-600 font-semibold text-sm hover:bg-navy-50 transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={guests <= 0 && rooms <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gold-400 text-navy-900 font-semibold text-sm hover:bg-gold-500 transition-colors disabled:opacity-40"
              >
                <Save size={16} /> Guardar
              </button>
            </div>
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
          {projection.length > 0 && (today?.guests ?? guests) > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-navy-100">
              <h3 className="text-sm font-semibold text-navy-700 mb-3 flex items-center gap-2">
                <Upload size={14} /> Proyeccion de compra ({today?.guests ?? guests} huespedes)
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
