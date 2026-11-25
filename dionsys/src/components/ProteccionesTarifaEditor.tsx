import { useEffect, useState } from 'react'
import { Save, ShieldCheck } from 'lucide-react'
import { KEY_PROTECCIONES, validarProtecciones, type ProteccionesTarifa } from '../lib/proteccionesTarifa'
import { guardarTarifa } from '../lib/permisosTarifa'
import type { Employee } from '../types'

// Parámetros de las protecciones al guardar precios (solo el dueño). Se guardan
// en la nube como cualquier tarifa, así que el cambio queda en el historial.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'

export default function ProteccionesTarifaEditor({ employee, guardadas }: {
  employee: Employee | null
  guardadas: ProteccionesTarifa
}) {
  const [piso, setPiso] = useState(String(guardadas.pisoPorPersona))
  const [tope, setTope] = useState(String(guardadas.topeDescuento * 100))
  const [relacion, setRelacion] = useState(String(guardadas.relacionSingle))
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    setPiso(String(guardadas.pisoPorPersona))
    setTope(String(guardadas.topeDescuento * 100))
    setRelacion(String(guardadas.relacionSingle))
  }, [guardadas])

  const num = (s: string) => Number(s.replace(',', '.'))

  async function guardar() {
    const valor = { pisoPorPersona: num(piso), topeDescuento: num(tope) / 100, relacionSingle: num(relacion) }
    const valido = validarProtecciones(valor)
    if (valido.pisoPorPersona !== valor.pisoPorPersona || valido.topeDescuento !== valor.topeDescuento
      || valido.relacionSingle !== valor.relacionSingle) {
      setEstado({ tipo: 'error', msg: 'Revisá los valores: piso 0 o más, tope entre 1 y 99%, relación entre 1 y 2.' })
      return
    }
    const r = await guardarTarifa(employee, KEY_PROTECCIONES, valor, { motivo: 'Protecciones al guardar' })
    setEstado(r.error ? { tipo: 'error', msg: r.error } : { tipo: 'ok', msg: 'Guardado.' })
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mt-4">
      <h3 className="flex items-center gap-2 font-semibold text-navy-800 mb-1"><ShieldCheck size={17} /> Protecciones al guardar</h3>
      <p className="text-xs text-navy-500 mb-3">
        Avisan antes de guardar un precio raro; siempre se puede confirmar igual. Piso en 0 = sin piso.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label><span className={labelCls}>Piso por persona ($)</span>
          <input className={inputCls} inputMode="numeric" value={piso} onChange={e => setPiso(e.target.value)} />
        </label>
        <label><span className={labelCls}>Tope de descuento combinado (%)</span>
          <input className={inputCls} inputMode="decimal" value={tope} onChange={e => setTope(e.target.value)} />
        </label>
        <label><span className={labelCls}>Single de referencia (× por persona)</span>
          <input className={inputCls} inputMode="decimal" value={relacion} onChange={e => setRelacion(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={() => void guardar()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
          <Save size={15} /> Guardar
        </button>
        {estado && <span className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{estado.msg}</span>}
      </div>
    </section>
  )
}
