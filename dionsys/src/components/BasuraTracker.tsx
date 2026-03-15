import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2, CheckCircle2, Clock, Bell } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface BasuraRecord {
  date: string
  completedAt: string
  completedBy: string
}

const STORAGE_KEY = 'dionsys_basura'

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function getStoredRecords(): BasuraRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveRecords(records: BasuraRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

export default function BasuraTracker({ onBack }: { onBack: () => void }) {
  const { employee } = useAuth()
  const [records, setRecords] = useState<BasuraRecord[]>(getStoredRecords)
  const [showAlert, setShowAlert] = useState(false)

  const today = getTodayKey()
  const todayRecord = records.find(r => r.date === today)
  const isDoneToday = !!todayRecord

  // Check if it's 6 PM or later and not done
  useEffect(() => {
    function checkTime() {
      const now = new Date()
      if (now.getHours() >= 18 && !isDoneToday) {
        setShowAlert(true)
      } else if (isDoneToday) {
        setShowAlert(false)
      }
    }
    checkTime()
    const interval = setInterval(checkTime, 60_000)
    return () => clearInterval(interval)
  }, [isDoneToday])

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Schedule browser notification at 6 PM
  useEffect(() => {
    const now = new Date()
    const target = new Date()
    target.setHours(18, 0, 0, 0)

    if (now >= target || isDoneToday) return

    const delay = target.getTime() - now.getTime()
    const timeout = setTimeout(() => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Basura - DionSys', {
          body: 'Son las 18:00. Hora de sacar la basura!',
        })
      }
      setShowAlert(true)
    }, delay)

    return () => clearTimeout(timeout)
  }, [isDoneToday])

  const handleToggle = useCallback(() => {
    if (isDoneToday) {
      const updated = records.filter(r => r.date !== today)
      setRecords(updated)
      saveRecords(updated)
    } else {
      const newRecord: BasuraRecord = {
        date: today,
        completedAt: new Date().toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        completedBy: employee?.name ?? 'Desconocido',
      }
      const updated = [...records, newRecord]
      setRecords(updated)
      saveRecords(updated)
      setShowAlert(false)
    }
  }, [isDoneToday, records, today, employee])

  // Last 7 days history
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const record = records.find(r => r.date === key)
    return {
      date: key,
      label:
        i === 0
          ? 'Hoy'
          : i === 1
            ? 'Ayer'
            : d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' }),
      done: !!record,
      time: record?.completedAt,
      by: record?.completedBy,
    }
  })

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4 transition-colors"
      >
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">Volver</span>
      </button>

      <h2 className="text-xl font-bold text-navy-800 mb-1">Basura</h2>
      <p className="text-sm text-navy-500 mb-6">
        Control diario — Sacar la basura todos los dias a las 18:00hs
      </p>

      {/* Alert banner */}
      {showAlert && !isDoneToday && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3 animate-pulse">
          <Bell size={24} className="text-red-500 shrink-0" />
          <div>
            <p className="font-bold text-red-700">Hora de sacar la basura!</p>
            <p className="text-sm text-red-600">
              Son las 18:00 o mas. Marca el check cuando este hecho.
            </p>
          </div>
        </div>
      )}

      {/* Today's card */}
      <div
        onClick={handleToggle}
        className={`cursor-pointer rounded-xl p-6 shadow-sm border-2 transition-all mb-6 ${
          isDoneToday
            ? 'bg-green-50 border-green-300'
            : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                isDoneToday ? 'bg-green-200 text-green-700' : 'bg-red-100 text-red-500'
              }`}
            >
              {isDoneToday ? <CheckCircle2 size={28} /> : <Trash2 size={28} />}
            </div>
            <div>
              <h3 className="font-bold text-lg text-navy-800">
                {isDoneToday ? 'Basura sacada!' : 'Sacar la basura'}
              </h3>
              <p className="text-sm text-navy-500">
                {isDoneToday
                  ? `Completado a las ${todayRecord?.completedAt} por ${todayRecord?.completedBy}`
                  : 'Toca para marcar como hecho'}
              </p>
            </div>
          </div>

          <div
            className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all ${
              isDoneToday
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-navy-300 hover:border-gold-400'
            }`}
          >
            {isDoneToday && <CheckCircle2 size={20} />}
          </div>
        </div>
      </div>

      {/* History - last 7 days */}
      <h3 className="text-sm font-bold text-navy-700 mb-3 uppercase tracking-wide">
        Ultimos 7 dias
      </h3>
      <div className="space-y-2">
        {last7Days.map(day => (
          <div
            key={day.date}
            className={`flex items-center justify-between px-4 py-3 rounded-lg ${
              day.done ? 'bg-green-50' : 'bg-red-50'
            }`}
          >
            <div className="flex items-center gap-3">
              {day.done ? (
                <CheckCircle2 size={18} className="text-green-500" />
              ) : (
                <Clock size={18} className="text-red-400" />
              )}
              <span className="text-sm font-medium text-navy-700">{day.label}</span>
              <span className="text-xs text-navy-400">{day.date}</span>
            </div>
            <span
              className={`text-xs font-medium ${day.done ? 'text-green-600' : 'text-red-500'}`}
            >
              {day.done ? `${day.time} — ${day.by}` : 'No registrado'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
