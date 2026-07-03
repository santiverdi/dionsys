import { useEffect, useState } from 'react'
import { ClipboardCheck, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOccupancy, type Turno } from '../context/OccupancyContext'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { minutesUntilTurnoEnd } from './OccupancyReminder'

// Inicio del turno actual en ms (los turnos arrancan a las 7/15/23 hs). Sirve
// para saber si el conserje ya cargó SU caja y SU parte dentro de este turno:
// cualquier import propio posterior al inicio del turno cuenta.
function turnoStartMs(turno: Turno, now: Date): number {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  if (turno === 'manana') d.setHours(7)
  else if (turno === 'tarde') d.setHours(15)
  else {
    d.setHours(23)
    if (now.getHours() < 7) d.setDate(d.getDate() - 1)
  }
  return d.getTime()
}

const REMINDER_THRESHOLD_MIN = 45
const DISMISS_KEY = 'dionsys_cierre_reminder_dismissed'

/**
 * Recordatorio de cierre de turno: si faltan ≤45 min para que termine el turno
 * y el conserje todavía no subió su caja o su parte, se lo avisa en toda la app.
 * Complementa el bloqueo de numeración: aquel evita saltear números, este evita
 * que el turno se vaya sin cargar nada (el hueco "en la cola").
 */
export default function CierreTurnoReminder() {
  const { employee } = useAuth()
  const { currentTurno } = useOccupancy()
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const location = useLocation()
  const [now, setNow] = useState(() => new Date())
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')
    } catch {
      return []
    }
  })

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const remaining = minutesUntilTurnoEnd(currentTurno, now)
  const isWithinReminder = remaining > 0 && remaining <= REMINDER_THRESHOLD_MIN

  const inicio = turnoStartMs(currentTurno, now)
  const mio = (importedBy: string, importedAt: string) =>
    importedBy === employee?.name && new Date(importedAt).getTime() >= inicio
  const cajaOk = cajas.some(c => mio(c.importedBy, c.importedAt))
  const parteOk = partes.some(p => mio(p.importedBy, p.importedAt))

  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dismissedKey = `${dateStr}-${currentTurno}`
  const isDismissed = dismissed.includes(dismissedKey)
  const onCierrePage = location.pathname === '/cerrar-turno'

  if (!isWithinReminder || (cajaOk && parteOk) || isDismissed || onCierrePage || !employee) return null

  const falta = !cajaOk && !parteOk ? 'la caja y el parte' : !cajaOk ? 'la caja' : 'el parte'

  function handleDismiss() {
    const updated = [...dismissed, dismissedKey]
    setDismissed(updated)
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify(updated))
  }

  return (
    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-3 mb-4 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <ClipboardCheck size={18} className="text-red-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-900">
            Tu turno termina en {remaining} min y falta cargar {falta}
          </p>
          <p className="text-xs text-red-700">
            No te podés ir sin rendir el turno. Subilo antes de cerrar.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Link
          to="/cerrar-turno"
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
        >
          Cargar
        </Link>
        <button
          onClick={handleDismiss}
          className="p-1.5 hover:bg-red-100 rounded-lg"
          title="Ocultar este recordatorio"
        >
          <X size={14} className="text-red-700" />
        </button>
      </div>
    </div>
  )
}
