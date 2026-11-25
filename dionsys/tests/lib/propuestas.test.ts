import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Propuestas de los conserjes (etapa 2, fase 4). Mock-first: la base se
// simula; acá se prueba qué le manda la app y qué hace con la respuesta. Las
// funciones SQL se probaron aparte en un Postgres local (29 comprobaciones).
const rpc = vi.fn()
vi.mock('../../src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const {
  crearPropuesta, misPropuestas, listarPropuestas, resolverPropuesta, contarPendientes, errorDePropuesta,
  aplicarPrecioPropuesta, singleSugerida, resumenPropuesta, aPropuesta, avisoPorMailActivo,
  resumenPendientes, textoPendientes, textoUltima, SIN_PENDIENTES,
} = await import('../../src/lib/propuestas')

const leandro = { id: 'c1', name: 'Leandro', pin: '2222', role: 'concierge' as const, active: true }
const santi = { id: '3', name: 'Santi (Admin)', pin: '1234', role: 'admin' as const, active: true }
const HOY = '2026-11-25'
const nueva = { desde: '2026-12-10', hasta: '2026-12-12', precio: 60_000, promo: '', motivo: 'El Guerrero está a 60k' }

beforeEach(() => { rpc.mockReset(); fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true }) })
afterEach(() => { vi.unstubAllEnvs() })

