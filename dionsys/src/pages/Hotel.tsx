// Mapa del hotel: el plano piso por piso con el estado de cada habitación según
// el último parte importado. Reemplaza tener que leer las dos listas sueltas del
// PDF del PMS para saber cómo está el hotel ahora.

import { useMemo, useState } from 'react'
import { Building2, BedDouble, Sparkles, Wrench, HelpCircle, AlertTriangle, Users } from 'lucide-react'
import { usePartes } from '../context/ParteContext'
import FichaHabitacionModal from '../components/FichaHabitacionModal'
import { getMapaHotel, type CeldaHabitacion, type EstadoMapa } from '../lib/mapaHotel'
import { TOTAL_HABITACIONES } from '../data/hotel'
import { TURNO_LABELS } from '../context/OccupancyContext'

const ESTADO: Record<EstadoMapa, { label: string; celda: string; punto: string }> = {
  ocupada:       { label: 'Ocupada',       celda: 'bg-navy-600 text-white border-navy-700',        punto: 'bg-navy-600' },
  limpia:        { label: 'Limpia',        celda: 'bg-green-50 text-green-800 border-green-200',   punto: 'bg-green-500' },
  sucia:         { label: 'Sucia',         celda: 'bg-amber-50 text-amber-800 border-amber-200',   punto: 'bg-amber-500' },
  mantenimiento: { label: 'Mantenimiento', celda: 'bg-red-50 text-red-800 border-red-200',         punto: 'bg-red-500' },
  sin_dato:      { label: 'Sin dato',      celda: 'bg-navy-50 text-navy-400 border-dashed border-navy-200', punto: 'bg-navy-200' },
}

