import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, KeyRound, MessageCircle } from 'lucide-react'
import { fetchLeads, type Lead, type LeadsResult } from '../lib/landing'

// Código de acceso del endpoint /api/leads. Se guarda por dispositivo, a
// propósito FUERA del sync en la nube: la tabla app_state es legible con la
// anon key y el código quedaría público.
const LS_TOKEN = 'dionsys_landing_leads_token'

const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function fdia(s: string | undefined): string {
  if (!s) return '—'
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`
}

function frecibida(s: string | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function LandingLeads() {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN) ?? '')
  const [tokenAbierto, setTokenAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [resultado, setResultado] = useState<LeadsResult>({ leads: [], via: null, error: null })

  const cargar = useCallback(async (tok: string) => {
    setCargando(true)
    setResultado(await fetchLeads(tok))
    setCargando(false)
  }, [])

  // Carga inicial: el estado arranca en "cargando", acá solo llega el resultado.
  useEffect(() => {
    let activo = true
    void fetchLeads(localStorage.getItem(LS_TOKEN) ?? '').then(r => {
      if (!activo) return
      setResultado(r)
      setCargando(false)
    })
    return () => { activo = false }
  }, [])

  function guardarToken() {
    localStorage.setItem(LS_TOKEN, token.trim())
    setTokenAbierto(false)
    void cargar(token)
  }

  const { leads, via, error } = resultado

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-navy-500">
          Cada consulta que la landing manda a WhatsApp queda guardada acá, con nombre y teléfono.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTokenAbierto(!tokenAbierto)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50"
            title="Código de acceso del endpoint /api/leads"
          >
            <KeyRound size={16} /> Código de acceso
          </button>
          <button
            onClick={() => void cargar(token)}
            disabled={cargando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {tokenAbierto && (
        <div className="mb-4 p-4 bg-white rounded-xl border border-navy-100 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-navy-500 mb-1">
              Código de acceso (el LANDING_LEADS_TOKEN configurado en Vercel)
            </label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm"
              placeholder="Se guarda solo en este dispositivo"
            />
          </div>
          <button onClick={guardarToken} className="px-4 py-2 rounded-lg text-sm bg-gold-400 text-navy-900 font-medium hover:bg-gold-300">
            Guardar y probar
          </button>
        </div>
      )}

      {via === 'directa' && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Estas consultas se están leyendo con la clave pública: cualquiera que mire el código de la
          landing puede verlas también. Para cerrarlo, corré <code>scripts/landing-supabase.sql</code> en
          Supabase y configurá el código de acceso (ver <code>api/leads.js</code>). Ojo: una vez corrido el
          script, esta lectura directa va a mostrar la lista vacía — cargá el código de acceso acá arriba.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
      )}

      {cargando ? (
        <p className="text-sm text-navy-400 py-8 text-center">Cargando consultas…</p>
      ) : leads.length === 0 && !error ? (
        <p className="text-sm text-navy-400 py-8 text-center">Todavía no llegó ninguna consulta desde la landing.</p>
      ) : leads.length > 0 && (
        <div className="bg-white rounded-xl border border-navy-100 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-navy-400 border-b border-navy-100">
                <th className="px-4 py-3 font-medium">Recibida</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Estadía</th>
                <th className="px-4 py-3 font-medium">Camas</th>
                <th className="px-4 py-3 font-medium text-right">Cotizado</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l: Lead, i) => (
                <tr key={l.id ?? i} className="border-b border-navy-50 last:border-0">
                  <td className="px-4 py-3 text-navy-500 whitespace-nowrap">{frecibida(l.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-navy-800">{l.nombre || '—'}</td>
                  <td className="px-4 py-3">
                    {l.telefono ? (
                      <a
                        href={`https://wa.me/${l.telefono.replace(/\D/g, '')}`}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                      >
                        <MessageCircle size={14} /> {l.telefono}
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-navy-600 whitespace-nowrap">
                    {fdia(l.fecha_in)} → {fdia(l.fecha_out)} · {l.noches} {l.noches === 1 ? 'noche' : 'noches'} · {l.personas} pax
                  </td>
                  <td className="px-4 py-3 text-navy-500">{l.camas || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-navy-800 whitespace-nowrap">{money(l.total)}</td>
                  <td className="px-4 py-3">
                    {l.fue_a_wa ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Abrió WhatsApp</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">No llegó a abrir</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
