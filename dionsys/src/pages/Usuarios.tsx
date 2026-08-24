import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { employees } from '../data/mock'
import type { Role } from '../types'

// Vista de admin: los usuarios del sistema con su PIN de acceso. Solo lectura
// (los PINs se editan en src/data/mock.ts). El PIN es de 4 dígitos y va en el
// bundle público: sirve para separar roles adentro del hotel, no como secreto
// fuerte — ver la nota al pie.

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administración',
  concierge: 'Conserje',
  mucama: 'Mucama',
  mantenimiento: 'Mantenimiento',
  encargada: 'Encargada',
}

const ROLE_CLS: Record<Role, string> = {
  admin: 'bg-violet-100 text-violet-700',
  concierge: 'bg-sky-100 text-sky-700',
  mucama: 'bg-emerald-100 text-emerald-700',
  mantenimiento: 'bg-amber-100 text-amber-700',
  encargada: 'bg-rose-100 text-rose-700',
}

export default function Usuarios() {
  const [verPins, setVerPins] = useState(false)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold text-navy-800">Usuarios</h2>
        <button
          onClick={() => setVerPins(v => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy-800 text-cream hover:bg-navy-700"
        >
          {verPins ? <EyeOff size={16} /> : <Eye size={16} />}
          {verPins ? 'Ocultar PINs' : 'Mostrar PINs'}
        </button>
      </div>
      <p className="text-sm text-navy-500 mb-4">
        Quiénes entran al sistema y con qué PIN. Los usuarios inactivos no pueden iniciar sesión.
      </p>

      <div className="bg-white rounded-xl border border-navy-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="text-left text-xs text-navy-400 border-b border-navy-100">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">PIN</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(e => (
              <tr key={e.id} className="border-b border-navy-50 last:border-0">
                <td className="px-4 py-3 font-medium text-navy-800">{e.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${ROLE_CLS[e.role]}`}>
                    {ROLE_LABEL[e.role]}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono tracking-widest text-navy-800">
                  {verPins ? e.pin : '••••'}
                </td>
                <td className="px-4 py-3">
                  {e.active ? (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Activo</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-navy-100 text-navy-500">Inactivo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-navy-400 mt-4 leading-relaxed">
        Para cambiar un PIN o dar de alta/baja a alguien, se edita <code>src/data/mock.ts</code>.
        Tené en cuenta que el PIN viaja dentro de la página: cualquiera con conocimientos técnicos
        que abra el código del sitio puede leerlo. Sirve para separar los roles adentro del hotel,
        no como una contraseña secreta — no reutilices estos PINs para el banco, el mail ni nada importante.
      </p>
    </div>
  )
}
