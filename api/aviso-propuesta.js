// Vercel Serverless Function: avisa por mail al dueño que entró una propuesta
// de tarifa de un conserje (Recepción → Tarifas → "Proponer cambio").
//
// La app llama acá con el id recién creado. El contenido del mail sale de la
// BASE (no del navegador), así nadie puede usar este endpoint para mandar
// mails con otro texto; y cada propuesta se avisa UNA sola vez (avisado_en).
//
// Setup (una sola vez), Vercel -> proyecto DionSys -> Settings -> Environment Variables:
//   RESEND_API_KEY            = API key de Resend (resend.com -> API Keys)
//   AVISO_PROPUESTAS_A        = a quién avisar (el mail del dueño; el de la cuenta de Resend)
//   AVISO_PROPUESTAS_DE       = (opcional) remitente; sin dominio propio en Resend:
//                               "DionSys <onboarding@resend.dev>" (el valor por defecto)
//   APP_URL                   = dirección de DionSys para el link del mail (p. ej. https://dionsys.vercel.app).
//                               Obligatoria: el link NO se arma con el Host del pedido, que lo puede falsear
//                               cualquiera que llame a este endpoint.
//   SUPABASE_SERVICE_ROLE_KEY = la misma que usan /api/tarifario y /api/leads
//   (la URL del proyecto sale de VITE_SUPABASE_URL, ya configurada para la app)
//
// Request:  POST application/json  { "id": 123 }
// Response: 200 { ok: true, avisada: true | false }  ·  501 si falta configurar el mail

const env = k => String(process.env[k] || '').trim()

const money = n => '$' + Math.round(Number(n)).toLocaleString('es-AR')
const dm = s => `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}`
const escapar = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Asunto, texto y HTML del mail para una fila de propuestas_tarifa. */
function armarMail(p, link) {
  const noches = p.desde === p.hasta ? `la noche del ${dm(p.desde)}` : `las noches del ${dm(p.desde)} al ${dm(p.hasta)}`
  const que = [
    p.precio_propuesto != null ? `${money(p.precio_propuesto)} por persona por noche` : null,
    p.promo_propuesta ? `promo: ${p.promo_propuesta}` : null,
  ].filter(Boolean).join(' · ')
  const asunto = `Propuesta de tarifa de ${p.autor_nombre}: ${noches}`
  const texto = [
    `${p.autor_nombre} propone un cambio de tarifa en DionSys.`,
    '',
    `Fechas: ${noches}`,
    `Propuesta: ${que}`,
    `Motivo: ${p.motivo}`,
    '',
    `Revisala en la bandeja: ${link}`,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2a44">
  <p><b>${escapar(p.autor_nombre)}</b> propone un cambio de tarifa en DionSys.</p>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 12px 4px 0;color:#667">Fechas</td><td>${escapar(noches)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#667">Propuesta</td><td><b>${escapar(que)}</b></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#667;vertical-align:top">Motivo</td><td>${escapar(p.motivo)}</td></tr>
  </table>
  <p><a href="${escapar(link)}" style="display:inline-block;background:#1e2a44;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir la bandeja de propuestas</a></p>
</div>`
  return { asunto, texto, html }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const url = (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, '')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = env('RESEND_API_KEY')
  const para = env('AVISO_PROPUESTAS_A')
  const appUrl = env('APP_URL').replace(/\/+$/, '')
  if (!url || !serviceKey || !resendKey || !para || !/^https:\/\//.test(appUrl)) {
    res.status(501).json({ error: 'Falta configurar el aviso por mail (RESEND_API_KEY, AVISO_PROPUESTAS_A, APP_URL) en Vercel.' })
    return
  }
  const id = Number(req.body && req.body.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Falta el id de la propuesta.' })
    return
  }

  const sb = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })

  try {
    // Se "reserva" el aviso en un solo paso: solo si todavía no estaba avisada.
    // Si dos pedidos llegan juntos, uno solo recibe la fila y manda el mail.
    const r = await sb(`propuestas_tarifa?id=eq.${id}&avisado_en=is.null&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ avisado_en: new Date().toISOString() }),
    })
    if (!r.ok) {
      res.status(502).json({ error: `Supabase respondió ${r.status}.` })
      return
    }
    const filas = await r.json()
    if (!Array.isArray(filas) || !filas.length) {
      res.status(200).json({ ok: true, avisada: false })   // no existe o ya se avisó
      return
    }
    const p = filas[0]
    const { asunto, texto, html } = armarMail(p, `${appUrl}/propuestas`)

    const envio = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('AVISO_PROPUESTAS_DE') || 'DionSys <onboarding@resend.dev>',
        to: para.split(',').map(s => s.trim()).filter(Boolean),
        subject: asunto, text: texto, html,
      }),
    })
    if (!envio.ok) {
      // Se libera para que un próximo intento la vuelva a avisar.
      await sb(`propuestas_tarifa?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ avisado_en: null }) })
      res.status(502).json({ error: `Resend respondió ${envio.status}.` })
      return
    }
    res.status(200).json({ ok: true, avisada: true })
  } catch (e) {
    res.status(500).json({ error: 'No se pudo mandar el aviso: ' + (e && e.message ? e.message : 'error desconocido') })
  }
}

module.exports.armarMail = armarMail
