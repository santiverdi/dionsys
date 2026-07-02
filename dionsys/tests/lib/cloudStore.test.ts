import { describe, it, expect, beforeEach } from 'vitest'

// El entorno de tests es 'node' (sin DOM): stubeamos un localStorage en memoria
// antes de importar cloudStore. cloudStore no toca localStorage al importarse, así
// que alcanza con que el stub exista cuando llamamos a persist/purge.
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)) },
  removeItem: (k: string) => { mem.delete(k) },
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage

import { persist, purgeAdminOnlyKeys, setAdminAccess, ADMIN_ONLY_KEYS } from '../../src/lib/cloudStore'

const NOMINA = 'dionsys_nomina_empleados'
const PAGOS = 'dionsys_sueldos_pagos'

describe('cloudStore — keys solo-admin (sueldos)', () => {
  beforeEach(() => {
    mem.clear()
    setAdminAccess(false)
  })

  it('ADMIN_ONLY_KEYS son exactamente las dos keys de sueldos', () => {
    expect([...ADMIN_ONLY_KEYS].sort()).toEqual([NOMINA, PAGOS].sort())
  })

  it('persist NO escribe las keys de sueldos si no hay admin', () => {
    persist(NOMINA, [{ id: '1' }])
    persist(PAGOS, [{ id: 'p' }])
    expect(localStorage.getItem(NOMINA)).toBeNull()
    expect(localStorage.getItem(PAGOS)).toBeNull()
  })

  it('persist escribe las keys de sueldos cuando hay admin', () => {
    setAdminAccess(true)
    persist(NOMINA, [{ id: '1' }])
    expect(localStorage.getItem(NOMINA)).not.toBeNull()
  })

  it('al loguearse un rol no-admin (o logout) se purgan las keys de localStorage', () => {
    // Un admin dejó datos cacheados en el equipo compartido…
    setAdminAccess(true)
    persist(NOMINA, [{ id: '1' }])
    persist(PAGOS, [{ id: 'p' }])
    expect(localStorage.getItem(NOMINA)).not.toBeNull()

    // …entra un no-admin: se corta el acceso y se purga el residuo.
    setAdminAccess(false)
    purgeAdminOnlyKeys()
    expect(localStorage.getItem(NOMINA)).toBeNull()
    expect(localStorage.getItem(PAGOS)).toBeNull()
  })

  it('no afecta a las keys normales (no sensibles)', () => {
    persist('dionsys_orders', [{ id: 'o' }])
    expect(localStorage.getItem('dionsys_orders')).not.toBeNull()
  })
})
