import type { LucideIcon } from 'lucide-react'

export interface TabDef<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
  // Numerito al lado del nombre (ej. tareas pendientes). 0 o undefined = no se muestra.
  badge?: number
  badgeTone?: 'amber' | 'red'
}

// Pestañas de toda la app: mismo estilo en todas las pantallas. Con pocas
// pestañas (`full`) ocupan todo el ancho; con muchas se desplazan de costado.
export default function Tabs<T extends string>({ tabs, value, onChange, full = false, className = 'mb-4' }: {
  tabs: TabDef<T>[]
  value: T
  onChange: (id: T) => void
  full?: boolean
  className?: string
}) {
  return (
    <div className={`overflow-x-auto -mx-1 px-1 ${className}`}>
      <div role="tablist" className="flex gap-1 bg-navy-100 rounded-xl p-1 w-max min-w-full">
        {tabs.map(t => {
          const activa = t.id === value
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activa}
              onClick={() => onChange(t.id)}
              className={`${full ? 'flex-1 justify-center' : ''} flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                activa ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
              }`}
            >
              {t.icon && <t.icon size={15} />}
              {t.label}
              {!!t.badge && (
                <span className={`text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center ${
                  t.badgeTone === 'red' ? 'bg-red-500 text-white' : 'bg-amber-100 text-amber-700'
                }`}>
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

