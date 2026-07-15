import { useState } from 'react'
import { Wallet, Scale, Sparkles } from 'lucide-react'
import Panorama from './Panorama'
import Negocio from './Negocio'
import AnalisisMes from './AnalisisMes'

type Tab = 'negocio' | 'analisis' | 'control'

const TABS: { id: Tab; label: string; icon: typeof Wallet }[] = [
  { id: 'negocio', label: 'Negocio', icon: Scale },
  { id: 'analisis', label: 'Análisis', icon: Sparkles },
  { id: 'control', label: 'Caja & partes', icon: Wallet },
]

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('negocio')

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

      {tab === 'negocio' ? <Negocio /> : tab === 'analisis' ? <AnalisisMes /> : <Panorama />}
    </div>
  )
}
