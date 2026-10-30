import type { Employee } from '../types'
import { validatePin, type ValidationResult } from '../utils/validators'

// Los usuarios de fábrica viven en data/mock.ts. En el almacén de la nube solo se
// guardan los que el admin creó o modificó: lo guardado pisa por id a lo de fábrica.
export function mergeUsuarios(base: Employee[], guardados: Employee[]): Employee[] {
  const porId = new Map(guardados.map(u => [u.id, u]))
  const nuevos = guardados.filter(u => !base.some(b => b.id === u.id))
  return [...base.map(b => porId.get(b.id) ?? b), ...nuevos]
}

/** El login identifica a la persona solo por el PIN, así que no se puede repetir. */
export function validarPinUsuario(
  input: string,
  usuarios: Employee[],
  excluirId?: string,
): ValidationResult<string> {
  const pin = validatePin(input)
  if (!pin.ok) return pin
  const enUso = usuarios.some(u => u.pin === pin.value && u.id !== excluirId)
  if (enUso) return { ok: false, error: 'Ese PIN ya lo usa otro usuario' }
  return pin
}

/** Si no queda ningún admin activo, nadie más podría entrar a esta pantalla. */
export function esUltimoAdminActivo(id: string, usuarios: Employee[]): boolean {
  const admins = usuarios.filter(u => u.role === 'admin' && u.active)
  return admins.length === 1 && admins[0].id === id
}

export function validarNombreUsuario(input: string, usuarios: Employee[]): ValidationResult<string> {
  const nombre = input.trim()
  if (!nombre) return { ok: false, error: 'Ingresá el nombre' }
  const enUso = usuarios.some(u => u.name.toLowerCase() === nombre.toLowerCase())
  if (enUso) return { ok: false, error: 'Ya existe un usuario con ese nombre' }
  return { ok: true, value: nombre }
}
