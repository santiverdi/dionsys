// Escaneo de documento en el navegador con OpenCV.js: detecta el papel, recorta,
// endereza y realza (fondo blanco + texto oscuro) para que quede como escaneado.
// Devuelve un File JPEG.
//
// IMPORTANTE: corre en el HILO PRINCIPAL con un <canvas> normal (NO Web Worker ni
// OffscreenCanvas), porque en iPhone/Safari esas APIs no están o tienen bugs.
// El procesamiento es sincrónico (~1-2s, sobre una versión reducida de la foto),
// así que la pantalla se traba un instante pero no se cuelga.
//
// Es best-effort: ante cualquier problema (OpenCV no carga, error, etc.) devuelve
// la foto original para que igual se suba. La librería (~10MB) se carga on-demand.

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORK_MAX = 1800 // px del lado más largo para procesar

// Info opcional sobre cómo salió el escaneo (para diagnóstico/avisos en la UI).
export interface ScanInfo {
  scanned: boolean   // true = se procesó con OpenCV; false = se subió la foto original
  error?: string     // motivo si scanned === false
}

let cvPromise: Promise<any> | null = null
function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js')
      const cv = mod.default ?? mod
      // `calledRun` (flag de Emscripten) es true cuando el WASM ya inicializó.
      if (cv && cv.calledRun) return cv
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('OpenCV tardó demasiado en cargar')), 25000)
        if (cv && cv.calledRun) { clearTimeout(t); resolve(); return }
        const prev = cv.onRuntimeInitialized
        cv.onRuntimeInitialized = () => { clearTimeout(t); if (typeof prev === 'function') prev(); resolve() }
      })
      return cv
    })()
    // Si falla, no dejamos la promesa rechazada cacheada: el próximo intento reintenta.
    cvPromise.catch(() => { cvPromise = null })
  }
  return cvPromise
}

interface Pt { x: number; y: number }

// Ordena 4 puntos como [topLeft, topRight, bottomRight, bottomLeft].
function orderPoints(pts: Pt[]): [Pt, Pt, Pt, Pt] {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]]
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

async function bitmapToCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  try { bitmap.close() } catch { /* ignore */ }
  return canvas
}

// Detecta el papel y devuelve sus 4 esquinas. Si el contorno da 4 lados, corrige
// perspectiva; si no, usa el rectángulo rotado que lo envuelve (endereza la
// inclinación). Devuelve null si no encuentra un papel grande y nítido.
function findDocQuad(cv: any, gray: any, imgArea: number): [Pt, Pt, Pt, Pt] | null {
  const tmp: any[] = []
  const t = <T>(m: T): T => { tmp.push(m); return m }
  try {
    const blurred = t(new cv.Mat())
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    const edges = t(new cv.Mat())
    cv.Canny(blurred, edges, 60, 180)
    const kernel = t(cv.Mat.ones(7, 7, cv.CV_8U))
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)

    const contours = t(new cv.MatVector())
    const hierarchy = t(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    let best: any = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      if (area > 0.15 * imgArea && area > bestArea) {
        if (best) best.delete()
        best = c
        bestArea = area
      } else {
        c.delete()
      }
    }
    if (!best) return null

    let quad: [Pt, Pt, Pt, Pt] | null = null
    try {
      const peri = cv.arcLength(best, true)
      const approx = t(new cv.Mat())
      cv.approxPolyDP(best, approx, 0.02 * peri, true)
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const pts: Pt[] = []
        for (let r = 0; r < 4; r++) pts.push({ x: approx.intAt(r, 0), y: approx.intAt(r, 1) })
        quad = orderPoints(pts)
      } else {
        const rect = cv.minAreaRect(best)
        const v = cv.RotatedRect.points(rect) as Pt[]
        if (v && v.length === 4) quad = orderPoints(v.map(p => ({ x: p.x, y: p.y })))
      }
    } finally {
      best.delete()
    }
    return quad
  } catch {
    return null
  } finally {
    for (const m of tmp) { try { m.delete() } catch { /* ignore */ } }
  }
}

