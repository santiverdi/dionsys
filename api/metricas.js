// Vercel Serverless Function: métricas propias de la landing (visitas y embudo)
// agregadas por día, para la pestaña Métricas de DionSys -> Página web.
// Lee la vista eventos_landing_diario con la service role key (la anon key no
// puede leerla) y exige el mismo LANDING_TOKEN que /api/leads y /api/tarifario.
//
// Request:  GET /api/metricas?dias=60   header x-landing-token: <LANDING_TOKEN>
// Response (200): { eventos: [{ dia, tipo, fuente, dispositivo, cantidad }] }

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = String(process.env.LANDING_TOKEN || process.env.LANDING_LEADS_TOKEN || '').trim()
  if (!url || !serviceKey || !token) {
    res.status(501).json({ error: 'Faltan configurar SUPABASE_SERVICE_ROLE_KEY y/o LANDING_TOKEN en Vercel.' })
    return
  }
  if (String(req.headers['x-landing-token'] || '').trim() !== token) {
    res.status(401).json({ error: 'Código de acceso incorrecto.' })
    return
  }

  const dias = Math.min(365, Math.max(1, Number(req.query?.dias) || 60))
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString().slice(0, 10)

  const r = await fetch(
    `${url}/rest/v1/eventos_landing_diario?select=*&dia=gte.${desde}&order=dia.asc`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  )
  if (!r.ok) {
    const detail = await r.text()
    console.error('[metricas] Supabase error', r.status, detail)
    res.status(502).json({ error: 'No se pudieron leer las métricas. ¿Corriste scripts/landing-metricas.sql en Supabase?' })
    return
  }
  res.status(200).json({ eventos: await r.json() })
}
