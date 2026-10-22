import { useEffect, useRef, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { validarEstadiaMinima, type EstadiaMinima } from '../lib/tarifasEspeciales'

// Estadías mínimas por fechas puntuales (Año Nuevo, Carnaval…), aparte de la
// temporada. Solo admin, desde Recepción → Tarifas. Se guardan en la nube
// interna como los ajustes por día (onGuardar persiste la lista entera).

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'

const nueva = (): EstadiaMinima => ({
  id: `em-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  nombre: '', desde: '', hasta: '', minNoches: 3, activo: true,
})

const igual = (a: EstadiaMinima, b: EstadiaMinima) =>
  a.nombre === b.nombre && a.desde === b.desde && a.hasta === b.hasta && a.minNoches === b.minNoches && a.activo === b.activo

export default function EstadiasMinimasEditor({ guardadas, onGuardar }: {
  guardadas: EstadiaMinima[]
  onGuardar: (lista: EstadiaMinima[]) => void
}) {
  const [filas, setFilas] = useState<EstadiaMinima[]>(guardadas)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)

  // Si la lista guardada cambia (al guardar acá o desde otro equipo), se toma
  // la nueva, pero sin perder las filas que acá están a medio editar.
  const anteriores = useRef(guardadas)
  useEffect(() => {
    const antes = anteriores.current
    anteriores.current = guardadas
    setFilas(prev => {
      const enEdicion = prev.filter(f => {
        const o = antes.find(g => g.id === f.id)
        return !o || !igual(o, f)   // nueva o con cambios sin guardar
      })
      const editada = (id: string) => enEdicion.find(f => f.id === id)
      const sinGuardar = enEdicion.filter(f => !guardadas.some(g => g.id === f.id) && !antes.some(g => g.id === f.id))
      return [...guardadas.map(g => editada(g.id) ?? g), ...sinGuardar]
    })
  }, [guardadas])

  const upd = (i: number, patch: Partial<EstadiaMinima>) =>
    setFilas(filas.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  function guardar(i: number) {
    const f = { ...filas[i], nombre: filas[i].nombre.trim() }
    const problemas = validarEstadiaMinima(f)
    if (problemas.length) {
      setEstado({ tipo: 'error', msg: problemas.join(' ') })
      return
    }
    const existe = guardadas.some(g => g.id === f.id)
    const lista = existe ? guardadas.map(g => (g.id === f.id ? f : g)) : [...guardadas, f]
    onGuardar([...lista].sort((a, b) => a.desde.localeCompare(b.desde)))
    setEstado({ tipo: 'ok', msg: `Guardada "${f.nombre}".` })
  }

  function borrar(i: number) {
    const f = filas[i]
    if (!guardadas.some(g => g.id === f.id)) {
      setFilas(filas.filter((_, j) => j !== i))
      return
    }
    if (!confirm(`¿Borrar la estadía mínima "${f.nombre}"?`)) return
    setFilas(filas.filter((_, j) => j !== i))
    onGuardar(guardadas.filter(g => g.id !== f.id))
    setEstado({ tipo: 'ok', msg: `Borrada "${f.nombre}".` })
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-navy-800">Estadías mínimas</h3>
        <button onClick={() => setFilas([...filas, nueva()])} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">
          <Plus size={15} /> Agregar
        </button>
      </div>
      <p className="text-xs text-navy-400 mb-3">
        Si la estadía toca alguna noche del rango, se exige este mínimo o el de la temporada, el que sea mayor.
      </p>
      {estado && (
        <div className={`p-2 rounded-lg border text-sm mb-3 ${estado.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {estado.msg}
        </div>
      )}
      <div className="space-y-2">
        {filas.map((f, i) => {
          const o = guardadas.find(g => g.id === f.id)
          const cambiada = !o || !igual(o, f)
          return (
            <div key={f.id} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>Nombre</label>
                <input type="text" value={f.nombre} onChange={e => upd(i, { nombre: e.target.value })} placeholder="Año Nuevo" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Desde</label>
                <input type="date" value={f.desde} onChange={e => upd(i, { desde: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Hasta</label>
                <input type="date" value={f.hasta} min={f.desde || undefined} onChange={e => upd(i, { hasta: e.target.value })} className={inputCls} />
              </div>
              <div className="w-24">
                <label className={labelCls}>Mín. noches</label>
                <input type="number" min={1} value={f.minNoches || ''} onChange={e => upd(i, { minNoches: Number(e.target.value) || 0 })} className={inputCls} />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-navy-600 pb-2">
                <input type="checkbox" checked={f.activo} onChange={e => upd(i, { activo: e.target.checked })} /> Activo
              </label>
              <div className="flex items-center gap-1">
                <button onClick={() => guardar(i)} disabled={!cambiada} className="p-2 rounded-lg text-navy-600 hover:bg-navy-50 disabled:opacity-30" title="Guardar">
                  <Save size={16} />
                </button>
                <button onClick={() => borrar(i)} className="p-2 rounded-lg text-red-400 hover:bg-red-50" title="Eliminar">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )
        })}
        {filas.length === 0 && <p className="text-xs text-navy-400">Sin estadías mínimas especiales: rige el mínimo de cada temporada.</p>}
      </div>
    </section>
  )
}
