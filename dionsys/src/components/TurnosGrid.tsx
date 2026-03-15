import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTurnos } from '../context/TurnosContext'
import type { Turno } from '../context/TurnosContext'

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

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TurnosGrid({ onBack }: Props) {
  const { employee } = useAuth()
  const { getShiftEmployee, toggleOverride } = useTurnos()
  const isValentin = employee?.name === 'Valentin'

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-based

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

  function handleCellClick(dateStr: string, turno: Turno) {
    if (!isValentin) return
    toggleOverride(dateStr, turno)
  }

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

      {!isValentin && (
        <p className="text-xs text-navy-400 mb-3 text-center">Solo lectura. Solo Valentin puede editar turnos.</p>
      )}

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
                    const isOverride = emp === 'Valentin'
                    return (
                      <td key={t.key} className="text-center py-1.5 px-1">
                        <button
                          onClick={() => handleCellClick(dateStr, t.key)}
                          disabled={!isValentin}
                          className={`w-full py-1.5 px-1 rounded-lg text-xs font-medium transition-all ${
                            isOverride
                              ? 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-300'
                              : 'bg-white text-navy-400 border border-navy-100'
                          } ${isValentin ? 'hover:bg-indigo-50 cursor-pointer active:scale-95' : 'cursor-default'}`}
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
    </div>
  )
}
