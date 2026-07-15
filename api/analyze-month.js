// Vercel Serverless Function: recibe el resumen numérico del mes del hotel
// (armado en el cliente por src/lib/analisisMes.ts) y devuelve un análisis en
// lenguaje natural escrito por Gemini. La API key vive SOLO acá (misma
// GEMINI_API_KEY que api/extract-invoice.js).
//
// Request  (POST application/json): { resumen: object }
// Response (200): { analisis: string }

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash']
const RETRYABLE = new Set([429, 500, 503])
const MAX_TRIES_PER_MODEL = 3
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PROMPT = `Sos el analista de gestión del Hotel Dion (hotel familiar de Mar del Plata, Argentina).
Te paso un JSON con los números del mes comparados contra el mes anterior: ingresos, egresos por rubro,
cada impuesto/servicio por separado, entradas/salidas de stock del depósito (con el consumo por producto),
ocupación, costo por habitación ocupada y el lavadero (ropa alquilada tercerizada).
"delta" trae la variación contra el mes anterior (pct = %, absolute = diferencia, direction = up/down/flat).

Escribí un análisis CORTO y claro en español rioplatense para la dueña del hotel (no es contadora):
- Arrancá con UNA línea de resumen del mes (¿fue mejor o peor que el anterior y por qué?).
- Después viñetas con "•": qué subió y qué bajó, con monto y %, empezando por lo más importante.
  Nombrá los rubros y servicios puntuales (ej: "EDEA subió 18%"), y el consumo de stock que se disparó o desplomó.
- Marcá ALERTAS si las hay: gastos que crecieron fuerte, impuestos pendientes, costo por habitación subiendo
  más que los ingresos, deuda con el lavadero, y datos faltantes (si sueldosCargados o lavaderoCargado son false,
  avisá que el costo real da incompleto).
- Cerrá con 1 o 2 recomendaciones concretas y accionables.

Reglas: NO inventes datos que no estén en el JSON. Montos en pesos argentinos con separador de miles (ej: $1.250.000).
Máximo 250 palabras. Texto plano (sin markdown, sin títulos), viñetas con "•".`

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
  const resumen = body && body.resumen
  if (!resumen || typeof resumen !== 'object') {
    res.status(400).json({ error: 'Falta el resumen del mes.' })
    return
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: PROMPT + '\n\nJSON del mes:\n' + JSON.stringify(resumen) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
    },
  }

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
      } catch {
        lastStatus = 0
        lastReason = 'network'
        await sleep(500 * attempt)
        continue
      }
      if (r.ok) {
        try {
          const j = await r.json()
          const text = j && j.candidates && j.candidates[0] && j.candidates[0].content
            && j.candidates[0].content.parts && j.candidates[0].content.parts[0]
            && j.candidates[0].content.parts[0].text
          if (!text) {
            res.status(502).json({ error: 'La IA no devolvió texto. Probá de nuevo.' })
            return
          }
          res.status(200).json({ analisis: String(text).trim() })
          return
        } catch {
          res.status(502).json({ error: 'Respuesta inválida de la IA.' })
          return
        }
      }
      lastStatus = r.status
      try { lastReason = (await r.text()).slice(0, 300) } catch { lastReason = '' }
      if (!RETRYABLE.has(r.status)) break // error no recuperable: probar el próximo modelo
      await sleep(700 * attempt)
    }
  }
  console.error('analyze-month falló:', lastStatus, lastReason)
  res.status(502).json({ error: `La IA está saturada o falló (HTTP ${lastStatus}). Probá de nuevo en un rato.` })
}
