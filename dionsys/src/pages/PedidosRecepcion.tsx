import { useState } from 'react'
import { Croissant, Milk, Trash2, Users, AlertTriangle, CalendarDays, Apple } from 'lucide-react'
import PanaderiaCalc from '../components/PanaderiaCalc'
import LacteosOrder from '../components/LacteosOrder'
import BasuraTracker from '../components/BasuraTracker'
import OccupancyPanel from '../components/OccupancyPanel'
import TurnosGrid from '../components/TurnosGrid'
import VerduleriaOrder from '../components/VerduleriaOrder'
import { useOccupancy, TURNO_LABELS } from '../context/OccupancyContext'

type Section = 'menu' | 'panaderia' | 'lacteos' | 'basura' | 'ocupacion' | 'turnos' | 'verduleria'

export default function PedidosRecepcion() {
  const [section, setSection] = useState<Section>('menu')
  const { currentTurno, getToday } = useOccupancy()

  const today = getToday()
  const isNoche = currentTurno === 'noche'
  const blocked = isNoche && !today

  if (section === 'panaderia') {
    return <PanaderiaCalc onBack={() => setSection('menu')} />
  }

  if (section === 'lacteos') {
    return <LacteosOrder onBack={() => setSection('menu')} />
  }

  if (section === 'basura') {
    return <BasuraTracker onBack={() => setSection('menu')} />
  }

  if (section === 'ocupacion') {
    return <OccupancyPanel onBack={() => setSection('menu')} />
  }

  if (section === 'turnos') {
    return <TurnosGrid onBack={() => setSection('menu')} />
  }

  if (section === 'verduleria') {
    return <VerduleriaOrder onBack={() => setSection('menu')} />
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-2">Pedidos Recepcion</h2>
      <p className="text-sm text-navy-500 mb-6">Pedidos calculados por huespedes. Van directo al desayunador.</p>

      {/* Night shift block banner */}
      {blocked && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-indigo-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">
              Turno {TURNO_LABELS[currentTurno].split(' ')[0]} — Carga la ocupacion primero
            </p>
            <p className="text-xs text-indigo-600 mt-1.5 leading-relaxed">
              En el sistema: <span className="font-semibold">Reservas</span> → <span className="font-semibold">Ingresos</span> → <span className="font-semibold">Impresora</span> → <span className="font-semibold">Proyeccion de huespedes Hoy:Hoy</span>
            </p>
            <p className="text-xs text-indigo-500 mt-1">
              Descarga el Excel e importalo en Ocupacion.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Ocupacion - always first and always enabled */}
        <button
          onClick={() => setSection('ocupacion')}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group ${
            blocked
              ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-300 animate-pulse'
              : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
          }`}
        >
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors ${
            blocked
              ? 'bg-indigo-200 text-indigo-700'
              : 'bg-emerald-100 text-emerald-600 group-hover:bg-gold-400 group-hover:text-navy-900'
          }`}>
            <Users size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">
            Ocupacion
            {blocked && <span className="ml-2 text-xs text-indigo-600 font-semibold">← Cargar primero</span>}
          </h3>
          <p className="text-sm text-navy-500 mt-1">Carga diaria de huespedes. Importa Excel o carga manual.</p>
          <p className={`text-xs mt-2 font-medium ${blocked ? 'text-indigo-600' : 'text-emerald-600'}`}>
            {today ? `Cargado: ${today.guests} huespedes, ${today.rooms} hab.` : 'Proyeccion de compras por huesped'}
          </p>
        </button>

        <button
          onClick={() => !blocked && setSection('panaderia')}
          disabled={blocked}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group ${
            blocked
              ? 'bg-navy-50 border-navy-100 opacity-40 cursor-not-allowed'
              : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-gold-100 text-gold-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Croissant size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Piazza - Panaderia</h3>
          <p className="text-sm text-navy-500 mt-1">Calculo automatico por huespedes. Medialunas + facturas surtidas.</p>
          <p className="text-xs text-gold-600 mt-2 font-medium">Todos los dias (excepto domingos)</p>
        </button>

        <button
          onClick={() => !blocked && setSection('lacteos')}
          disabled={blocked}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group ${
            blocked
              ? 'bg-navy-50 border-navy-100 opacity-40 cursor-not-allowed'
              : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Milk size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Lacteos - El Amanecer</h3>
          <p className="text-sm text-navy-500 mt-1">Leche, yogurt, queso y paleta. Carga manual con sugerencias.</p>
          <p className="text-xs text-blue-600 mt-2 font-medium">Lunes, Miercoles y Viernes</p>
        </button>

        <button
          onClick={() => !blocked && setSection('verduleria')}
          disabled={blocked}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group ${
            blocked
              ? 'bg-navy-50 border-navy-100 opacity-40 cursor-not-allowed'
              : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Apple size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Verduleria</h3>
          <p className="text-sm text-navy-500 mt-1">Manzanas rojas, verdes y naranjas. Por medio kilo o kilo.</p>
          <p className="text-xs text-green-600 mt-2 font-medium">Frutas para el desayunador</p>
        </button>

        <button
          onClick={() => !blocked && setSection('basura')}
          disabled={blocked}
          className={`rounded-xl p-6 shadow-sm border transition-all text-left group ${
            blocked
              ? 'bg-navy-50 border-navy-100 opacity-40 cursor-not-allowed'
              : 'bg-white border-navy-100 hover:border-gold-400 hover:shadow-md'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-500 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <Trash2 size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Basura</h3>
          <p className="text-sm text-navy-500 mt-1">Control diario. Alerta a las 18:00hs para sacar la basura.</p>
          <p className="text-xs text-red-500 mt-2 font-medium">Todos los dias a las 18:00</p>
        </button>

        <button
          onClick={() => setSection('turnos')}
          className="rounded-xl p-6 shadow-sm border transition-all text-left group bg-white border-navy-100 hover:border-gold-400 hover:shadow-md"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 group-hover:bg-gold-400 group-hover:text-navy-900 transition-colors">
            <CalendarDays size={24} />
          </div>
          <h3 className="font-bold text-navy-800 text-lg">Turnos</h3>
          <p className="text-sm text-navy-500 mt-1">Grilla mensual de turnos. Valentin marca los dias que cubre.</p>
          <p className="text-xs text-indigo-600 mt-2 font-medium">Leandro · Santiago · Gaston · Valentin</p>
        </button>
      </div>
    </div>
  )
}
