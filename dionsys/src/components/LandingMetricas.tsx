import { useEffect, useState } from 'react'
import { RefreshCw, TrendingDown } from 'lucide-react'
import { fetchMetricas, type EventoDiario } from '../lib/landing'
import { pct, resumirEventos } from '../lib/metricasLanding'

// Dashboard de la landing con datos PROPIOS (tabla eventos_landing): embudo de
// venta, serie diaria, fuentes de tráfico y dispositivos. Complementa (no
// reemplaza) los dashboards de Meta y Vercel: estos números son del hotel.

const DIAS = 60

export default function LandingMetricas() {
  const [eventos, setEventos] = useState<EventoDiario[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setCargando(true)
    const r = await fetchMetricas(DIAS)
    setEventos(r.eventos)
    setError(r.error)
    setCargando(false)
  }

  useEffect(() => {
    let activo = true
    void fetchMetricas(DIAS).then(r => {
      if (!activo) return
      setEventos(r.eventos)
      setError(r.error)
      setCargando(false)
    })
    return () => { activo = false }
  }, [])

  const m = eventos ? resumirEventos(eventos) : null
  const maxDia = m ? Math.max(1, ...m.porDia.map(d => d.visitas)) : 1

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-navy-500">
          Últimos {DIAS} días, medidos por la propia landing. El "lead" es quien cotizó, puso su nombre y fue a WhatsApp.
        </p>
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
      {cargando && <p className="text-sm text-navy-400 py-8 text-center">Cargando métricas…</p>}

      {!cargando && !error && m && m.visitas === 0 && (
        <p className="text-sm text-navy-400 py-8 text-center">
          Todavía no hay eventos registrados. Si acabás de activar las métricas, correr scripts/landing-metricas.sql en Supabase y esperá las primeras visitas.
        </p>
      )}

      {!cargando && m && m.visitas > 0 && (
        <div className="space-y-4">
          {/* Embudo */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              ['Visitas', m.visitas, null],
              ['Cotizaron', m.cotizaron, pct(m.cotizaron, m.visitas)],
              ['Leads (fueron a reservar)', m.reservaron, pct(m.reservaron, m.visitas)],
              ['WhatsApp directo', m.waDirecto, pct(m.waDirecto, m.visitas)],
            ] as const).map(([label, valor, porcentaje]) => (
              <div key={label} className="bg-white rounded-xl border border-navy-100 p-4">
                <p className="text-xs text-navy-400">{label}</p>
                <p className="text-2xl font-bold text-navy-800 mt-1">{valor.toLocaleString('es-AR')}</p>
                {porcentaje && <p className="text-xs text-gold-600 font-medium mt-0.5">{porcentaje} de las visitas</p>}
              </div>
            ))}
          </div>

          {/* Serie diaria */}
          <div className="bg-white rounded-xl border border-navy-100 p-4">
            <h3 className="font-bold text-navy-800 text-sm mb-3">Visitas y leads por día</h3>
            <div className="flex items-end gap-[3px] h-28">
              {m.porDia.map(d => (
                <div key={d.dia} className="flex-1 flex flex-col justify-end items-stretch gap-[2px]" title={`${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${d.visitas} visitas, ${d.leads} leads`}>
                  {d.leads > 0 && (
                    <div className="bg-gold-400 rounded-sm" style={{ height: `${Math.max(6, (d.leads / maxDia) * 100)}%` }} />
                  )}
                  <div className="bg-navy-200 rounded-sm" style={{ height: `${Math.max(2, (d.visitas / maxDia) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-navy-400 mt-1">
              <span>{m.porDia[0]?.dia.slice(8, 10)}/{m.porDia[0]?.dia.slice(5, 7)}</span>
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-navy-200 rounded-sm inline-block" /> visitas</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-gold-400 rounded-sm inline-block" /> leads</span>
              </span>
              <span>{m.porDia[m.porDia.length - 1]?.dia.slice(8, 10)}/{m.porDia[m.porDia.length - 1]?.dia.slice(5, 7)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Fuentes */}
            <div className="bg-white rounded-xl border border-navy-100 p-4">
              <h3 className="font-bold text-navy-800 text-sm mb-2">De dónde vienen</h3>
              <p className="text-[11px] text-navy-400 mb-2">Si el media buyer usa utm_source en los anuncios, cada campaña aparece con su nombre.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] text-navy-400">
                    <th className="py-1 font-medium">Fuente</th>
                    <th className="py-1 font-medium text-right">Visitas</th>
                    <th className="py-1 font-medium text-right">Leads</th>
                    <th className="py-1 font-medium text-right">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {m.fuentes.slice(0, 8).map(f => (
                    <tr key={f.fuente} className="border-t border-navy-50">
                      <td className="py-1.5 text-navy-700">{f.fuente}</td>
                      <td className="py-1.5 text-right text-navy-600">{f.visitas.toLocaleString('es-AR')}</td>
                      <td className="py-1.5 text-right font-medium text-navy-800">{f.leads}</td>
                      <td className="py-1.5 text-right text-gold-600">{pct(f.leads, f.visitas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dispositivos + abandono */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-navy-100 p-4">
                <h3 className="font-bold text-navy-800 text-sm mb-2">Dispositivos</h3>
                {m.dispositivos.map(d => (
                  <div key={d.dispositivo} className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm text-navy-600 w-20 capitalize">{d.dispositivo}</span>
                    <div className="flex-1 h-2.5 bg-navy-50 rounded-full overflow-hidden">
                      <div className="h-full bg-navy-400 rounded-full" style={{ width: pct(d.visitas, m.visitas) === '—' ? '0%' : `${(d.visitas / m.visitas) * 100}%` }} />
                    </div>
                    <span className="text-xs text-navy-500 w-10 text-right">{pct(d.visitas, m.visitas)}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-navy-100 p-4">
                <h3 className="font-bold text-navy-800 text-sm mb-1 flex items-center gap-1.5">
                  <TrendingDown size={15} className="text-navy-400" /> Dónde se pierden
                </h3>
                <p className="text-xs text-navy-500 leading-relaxed">
                  De {m.visitas.toLocaleString('es-AR')} visitas, {m.cotizaron.toLocaleString('es-AR')} llegaron a ver un precio
                  ({pct(m.cotizaron, m.visitas)}) y {m.reservaron.toLocaleString('es-AR')} fueron a reservar
                  ({pct(m.reservaron, m.cotizaron)} de los que cotizaron). Los nombres y teléfonos de esos leads están en la pestaña Consultas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
