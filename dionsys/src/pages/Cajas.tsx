import { LayoutList, Wallet, Landmark } from 'lucide-react'
import Tabs, { type TabDef } from '../components/Tabs'
import { useTabParam } from '../lib/useTabParam'
import Panorama from './Panorama'
import ControlCaja from './ControlCaja'
import CajaAdmin from './CajaAdmin'

// Todo lo de caja en un solo lugar: las cajas de cada turno, el resumen de
// cajas y partes (antes en el Dashboard; es pesado, por eso no es la pestaña
// por defecto) y la caja de Administración.
const IDS = ['turnos', 'resumen', 'administracion'] as const
type Tab = typeof IDS[number]

const TABS: TabDef<Tab>[] = [
  { id: 'turnos', label: 'Cajas de turno', icon: Wallet },
  { id: 'resumen', label: 'Resumen y alertas', icon: LayoutList },
  { id: 'administracion', label: 'Caja de Administración', icon: Landmark },
]

export default function Cajas() {
  const [tab, setTab] = useTabParam(IDS, 'turnos')

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'turnos' ? <ControlCaja /> : tab === 'resumen' ? <Panorama /> : <CajaAdmin />}
    </div>
  )
}
