import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, X, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTurnos, CONSERJES, DEFAULT_SHIFTS, type Turno } from '../context/TurnosContext'

interface Props {
  onBack: () => void
}

const TURNOS: { key: Turno; label: string }[] = [
  { key: 'manana', label: 'Mañana' },
  { key: 'tarde', label: 'Tarde' },
  { key: 'noche', label: 'Noche' },
]

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Color por conserje para escanear la grilla de un vistazo.
const NAME_COLORS: Record<string, string> = {
  Leandro: 'bg-blue-100 text-blue-700 border-blue-300',
  Santiago: 'bg-green-100 text-green-700 border-green-300',
  Gaston: 'bg-amber-100 text-amber-700 border-amber-300',
  Valentin: 'bg-indigo-100 text-indigo-700 border-indigo-300',
}
const FALLBACK_COLOR = 'bg-white text-navy-500 border-navy-100'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TurnosGrid({ onBack }: Props) {
  const { employee } = useAuth()
  const { getShiftEmployee, setShift } = useTurnos()
  const isValentin = employee?.name === 'Valentin'

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-based
  const [picker, setPicker] = useState<{ dateStr: string; turno: Turno; day: number } | null>(null)

  const today = todayStr()

  const days = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayOfWeek = new Date(year, month - 1, day).getDay()
      return { day, dateStr, dayName: DAY_NAMES[dayOfWeek] }
    })
  }, [year, month])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function pick(name: string) {
    if (picker) setShift(picker.dateStr, picker.turno, name)
    setPicker(null)
  }

  const pickerTurnoLabel = picker ? TURNOS.find(t => t.key === picker.turno)?.label : ''
  const pickerCurrent = picker ? getShiftEmployee(picker.dateStr, picker.turno) : ''

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium"
      >
        <ChevronLeft size={18} /> Pedidos Recepcion
      </button>

      <h2 className="text-xl font-bold text-navy-800 mb-4">Grilla de Turnos</h2>

      {/* Month selector */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-navy-100 text-navy-600">
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-bold text-navy-800 min-w-[180px] text-center">
          {MONTH_NAMES[month - 1]} {year}
        </span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-navy-100 text-navy-600">
          <ChevronRight size={20} />
        </button>
      </div>

      <p className="text-xs text-navy-400 mb-3 text-center">
        {isValentin
          ? 'Tocá una celda para cambiar quién hace ese turno.'
          : 'Solo lectura. Solo Valentin puede editar los turnos.'}
      </p>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-navy-50">
              <th className="text-left py-2 px-2 text-xs font-semibold text-navy-500 w-20">Dia</th>
              {TURNOS.map(t => (
                <th key={t.key} className="text-center py-2 px-1 text-xs font-semibold text-navy-500">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map(({ day, dateStr, dayName }) => {
              const isToday = dateStr === today
              return (
                <tr
                  key={day}
                  className={`border-b border-navy-50 ${isToday ? 'ring-2 ring-yellow-400 ring-inset bg-yellow-50/40' : ''}`}
                >
                  <td className="py-1.5 px-2">
                    <span className={`text-xs font-medium ${isToday ? 'text-yellow-700' : 'text-navy-500'}`}>
                      {day} {dayName}
                    </span>
                  </td>
                  {TURNOS.map(t => {
                    const emp = getShiftEmployee(dateStr, t.key)
                    const isOverride = emp !== DEFAULT_SHIFTS[t.key]
                    const color = NAME_COLORS[emp] ?? FALLBACK_COLOR
                    return (
                      <td key={t.key} className="text-center py-1.5 px-1">
                        <button
                          onClick={() => isValentin && setPicker({ dateStr, turno: t.key, day })}
                          disabled={!isValentin}
                          className={`w-full py-1.5 px-1 rounded-lg text-xs font-semibold border transition-all ${color} ${
                            isOverride ? 'ring-1 ring-offset-0' : 'opacity-90'
                          } ${isValentin ? 'hover:brightness-95 cursor-pointer active:scale-95' : 'cursor-default'}`}
                        >
                          {emp}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Picker */}
      {picker && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setPicker(null)}
        >
          <div
            className="bg-white w-full sm:w-80 rounded-t-2xl sm:rounded-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-navy-800">
                Día {picker.day} — {pickerTurnoLabel}
              </h3>
              <button onClick={() => setPicker(null)} className="p-1 rounded-lg hover:bg-navy-100">
                <X size={20} />
              </button>
            </div>
            <p className="text-xs text-navy-400 mb-4">¿Quién hace este turno?</p>

            <div className="space-y-1.5">
              {CONSERJES.map(name => {
                const isTitular = DEFAULT_SHIFTS[picker.turno] === name
                const isCurrent = pickerCurrent === name
                return (
                  <button
                    key={name}
                    onClick={() => pick(name)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      isCurrent
                        ? (NAME_COLORS[name] ?? 'bg-navy-100 text-navy-700 border-navy-300')
                        : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'
                    }`}
                  >
                    <span>
                      {name}
                      {isTitular && <span className="ml-1.5 text-[10px] font-medium text-navy-400">titular</span>}
                    </span>
                    {isCurrent && <Check size={16} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
