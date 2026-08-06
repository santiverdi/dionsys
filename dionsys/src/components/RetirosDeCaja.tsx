// Retiros de efectivo por mes: plata que sale de la caja del conserje hacia la
// caja fuerte/oficina. NO es gasto — por eso vive aparte del desglose de gastos.
//
// Vive en su propio componente (y no adentro de Negocio) porque tiene estado
// propio: el acordeón del mes abierto.

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { RetirosDeCajaMesGrupo } from '../lib/negocio'
import { formatMontoCurrency } from '../utils/validators'

export default function RetirosDeCaja({ meses, mesKey }: { meses: RetirosDeCajaMesGrupo[]; mesKey: string }) {
  // Arranca abierto en el mes que se está mirando, y se reacomoda solo cuando
  // cambia el mes elegido (sin pisar lo que abra el usuario a mano).
  const [abierto, setAbierto] = useState<string | null>(mesKey)
  const [mesSeguido, setMesSeguido] = useState(mesKey)
  if (mesSeguido !== mesKey) {
    setMesSeguido(mesKey)
    setAbierto(mesKey)
  }

  if (meses.length === 0) {
    return <p className="text-xs text-navy-400">Sin retiros de efectivo cargados todavía.</p>
  }

  return (
    <>
      <div className="space-y-1.5">
        {meses.map(mes => {
          const open = abierto === mes.key
          return (
            <div key={mes.key} className="rounded-lg border border-navy-100 overflow-hidden">
              <button
                onClick={() => setAbierto(open ? null : mes.key)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-navy-50 hover:bg-navy-100 transition-colors"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-700">
                  {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {mes.label}
                  <span className="text-navy-400 font-normal">· {mes.items.length} retiro(s)</span>
                </span>
                <span className="text-sm font-bold text-navy-800 shrink-0">{formatMontoCurrency(mes.total)}</span>
              </button>
              {open && (
                <ul className="space-y-1 text-xs px-3 py-2">
                  {mes.items.map((g, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                      <span className="min-w-0 truncate text-navy-700">
                        {g.observacion}
                        <span className="text-navy-400"> · Caja {g.nroCaja}{g.conserje ? ` · ${g.conserje}` : ''}</span>
                      </span>
                      <span className="shrink-0 font-semibold text-navy-800">{formatMontoCurrency(g.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-navy-400 mt-2">
        El retiro no es un gasto: es plata del hotel que va a la caja fuerte/oficina.
      </p>
    </>
  )
}
