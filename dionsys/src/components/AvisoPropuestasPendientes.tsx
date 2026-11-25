import { useNavigate } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEsDuenoTarifas } from '../lib/permisosTarifa'
import { textoPendientes, textoUltima, useResumenPendientes } from '../lib/propuestas'

// Arriba de todo en Inicio, SOLO para el dueño (mismo permiso que la bandeja de
// Propuestas, verificado en el servidor): cuántas propuestas de tarifa de los
// conserjes esperan respuesta y cuál es la más reciente. Discreto a propósito:
// el contador rojo ya está en el menú. Se actualiza solo cada 2 minutos.

export default function AvisoPropuestasPendientes() {
  const navigate = useNavigate()
  const { employee } = useAuth()
  const esDueno = useEsDuenoTarifas(employee)
  const { cantidad, ultima } = useResumenPendientes(employee, esDueno)

  if (!esDueno || cantidad === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 p-3 mb-4" role="status">
      <Inbox size={18} className="shrink-0 text-sky-700" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{textoPendientes(cantidad)}</p>
        {ultima && <p className="text-xs text-sky-800">{textoUltima(ultima)}</p>}
      </div>
      <button
        onClick={() => navigate('/propuestas')}
        className="px-3 py-1.5 rounded-lg bg-white border border-sky-300 text-sky-800 text-sm font-medium hover:bg-sky-100"
      >
        Revisar
      </button>
    </div>
  )
}
