// El aviso de la plata del libro de Charo que todavía no está en ningún número.
//
// Vive fuera de la Caja de Administración a propósito: si el aviso estuviera
// solo adentro de esa pantalla habría que acordarse de entrar, y con los días
// esa plata se pierde. Va donde se miran los números (Negocio) y en la portada
// de Administración, que es la pantalla de todos los días.

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { usePendientesLibro } from '../lib/usePendientesLibro'
import { formatMontoCurrency } from '../utils/validators'
import { monthLabel } from '../utils/dateRange'

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return monthLabel(y, m)
}

interface Props {
  /** YYYY-MM: avisa solo por ese mes. Sin esto avisa por todos los importados. */
  mes?: string
  /** Compacto para meter adentro de una sección. */
  chico?: boolean
}

export default function AvisoLibroPendiente({ mes, chico = false }: Props) {
  const navigate = useNavigate()
  const p = usePendientesLibro()

  const { monto, cantidad, detalle } = useMemo(() => {
    if (mes) {
      const r = p.porMes.get(mes)
      return {
        monto: r?.sinDecidir ?? 0,
        cantidad: r?.cantSinDecidir ?? 0,
        detalle: 'de este mes',
      }
    }
    const meses = p.mesesConPendiente
    return {
      monto: p.totalSinDecidir,
      cantidad: p.cantSinDecidir,
      detalle: meses.length === 1
        ? `de ${mesLabel(meses[0])}`
        : `de ${meses.length} meses (${meses.map(mesLabel).join(', ')})`,
    }
  }, [p, mes])

  if (cantidad === 0) return null

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800 ${chico ? 'p-2.5 text-xs mb-3' : 'p-3 mb-3'}`}
    >
      <AlertTriangle size={chico ? 14 : 18} className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className={chico ? 'font-bold' : 'text-sm font-bold'}>
          {formatMontoCurrency(monto)} del libro de caja sin decidir {detalle}
        </p>
        <p className={chico ? 'mt-0.5' : 'text-xs mt-0.5'}>
          {cantidad} pago(s) que salieron de verdad y no están en ningún número: ni marcados para el
          resultado del mes, ni mandados a Sueldos o Impuestos. Mientras tanto, los egresos dan de menos.
        </p>
      </div>
      <button
        onClick={() => navigate('/caja-admin')}
        className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-200 text-amber-900 text-xs font-semibold hover:bg-amber-300"
      >
        Resolver
      </button>
    </div>
  )
}
