import { ClipboardList, FileText } from 'lucide-react'
import Tabs, { type TabDef } from '../components/Tabs'
import { useTabParam } from '../lib/useTabParam'
import PedidosAdmin from './PedidosAdmin'
import Facturas from './Facturas'

// Proveedores en un solo lugar: el pedido semanal para mandar a cada
// distribuidora y las facturas que llegan con la mercadería.
const IDS = ['pedidos', 'facturas'] as const
type Tab = typeof IDS[number]

const TABS: TabDef<Tab>[] = [
  { id: 'pedidos', label: 'Pedido semanal', icon: ClipboardList },
  { id: 'facturas', label: 'Facturas', icon: FileText },
]

export default function Proveedores() {
  const [tab, setTab] = useTabParam(IDS, 'pedidos')

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} full />
      {tab === 'pedidos' ? <PedidosAdmin /> : <Facturas />}
    </div>
  )
}
