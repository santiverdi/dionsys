import { ExternalLink, MessageCircle, CalendarRange, BarChart3, Tag } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { LANDING_URL } from '../lib/landing'
import LandingLeads from '../components/LandingLeads'
import LandingMetricas from '../components/LandingMetricas'
import LandingTarifarioEditor from '../components/LandingTarifarioEditor'
import Tabs, { type TabDef } from '../components/Tabs'
import { useTabParam } from '../lib/useTabParam'
import AnalisisTarifa from './AnalisisTarifa'

const IDS = ['consultas', 'tarifario', 'metricas', 'analisis'] as const
type Tab = typeof IDS[number]

const TABS: TabDef<Tab>[] = [
  { id: 'consultas', label: 'Consultas', icon: MessageCircle },
  { id: 'tarifario', label: 'Tarifario público', icon: CalendarRange },
  { id: 'metricas', label: 'Métricas', icon: BarChart3 },
  { id: 'analisis', label: 'Análisis de tarifa', icon: Tag },
]

// La página web pública del hotel (repo aparte, deployada en Vercel) se maneja
// desde acá: qué tarifario muestra su calculador y qué consultas llegaron. El
// análisis de tarifa (antes en el Dashboard) vive acá porque decide el precio.
// Los conserjes entran solo a Consultas, para responder a quien no llegó a
// abrir WhatsApp; el tarifario, las métricas y el análisis quedan para admin.
export default function Landing() {
  const { employee } = useAuth()
  const esAdmin = employee?.role === 'admin'
  const [tabElegida, setTab] = useTabParam(IDS, 'consultas')
  const tab = esAdmin ? tabElegida : 'consultas'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold text-navy-800">{esAdmin ? 'Página web y tarifas' : 'Consultas web'}</h2>
        <a
          href={LANDING_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-navy-500 hover:text-navy-800"
        >
          Ver la landing <ExternalLink size={14} />
        </a>
      </div>
      <p className="text-sm text-navy-500 mb-4">
        {esAdmin
          ? 'Las consultas que llegan desde la página de reservas, el tarifario que muestra su calculador y si conviene subir o mantener la tarifa.'
          : 'Las consultas que llegan desde la página de reservas, para contestarle a quien no llegó a escribir por WhatsApp.'}
      </p>

      {esAdmin && <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-6" />}

      {tab === 'consultas' ? <LandingLeads admin={esAdmin} />
        : tab === 'tarifario' ? <LandingTarifarioEditor />
          : tab === 'metricas' ? <LandingMetricas />
            : <AnalisisTarifa />}
    </div>
  )
}
