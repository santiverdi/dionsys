import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useOccupancy, type Turno } from '../context/OccupancyContext'

// Compartido con CierreTurnoReminder (mismos horarios de turno: 7/15/23 hs).
export function minutesUntilTurnoEnd(turno: Turno, now: Date): number {
  const h = now.getHours()
  const m = now.getMinutes()
  const nowMin = h * 60 + m

  let endMin: number
  if (turno === 'manana') endMin = 15 * 60
  else if (turno === 'tarde') endMin = 23 * 60
  else {
    // noche: ends at 7am — if we're past 23, end is tomorrow's 7am
    endMin = h >= 23 ? (24 + 7) * 60 : 7 * 60
  }
  return endMin - nowMin
}

const REMINDER_THRESHOLD_MIN = 30
const DISMISS_KEY = 'dionsys_occupancy_reminder_dismissed'

function getDismissedKey(turno: Turno, date: string): string {
  return `${date}-${turno}`
}

export default function OccupancyReminder() {
  const { currentTurno, getTodayByTurno } = useOccupancy()
  const location = useLocation()
  const [now, setNow] = useState(() => new Date())
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')
    } catch {
      return []
    }
  })

  // Re-check every minute
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const remaining = minutesUntilTurnoEnd(currentTurno, now)
  const isWithinReminder = remaining > 0 && remaining <= REMINDER_THRESHOLD_MIN
  const turnoRecord = getTodayByTurno(currentTurno)

  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dismissedKey = getDismissedKey(currentTurno, dateStr)
  const isDismissed = dismissed.includes(dismissedKey)

  // Don't show on occupancy page itself (avoid noise)
  const onOccupancyPage = location.pathname === '/recepcion'

  if (!isWithinReminder || turnoRecord || isDismissed || onOccupancyPage) return null

  function handleDismiss() {
    const updated = [...dismissed, dismissedKey]
    setDismissed(updated)
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(updated))
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Bell size={18} className="text-amber-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Tu turno termina en {remaining} min
          </p>
          <p className="text-xs text-amber-700">
            Cargá la ocupación del turno antes de cerrar.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link
          to="/recepcion"
          className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
        >
          Cargar
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-amber-100 rounded-lg"
          title="Ocultar este recordatorio"
        >
          <X size={14} className="text-amber-700" />
        </button>
      </div>
    </div>
  )
}
