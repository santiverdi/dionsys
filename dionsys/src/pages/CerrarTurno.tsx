import { useState, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Wallet, Clock, Circle, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { getCajaFlags, type CajaFlag } from '../lib/cajaControl'
import { getTarifaFlags } from '../lib/tarifas'
import { useTarifas } from '../context/TarifasContext'
import { TURNO_LABELS } from '../context/OccupancyContext'
import PartePanel from '../components/PartePanel'
import CajaImporter from '../components/CajaImporter'

function fmtFecha(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

// Ventana del "turno actual": un turno dura ≤8h y se sube al cerrar, así que lo
// propio está a pocas horas; lo de ayer queda a ≥24h. 18h separa con margen.
const RECIENTE_MS = 18 * 60 * 60 * 1000
function esReciente(iso: string): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return !isNaN(t) && Date.now() - t < RECIENTE_MS
}

function ChecklistItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${ok ? 'text-green-700' : 'text-navy-500'}`}>
      {ok ? <CheckCircle2 size={16} className="text-green-600" /> : <Circle size={16} className="text-navy-300" />}
      <span className={ok ? 'font-semibold' : ''}>{label}</span>
      {!ok && <span className="text-[11px] text-amber-600 font-medium">pendiente</span>}
    </div>
  )
}

function FlagPill({ flag }: { flag: CajaFlag }) {
  const color = flag.level === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : flag.level === 'warn'
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-navy-50 border-navy-200 text-navy-600'
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${color}`}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{flag.mensaje}</span>
    </div>
  )
}

export default function CerrarTurno() {
  const { employee } = useAuth()
  const { cajas, getCajaAnterior, deleteCaja } = useCajas()
  const { partes, getParteByCaja } = usePartes()
  const { tarifas } = useTarifas()
  // Lo que subió ESTE conserje en esta sesión (sobrevive a la lógica de fallback).
  const [savedCajaNro, setSavedCajaNro] = useState<number | null>(null)
  const [savedParteNro, setSavedParteNro] = useState<number | null>(null)

  // La caja del turno: la recién guardada en esta sesión, o —tras recargar— la
  // última que subió ESTE conserje DENTRO del turno actual (reciente). No caemos
  // a cajas[0] (global) ni a la última histórica del conserje, para no mostrar la
  // caja de OTRO turno (ej. la de ayer si todavía no subió la de hoy).
  const caja = useMemo(() => {
    if (savedCajaNro != null) return cajas.find(c => c.nroCaja === savedCajaNro) ?? null
    if (!employee) return null
    return cajas.find(c => c.importedBy === employee.name && esReciente(c.aperturaAt)) ?? null
  }, [cajas, savedCajaNro, employee])

  // El parte y la caja se cargan por separado (el Excel de caja puede no estar
  // disponible cuando se carga el parte). Cada uno trae su Nº de Caja del PMS y se
  // enlazan por ese número. Mismo criterio que la caja: lo guardado esta sesión o
  // —tras recargar— el parte propio del turno actual (reciente).
  const parteReciente = useMemo(() => {
    if (savedParteNro != null) return partes.find(p => p.nroCaja === savedParteNro) ?? null
    if (!employee) return null
    return partes.find(p => p.importedBy === employee.name && esReciente(p.fechaCaja)) ?? null
  }, [partes, savedParteNro, employee])

  const nroTurno = caja?.nroCaja ?? parteReciente?.nroCaja ?? undefined
  const parte = nroTurno != null ? getParteByCaja(nroTurno) : undefined
  // Aviso si caja y parte no son del mismo turno (números distintos).
  const mismatch = caja != null && parteReciente != null && caja.nroCaja !== parteReciente.nroCaja

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-navy-800 mb-1">Cerrar turno</h2>
      <p className="text-sm text-navy-500 mb-4">Al terminar tu turno, subí <strong>tu caja</strong> y <strong>tu parte de habitaciones</strong>. Los dos son obligatorios.</p>

      {/* Checklist: qué falta para no saltearse nada */}
      {(() => {
        const cajaOk = !!caja
        const parteOk = !!parte
        return (
          <div className={`rounded-xl border p-3 mb-4 ${cajaOk && parteOk ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}>
            <div className="space-y-1.5">
              <ChecklistItem ok={cajaOk} label="1 · Caja del turno (Excel)" />
              <ChecklistItem ok={parteOk} label="2 · Parte de habitaciones (PDF o foto)" />
            </div>
            <p className={`text-xs mt-2 ${cajaOk && parteOk ? 'text-green-700 font-semibold' : 'text-amber-700'}`}>
              {cajaOk && parteOk
                ? '✓ Listo, cargaste todo. Podés cerrar el turno.'
                : 'Te falta cargar lo marcado como pendiente antes de irte.'}
            </p>
          </div>
        )
      })()}

      {/* Paso 1 — Caja */}
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">1 · Tu caja (Excel)</p>
        <CajaImporter onSaved={c => setSavedCajaNro(c.nroCaja)} />
      </div>

      {/* Caja guardada: resumen + avisos */}
      {caja && (
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="font-bold text-navy-800 flex items-center gap-1.5">
              <Wallet size={16} className="text-navy-500" /> Caja {caja.nroCaja} · {caja.turno ? TURNO_LABELS[caja.turno] : 'Turno —'}
            </p>
            <button
              onClick={() => { deleteCaja(caja.id); setSavedCajaNro(null) }}
              className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
              title="Borrar esta caja (¿no es la tuya? subí la correcta)"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <p className="text-xs text-navy-400 flex items-center gap-1 mb-3">
            <Clock size={11} /> {fmtFecha(caja.aperturaAt)} · {caja.conserje ?? caja.usuarioApertura}
          </p>
          {(() => {
            const flags = [...getCajaFlags(caja, getCajaAnterior(caja)), ...getTarifaFlags(caja, partes, tarifas)]
            return flags.length > 0 ? (
              <div className="space-y-1.5">
                {flags.map((f, i) => <FlagPill key={i} flag={f} />)}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-700">
                <CheckCircle2 size={14} /> Caja sin observaciones.
              </div>
            )
          })()}
        </div>
      )}

      {/* Paso 2 — Parte (independiente de la caja; reusa el panel PDF/foto IA + avisos) */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">2 · Tu parte de habitaciones</p>
        {mismatch && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-700 mb-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Ojo: tu parte es de la Caja {parteReciente?.nroCaja} pero tu caja es la {caja?.nroCaja}. Fijate que sean del mismo turno.</span>
          </div>
        )}
        <PartePanel nroCaja={nroTurno} onSaved={p => setSavedParteNro(p.nroCaja)} onDeleted={() => setSavedParteNro(null)} />
      </div>
    </div>
  )
}
