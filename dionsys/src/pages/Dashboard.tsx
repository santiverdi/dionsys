import { useState } from 'react'
import { Wallet, Scale } from 'lucide-react'
import Panorama from './Panorama'
import Negocio from './Negocio'

export default function Dashboard() {
  const [tab, setTab] = useState<'negocio' | 'control'>('negocio')

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3">
        <h2 className="text-xl font-bold text-navy-800">Dashboard</h2>
        <div className="flex gap-1 bg-navy-100 rounded-xl p-1">
          <button
            onClick={() => setTab('negocio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'negocio' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <Scale size={14} /> Negocio
          </button>
          <button
            onClick={() => setTab('control')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'control' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <Wallet size={14} /> Caja & partes
          </button>
        </div>
      </div>

      {tab === 'negocio' ? <Negocio /> : <Panorama />}
    </div>
  )
}
