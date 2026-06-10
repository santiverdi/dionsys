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

const MODEL = 'gemini-2.5-flash'

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`
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

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!r.ok) {
      const detail = await r.text()
      console.error('[extract-invoice] Gemini error', r.status, detail)
      // DIAGNÓSTICO TEMPORAL: mostramos el motivo real de Gemini en pantalla.
      let reason = detail
      try { reason = JSON.parse(detail)?.error?.message || detail } catch { /* texto plano */ }
      res.status(502).json({ error: `IA rechazó (HTTP ${r.status}): ${String(reason).slice(0, 300)}` })
      return
    }

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
  } catch (err) {
    console.error('[extract-invoice] fallo', err)
    res.status(500).json({ error: 'Error inesperado al procesar la factura.' })
  }
}
