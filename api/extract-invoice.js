// Vercel Serverless Function: lee una factura (PDF o imagen) con Gemini Flash
// y devuelve los datos del pago en JSON. La API key vive SOLO acá (env var),
// nunca en el navegador.
//
// Setup (una sola vez):
//   1. Crear API key gratis en https://aistudio.google.com/app/apikey
//   2. Vercel -> Project Settings -> Environment Variables: GEMINI_API_KEY=...
//      (marcar Production + Preview) y redeploy.
//
// Request  (POST application/json): { mimeType: string, data: string(base64 sin prefijo) }
// Response (200): { nombre, nroCuenta, monto, vtoActual, vtoSiguiente }

// Probamos los modelos en orden: si el 1ro está saturado (503), caemos al siguiente.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const RETRYABLE = new Set([429, 500, 503]) // saturación / sobrecarga transitoria
const MAX_TRIES_PER_MODEL = 3
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PROMPT = `Sos un asistente que extrae datos de facturas argentinas de servicios e impuestos (luz, gas, agua, ABL/municipales, expensas, etc.).
Analizá el documento adjunto y devolvé EXACTAMENTE estos campos:
- nombre: empresa o servicio que emite la factura (ej: "EDEA", "CAMUZZI", "OSSE", "MUNICIPALIDAD"). En mayúsculas, corto.
- nroCuenta: número de cuenta / cliente / suministro / partida que identifica al titular. Solo el número o código, sin etiquetas ni texto.
- monto: importe TOTAL A PAGAR del PRIMER vencimiento, como número con punto decimal, sin separador de miles ni símbolo (ej: "15234.50").
- vtoActual: fecha del 1er vencimiento en formato YYYY-MM-DD.
- vtoSiguiente: fecha del 2do vencimiento en formato YYYY-MM-DD si existe; si no, cadena vacía "".
Si un dato no aparece en el documento, devolvé cadena vacía "" en ese campo. No inventes datos.`

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    nombre: { type: 'STRING' },
    nroCuenta: { type: 'STRING' },
    monto: { type: 'STRING' },
    vtoActual: { type: 'STRING' },
    vtoSiguiente: { type: 'STRING' },
  },
  required: ['nombre', 'nroCuenta', 'monto', 'vtoActual', 'vtoSiguiente'],
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido' })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }
  const mimeType = body && body.mimeType
  const data = body && body.data
  if (!mimeType || !data) {
    res.status(400).json({ error: 'Faltan datos del archivo (mimeType / data).' })
    return
  }
  // Guarda de tamaño: el límite del body en Vercel es ~4.5MB.
  if (data.length > 6_000_000) {
    res.status(413).json({ error: 'El archivo es muy grande. Probá con una foto más liviana o un PDF más chico.' })
    return
  }

  const payload = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  }

  // Recorre los modelos; en cada uno reintenta ante sobrecarga transitoria (503/429/500)
  // con backoff creciente. Solo aborta ante un error NO recuperable (ej: 400, 403).
  let lastStatus = 0
  let lastReason = ''
  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    for (let attempt = 1; attempt <= MAX_TRIES_PER_MODEL; attempt++) {
      let r
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch (err) {
        console.error('[extract-invoice] fetch fallo', model, err)
        lastStatus = 0
        lastReason = 'No se pudo conectar con el servicio de IA.'
        await sleep(attempt * 600)
        continue
      }

      if (r.ok) {
        const json = await r.json()
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
        if (!text) {
          res.status(502).json({ error: 'La IA no devolvió datos legibles de la factura.' })
          return
        }
        let parsed
        try { parsed = JSON.parse(text) } catch {
          res.status(502).json({ error: 'No se pudo interpretar la respuesta de la IA.' })
          return
        }
        res.status(200).json({
          nombre: String(parsed.nombre ?? '').trim(),
          nroCuenta: String(parsed.nroCuenta ?? '').trim(),
          monto: String(parsed.monto ?? '').trim(),
          vtoActual: String(parsed.vtoActual ?? '').trim(),
          vtoSiguiente: String(parsed.vtoSiguiente ?? '').trim(),
        })
        return
      }

      const detail = await r.text()
      console.error('[extract-invoice] Gemini error', model, r.status, detail)
      lastStatus = r.status
      try { lastReason = JSON.parse(detail)?.error?.message || detail } catch { lastReason = detail }

      if (!RETRYABLE.has(r.status)) {
        // Error definitivo (key inválida, request mal armado, etc.): no insistir.
        // El detalle real queda en los logs (console.error de arriba).
        res.status(502).json({ error: 'No se pudo leer la factura (error del servicio de IA).' })
        return
      }
      // Sobrecarga transitoria: esperar y reintentar (backoff 0.6s, 1.2s, 1.8s).
      if (attempt < MAX_TRIES_PER_MODEL) await sleep(attempt * 600)
    }
    // Este modelo no respondió tras varios intentos: probamos el siguiente.
  }

  res.status(503).json({
    error: 'El servicio de IA está saturado en este momento. Probá de nuevo en un minuto.',
    detail: `HTTP ${lastStatus}: ${String(lastReason).slice(0, 200)}`,
  })
}
