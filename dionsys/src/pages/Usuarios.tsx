import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { useAuth } from '../context/AuthContext'
import type { Employee, Role } from '../types'

// Vista de admin: los usuarios del sistema con su PIN de acceso. Desde acá se
// cambian los PINs y se crean usuarios (se sincronizan a todos los dispositivos).
// El PIN es de 4 dígitos y se puede leer desde el navegador: sirve para separar
// roles adentro del hotel, no como secreto fuerte — ver la nota al pie.

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

const ROLES = Object.keys(ROLE_LABEL) as Role[]

const INPUT_CLS = 'px-3 py-2 rounded-lg border border-navy-200 text-sm text-navy-800'
const PIN_INPUT_PROPS = { inputMode: 'numeric', maxLength: 4, autoComplete: 'off' } as const

export default function Usuarios() {
  const { employee, employees, cambiarPin, crearUsuario, cambiarEstado } = useAuth()
  const [verPins, setVerPins] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pinNuevo, setPinNuevo] = useState('')
  const [errorPin, setErrorPin] = useState('')
  const [creando, setCreando] = useState(false)
  const [alta, setAlta] = useState<{ name: string; role: Role; pin: string }>({ name: '', role: 'concierge', pin: '' })
  const [errorAlta, setErrorAlta] = useState('')
  const [aDesactivar, setADesactivar] = useState<Employee | null>(null)
  const [errorEstado, setErrorEstado] = useState('')

  function aplicarEstado(id: string, active: boolean) {
    setErrorEstado(cambiarEstado(id, active) ?? '')
    setADesactivar(null)
  }

  function empezarEdicion(id: string) {
    setEditandoId(id)
    setPinNuevo('')
    setErrorPin('')
  }

  function guardarPin(e: FormEvent) {
    e.preventDefault()
    if (!editandoId) return
    const error = cambiarPin(editandoId, pinNuevo)
    if (error) {
      setErrorPin(error)
      return
    }
    setEditandoId(null)
  }

  function guardarAlta(e: FormEvent) {
    e.preventDefault()
    const error = crearUsuario(alta)
    if (error) {
      setErrorAlta(error)
      return
    }
    setAlta({ name: '', role: 'concierge', pin: '' })
    setErrorAlta('')
    setCreando(false)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 className="text-xl font-bold text-navy-800">Usuarios</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setVerPins(v => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy-100 text-navy-700 hover:bg-navy-200"
          >
            {verPins ? <EyeOff size={16} /> : <Eye size={16} />}
            {verPins ? 'Ocultar PINs' : 'Mostrar PINs'}
          </button>
          <button
            onClick={() => { setCreando(c => !c); setErrorAlta('') }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-navy-800 text-cream hover:bg-navy-700"
          >
            <UserPlus size={16} />
            Nuevo usuario
          </button>
        </div>
      </div>
      <p className="text-sm text-navy-500 mb-4">
        Quiénes entran al sistema y con qué PIN. Los usuarios inactivos no pueden iniciar sesión.
      </p>

      {creando && (
        <form onSubmit={guardarAlta} className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-navy-500">
              Nombre
              <input
                value={alta.name}
                onChange={e => setAlta({ ...alta, name: e.target.value })}
                className={INPUT_CLS}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-navy-500">
              Rol
              <select
                value={alta.role}
                onChange={e => setAlta({ ...alta, role: e.target.value as Role })}
                className={INPUT_CLS}
              >
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-navy-500">
              PIN (4 dígitos)
              <input
                {...PIN_INPUT_PROPS}
                value={alta.pin}
                onChange={e => setAlta({ ...alta, pin: e.target.value })}
                className={`${INPUT_CLS} font-mono tracking-widest`}
              />
            </label>
          </div>
          {errorAlta && <p className="text-red-500 text-sm mt-3">{errorAlta}</p>}
          <div className="flex gap-2 mt-3">
            <button type="submit" className="px-3 py-2 rounded-lg text-sm bg-navy-800 text-cream hover:bg-navy-700">
              Crear usuario
            </button>
            <button
              type="button"
              onClick={() => setCreando(false)}
              className="px-3 py-2 rounded-lg text-sm bg-navy-100 text-navy-700 hover:bg-navy-200"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {errorEstado && <p className="text-red-500 text-sm mb-3">{errorEstado}</p>}

      <div className="bg-white rounded-xl border border-navy-100 overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
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
                <td className="px-4 py-3">
                  {editandoId === e.id ? (
                    <form onSubmit={guardarPin}>
                      <div className="flex items-center gap-2">
                        <input
                          {...PIN_INPUT_PROPS}
                          aria-label={`Nuevo PIN de ${e.name}`}
                          value={pinNuevo}
                          onChange={ev => setPinNuevo(ev.target.value)}
                          className={`${INPUT_CLS} w-20 font-mono tracking-widest`}
                          autoFocus
                        />
                        <button type="submit" className="text-xs font-medium text-navy-800 hover:underline">Guardar</button>
                        <button type="button" onClick={() => setEditandoId(null)} className="text-xs text-navy-400 hover:underline">
                          Cancelar
                        </button>
                      </div>
                      {errorPin && <p className="text-red-500 text-xs mt-1">{errorPin}</p>}
                    </form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-mono tracking-widest text-navy-800">{verPins ? e.pin : '••••'}</span>
                      <button onClick={() => empezarEdicion(e.id)} className="text-xs text-navy-500 hover:underline">
                        Cambiar
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {e.active ? (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Activo</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-navy-100 text-navy-500">Inactivo</span>
                    )}
                    <button
                      onClick={() => (e.active ? setADesactivar(e) : aplicarEstado(e.id, true))}
                      className="text-xs text-navy-500 hover:underline"
                    >
                      {e.active ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-navy-400 mt-4 leading-relaxed">
        Tené en cuenta que los PINs se pueden leer desde el navegador: cualquiera con conocimientos
        técnicos puede verlos. Sirven para separar los roles adentro del hotel, no como una contraseña
        secreta — no reutilices estos PINs para el banco, el mail ni nada importante.
      </p>

      <ConfirmDialog
        open={aDesactivar !== null}
        title="Dar de baja"
        message={
          aDesactivar?.id === employee?.id
            ? 'Te estás dando de baja a vos: se va a cerrar tu sesión y no vas a poder volver a entrar hasta que otro admin te reactive.'
            : `${aDesactivar?.name} no va a poder iniciar sesión hasta que se reactive el usuario. Su PIN queda reservado.`
        }
        confirmLabel="Dar de baja"
        onConfirm={() => aDesactivar && aplicarEstado(aDesactivar.id, false)}
        onCancel={() => setADesactivar(null)}
      />
    </div>
  )
}
