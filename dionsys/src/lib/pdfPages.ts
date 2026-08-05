// Parte un PDF de varias páginas en una imagen por página.
//
// La contadora manda TODOS los recibos del mes en un solo PDF, uno por página.
// El lector de IA trabaja de a un recibo, así que hay que separarlos antes.
//
// Ojo: estos PDF vienen con la tipografía convertida a curvas (no tienen texto
// extraíble), por eso se rasterizan en vez de leerles el texto.

// Ancho al que se rasteriza cada página. El recibo es una tabla con importes
// chicos: por debajo de esto la IA empieza a confundir dígitos.
const TARGET_WIDTH = 1600
const JPEG_QUALITY = 0.85

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  return pdfjs
}

/** Cuántas páginas tiene el PDF (0 si no se puede abrir). */
export async function pdfPageCount(file: File): Promise<number> {
  try {
    const pdfjs = await loadPdfjs()
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    return doc.numPages
  } catch {
    return 0
  }
}

/**
 * Rasteriza cada página del PDF a un JPEG. Devuelve un File por página, con el
 * nombre original + " - pág N" para que se entienda de dónde salió cada uno.
 */
export async function pdfPagesToImages(file: File): Promise<File[]> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const base = file.name.replace(/\.pdf$/i, '')
  const out: File[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const base1 = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: TARGET_WIDTH / base1.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    // Fondo blanco: el PDF no lo pinta y el JPEG sin alpha saldría negro.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport, canvas }).promise

    const blob: Blob | null = await new Promise(resolve =>
      canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) continue
    out.push(new File([blob], `${base} - pág ${p}.jpg`, { type: 'image/jpeg' }))
  }
  return out
}

/**
 * Devuelve los archivos a procesar de a uno: un PDF de varias páginas se abre en
 * una imagen por página; cualquier otra cosa (foto, PDF de una sola hoja) pasa
 * tal cual. Si el PDF no se puede abrir, se devuelve el original y que lo intente
 * el lector, que también sabe leer PDFs.
 */
export async function explotarSiEsMultipagina(file: File): Promise<File[]> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return [file]
  try {
    const paginas = await pdfPageCount(file)
    if (paginas <= 1) return [file]
    const imgs = await pdfPagesToImages(file)
    return imgs.length > 0 ? imgs : [file]
  } catch {
    return [file]
  }
}
