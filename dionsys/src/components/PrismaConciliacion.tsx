import { useMemo, useState } from 'react'
import { CreditCard, CheckCircle2, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { usePrisma } from '../context/PrismaContext'
import { conciliacionTarjetas, TOLERANCIA_CONCILIACION } from '../lib/prismaTarjetas'
import { formatMontoCurrency } from '../utils/validators'

// "2026-07" → "julio 2026"
function fmtMes(yyyyMm: string): string {
  const d = new Date(`${yyyyMm}-15T12:00:00`)
  return isNaN(d.getTime()) ? yyyyMm : d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

// Conciliación mensual de tarjetas (solo admin): lo cobrado por tarjeta según
// las cajas del sistema vs el total del resumen de Prisma, que se carga acá a
// mano (un número por mes).
export default function PrismaConciliacion() {
  const { employee } = useAuth()
  const { cajas } = useCajas()
  const { resumenes, setResumenMes } = usePrisma()
  const [open, setOpen] = useState(false)
  // mes → texto tipeado y todavía sin guardar (se guarda con el botón).
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const rows = useMemo(() => conciliacionTarjetas(cajas, resumenes), [cajas, resumenes])
  const sinCargar = rows.filter(r => r.prisma == null).length

  function guardar(mes: string) {
    const raw = drafts[mes]
    if (raw == null) return
    const n = Math.round(Number(raw.replace(',', '.')) * 100) / 100
    setResumenMes(mes, raw.trim() === '' || isNaN(n) ? null : n, employee?.name ?? '')
    setDrafts(d => {
      const { [mes]: _omit, ...rest } = d
      void _omit
      return rest
    })
  }

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-navy-100 mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-500">
          <CreditCard size={15} className="text-gold-600" /> Conciliación tarjetas (Prisma)
        </span>
        <span className="flex items-center gap-2 text-xs text-navy-400">
          {!open && sinCargar > 0 && (
            <span className="text-amber-600 font-semibold">{sinCargar} mes(es) sin resumen cargado</span>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-navy-400 mb-2">
            Por cada mes, cargá el total del resumen de Prisma. El sistema lo compara contra lo cobrado
            por tarjeta en las cajas de ese mes y marca la diferencia.
          </p>
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Mes</th>
                  <th className="text-right px-2">Sistema (tarjetas)</th>
                  <th className="text-left px-2">Resumen Prisma</th>
                  <th className="text-right pl-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const draft = drafts[r.mes]
                  const dirty = draft != null
                  const coincide = r.dif != null && Math.abs(r.dif) <= TOLERANCIA_CONCILIACION
                  return (
                    <tr key={r.mes} className="border-b border-navy-50 last:border-0">
                      <td className="py-1.5 pr-2 text-navy-700 font-semibold whitespace-nowrap capitalize">{fmtMes(r.mes)}</td>
                      <td className="px-2 text-right text-navy-800 font-semibold whitespace-nowrap">
                        {formatMontoCurrency(r.sistema)}
                        <span className="block text-[10px] font-normal text-navy-400">{r.cobros} cobro(s)</span>
                      </td>
                      <td className="px-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number" min={0} step={1000}
                            value={draft ?? (r.prisma ?? '')}
                            onChange={e => setDrafts(d => ({ ...d, [r.mes]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') guardar(r.mes) }}
                            placeholder="total del resumen"
                            className="w-32 rounded-lg border border-navy-200 px-2 py-1.5 text-xs text-navy-800 focus:outline-none focus:border-gold-400"
                          />
                          {dirty && (
                            <button onClick={() => guardar(r.mes)} className="p-1.5 rounded-lg bg-navy-800 text-cream hover:bg-navy-700" title="Guardar total del mes">
                              <Save size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="pl-2 text-right whitespace-nowrap">
                        {r.dif == null ? (
                          <span className="text-navy-300">—</span>
                        ) : coincide ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-semibold">
                            <CheckCircle2 size={13} /> Coincide
                          </span>
                        ) : (
                          <span className="text-red-600 font-bold">
                            {r.dif > 0 ? '+' : ''}{formatMontoCurrency(r.dif)}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-navy-400 mt-2">
            Diferencia = Prisma − sistema. En rojo hay que buscar qué cobro falta o sobra de un lado
            (un cobro mal pasado por posnet, un mes corrido, una anulación que Prisma no netea…).
          </p>
        </div>
      )}
    </div>
  )
}
