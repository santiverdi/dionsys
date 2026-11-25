import { useCallback, useMemo, useState } from 'react'
import type { TarifarioPublico } from '../lib/landing'
import type { Cotizacion } from '../lib/tarifaDiaria'
import type { TarifaEspecial } from '../lib/tarifasEspeciales'
import type { Promo } from '../lib/promos'
import { useCloudSync } from '../lib/cloudStore'
import { KEY_AGREGADOS, cotizarAgregados, leerAgregados, seOfrece, validarAgregados, type Agregado } from '../lib/agregados'
import CotizacionMensaje from './CotizacionMensaje'

// Debajo de la cotización del calendario: el conserje tilda los agregados de
// pensión que se ofrecen en esas fechas y el mensaje los suma en una línea
// aparte. Sin agregados configurados, es solo el mensaje de siempre.

const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

export default function CotizacionConAgregados(props: {
  llegada: string
  salida: string
  pax: number
  cotizacion: Cotizacion
  tarifario: TarifarioPublico
  especiales: TarifaEspecial[]
  promos: readonly Promo[]
  hoy: string
}) {
  const { llegada, salida, pax, cotizacion, tarifario, especiales, promos, hoy } = props
  const [agregados, setAgregados] = useState<Agregado[]>(leerAgregados)
  useCloudSync<unknown>(KEY_AGREGADOS, useCallback(v => setAgregados(validarAgregados(v)), []))
  const [elegidos, setElegidos] = useState<Set<string>>(new Set())

  const ofrecidos = useMemo(() => agregados.filter(a => seOfrece(a, llegada, salida)), [agregados, llegada, salida])
  const cotizados = useMemo(
    () => cotizarAgregados(ofrecidos.filter(a => elegidos.has(a.id)), { llegada, salida, pax, tarifario, especiales, promos, hoy, cotizacion }),
    [ofrecidos, elegidos, llegada, salida, pax, tarifario, especiales, promos, hoy, cotizacion],
  )

  const alternar = (id: string) => setElegidos(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  const base = cotizacion.promo ? cotizacion.promo.total : cotizacion.conDescuento
  const totalAgregados = cotizados.reduce((s, a) => s + a.conPromo, 0)

  return (
    <>
      {ofrecidos.length > 0 && (
        <div className="mt-3 border-t border-navy-100 pt-3">
          <p className="text-xs font-medium text-navy-500 mb-1.5">Agregados</p>
          <div className="flex flex-wrap gap-2">
            {ofrecidos.map(a => (
              <label key={a.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer ${elegidos.has(a.id) ? 'border-gold-400 bg-gold-50' : 'border-navy-200'}`}>
                <input type="checkbox" checked={elegidos.has(a.id)} onChange={() => alternar(a.id)} />
                {a.nombre} <span className="text-navy-400">{money(a.precioPorPersona)} p/p/noche</span>
              </label>
            ))}
          </div>
          {cotizados.length > 0 && (
            <div className="text-sm text-navy-700 mt-2 space-y-0.5">
              {cotizados.map(a => (
                <p key={a.id}>
                  🍽️ {a.nombre}: {a.pax} × {a.noches} {a.noches === 1 ? 'noche' : 'noches'} = <b>{money(a.conPromo)}</b>
                  {a.conPromo < a.lista && <span className="text-navy-400"> (lista {money(a.lista)})</span>}
                </p>
              ))}
              <p>Total con agregados: <b>{money(base + totalAgregados)}</b></p>
            </div>
          )}
        </div>
      )}
      <CotizacionMensaje llegada={llegada} salida={salida} pax={pax} cotizacion={cotizacion} cuotas={tarifario.config.cuotas ?? []} agregados={cotizados} />
    </>
  )
}
