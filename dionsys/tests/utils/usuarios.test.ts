import { describe, it, expect } from 'vitest'
import { mergeUsuarios, validarPinUsuario, validarNombreUsuario, esUltimoAdminActivo } from '../../src/lib/usuarios'
import type { Employee } from '../../src/types'

const ana: Employee = { id: '1', name: 'Ana', pin: '1111', role: 'admin', active: true }
const beto: Employee = { id: '2', name: 'Beto', pin: '2222', role: 'mucama', active: true }

describe('mergeUsuarios', () => {
  it('sin nada guardado devuelve los de fábrica', () => {
    expect(mergeUsuarios([ana, beto], [])).toEqual([ana, beto])
  })
  it('lo guardado pisa por id y conserva el orden', () => {
    const editado = { ...ana, pin: '9999' }
    expect(mergeUsuarios([ana, beto], [editado])).toEqual([editado, beto])
  })
  it('agrega al final los usuarios nuevos', () => {
    const nuevo: Employee = { id: 'u1', name: 'Caro', pin: '3333', role: 'concierge', active: true }
    expect(mergeUsuarios([ana, beto], [nuevo])).toEqual([ana, beto, nuevo])
  })
})

describe('validarPinUsuario', () => {
  it('acepta un PIN libre', () => {
    expect(validarPinUsuario('3333', [ana, beto])).toEqual({ ok: true, value: '3333' })
  })
  it('rechaza un PIN que no tiene 4 dígitos', () => {
    expect(validarPinUsuario('12', [ana, beto]).ok).toBe(false)
  })
  it('rechaza el PIN de otro usuario', () => {
    expect(validarPinUsuario('2222', [ana, beto], '1').ok).toBe(false)
  })
  it('permite volver a poner el propio PIN', () => {
    expect(validarPinUsuario('1111', [ana, beto], '1').ok).toBe(true)
  })
})

describe('esUltimoAdminActivo', () => {
  const otroAdmin: Employee = { id: '3', name: 'Caro', pin: '3333', role: 'admin', active: true }

  it('detecta al único admin activo', () => {
    expect(esUltimoAdminActivo('1', [ana, beto])).toBe(true)
  })
  it('no bloquea si hay otro admin activo', () => {
    expect(esUltimoAdminActivo('1', [ana, otroAdmin])).toBe(false)
  })
  it('no cuenta a los admins inactivos', () => {
    expect(esUltimoAdminActivo('1', [ana, { ...otroAdmin, active: false }])).toBe(true)
  })
  it('no aplica a quien no es admin', () => {
    expect(esUltimoAdminActivo('2', [ana, beto])).toBe(false)
  })
})

describe('validarNombreUsuario', () => {
  it('recorta espacios', () => {
    expect(validarNombreUsuario('  Caro ', [ana])).toEqual({ ok: true, value: 'Caro' })
  })
  it('rechaza vacío', () => {
    expect(validarNombreUsuario('  ', [ana]).ok).toBe(false)
  })
  it('rechaza un nombre repetido sin importar mayúsculas', () => {
    expect(validarNombreUsuario('ANA', [ana]).ok).toBe(false)
  })
})
