// Vercel Serverless Function: publica el tarifario de la landing pública.
// Recibe el JSON con la forma de la vista tarifario_publico.data y reescribe
// las tablas reales (temporadas, tarifas, findes_largos, fechas_bloqueadas,
// promociones, config_tarifario). La anon key NO puede escribirlas (a propósito:
// nadie puede tocar los precios desde el navegador); acá se usa la service role
// key, que vive SOLO en este endpoint (env var).
//
// Setup (una sola vez), Vercel -> Project Settings -> Environment Variables:
//   SUPABASE_SERVICE_ROLE_KEY = service_role key (supabase.com -> Project Settings -> API)
//   LANDING_TOKEN             = un código inventado por vos; el mismo se carga en
//                               DionSys -> Página web -> Consultas -> Código de acceso.
//   (la URL del proyecto sale de VITE_SUPABASE_URL, ya configurada para la app)
//
// Request:  POST application/json, header x-landing-token: <LANDING_TOKEN>
//           body = { temporadas, findesLargos, bloqueadas, config, promociones }
// Response (200): { ok: true }
//
// No es transaccional (varios pasos REST): si un paso del medio falla, se avisa
// con el paso exacto y se arregla volviendo a publicar.

const PAXES = [1, 2, 3, 4, 5]

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = process.env.LANDING_TOKEN || process.env.LANDING_LEADS_TOKEN
  if (!url || !serviceKey || !token) {
    res.status(501).json({ error: 'Faltan configurar SUPABASE_SERVICE_ROLE_KEY y/o LANDING_TOKEN en Vercel.' })
    return
  }
  if ((req.headers['x-landing-token'] || '') !== token) {
    res.status(401).json({ error: 'Código de acceso incorrecto.' })
    return
  }

  const t = req.body
  const malformado =
    !t || !Array.isArray(t.temporadas) || !t.temporadas.length ||
    !Array.isArray(t.findesLargos) || !Array.isArray(t.bloqueadas) ||
    !t.config || !t.config.vigencia ||
    t.temporadas.some(x => !x.tarifas || PAXES.some(p => !(Number(x.tarifas[p]) > 0)))
  if (malformado) {
    res.status(400).json({ error: 'El tarifario está incompleto (validarlo en DionSys antes de publicar).' })
    return
  }

  const sb = (path, opts = {}) =>
    fetch(`${url}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    })

  // Cada paso corta y reporta con nombre si Supabase lo rechaza.
  async function paso(nombre, promesa) {
    const r = await promesa
    if (!r.ok) {
      const detail = await r.text()
      console.error('[tarifario]', nombre, r.status, detail)
      throw new Error(`${nombre} (HTTP ${r.status})`)
    }
    return r
  }

  try {
    // 1. Vaciar. El orden importa: tarifas referencia a temporadas.
    await paso('borrar tarifas', sb('tarifas?id=not.is.null', { method: 'DELETE' }))
    await paso('borrar temporadas', sb('temporadas?id=not.is.null', { method: 'DELETE' }))
    await paso('borrar findes largos', sb('findes_largos?id=not.is.null', { method: 'DELETE' }))
    await paso('borrar promociones', sb('promociones?id=not.is.null', { method: 'DELETE' }))
    await paso('borrar fechas bloqueadas', sb('fechas_bloqueadas?fecha=not.is.null', { method: 'DELETE' }))

    // 2. Temporadas (pidiendo los ids nuevos para colgarles las tarifas).
    const rTemp = await paso('crear temporadas', sb('temporadas', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(t.temporadas.map((x, i) => ({
        nombre: x.nombre, desde: x.desde, hasta: x.hasta,
        min_noches: x.minNoches, sena: x.sena,
        efectivo_caro: x.efectivoCaro, efectivo_barato: x.efectivoBarato,
        dias_caros: x.diasCaros, orden: i, activo: true,
      }))),
    }))
    const tempRows = await rTemp.json() // mismo orden que el insert

    // 3. Tarifas: 5 ocupaciones por temporada; precio_finde solo si hay tarifasCaras.
    await paso('crear tarifas', sb('tarifas', {
      method: 'POST',
      body: JSON.stringify(t.temporadas.flatMap((x, i) => PAXES.map(p => ({
        temporada_id: tempRows[i].id,
        ocupacion: p,
        precio: x.tarifas[p],
        precio_finde: x.tarifasCaras ? x.tarifasCaras[p] : null,
        activo: true,
      })))),
    }))

    if (t.findesLargos.length) {
      await paso('crear findes largos', sb('findes_largos', {
        method: 'POST',
        body: JSON.stringify(t.findesLargos.map(f => ({
          nombre: f.n, desde: f.desde, hasta: f.hasta, recargo: f.recargo, activo: true,
        }))),
      }))
    }

    if (t.bloqueadas.length) {
      await paso('crear fechas bloqueadas', sb('fechas_bloqueadas', {
        method: 'POST',
        body: JSON.stringify(t.bloqueadas.map(fecha => ({ fecha, activo: true }))),
      }))
    }

    const promos = Array.isArray(t.promociones) ? t.promociones : []
    if (promos.length) {
      await paso('crear promociones', sb('promociones', {
        method: 'POST',
        body: JSON.stringify(promos.map((p, i) => ({
          titulo: p.titulo, nota: p.nota || null,
          dia_inicio: p.diaInicio, noches: p.noches,
          descuento_extra: 0, orden: i, activo: true,
        }))),
      }))
    }

    // 4. Config (upsert por clave).
    const ahora = new Date().toISOString()
    await paso('actualizar config', sb('config_tarifario?on_conflict=clave', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([
        { clave: 'tope_por_persona', valor: t.config.tope_por_persona, actualizado_at: ahora },
        { clave: 'cuotas', valor: t.config.cuotas, actualizado_at: ahora },
        { clave: 'vigencia', valor: t.config.vigencia, actualizado_at: ahora },
      ]),
    }))

    res.status(200).json({ ok: true })
  } catch (err) {
    res.status(502).json({ error: `No se pudo publicar — falló el paso: ${err.message}. Volvé a publicar para dejarlo consistente.` })
  }
}
