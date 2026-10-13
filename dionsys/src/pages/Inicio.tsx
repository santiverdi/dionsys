import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Receipt, Truck, Globe, Wrench, Users, LayoutDashboard, KeyRound, ChevronRight, type LucideIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { useTarifas } from '../context/TarifasContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useTarifarioPublico } from '../lib/useTarifarioPublico'
import { usePendientesLibro } from '../lib/usePendientesLibro'
import AvisoLibroPendiente from '../components/AvisoLibroPendiente'
import { getImperfeccionesGlobal } from '../lib/panorama'
import { getCuentaCorriente, getIngresosMes } from '../lib/negocio'
import { fetchLeads, landingToken } from '../lib/landing'
import { getCurrentMonth, getNextMonth, monthLabel } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'

type Tono = 'rojo' | 'ambar' | 'azul' | 'verde'

interface Aviso { texto: string; tono: Tono }

const TONO_CLS: Record<Tono, string> = {
  rojo: 'bg-red-50 text-red-700 border-red-200',
  ambar: 'bg-amber-50 text-amber-800 border-amber-200',
  azul: 'bg-sky-50 text-sky-700 border-sky-200',
  verde: 'bg-green-50 text-green-700 border-green-200',
}

const DIAS_PROXIMOS = 7

function Tarjeta({ icon: Icon, titulo, hint, avisos, ok, to }: {
  icon: LucideIcon; titulo: string; hint: string; avisos: Aviso[]; ok?: string; to: string
}) {
  const navigate = useNavigate()
  const lista = avisos.length > 0 ? avisos : ok ? [{ texto: ok, tono: 'verde' as const }] : []
  return (
    <button
      onClick={() => navigate(to)}
      className="text-left bg-white rounded-xl border border-navy-100 p-4 hover:border-gold-400 hover:shadow-md transition-all flex flex-col group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-navy-50 text-navy-700 flex items-center justify-center shrink-0 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
          <Icon size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy-800 leading-tight">{titulo}</p>
          <p className="text-xs text-navy-400 truncate">{hint}</p>
        </div>
        <ChevronRight size={16} className="text-navy-300 group-hover:text-gold-600 shrink-0" />
      </div>
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {lista.map(a => (
            <span key={a.texto} className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${TONO_CLS[a.tono]}`}>{a.texto}</span>
          ))}
        </div>
      )}
    </button>
  )
}

function saludo(h: number): string {
  return h < 12 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`
}

// La portada del admin: una tarjeta por sección con lo que necesita atención.
// Así quien entra por primera vez sabe adónde ir sin recorrer todo el menú.
export default function Inicio() {
  const { employee } = useAuth()
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const { tarifas } = useTarifas()
  const tarifarioWeb = useTarifarioPublico()
  const { getVencimientosMes } = useImpuestos()
  const { orders } = useOrders()
  const { pedidos } = useStock()
  const { tasks } = useMaintenance()
  // Plata del libro de Administración sin decidir (de todos los meses).
  const libro = usePendientesLibro()

  const mes = useMemo(() => getCurrentMonth(), [])

  // Solo lo de la última semana: lo viejo ya se revisó (o se ve en Cajas).
  const imperf = useMemo(() => {
    const desde = new Date()
    desde.setDate(desde.getDate() - DIAS_PROXIMOS)
    return getImperfeccionesGlobal(cajas, partes, tarifas, tarifarioWeb, desde)
  }, [cajas, partes, tarifas, tarifarioWeb])

  // Impuestos: vencidos sin pagar este mes y los que vencen en los próximos días
  // (mirando también el mes que viene si estamos a fin de mes).
  const impuestos = useMemo(() => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    const limite = new Date(hoy.getTime() + DIAS_PROXIMOS * 86_400_000)
    let vencidos = 0
    let proximos = 0
    const sig = getNextMonth(mes.year, mes.month)
    for (const { year, month } of [mes, sig]) {
      for (const { dia, servicios } of getVencimientosMes(year, month)) {
        const fecha = new Date(year, month - 1, dia)
        for (const s of servicios) {
          if (s.pagado) continue
          if (fecha < hoy) vencidos++
          else if (fecha <= limite) proximos++
        }
      }
    }
    return { vencidos, proximos }
  }, [getVencimientosMes, mes])

  const cc = useMemo(() => getCuentaCorriente(orders, pedidos), [orders, pedidos])
  const ccVencidas = cc.items.filter(d => d.diasParaVto != null && d.diasParaVto < 0).length
  const ccProximas = cc.items.filter(d => d.diasParaVto != null && d.diasParaVto >= 0 && d.diasParaVto <= DIAS_PROXIMOS).length

  const tareasPendientes = tasks.filter(t => t.status === 'pendiente' || t.status === 'en_progreso').length
  const ingresos = useMemo(() => getIngresosMes(mes.year, mes.month, cajas), [mes, cajas])

  // Consultas de la web de los últimos 7 días (viene de la landing, puede fallar).
  const [consultas, setConsultas] = useState<number | null>(null)
  useEffect(() => {
    let activo = true
    void fetchLeads(landingToken()).then(r => {
      if (!activo || r.error) return
      const desde = Date.now() - DIAS_PROXIMOS * 86_400_000
      setConsultas(r.leads.filter(l => l.created_at && new Date(l.created_at).getTime() >= desde).length)
    })
    return () => { activo = false }
  }, [])

  const avisosCajas: Aviso[] = []
  if (imperf.descuadres) avisosCajas.push({ texto: plural(imperf.descuadres, 'descuadre', 'descuadres'), tono: 'rojo' })
  if (imperf.huecos) avisosCajas.push({ texto: plural(imperf.huecos, 'caja salteada', 'cajas salteadas'), tono: 'rojo' })
  if (imperf.checkoutsSinCobro) avisosCajas.push({ texto: plural(imperf.checkoutsSinCobro, 'check-out sin cobro', 'check-outs sin cobro'), tono: 'rojo' })
  if (libro.cantSinDecidir) avisosCajas.push({ texto: `${formatMontoCurrency(libro.totalSinDecidir)} del libro sin decidir`, tono: 'ambar' })
  if (imperf.cajasSinCerrar) avisosCajas.push({ texto: plural(imperf.cajasSinCerrar, 'caja sin cerrar', 'cajas sin cerrar'), tono: 'ambar' })

  const avisosImpuestos: Aviso[] = []
  if (impuestos.vencidos) avisosImpuestos.push({ texto: plural(impuestos.vencidos, 'vencido sin pagar', 'vencidos sin pagar'), tono: 'rojo' })
  if (impuestos.proximos) avisosImpuestos.push({ texto: `${impuestos.proximos} vence${impuestos.proximos === 1 ? '' : 'n'} esta semana`, tono: 'ambar' })

  const avisosProv: Aviso[] = []
  if (ccVencidas) avisosProv.push({ texto: plural(ccVencidas, 'factura vencida', 'facturas vencidas'), tono: 'rojo' })
  if (ccProximas) avisosProv.push({ texto: `${ccProximas} vence${ccProximas === 1 ? '' : 'n'} esta semana`, tono: 'ambar' })

  const avisosWeb: Aviso[] = consultas ? [{ texto: plural(consultas, 'consulta esta semana', 'consultas esta semana'), tono: 'azul' }] : []
  const avisosMant: Aviso[] = tareasPendientes ? [{ texto: plural(tareasPendientes, 'tarea pendiente', 'tareas pendientes'), tono: 'ambar' }] : []

  const hayAlgo = libro.cantSinDecidir > 0 || avisosCajas.length + avisosImpuestos.length + avisosProv.length + avisosMant.length > 0

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800">{saludo(new Date().getHours())}, {employee?.name}</h2>
      <p className="text-sm text-navy-500 mb-6">
        {hayAlgo ? 'Esto es lo que necesita tu atención. Tocá una tarjeta para ir a esa sección.' : 'Está todo al día. Tocá una tarjeta para ir a esa sección.'}
      </p>

      <AvisoLibroPendiente />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Tarjeta icon={Wallet} titulo="Cajas" hint="Últimos 7 días · turnos, partes y caja de Administración"
          avisos={avisosCajas} ok="Sin problemas" to="/cajas" />
        <Tarjeta icon={Receipt} titulo="Impuestos y servicios" hint="Vencimientos y pagos del mes"
          avisos={avisosImpuestos} ok="Nada por vencer" to="/impuestos" />
        <Tarjeta icon={Truck} titulo="Proveedores" hint="Pedido semanal, facturas y cuenta corriente"
          avisos={avisosProv} ok={cc.items.length ? `${formatMontoCurrency(cc.totalPendiente)} en cuenta corriente` : 'Sin deudas'}
          to={ccVencidas || ccProximas ? '/proveedores?tab=facturas&vista=cuentacorriente' : '/proveedores'} />
        <Tarjeta icon={Globe} titulo="Página web y tarifas" hint="Consultas, tarifario público y análisis de tarifa"
          avisos={avisosWeb} to="/web" />
        <Tarjeta icon={Wrench} titulo="Mantenimiento" hint="Arreglos y tareas del hotel"
          avisos={avisosMant} ok="Todo al día" to="/mantenimiento" />
        <Tarjeta icon={Users} titulo="Sueldos" hint="Nómina, adelantos, aguinaldos y recibos"
          avisos={[]} to="/sueldos" />
        <Tarjeta icon={LayoutDashboard} titulo="Dashboard" hint={`Resultado, gastos y análisis de ${monthLabel(mes.year, mes.month)}`}
          avisos={ingresos.total > 0 ? [{ texto: `${formatMontoCurrency(ingresos.total)} cobrados este mes`, tono: 'verde' }] : []}
          to="/dashboard" />
        <Tarjeta icon={KeyRound} titulo="Usuarios" hint="Quiénes entran, con qué rol y con qué PIN"
          avisos={[]} to="/usuarios" />
      </div>
    </div>
  )
}
