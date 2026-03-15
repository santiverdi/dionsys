import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Employee } from '../types'
import { employees } from '../data/mock'

interface AuthContextType {
  employee: Employee | null
  login: (pin: string) => Employee | null
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(() => {
    const saved = localStorage.getItem('dionsys_employee')
    if (!saved) return null
    const parsed = JSON.parse(saved) as Employee
    return employees.find(e => e.id === parsed.id && e.active) ?? null
  })

  const login = useCallback((pin: string): Employee | null => {
    const found = employees.find(e => e.pin === pin && e.active)
    if (found) {
      setEmployee(found)
      localStorage.setItem('dionsys_employee', JSON.stringify(found))
    }
    return found ?? null
  }, [])

  const logout = useCallback(() => {
    setEmployee(null)
    localStorage.removeItem('dionsys_employee')
  }, [])

  return (
    <AuthContext.Provider value={{ employee, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
