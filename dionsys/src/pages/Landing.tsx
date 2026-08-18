import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { LANDING_URL } from '../lib/landing'
import LandingLeads from '../components/LandingLeads'
import LandingMetricas from '../components/LandingMetricas'
import LandingTarifarioEditor from '../components/LandingTarifarioEditor'

// La página web pública del hotel (repo aparte, deployada en Vercel) se maneja
// desde acá: qué tarifario muestra su calculador y qué consultas llegaron.
export default function Landing() {
  const [tab, setTab] = useState<'consultas' | 'tarifario' | 'metricas'>('consultas')

  const tabCls = (activa: boolean) =>
    `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
      activa ? 'bg-navy-800 text-cream' : 'bg-white text-navy-600 border border-navy-200 hover:bg-navy-50'
    }`

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold text-navy-800">Página web</h2>
        <a
          href={LANDING_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800"
        >
          Ver la landing <ExternalLink size={14} />
        </a>
      </div>
      <p className="text-sm text-navy-500 mb-4">
        Las consultas que llegan desde la página de reservas y el tarifario que muestra su calculador.
      </p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('consultas')} className={tabCls(tab === 'consultas')}>Consultas</button>
        <button onClick={() => setTab('tarifario')} className={tabCls(tab === 'tarifario')}>Tarifario público</button>
        <button onClick={() => setTab('metricas')} className={tabCls(tab === 'metricas')}>Métricas</button>
      </div>

      {tab === 'consultas' ? <LandingLeads /> : tab === 'tarifario' ? <LandingTarifarioEditor /> : <LandingMetricas />}
    </div>
  )
}
