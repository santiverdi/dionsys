import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRequire } from 'node:module'

// api/aviso-propuesta.js (etapa 2, fase 5): el mail al dueño cuando entra una
// propuesta. Supabase y Resend se simulan con fetch.

const require = createRequire(import.meta.url)
const handler = require('../../../api/aviso-propuesta.js') as ((req: unknown, res: unknown) => Promise<void>) & {
  armarMail: (p: Record<string, unknown>, link: string) => { asunto: string; texto: string; html: string }
}

const fila = {
  id: 7, autor_id: 'c1', autor_nombre: 'Leandro', desde: '2026-12-10', hasta: '2026-12-12',
  precio_propuesto: '60000.00', promo_propuesta: null, motivo: 'El Guerrero está a 60k <b>ojo</b>',
}

const ENV = {
  VITE_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv', RESEND_API_KEY: 're_123',
  AVISO_PROPUESTAS_A: 'duenio@example.com', APP_URL: 'https://dionsys.example.app/',
}

function respuesta() {
  const r = { code: 0, body: undefined as unknown, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}
const pedido = (body: unknown, method = 'POST') => ({ method, body, headers: { host: 'malicioso.example' } })
const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json })

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
})
afterEach(() => { vi.unstubAllEnvs() })

describe('api/aviso-propuesta', () => {
  it('marca la propuesta como avisada y manda el mail con datos de la BASE y link a la bandeja', async () => {
    fetchMock.mockResolvedValueOnce(ok([fila])).mockResolvedValueOnce(ok({ id: 'm1' }))
    const res = respuesta()
    await handler(pedido({ id: 7 }), res)
    expect(res.code).toBe(200)
    expect(res.body).toEqual({ ok: true, avisada: true })

    const [urlSb, initSb] = fetchMock.mock.calls[0]
    expect(urlSb).toBe('https://x.supabase.co/rest/v1/propuestas_tarifa?id=eq.7&avisado_en=is.null&select=*')
    expect(initSb.method).toBe('PATCH')
    expect(initSb.headers).toMatchObject({ apikey: 'srv', Prefer: 'return=representation' })

    const [urlRe, initRe] = fetchMock.mock.calls[1]
    expect(urlRe).toBe('https://api.resend.com/emails')
    expect(initRe.headers.Authorization).toBe('Bearer re_123')
    const mail = JSON.parse(initRe.body)
    expect(mail.to).toEqual(['duenio@example.com'])
    expect(mail.from).toBe('DionSys <onboarding@resend.dev>')
    expect(mail.subject).toBe('Propuesta de tarifa de Leandro: las noches del 10/12 al 12/12')
    expect(mail.text).toContain('Propuesta: $60.000 por persona por noche')
    expect(mail.text).toContain('Revisala en la bandeja: https://dionsys.example.app/propuestas')
    // El link sale de APP_URL, nunca del Host del pedido.
    expect(mail.html).not.toContain('malicioso')
    // El texto del conserje va escapado en el HTML.
    expect(mail.html).toContain('&lt;b&gt;ojo&lt;/b&gt;')
  })

  it('ya avisada (o no existe): no manda nada', async () => {
    fetchMock.mockResolvedValueOnce(ok([]))
    const res = respuesta()
    await handler(pedido({ id: 7 }), res)
    expect(res.body).toEqual({ ok: true, avisada: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('si Resend falla, libera la marca para reintentar y avisa el error', async () => {
    fetchMock.mockResolvedValueOnce(ok([fila])).mockResolvedValueOnce({ ok: false, status: 403 }).mockResolvedValueOnce(ok([]))
    const res = respuesta()
    await handler(pedido({ id: 7 }), res)
    expect(res.code).toBe(502)
    const [url, init] = fetchMock.mock.calls[2]
    expect(url).toBe('https://x.supabase.co/rest/v1/propuestas_tarifa?id=eq.7')
    expect(JSON.parse(init.body)).toEqual({ avisado_en: null })
  })

  it('sin configurar (falta APP_URL o la clave de Resend): 501 y no toca nada', async () => {
    vi.stubEnv('APP_URL', '')
    const res = respuesta()
    await handler(pedido({ id: 7 }), res)
    expect(res.code).toBe(501)
    vi.stubEnv('APP_URL', ENV.APP_URL)
    vi.stubEnv('RESEND_API_KEY', '')
    await handler(pedido({ id: 7 }), res)
    expect(res.code).toBe(501)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('id inválido o método equivocado', async () => {
    const res = respuesta()
    await handler(pedido({ id: 'abc' }), res)
    expect(res.code).toBe(400)
    await handler(pedido({ id: 7 }, 'GET'), res)
    expect(res.code).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('mail de una propuesta de promo de una sola noche', () => {
    const m = handler.armarMail({ ...fila, desde: '2027-01-05', hasta: '2027-01-05', precio_propuesto: null, promo_propuesta: '3x2' }, 'https://a/propuestas')
    expect(m.asunto).toBe('Propuesta de tarifa de Leandro: la noche del 05/01')
    expect(m.texto).toContain('Propuesta: promo: 3x2')
  })
})
