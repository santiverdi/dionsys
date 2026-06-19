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

export interface ExtractedInvoiceItem {
  descripcion: string
  cantidad: string // número o ''
  importe: string  // número con punto decimal o ''
  concepto: 'producto' | 'impuesto'
}

export interface ExtractedProviderInvoice {
  tipoFactura: 'A' | 'B' | 'C' | 'M' | ''
  proveedor: string
  monto: string // número con punto decimal, listo para validateMonto
  fecha: string // YYYY-MM-DD o ''
  condicionVenta: 'contado' | 'cuenta_corriente' | ''
  vencimiento: string // YYYY-MM-DD o ''
  items: ExtractedInvoiceItem[]
}

export interface ExtractedParteOcupada {
  habitacion: string
  reserva: string
  plazas: string  // número como texto
  canal: string
}
export interface ExtractedParteLibre {
  habitacion: string
  estado: string  // "sucia" | "limpia" | "mantenimiento"
}
export interface ExtractedParte {
  nroCaja: string
  usuario: string
  fechaCaja: string // "dd/mm/yyyy hh:mm" o ''
  ocupadas: ExtractedParteOcupada[]
  libres: ExtractedParteLibre[]
  totalOcupadas: string
  totalPlazas: string
  totalLibres: string
}

// Un movimiento de caja leído por IA (todos los importes como texto).
export interface ExtractedCajaMov {
  fechaHora: string // "dd/mm/yyyy hh:mm" o ''
  usuario: string
  comp: string
  habitacion: string
  observacion: string
  efectivo: string
  tarjetas: string
  cheques: string
  transferencia: string
  otros: string
  total: string
}
// El "Informe de caja" leído por IA desde una foto/escaneo. Espejo del Excel
// (parseCaja.ts) pero con todos los valores como texto, listo para cajaFromExtracted.
export interface ExtractedCaja {
  nroCaja: string
  puntoVenta: string
  moneda: string
  usuarioApertura: string
  usuarioCierre: string
  aperturaAt: string // "dd/mm/yyyy hh:mm" o ''
  cierreAt: string
  aperturaMonto: string
  saldoFinal: string
  ingresos: ExtractedCajaMov[]
  egresos: ExtractedCajaMov[]
  retiros: ExtractedCajaMov[]
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

// Comprime/codifica el archivo y llama al endpoint con el modo indicado.
async function callExtract(file: File, mode: 'servicio' | 'proveedor' | 'parte' | 'caja'): Promise<unknown> {
  const isImage = file.type.startsWith('image/')
  const { data, mimeType } = isImage
    ? await compressImage(file)
    : { data: await fileToBase64(file), mimeType: file.type || 'application/pdf' }

  let res: Response
  try {
    res = await fetch('/api/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType, data, mode }),
    })
  } catch {
    throw new Error('No se pudo conectar con el lector. ¿Estás en el sitio publicado?')
  }

  if (!res.ok) {
    let msg = 'No se pudo leer el documento.'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  return await res.json()
}

export async function extractInvoice(file: File): Promise<ExtractedInvoice> {
  return (await callExtract(file, 'servicio')) as ExtractedInvoice
}

/** Lee una factura comercial de proveedor (detecta tipo A/B/C, monto y fecha). */
export async function extractProviderInvoice(file: File): Promise<ExtractedProviderInvoice> {
  return (await callExtract(file, 'proveedor')) as ExtractedProviderInvoice
}

/** Lee el Parte Diario de habitaciones desde una foto/escaneo (PDF o imagen). */
export async function extractParte(file: File): Promise<ExtractedParte> {
  return (await callExtract(file, 'parte')) as ExtractedParte
}

/**
 * Lee el "Informe de caja" desde una foto/escaneo (PDF o imagen).
 * OJO: el modo 'caja' debe existir en /api/extract-invoice (endpoint fuera del
 * repo). Hasta agregarlo, esta llamada devuelve error y el botón IA queda
 * apagado por flag (ver CajaImporter). La caja por Excel es la fuente exacta.
 */
export async function extractCaja(file: File): Promise<ExtractedCaja> {
  return (await callExtract(file, 'caja')) as ExtractedCaja
}
