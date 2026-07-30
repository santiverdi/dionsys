// "Anoche durmieron N" sacado del parte del turno noche, para no tener que
// cargar los huéspedes a mano. Ver src/lib/desayuno.ts para la regla y sus
// límites (es una medición de la noche que pasó, no una previsión).

import { useMemo } from 'react'
import { Moon, AlertTriangle } from 'lucide-react'
import { usePartes } from '../context/ParteContext'
import { ultimaNoche, diasDeAntiguedad, serieDesayuno } from '../lib/desayuno'

function fmtFecha(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + 'T12:00:00')
  return isNaN(d.getTime()) ? yyyyMmDd : d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

export default function SugerenciaDesayuno({ onUsar }: { onUsar: (huespedes: number) => void }) {
  const { partes } = usePartes()
  const ultima = useMemo(() => ultimaNoche(partes), [partes])
  const serie = useMemo(() => serieDesayuno(partes, 5), [partes])

  if (!ultima) {
    return (
      <p className="text-xs text-navy-500 bg-navy-50 border border-navy-100 rounded-lg p-2.5 mb-3">
        Cuando el conserje de la noche suba su parte, acá va a aparecer cuánta gente durmió,
        para no tener que contarla a mano.
      </p>
    )
  }

  const dias = diasDeAntiguedad(ultima)
  const viejo = dias > 1

  return (
    <div className={`rounded-xl border p-3 mb-3 ${viejo ? 'border-amber-200 bg-amber-50' : 'border-navy-100 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-navy-500 flex items-center gap-1.5">
            <Moon size={12} /> Según el parte de la noche
          </p>
          <p className="text-2xl font-bold text-navy-800 leading-tight">
            {ultima.huespedes} <span className="text-sm font-semibold text-navy-500">huéspedes</span>
          </p>
          <p className="text-[11px] text-navy-400">
            Durmieron la noche del {fmtFecha(ultima.fecha)} en {ultima.habitaciones} habitaciones
            {ultima.conserje ? ` · lo cargó ${ultima.conserje}` : ''} a las {ultima.cargadoA}
          </p>
        </div>
        <button
          onClick={() => onUsar(ultima.huespedes)}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-semibold hover:bg-navy-700"
        >
          Usar {ultima.huespedes}
        </button>
      </div>

      {viejo && (
        <p className="text-[11px] text-amber-800 mt-2 flex gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          Es de hace {dias} días: falta cargar los partes de las noches siguientes. Confirmá el número antes de pedir.
        </p>
      )}

      {serie.length > 1 && (
        <div className="flex items-end gap-1.5 mt-2 pt-2 border-t border-navy-50">
          {[...serie].reverse().map(d => {
            const max = Math.max(...serie.map(x => x.huespedes), 1)
            return (
              <div key={d.fecha} className="flex-1 text-center">
                <div className="h-8 flex items-end justify-center">
                  <div
                    className="w-full rounded-t bg-navy-200"
                    style={{ height: `${Math.max(8, (d.huespedes / max) * 100)}%` }}
                    title={`${d.fecha}: ${d.huespedes} huéspedes`}
                  />
                </div>
                <p className="text-[9px] text-navy-400 mt-0.5">{d.huespedes}</p>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-navy-400 mt-2">
        Es la gente que ya durmió, no una previsión: si sabés que entra o sale un grupo, ajustá el número.
      </p>
    </div>
  )
}
