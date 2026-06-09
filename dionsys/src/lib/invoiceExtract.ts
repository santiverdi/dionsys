// Lee una factura (PDF o imagen) llamando a la función serverless /api/extract-invoice,
// que usa IA de visión (Gemini) para extraer los datos del pago.
//
// IMPORTANTE: /api/extract-invoice solo existe en el sitio publicado en Vercel
// (o con `vercel dev`). Con `npm run dev` normal el endpoint no está disponible.

export interface ExtractedInvoice {
  nombre: string
  nroCuenta: string
  monto: string // número con punto decimal, listo para validateMonto
  vtoActual: string // YYYY-MM-DD o ''
  vtoSiguiente: string // YYYY-MM-DD o ''
}

const MAX_IMAGE_DIM = 2000 // px del lado más largo tras comprimir
const IMAGE_QUALITY = 0.8

/** Convierte un File a base64 (sin el prefijo data:...;base64,). */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

/** Reduce el tamaño de una imagen grande para no pasar el límite de subida ni gastar cuota. */
async function compressImage(file: File): Promise<{ data: string; mimeType: string }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1 && file.size < 1_500_000) {
      // Ya es chica: la mandamos tal cual.
      return { data: await fileToBase64(file), mimeType: file.type }
    }
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { data: await fileToBase64(file), mimeType: file.type }
    ctx.drawImage(bitmap, 0, 0, w, h)
    const blob: Blob = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b!), 'image/jpeg', IMAGE_QUALITY),
    )
    return { data: await fileToBase64(blob), mimeType: 'image/jpeg' }
  } catch {
    return { data: await fileToBase64(file), mimeType: file.type }
  }
}

export async function extractInvoice(file: File): Promise<ExtractedInvoice> {
  const isImage = file.type.startsWith('image/')
  const { data, mimeType } = isImage
    ? await compressImage(file)
    : { data: await fileToBase64(file), mimeType: file.type || 'application/pdf' }

  let res: Response
  try {
    res = await fetch('/api/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType, data }),
    })
  } catch {
    throw new Error('No se pudo conectar con el lector de facturas. ¿Estás en el sitio publicado?')
  }

  if (!res.ok) {
    let msg = 'No se pudo leer la factura.'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  return (await res.json()) as ExtractedInvoice
}
