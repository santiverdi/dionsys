// Grupos que cobra el dueño POR FUERA de la caja de recepción.
// Es el espejo de la cuenta corriente con proveedores: acá lo que nos deben.

import { useMemo, useRef, useState } from 'react'
import { Users, Upload, Loader2, AlertTriangle, Trash2, CalendarClock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useGrupos } from '../context/GruposContext'
import { parseGruposExcel } from '../lib/parseGrupos'
import {
  getResumenGrupos, gruposProximos, gruposConDeudaVencida, gruposSobrepagados, ingresosPorMes,
} from '../lib/grupos'
import { formatMontoCurrency } from '../utils/validators'

function fmtFecha(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + 'T12:00:00')
  return isNaN(d.getTime()) ? yyyyMmDd : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function fmtMes(yyyyMm: string): string {
  const d = new Date(yyyyMm + '-01T12:00:00')
  return isNaN(d.getTime()) ? yyyyMm : d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}

export default function GruposPanel() {
  const { employee } = useAuth()
  const { grupos, importarGrupos, borrarGrupos } = useGrupos()
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const resumen = useMemo(() => getResumenGrupos(grupos), [grupos])
  const proximos = useMemo(() => gruposProximos(grupos), [grupos])
  const vencidos = useMemo(() => gruposConDeudaVencida(grupos), [grupos])
  const sobrepagados = useMemo(() => gruposSobrepagados(grupos), [grupos])
  const porMes = useMemo(() => ingresosPorMes(grupos), [grupos])

  async function importar(file: File) {
    setError('')
    setImportando(true)
    try {
      importarGrupos(await parseGruposExcel(file, employee?.name ?? '?'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    } finally {
      setImportando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div>
      <p className="text-[11px] text-navy-400 mb-2">
        Los grupos los cobra el dueño por fuera de la caja, así que esta plata no aparece en ningún
        otro lado del sistema. Importá tu planilla de grupos: reemplaza lo cargado, así se refleja
        cualquier pago o corrección que hayas hecho en el Excel.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-xs font-semibold hover:bg-navy-700 disabled:opacity-60"
        >
          {importando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {grupos.length ? 'Actualizar desde el Excel' : 'Importar planilla de grupos'}
        </button>
        {grupos.length > 0 && (
          <button
            onClick={borrarGrupos}
            className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50"
            title="Borrar los grupos cargados"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3">{error}</p>
      )}

      {!grupos.length ? (
        <p className="text-xs text-navy-500">Todavía no importaste ningún grupo.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="bg-navy-50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-navy-500">Contratado</p>
              <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(resumen.contratado)}</p>
              <p className="text-[10px] text-navy-400">{resumen.grupos} grupo(s)</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-green-700">Ya cobrado</p>
              <p className="text-lg font-bold text-green-700">{formatMontoCurrency(resumen.cobrado)}</p>
            </div>
            <div className={`rounded-lg p-3 ${resumen.porCobrar > 0 ? 'bg-amber-50' : 'bg-navy-50'}`}>
              <p className={`text-[10px] uppercase ${resumen.porCobrar > 0 ? 'text-amber-700' : 'text-navy-500'}`}>Falta cobrar</p>
              <p className={`text-lg font-bold ${resumen.porCobrar > 0 ? 'text-amber-700' : 'text-navy-800'}`}>
                {formatMontoCurrency(resumen.porCobrar)}
              </p>
            </div>
            <div className="bg-navy-50 rounded-lg p-3">
              <p className="text-[10px] uppercase text-navy-500">Plazas comprometidas</p>
              <p className="text-lg font-bold text-navy-800">{resumen.plazas}</p>
              <p className="text-[10px] text-navy-400">{resumen.nochesPlaza} noches-plaza</p>
            </div>
          </div>

          {sobrepagados.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
              <span>
                {sobrepagados.map(g => (
                  <span key={g.id} className="block">
                    <strong>{g.nombre}</strong> pagó {formatMontoCurrency(Math.abs(g.saldo))} más que su total
                    ({formatMontoCurrency(g.total)}). Puede ser un precio que cambió o una carga mal hecha:
                    conviene revisarlo antes de dar por buena la cuenta.
                  </span>
                ))}
              </span>
            </p>
          )}

          {vencidos.length > 0 && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 flex gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
              <span>
                Ya se fueron y siguen debiendo: <strong>{vencidos.map(g => `${g.nombre} (${formatMontoCurrency(g.saldo)})`).join(', ')}</strong>.
              </span>
            </p>
          )}

          <div className="overflow-x-auto -mx-3 px-3 mb-3">
            <table className="w-full text-xs min-w-[540px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Grupo</th>
                  <th className="text-left px-2">Estadía</th>
                  <th className="text-right px-2">Pax</th>
                  <th className="text-right px-2">Total</th>
                  <th className="text-right px-2">Cobrado</th>
                  <th className="text-right pl-2">Falta</th>
                </tr>
              </thead>
              <tbody>
                {proximos.map(g => {
                  const cobrado = g.pagos.reduce((a, b) => a + b, 0)
                  return (
                    <tr key={g.id} className="border-b border-navy-50 last:border-0">
                      <td className="py-1.5 pr-2 text-navy-700">
                        {g.nombre}
                        {g.facturaPct > 0 && <span className="text-navy-400"> · fact. {g.facturaPct}%</span>}
                      </td>
                      <td className="px-2 text-navy-500 whitespace-nowrap">
                        {fmtFecha(g.ingreso)} al {fmtFecha(g.egreso)} <span className="text-navy-400">({g.noches}n)</span>
                      </td>
                      <td className="px-2 text-right text-navy-600 tabular-nums">{g.plazasDoble + g.plazasSingle}</td>
                      <td className="px-2 text-right text-navy-800 font-semibold tabular-nums">{formatMontoCurrency(g.total)}</td>
                      <td className="px-2 text-right text-green-700 tabular-nums">{cobrado ? formatMontoCurrency(cobrado) : '—'}</td>
                      <td className={`pl-2 text-right font-semibold tabular-nums ${
                        g.saldo > 0 ? 'text-amber-700' : g.saldo < 0 ? 'text-navy-400' : 'text-green-600'
                      }`}>
                        {g.saldo === 0 ? 'pagado' : formatMontoCurrency(g.saldo)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {porMes.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5 flex items-center gap-1.5">
                <CalendarClock size={12} /> Ingreso comprometido por mes
              </p>
              <ul className="space-y-1 text-xs mb-2">
                {porMes.map(m => (
                  <li key={m.mes} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                    <span className="text-navy-600 capitalize">{fmtMes(m.mes)} <span className="text-navy-400">· {m.grupos} grupo(s)</span></span>
                    <span className="font-semibold text-navy-800">{formatMontoCurrency(m.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="text-[10px] text-navy-400 flex items-start gap-1.5">
            <Users size={11} className="shrink-0 mt-0.5" />
            El ingreso se imputa al mes en que el grupo SE ALOJA, no al que pagó la seña: es cuando el
            hotel presta el servicio y genera el costo.
          </p>
        </>
      )}
    </div>
  )
}
