import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { cargarCambiosDeLaNoche, textoCambioNoche, type CambioNoche } from '../lib/historialTarifas'

// Registro de UNA noche del calendario de Tarifas: todos los cambios de precio
// (o de mínimo de noches) que tuvo esa fecha, del más nuevo al más viejo. Sale
// del historial de tarifas (tabla tarifas_historial), que anota qué noches
// tocó cada guardado.

const fechaHora = (s: string) => new Date(s).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

export default function HistorialNoche({ fecha, vuelta = 0 }: { fecha: string; vuelta?: number }) {
  const [estado, setEstado] = useState<{ fecha: string; cambios: CambioNoche[]; error: string | null } | null>(null)

  useEffect(() => {
    let activo = true
    void cargarCambiosDeLaNoche(fecha).then(r => { if (activo) setEstado({ fecha, ...r }) })
    return () => { activo = false }
  }, [fecha, vuelta])

  const listo = estado?.fecha === fecha ? estado : null

  return (
    <div className="mt-3 p-4 bg-white rounded-xl border border-navy-100">
      <p className="text-sm font-bold text-navy-800 flex items-center gap-1.5 mb-2">
        <History size={15} /> Cambios de precio del {dm(fecha)}
      </p>
      {!listo ? (
        <p className="text-xs text-navy-400">Cargando…</p>
      ) : listo.error ? (
        <p className="text-xs text-red-600">{listo.error}</p>
      ) : listo.cambios.length === 0 ? (
        <p className="text-xs text-navy-500">
          Esta noche no se cambió a mano: tiene el precio de la página de reservas.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto pr-1 space-y-1.5">
          {listo.cambios.map((c, i) => (
            <li key={c.id} className={`rounded-lg px-2.5 py-1.5 text-xs ${i === 0 ? 'bg-gold-50 border border-gold-200' : 'bg-navy-50/60'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className="font-semibold text-navy-800">{textoCambioNoche(c.antes, c.despues)}</span>
                <span className="text-navy-400 whitespace-nowrap">{fechaHora(c.creado_en)}</span>
              </div>
              <p className="text-navy-500 mt-0.5">
                {c.autor_nombre} · cambio #{c.id}
                {i === 0 ? ' · el que vale hoy' : ''}
                {c.revierte_id ? ` · deshace el #${c.revierte_id}` : ''}
                {c.motivo && !c.revierte_id ? ` · ${c.motivo}` : ''}
                {!c.despues ? ' · vuelve al precio de la página' : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-navy-400 mt-2">pp = por persona por noche. Solo figuran los cambios desde que existe el historial de tarifas.</p>
    </div>
  )
}
