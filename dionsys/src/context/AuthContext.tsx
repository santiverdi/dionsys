import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import type { Employee, Role } from '../types'
import { employees as usuariosBase } from '../data/mock'
import { persist, useCloudSync } from '../lib/cloudStore'
import { esUltimoAdminActivo, mergeUsuarios, validarNombreUsuario, validarPinUsuario } from '../lib/usuarios'

const LS_USUARIOS = 'dionsys_usuarios'

interface AuthContextType {
  employee: Employee | null
  employees: Employee[]
  login: (pin: string) => Employee | null
  logout: () => void
  /** Devuelve el error a mostrar, o null si se guardó. */
  cambiarPin: (id: string, pin: string) => string | null
  /** Devuelve el error a mostrar, o null si se guardó. */
  crearUsuario: (datos: { name: string; role: Role; pin: string }) => string | null
  /** Devuelve el error a mostrar, o null si se guardó. */
  cambiarEstado: (id: string, active: boolean) => string | null
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [guardados, setGuardados] = useState<Employee[]>(() => {
    const saved = localStorage.getItem(LS_USUARIOS)
    return saved ? JSON.parse(saved) : []
  })
  const [employeeId, setEmployeeId] = useState<string | null>(() => {
    const saved = localStorage.getItem('dionsys_employee')
    return saved ? (JSON.parse(saved) as Employee).id : null
  })

  useCloudSync<Employee[]>(LS_USUARIOS, setGuardados)

  const employees = useMemo(() => mergeUsuarios(usuariosBase, guardados), [guardados])
  const employee = useMemo(
    () => employees.find(e => e.id === employeeId && e.active) ?? null,
    [employees, employeeId],
  )

  const login = useCallback((pin: string): Employee | null => {
    const found = employees.find(e => e.pin === pin && e.active)
    if (found) {
      setEmployeeId(found.id)
      localStorage.setItem('dionsys_employee', JSON.stringify(found))
    }
    return found ?? null
  }, [employees])

  const logout = useCallback(() => {
    setEmployeeId(null)
    localStorage.removeItem('dionsys_employee')
  }, [])

  // Al dar de baja a alguien se cierra su sesión en este equipo: si después lo
  // reactivan, tiene que volver a ingresar el PIN.
  if (employeeId && !employee) setEmployeeId(null)
  useEffect(() => {
    if (!employeeId) localStorage.removeItem('dionsys_employee')
  }, [employeeId])

  const guardar = useCallback((usuario: Employee) => {
    const next = [...guardados.filter(u => u.id !== usuario.id), usuario]
    setGuardados(next)
    persist(LS_USUARIOS, next)
  }, [guardados])

  const cambiarPin = useCallback((id: string, input: string): string | null => {
    const usuario = employees.find(e => e.id === id)
    if (!usuario) return 'No se encontró el usuario'
    const pin = validarPinUsuario(input, employees, id)
    if (!pin.ok) return pin.error ?? 'PIN inválido'
    guardar({ ...usuario, pin: pin.value! })
    return null
  }, [employees, guardar])

  const crearUsuario = useCallback((datos: { name: string; role: Role; pin: string }): string | null => {
    const nombre = validarNombreUsuario(datos.name, employees)
    if (!nombre.ok) return nombre.error ?? 'Nombre inválido'
    const pin = validarPinUsuario(datos.pin, employees)
    if (!pin.ok) return pin.error ?? 'PIN inválido'
    guardar({ id: `u${Date.now()}`, name: nombre.value!, pin: pin.value!, role: datos.role, active: true })
    return null
  }, [employees, guardar])

  const cambiarEstado = useCallback((id: string, active: boolean): string | null => {
    const usuario = employees.find(e => e.id === id)
    if (!usuario) return 'No se encontró el usuario'
    if (!active && esUltimoAdminActivo(id, employees)) return 'Tiene que quedar al menos un admin activo'
    guardar({ ...usuario, active })
    return null
  }, [employees, guardar])

  return (
    <AuthContext.Provider value={{ employee, employees, login, logout, cambiarPin, crearUsuario, cambiarEstado }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
