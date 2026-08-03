import { useMemo, useState } from 'react'
import { Wallet, Scale, Sparkles, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import Panorama from './Panorama'
import Negocio from './Negocio'
import AnalisisMes from './AnalisisMes'
import { getCurrentMonth, getPreviousMonth, getNextMonth, monthLabel } from '../utils/dateRange'

type Tab = 'negocio' | 'analisis' | 'control'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'negocio', label: 'Negocio', icon: Scale },
  { id: 'analisis', label: 'Análisis', icon: Sparkles },
  { id: 'control', label: 'Caja & partes', icon: Wallet },
]

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('negocio')

  // El mes que se está mirando. Vive acá para que al cambiar de pestaña
  // (Negocio ↔ Análisis) se siga viendo el mismo mes.
  const actual = useMemo(() => getCurrentMonth(), [])
  const [{ year, month }, setMes] = useState(actual)
  const esMesActual = year === actual.year && month === actual.month
  // Panorama no está partido por mes (agrega todas las cajas y partes cargados).
  const mostrarSelector = tab !== 'control'

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-bold text-navy-800">Dashboard</h2>
        <div className="flex gap-1 bg-navy-100 rounded-xl p-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {mostrarSelector && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1 bg-white border border-navy-100 rounded-xl px-1 py-1">
            <button
              onClick={() => setMes(getPreviousMonth(year, month))}
              className="p-1.5 rounded-lg text-navy-500 hover:bg-navy-50"
              title="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="flex items-center gap-1.5 text-xs font-bold text-navy-800 capitalize px-1 min-w-[7.5rem] justify-center">
              <CalendarDays size={13} className="text-gold-600 shrink-0" /> {monthLabel(year, month)}
            </span>
            <button
              onClick={() => setMes(getNextMonth(year, month))}
              disabled={esMesActual}
              className={`p-1.5 rounded-lg ${esMesActual ? 'text-navy-200' : 'text-navy-500 hover:bg-navy-50'}`}
              title="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {!esMesActual && (
            <button
              onClick={() => setMes(actual)}
              className="px-3 py-2 rounded-xl border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50"
            >
              Volver al mes actual
            </button>
          )}
        </div>
      )}

      {tab === 'negocio'
        ? <Negocio year={year} month={month} />
        : tab === 'analisis'
          ? <AnalisisMes year={year} month={month} />
          : <Panorama />}
    </div>
  )
}
