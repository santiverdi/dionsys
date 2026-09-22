import { useNavigate } from 'react-router-dom'
import { ClipboardList, Receipt, FileText, Wallet, Users, Landmark, Globe, KeyRound } from 'lucide-react'
import AvisoLibroPendiente from '../components/AvisoLibroPendiente'
import { usePendientesLibro } from '../lib/usePendientesLibro'
import { formatMontoCurrency } from '../utils/validators'

export default function Administracion() {
  const navigate = useNavigate()
  // La plata del libro sin decidir de TODOS los meses: acá es donde se entra
  // todos los días, así que un mes viejo sin resolver no se archiva solo.
  const pendientes = usePendientesLibro()

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-2">Administracion</h2>
      <p className="text-sm text-navy-500 mb-6">Pedidos a proveedores, impuestos y servicios.</p>

      <AvisoLibroPendiente />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <button
          onClick={() => navigate('/pedidos-admin')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <ClipboardList size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Proveedores</h3>
          <p className="text-sm text-navy-500 mt-1">El pedido semanal que arma el conserje, para enviar a cada distribuidora y cargar montos.</p>
        </button>

        <button
          onClick={() => navigate('/facturas-proveedores')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <FileText size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Facturas de Proveedores</h3>
          <p className="text-sm text-navy-500 mt-1">Cargá la factura (A/C) de cada distribuidora al recibir y mirá el gasto por mes.</p>
        </button>

        <button
          onClick={() => navigate('/control-caja')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Wallet size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Control de Caja</h3>
          <p className="text-sm text-navy-500 mt-1">Importá el Excel de caja de cada turno y revisá los descuadres y cobros sin Factura B.</p>
        </button>

        <button
          onClick={() => navigate('/caja-admin')}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group bg-white hover:border-gold-400 hover:shadow-md ${
            pendientes.cantSinDecidir > 0 ? 'border-amber-300' : 'border-navy-100'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Landmark size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Caja de Administración</h3>
          <p className="text-sm text-navy-500 mt-1">La plata que se mueve fuera de la caja del conserje: subí la planilla y mirá el saldo en efectivo, tarjetas y banco.</p>
          {pendientes.cantSinDecidir > 0 && (
            <p className="text-xs font-semibold text-amber-700 mt-2">
              {formatMontoCurrency(pendientes.totalSinDecidir)} sin decidir
              {' '}({pendientes.cantSinDecidir} pago{pendientes.cantSinDecidir === 1 ? '' : 's'})
            </p>
          )}
        </button>

        <button
          onClick={() => navigate('/impuestos')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Receipt size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Impuestos y Servicios</h3>
          <p className="text-sm text-navy-500 mt-1">Vencimientos, pagos y facturas de impuestos y servicios.</p>
        </button>

        <button
          onClick={() => navigate('/sueldos')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Users size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Sueldos</h3>
          <p className="text-sm text-navy-500 mt-1">Nómina del personal, sueldos, adelantos y aguinaldos por mes, con recibo adjunto.</p>
        </button>

        <button
          onClick={() => navigate('/landing')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Globe size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Página web</h3>
          <p className="text-sm text-navy-500 mt-1">La landing de reservas: publicá el tarifario del calculador y mirá las consultas que llegan con nombre y WhatsApp.</p>
        </button>

        <button
          onClick={() => navigate('/usuarios')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <KeyRound size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Usuarios</h3>
          <p className="text-sm text-navy-500 mt-1">Quiénes entran al sistema, con qué rol y con qué PIN de acceso.</p>
        </button>
      </div>
    </div>
  )
}
