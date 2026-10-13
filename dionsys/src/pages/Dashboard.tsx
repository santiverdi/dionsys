import { useMemo, useState } from 'react'
import {
  Sparkles, ChevronLeft, ChevronRight, CalendarDays, LayoutGrid, Banknote,
  ArrowUpCircle, Receipt, BedDouble, Croissant, Users, Truck,
} from 'lucide-react'
import Negocio, { type NegocioTab } from './Negocio'
import AnalisisMes from './AnalisisMes'
import Tabs, { type TabDef } from '../components/Tabs'
import { useTabParam } from '../lib/useTabParam'
import { getCurrentMonth, getPreviousMonth, getNextMonth, monthLabel } from '../utils/dateRange'

// Un solo nivel de pestañas: los temas del mes + el análisis con IA. La caja y
// los partes se mudaron a Plata › Cajas, y el análisis de tarifa a Ventas.
type Tab = NegocioTab | 'analisis'

const TABS: TabDef<Tab>[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutGrid },
  { id: 'ingresos', label: 'Ingresos', icon: Banknote },
  { id: 'egresos', label: 'Egresos', icon: ArrowUpCircle },
  { id: 'caja', label: 'Gastos de caja', icon: Receipt },
  { id: 'habitaciones', label: 'Habitaciones', icon: BedDouble },
  { id: 'desayuno', label: 'Desayuno', icon: Croissant },
  { id: 'grupos', label: 'Grupos', icon: Users },
  { id: 'proveedores', label: 'Deuda con proveedores', icon: Truck },
  { id: 'analisis', label: 'Análisis IA', icon: Sparkles },
]
const IDS = TABS.map(t => t.id)

export default function Dashboard() {
  const [tab, setTab] = useTabParam<Tab>(IDS, 'resumen')

  // El mes que se está mirando. Vive acá para que al cambiar de pestaña
  // se siga viendo el mismo mes.
  const actual = useMemo(() => getCurrentMonth(), [])
  const [{ year, month }, setMes] = useState(actual)
  const esMesActual = year === actual.year && month === actual.month

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-bold text-navy-800">Dashboard</h2>
        <div className="flex items-center gap-2">
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
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'analisis'
        ? <AnalisisMes year={year} month={month} />
        : <Negocio year={year} month={month} tab={tab} setTab={setTab} />}
    </div>
  )
}