// Curva (LUT) que convierte un gris ya "aplanado" en look escaneado: oscurece los
// grises medios (texto más negro) y lleva los casi-blancos a blanco puro.
function scannerLut(cv: any): any {
  const gamma = 1.7
  const whitePoint = 238
  const arr = new Array<number>(256)
  for (let i = 0; i < 256; i++) {
    let v = Math.pow(i / 255, gamma) * 255
    if (i >= whitePoint) v = 255
    arr[i] = Math.max(0, Math.min(255, Math.round(v)))
  }
  return cv.matFromArray(1, 256, cv.CV_8U, arr)
}

export async function scanImageFile(file: File, onInfo?: (i: ScanInfo) => void): Promise<File> {
  if (!file.type.startsWith('image/')) { onInfo?.({ scanned: false, error: 'no es imagen' }); return file }

  let cv: any
  try {
    cv = await loadCv()
  } catch (e) {
    onInfo?.({ scanned: false, error: 'no se pudo cargar OpenCV: ' + ((e as any)?.message || String(e)) })
    return file
  }

  const mats: any[] = []
  const track = <T>(m: T): T => { mats.push(m); return m }
  let stage = 'preparar imagen'
  try {
    const inCanvas = await bitmapToCanvas(file)
    const imgArea = inCanvas.width * inCanvas.height

    stage = 'leer imagen'
    const src = track(cv.imread(inCanvas))
    const gray = track(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // --- Recorte + enderezado ---
    stage = 'detectar documento'
    const quad = findDocQuad(cv, gray, imgArea)

    stage = 'recortar'
    const work = track(new cv.Mat())
    if (quad) {
      const [tl, tr, br, bl] = quad
      const dstW = Math.max(1, Math.round(Math.max(dist(br, bl), dist(tr, tl))))
      const dstH = Math.max(1, Math.round(Math.max(dist(tr, br), dist(tl, bl))))
      const srcTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]))
      const dstTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstW - 1, 0, dstW - 1, dstH - 1, 0, dstH - 1]))
      const M = track(cv.getPerspectiveTransform(srcTri, dstTri))
      cv.warpPerspective(src, work, M, new cv.Size(dstW, dstH))
    } else {
      src.copyTo(work)
    }

    // --- Realce tipo escáner ---
    stage = 'realzar'
    const wgray = track(new cv.Mat())
    cv.cvtColor(work, wgray, cv.COLOR_RGBA2GRAY)
    // Fondo difuso estimado en baja resolución (rápido) = aplanado de iluminación.
    const small = track(new cv.Mat())
    const sw = Math.max(1, Math.round(wgray.cols / 4))
    const sh = Math.max(1, Math.round(wgray.rows / 4))
    cv.resize(wgray, small, new cv.Size(sw, sh), 0, 0, cv.INTER_AREA)
    const ks = Math.max(11, (Math.floor(Math.min(sw, sh) / 6) | 1))
    cv.GaussianBlur(small, small, new cv.Size(ks, ks), 0)
    const bg = track(new cv.Mat())
    cv.resize(small, bg, new cv.Size(wgray.cols, wgray.rows), 0, 0, cv.INTER_LINEAR)
    const norm = track(new cv.Mat())
    cv.divide(wgray, bg, norm, 255)
    // Contraste + blanco puro.
    const lut = track(scannerLut(cv))
    const enhanced = track(new cv.Mat())
    cv.LUT(norm, lut, enhanced)

    stage = 'exportar'
    const outCanvas = document.createElement('canvas')
    cv.imshow(outCanvas, enhanced)
    const blob: Blob | null = await new Promise(res => outCanvas.toBlob(b => res(b), 'image/jpeg', 0.9))
    if (!blob) { onInfo?.({ scanned: false, error: 'no se pudo exportar el JPEG' }); return file }

    onInfo?.({ scanned: true })
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch (e) {
    onInfo?.({ scanned: false, error: `${stage}: ` + ((e as any)?.message || String(e)) })
    return file
  } finally {
    for (const m of mats) { try { m.delete() } catch { /* ignore */ } }
  }
}