describe('crear una propuesta (conserje)', () => {
  it('manda quién, fechas, precio, promo y motivo; con el mail apagado NO hace ningún pedido más', async () => {
    rpc.mockResolvedValue({ data: 41, error: null })
    const r = await crearPropuesta(leandro, { ...nueva, promo: '  ', motivo: '  El Guerrero está a 60k ' })
    expect(rpc).toHaveBeenCalledWith('crear_propuesta_tarifa', {
      p_emp: 'c1', p_nombre: 'Leandro', p_desde: '2026-12-10', p_hasta: '2026-12-12',
      p_precio: 60_000, p_promo: null, p_motivo: 'El Guerrero está a 60k',
    })
    expect(r).toEqual({ id: 41, error: null })
    expect(avisoPorMailActivo()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con el mail prendido (VITE_AVISO_PROPUESTAS_MAIL=si) pide el aviso con el id', async () => {
    vi.stubEnv('VITE_AVISO_PROPUESTAS_MAIL', 'si')
    rpc.mockResolvedValue({ data: 41, error: null })
    await crearPropuesta(leandro, nueva)
    expect(fetchMock).toHaveBeenCalledWith('/api/aviso-propuesta', expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 41 }) }))
  })

  it('con el mail prendido, si el mail falla, la propuesta igual quedó creada', async () => {
    vi.stubEnv('VITE_AVISO_PROPUESTAS_MAIL', 'si')
    rpc.mockResolvedValue({ data: 42, error: null })
    fetchMock.mockRejectedValue(new Error('sin red'))
    expect(await crearPropuesta(leandro, nueva)).toEqual({ id: 42, error: null })
  })

  it('muestra el error de la base (límite por hora) y no manda mail', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '54000', message: 'Demasiadas propuestas en la última hora. Probá más tarde.' } })
    expect((await crearPropuesta(leandro, nueva)).error).toContain('Demasiadas propuestas')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sin el SQL instalado lo dice claro', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    expect((await crearPropuesta(leandro, nueva)).error).toContain('etapa2_tarifas.sql')
  })

  it('sin sesión no llama a la base', async () => {
    expect((await crearPropuesta(null, nueva)).error).toContain('iniciar sesión')
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('validación antes de mandar', () => {
  it('ok con precio o con promo', () => {
    expect(errorDePropuesta(nueva, HOY)).toBeNull()
    expect(errorDePropuesta({ ...nueva, precio: null, promo: '3x2 en semana' }, HOY)).toBeNull()
  })
  it('rechaza lo incompleto', () => {
    expect(errorDePropuesta({ ...nueva, hasta: '2026-12-01' }, HOY)).toMatch(/noches/)
    expect(errorDePropuesta({ ...nueva, desde: '2026-11-01', hasta: '2026-11-10' }, HOY)).toMatch(/pasaron/)
    expect(errorDePropuesta({ ...nueva, precio: null, promo: ' ' }, HOY)).toMatch(/precio por persona o describí/)
    expect(errorDePropuesta({ ...nueva, precio: 0 }, HOY)).toMatch(/mayor a 0/)
    expect(errorDePropuesta({ ...nueva, motivo: ' ' }, HOY)).toMatch(/motivo/)
  })
})

describe('mis propuestas, bandeja, resolver y contador', () => {
  const fila = {
    id: '7', autor_id: 'c1', autor_nombre: 'Leandro', desde: '2026-12-10', hasta: '2026-12-12',
    precio_propuesto: '60000.00', promo_propuesta: null, motivo: 'x', estado: 'pendiente', respuesta: null,
    creado_en: '2026-11-25T12:00:00Z', actualizado_en: '2026-11-25T12:00:00Z',
    historial_id: null, resuelto_por: null, resuelto_en: null,
  }

  it('mis propuestas: por id del conserje; los numéricos de Postgres llegan como número', async () => {
    rpc.mockResolvedValue({ data: [fila], error: null })
    const r = await misPropuestas(leandro)
    expect(rpc).toHaveBeenCalledWith('mis_propuestas_tarifa', { p_emp: 'c1' })
    expect(r.propuestas[0]).toMatchObject({ id: 7, precio_propuesto: 60_000, historial_id: null })
  })

  it('la bandeja pide el PIN del dueño', async () => {
    rpc.mockResolvedValue({ data: { ok: true, propuestas: [fila] }, error: null })
    const r = await listarPropuestas(santi)
    expect(rpc).toHaveBeenCalledWith('listar_propuestas_tarifa', { p_emp: '3', p_pin: '1234' })
    expect(r).toMatchObject({ error: null, propuestas: [{ id: 7 }] })
  })

  it('la bandeja para alguien que no es el dueño: el error de la base, sin propuestas', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'Solo el dueño ve las propuestas.' }, error: null })
    expect(await listarPropuestas(leandro)).toEqual({ propuestas: [], error: 'Solo el dueño ve las propuestas.' })
  })

  it('aplicar manda el id del historial; la respuesta vacía va como null', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null })
    expect(await resolverPropuesta(santi, 7, 'aplicada', '  ', 55)).toBeNull()
    expect(rpc).toHaveBeenCalledWith('resolver_propuesta_tarifa', {
      p_emp: '3', p_pin: '1234', p_id: 7, p_estado: 'aplicada', p_respuesta: null, p_historial_id: 55,
    })
  })

  it('resolver una ya resuelta: el error de la base', async () => {
    rpc.mockResolvedValue({ data: { ok: false, error: 'La propuesta no existe o ya estaba resuelta.' }, error: null })
    expect(await resolverPropuesta(santi, 7, 'rechazada', 'no')).toContain('ya estaba resuelta')
  })

  it('contador: el número, o 0 si algo falla', async () => {
    rpc.mockResolvedValue({ data: 3, error: null })
    expect(await contarPendientes()).toBe(3)
    rpc.mockResolvedValue({ data: null, error: { message: 'x' } })
    expect(await contarPendientes()).toBe(0)
  })

  it('resumen en una línea', () => {
    expect(resumenPropuesta(aPropuesta(fila))).toBe('$60.000 por persona — noches del 10/12 al 12/12')
    expect(resumenPropuesta({ desde: '2027-01-05', hasta: '2027-01-05', precio_propuesto: null, promo_propuesta: '3x2' }))
      .toBe('3x2 — noche del 05/01')
  })
})

