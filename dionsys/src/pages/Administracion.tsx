import { useNavigate } from 'react-router-dom'
import { ClipboardList, Receipt } from 'lucide-react'

export default function Administracion() {
  const navigate = useNavigate()

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-2">Administracion</h2>
      <p className="text-sm text-navy-500 mb-6">Pedidos a proveedores, impuestos y servicios.</p>

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
          onClick={() => navigate('/impuestos')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Receipt size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Impuestos y Servicios</h3>
          <p className="text-sm text-navy-500 mt-1">Vencimientos, pagos y facturas de impuestos y servicios.</p>
        </button>
      </div>
    </div>
  )
}