function fmtFecha(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Kpi({ label, value, sub, tone = 'navy' }: { label: string; value: string; sub?: string; tone?: 'navy' | 'green' | 'amber' | 'red' }) {
  const tones = {
    navy: 'text-navy-800', green: 'text-green-600', amber: 'text-amber-600', red: 'text-red-600',
  }
  return (
    <div className="bg-white rounded-xl border border-navy-100 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400">{label}</p>
      <p className={`text-lg font-bold ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-[11px] text-navy-400">{sub}</p>}
    </div>
  )
}

function Celda({ c, onClick }: { c: CeldaHabitacion; onClick: () => void }) {
  const st = ESTADO[c.estado]
  const fuera = !c.habitacion.activa
  // El hover resume; el click abre la ficha con el historial completo.
  const detalle = [
    `Hab. ${c.habitacion.numero} · ${c.habitacion.plazas} plazas`,
    fuera ? 'FUERA DE SERVICIO' : '',
    st.label,
    c.ocupacion ? `Reserva ${c.ocupacion.reserva} · ${c.ocupacion.plazas} pax · ${c.ocupacion.canal}` : '',
    c.sobreocupada ? `SOBREOCUPADA: ${c.ocupacion?.plazas} personas en ${c.habitacion.plazas} plazas` : '',
    'Tocá para ver la ficha',
  ].filter(Boolean).join('\n')

  return (
    <button
      type="button"
      onClick={onClick}
      title={detalle}
      className={`relative w-full rounded-lg border p-2 text-center transition-shadow hover:shadow-md hover:ring-2 hover:ring-gold-300 ${st.celda} ${fuera ? 'opacity-60' : ''}`}
    >
      {c.sobreocupada && (
        <AlertTriangle size={12} className="absolute top-1 right-1 text-red-500" aria-label="Sobreocupada" />
      )}
      <p className="text-sm font-bold leading-tight">{c.habitacion.numero}</p>
      <p className="text-[10px] leading-tight opacity-80">
        {c.ocupacion ? `${c.ocupacion.plazas}/${c.habitacion.plazas} pax` : `${c.habitacion.plazas} plazas`}
      </p>
      {c.ocupacion && (
        <p className="text-[10px] leading-tight opacity-70 truncate">Res. {c.ocupacion.reserva}</p>
      )}
      {fuera && <p className="text-[10px] leading-tight font-semibold">fuera de servicio</p>}
    </button>
  )
}

export default function Hotel() {
  const { partes } = usePartes()
  const mapa = useMemo(() => getMapaHotel(partes), [partes])
  const { parte, totales } = mapa
  const [ficha, setFicha] = useState<string | null>(null)

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Building2 size={20} className="text-navy-600" />
        <h2 className="text-xl font-bold text-navy-800">Mapa del hotel</h2>
      </div>

      {parte ? (
        <p className="text-xs text-navy-500 mb-4">
          Según el parte de la <strong>caja {parte.nroCaja}</strong>
          {parte.turno ? ` · ${TURNO_LABELS[parte.turno]}` : ''}
          {parte.conserje ? ` · ${parte.conserje}` : ''} — {fmtFecha(parte.fechaCaja || parte.importedAt)}
        </p>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-4">
          Todavía no hay ningún parte de habitaciones importado. El plano muestra el hotel sin estado.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Kpi label="Ocupación" value={`${totales.ocupacionPct}%`} sub={`${totales.ocupadas} de ${TOTAL_HABITACIONES} habitaciones`} />
        <Kpi label="Huéspedes" value={String(totales.plazasOcupadas)} sub={`de ${totales.plazasTotales} plazas`} tone="green" />
        <Kpi label="Para limpiar" value={String(totales.sucias)} sub={`${totales.limpias} limpias`} tone={totales.sucias ? 'amber' : 'navy'} />
        <Kpi label="Mantenimiento" value={String(totales.mantenimiento)} sub={totales.sinDato ? `${totales.sinDato} sin dato` : 'todas reportadas'} tone={totales.mantenimiento ? 'red' : 'navy'} />
      </div>

      {/* Referencias */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-[11px] text-navy-600">
        {(Object.keys(ESTADO) as EstadoMapa[]).map(e => (
          <span key={e} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${ESTADO[e].punto}`} /> {ESTADO[e].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><AlertTriangle size={12} className="text-red-500" /> Sobreocupada</span>
      </div>

      {/* Avisos del cruce contra el maestro */}
      {totales.sinDato > 0 && (
        <p className="text-xs text-navy-600 bg-navy-50 border border-navy-100 rounded-lg p-2.5 mb-3 flex gap-2">
          <HelpCircle size={14} className="shrink-0 mt-0.5 text-navy-400" />
          <span>
            {totales.sinDato} habitación(es) no figuran en el parte, ni ocupadas ni libres: quedaron sin control.
          </span>
        </p>
      )}
      {mapa.desconocidas.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
          <span>
            El parte menciona habitaciones que no existen en el hotel: <strong>{mapa.desconocidas.join(', ')}</strong>.
            Revisá la lectura del PDF o el maestro de habitaciones.
          </span>
        </p>
      )}

      {/* El plano, piso por piso (del más alto al más bajo, como se ve un edificio) */}
      <div className="space-y-3">
        {[...mapa.pisos].reverse().map(p => {
          const ocupadasPiso = p.celdas.filter(c => c.estado === 'ocupada').length
          return (
            <div key={p.piso} className="bg-white rounded-xl border border-navy-100 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-navy-700">Piso {p.piso}</p>
                <p className="text-[11px] text-navy-400 flex items-center gap-2">
                  <span className="flex items-center gap-1"><BedDouble size={12} /> {ocupadasPiso}/{p.celdas.length}</span>
                  <span className="flex items-center gap-1">
                    <Users size={12} /> {p.celdas.reduce((s, c) => s + (c.ocupacion?.plazas ?? 0), 0)}
                  </span>
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {p.celdas.map(c => (
                  <Celda key={c.habitacion.numero} c={c} onClick={() => setFicha(c.habitacion.numero)} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-navy-400 mt-3 flex items-start gap-1.5">
        <Sparkles size={12} className="shrink-0 mt-0.5" />
        Tocá cualquier habitación para ver su ficha: noches vendidas, plata que hizo, canales y controles.
        El estado sale del último parte importado; se actualiza al cargar el parte del turno siguiente.
        Las habitaciones fuera de servicio no cuentan para el % de ocupación.
        <Wrench size={12} className="shrink-0 mt-0.5" />
      </p>

      <FichaHabitacionModal numero={ficha} onClose={() => setFicha(null)} />
    </div>
  )
}
