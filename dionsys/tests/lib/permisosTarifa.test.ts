import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock-first: la base (guardar_tarifa / es_dueno_tarifas) se simula; acá se
// prueba qué le manda la app y qué hace con la respuesta.
const rpc = vi.fn()
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
const aplicar = vi.fn()
vi.mock('../../src/lib/cloudStore', async orig => ({
  ...(await orig<typeof import('../../src/lib/cloudStore')>()),
  aplicarGuardadoEnNube: (...a: unknown[]) => aplicar(...a),
}))

const { guardarTarifa, esDuenoTarifas } = await import('../../src/lib/permisosTarifa')
const { persist, isTarifaKey, TARIFA_KEYS } = await import('../../src/lib/cloudStore')

const santi = { id: 'u-santi', name: 'Santi', pin: '1234', role: 'admin' as const, active: true }
const laura = { id: '3', name: 'Laura (Admin)', pin: '0000', role: 'admin' as const, active: true }

beforeEach(() => { rpc.mockReset(); aplicar.mockReset() })

describe('guardarTarifa', () => {
  it('manda id, PIN, clave, valor y motivo a guardar_tarifa y aplica el valor en este equipo', async () => {
    rpc.mockResolvedValue({ data: { ok: true, id: 17 }, error: null })
    const r = await guardarTarifa(santi, 'dionsys_tarifas_dia', { '2026-12-01': { minNoches: 2 } }, { motivo: 'finde' })
    expect(rpc).toHaveBeenCalledWith('guardar_tarifa', {
      p_emp: 'u-santi', p_pin: '1234', p_clave: 'dionsys_tarifas_dia',
      p_valor: { '2026-12-01': { minNoches: 2 } }, p_motivo: 'finde', p_revierte_id: null,
    })
    expect(r).toEqual({ error: null, historialId: 17 })
    expect(aplicar).toHaveBeenCalledWith('dionsys_tarifas_dia', { '2026-12-01': { minNoches: 2 } })
  })

  it('si la base lo rechaza (Laura no es dueña) no toca nada local y muestra el motivo', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'Solo el dueño puede cambiar tarifas.' }, error: null })
    const r = await guardarTarifa(laura, 'dionsys_tarifas_dia', {})
    expect(r.error).toBe('Solo el dueño puede cambiar tarifas.')
    expect(aplicar).not.toHaveBeenCalled()
  })

  it('bloqueo por intentos: muestra el mensaje de la base', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '28000', message: 'Demasiados intentos con PIN incorrecto. Probá de nuevo en 15 minutos.' } })
    expect((await guardarTarifa(santi, 'dionsys_tarifas_dia', {})).error).toContain('Demasiados intentos')
  })

  it('sin la función instalada en Supabase lo dice claro', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect((await guardarTarifa(santi, 'dionsys_tarifas_dia', {})).error).toContain('etapa1_tarifas.sql')
  })

  it('se niega a guardar claves que no son de tarifas o sin sesión', async () => {
    expect((await guardarTarifa(santi, 'dionsys_orders', [])).error).toContain('no es de tarifas')
    expect((await guardarTarifa(null, 'dionsys_tarifas_dia', {})).error).toContain('iniciar sesión')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('pasa el id de la entrada que revierte', async () => {
    rpc.mockResolvedValue({ data: { ok: true, id: 20 }, error: null })
    await guardarTarifa(santi, 'dionsys_promo_anticipada', { activo: false }, { revierteId: 7, motivo: 'Revierte #7' })
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_revierte_id: 7, p_motivo: 'Revierte #7' })
  })
})

describe('esDuenoTarifas', () => {
  it('pregunta al servidor y solo true cuenta como dueño', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null })
    expect(await esDuenoTarifas('u-santi-2')).toBe(true)
    rpc.mockResolvedValueOnce({ data: false, error: null })
    expect(await esDuenoTarifas('3')).toBe(false)
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } })
    expect(await esDuenoTarifas('a2')).toBe(false)
  })
  it('sin usuario: false sin preguntar', async () => {
    expect(await esDuenoTarifas(null)).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('cloudStore: las claves de tarifas no se suben con persist()', () => {
  it('coinciden con clave_tarifa_protegida() del SQL', async () => {
    const fs = await import('node:fs')
    const sql = fs.readFileSync(new URL('../../supabase/etapa1_tarifas.sql', import.meta.url), 'utf8')
    const bloque = sql.slice(sql.indexOf('select k in ('), sql.indexOf(')\n$$;'))
    const delSql = [...bloque.matchAll(/'(dionsys_[a-z_]+)'/g)].map(m => m[1]).sort()
    expect(delSql).toEqual([...TARIFA_KEYS].sort())
  })
  it('persist() de una clave de tarifas solo escribe local', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { setItem: (k: string, v: string) => store.set(k, v), getItem: (k: string) => store.get(k) ?? null })
    persist('dionsys_tarifas_dia', { a: 1 })
    expect(store.get('dionsys_tarifas_dia')).toBe('{"a":1}')
    expect(isTarifaKey('dionsys_tarifas_dia')).toBe(true)
    expect(isTarifaKey('dionsys_orders')).toBe(false)
    vi.unstubAllGlobals()
  })
})
