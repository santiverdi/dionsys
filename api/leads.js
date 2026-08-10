// Vercel Serverless Function: lista las consultas (leads) que la landing pública
// guarda en Supabase. La tabla `leads` NO debe poder leerse con la anon key
// (RLS: solo INSERT — ver scripts/landing-supabase.sql) para que los nombres y
// teléfonos de los huéspedes no queden públicos; este endpoint lee con la
// service role key, que vive SOLO acá (env var), nunca en el navegador.
//
// Setup (una sola vez), Vercel -> Project Settings -> Environment Variables:
//   SUPABASE_SERVICE_ROLE_KEY = service_role key (supabase.com -> Project Settings -> API)
//   LANDING_LEADS_TOKEN       = un código inventado por vos; el mismo se carga en
//                               DionSys -> Página web -> Consultas -> Código de acceso.
//   (la URL del proyecto sale de VITE_SUPABASE_URL, ya configurada para la app)
//
// Request:  GET con header  x-landing-token: <LANDING_LEADS_TOKEN>
// Response (200): { leads: [{ nombre, telefono, fecha_in, fecha_out, ... }] }

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = process.env.LANDING_LEADS_TOKEN
  if (!url || !serviceKey || !token) {
    res.status(501).json({ error: 'Faltan configurar SUPABASE_SERVICE_ROLE_KEY y/o LANDING_LEADS_TOKEN en Vercel.' })
    return
  }
  if ((req.headers['x-landing-token'] || '') !== token) {
    res.status(401).json({ error: 'Código de acceso incorrecto.' })
    return
  }

  const r = await fetch(`${url}/rest/v1/leads?select=*`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  })
  if (!r.ok) {
    const detail = await r.text()
    console.error('[leads] Supabase error', r.status, detail)
    res.status(502).json({ error: 'No se pudieron leer las consultas.' })
    return
  }
  res.status(200).json({ leads: await r.json() })
}
