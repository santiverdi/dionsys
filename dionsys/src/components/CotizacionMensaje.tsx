import { useState } from 'react'
import { Check, Copy, MessageCircle } from 'lucide-react'
import { diaSemana, type Cotizacion } from '../lib/tarifaDiaria'

// Mensaje listo para mandarle al huésped con la cotización que el conserje
// acaba de marcar en el calendario de Tarifas. Mismas cifras que la tarjeta de
// arriba; las cuotas salen del tarifario publicado (igual que la landing:
// total de lista dividido en N cuotas sin interés).

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const fmtFecha = (s: string) => `${DIAS[diaSemana(s)]} ${s.slice(8, 10)}/${s.slice(5, 7)}`

export function armarMensaje(llegada: string, salida: string, pax: number, c: Cotizacion, cuotas: number[]): string {
  const l: string[] = [
    '¡Hola! Te paso la cotización del *Hotel Dion* 😊',
    '',
    `📅 Ingreso ${fmtFecha(llegada)} · salida ${fmtFecha(salida)}`,
    `🛏️ ${c.noches} ${c.noches === 1 ? 'noche' : 'noches'} · ${pax} ${pax === 1 ? 'persona' : 'personas'}`,
    '',
  ]
  // Transferencia = precio común (con el descuento que vale con cualquier medio, si hay).
  const conDesc = c.conDescuento < c.total ? ` (${Math.round(c.descGeneral * 100)}% off sobre ${money(c.total)})` : ''
  l.push(`🏦 Transferencia: *${money(c.conDescuento)}*${conDesc}`)
  if (c.efectivo < c.conDescuento) l.push(`💵 En efectivo: *${money(c.efectivo)}*`)
  if (cuotas.length) {
    const op = cuotas.map(n => `${n} cuotas de ${money(Math.round(c.total / n))}`).join(' o ')
    l.push(`💳 Sin interés con Banco Provincia: ${op}`)
  }
  if (c.minNoches > 1) l.push('', `ℹ️ Para esas fechas la estadía mínima es de ${c.minNoches} noches.`)
  if (c.sena > 0) {
    l.push('', `Para reservar se abona una seña del ${Math.round(c.sena * 100)}% (${money(Math.round(c.total * c.sena))}).`)
  }
  l.push('', 'Incluye desayuno buffet. ¡Cualquier consulta, avisanos!')
  return l.join('\n')
}

export default function CotizacionMensaje(props: {
  llegada: string; salida: string; pax: number; cotizacion: Cotizacion; cuotas: number[]
}) {
  const texto = armarMensaje(props.llegada, props.salida, props.pax, props.cotizacion, props.cuotas)
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div className="mt-3 border-t border-navy-100 pt-3">
      <p className="text-xs font-medium text-navy-500 mb-1.5">Mensaje para el huésped</p>
      <pre className="whitespace-pre-wrap font-sans text-sm text-navy-700 bg-navy-50/60 rounded-lg p-3">{texto}</pre>
      <div className="flex flex-wrap gap-2 mt-2">
        <button onClick={() => void copiar()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
          {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium"
        >
          <MessageCircle size={15} /> WhatsApp
        </a>
      </div>
    </div>
  )
}