describe('aplicar una propuesta de precio', () => {
  const ajustes = {
    '2026-12-10': { porPersona: 48_000, single: 85_000, descEfectivo: 0.1, minNoches: 2 },
    '2026-12-11': { minNoches: 3 },
  }

  it('pone el precio en cada noche; conserva mínimo y efectivo; sin efectivo cargado usa el de hoy', () => {
    const n = aplicarPrecioPropuesta(ajustes, ['2026-12-10', '2026-12-11', '2026-12-12'], 60_000, 111_000, () => 0.2)
    expect(n['2026-12-10']).toEqual({ porPersona: 60_000, single: 111_000, descEfectivo: 0.1, minNoches: 2 })
    expect(n['2026-12-11']).toEqual({ porPersona: 60_000, single: 111_000, descEfectivo: 0.2, minNoches: 3 })
    expect(n['2026-12-12']).toEqual({ porPersona: 60_000, single: 111_000, descEfectivo: 0.2 })
    expect(ajustes['2026-12-10'].porPersona).toBe(48_000)   // no toca el original
  })

  it('single sugerida: relación de las protecciones, redondeada a $1.000', () => {
    expect(singleSugerida(60_000, 1.85)).toBe(111_000)
    expect(singleSugerida(48_500, 1.85)).toBe(90_000)
  })
})

describe('aviso de pendientes en Inicio', () => {
  const fila = (id: number, autor: string, creado: string, estado = 'pendiente') => ({
    id, autor_id: 'c', autor_nombre: autor, desde: '2026-12-10', hasta: '2026-12-12', precio_propuesto: 60000,
    promo_propuesta: null, motivo: 'x', estado, respuesta: null, creado_en: creado, actualizado_en: creado,
    historial_id: null, resuelto_por: null, resuelto_en: null,
  })
  const bandeja = (filas: unknown[]) => ({ data: { ok: true, propuestas: filas }, error: null })

  it('sin pendientes: no pide el detalle (ni el PIN)', async () => {
    rpc.mockResolvedValueOnce({ data: 0, error: null })
    expect(await resumenPendientes(santi, SIN_PENDIENTES)).toEqual(SIN_PENDIENTES)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('contar_propuestas_pendientes')
  })

  it('con pendientes: la más reciente sale de la bandeja (las resueltas no cuentan)', async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce(bandeja([
      fila(1, 'Leandro', '2026-11-25T10:00:00Z'), fila(3, 'Gaston', '2026-11-25T12:00:00Z'),
      fila(2, 'Valentin', '2026-11-25T13:00:00Z', 'rechazada'),
    ]))
    const r = await resumenPendientes(santi, SIN_PENDIENTES)
    expect(r.cantidad).toBe(2)
    expect(r.ultima).toMatchObject({ id: 3, autor_nombre: 'Gaston' })
    expect(rpc).toHaveBeenLastCalledWith('listar_propuestas_tarifa', { p_emp: '3', p_pin: '1234' })
  })

  it('si el número no cambió, reusa el detalle: cada refresco no suma intentos de PIN', async () => {
    const previo = { cantidad: 2, ultima: aPropuesta(fila(3, 'Gaston', '2026-11-25T12:00:00Z')) }
    rpc.mockResolvedValueOnce({ data: 2, error: null })
    expect(await resumenPendientes(santi, previo)).toBe(previo)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('si el número cambió, vuelve a pedir el detalle', async () => {
    const previo = { cantidad: 1, ultima: aPropuesta(fila(1, 'Leandro', '2026-11-25T10:00:00Z')) }
    rpc.mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce(bandeja([fila(4, 'Santiago', '2026-11-26T09:00:00Z')]))
    expect((await resumenPendientes(santi, previo)).ultima?.autor_nombre).toBe('Santiago')
  })

  it('textos: singular, plural y la más reciente', () => {
    expect(textoPendientes(1)).toBe('Tenés 1 propuesta de tarifa pendiente')
    expect(textoPendientes(3)).toBe('Tenés 3 propuestas de tarifa pendientes')
    expect(textoUltima(aPropuesta(fila(1, 'Leandro', 'x')))).toBe('La más reciente: Leandro, noches del 10/12 al 12/12.')
    expect(textoUltima({ ...aPropuesta(fila(1, 'Leandro', 'x')), hasta: '2026-12-10' })).toBe('La más reciente: Leandro, noche del 10/12.')
  })
})
