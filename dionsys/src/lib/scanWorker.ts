// Web Worker: corre OpenCV.js FUERA del hilo principal.
//
// Por qué: OpenCV procesa de forma sincrónica y, en el hilo principal, congela
// la UI mientras trabaja — y si se cuelga, ningún temporizador puede dispararse
// para cortarlo (la pantalla queda en "Escaneando…" para siempre). Acá corre en
// un hilo aparte: la UI sigue viva y el hilo principal puede matar este worker
// por timeout y subir la foto sin procesar.
//
// Recibe un ImageBitmap (transferible), detecta el papel, recorta+endereza y
// realza, y devuelve un JPEG (ArrayBuffer transferible). Si algo falla, avisa
// para que el hilo principal use la foto original.

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORK_MAX = 1800 // px del lado más largo para procesar

let cvPromise: Promise<any> | null = null
function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js')
      const cv = mod.default ?? mod
      // `calledRun` (flag de Emscripten) es true cuando el WASM ya inicializó.
      if (cv && cv.calledRun) return cv
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('OpenCV tardó demasiado en cargar')), 20000)
        if (cv && cv.calledRun) { clearTimeout(t); resolve(); return }
        const prev = cv.onRuntimeInitialized
        cv.onRuntimeInitialized = () => { clearTimeout(t); if (typeof prev === 'function') prev(); resolve() }
      })
      return cv
    })()
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

// Detecta el papel y devuelve sus 4 esquinas (para recortar + enderezar).
// Estrategia: tomar el contorno externo más grande que ocupe buena parte de la
// foto y aproximarlo a un polígono. Si da 4 lados, perfecto (corrige
// perspectiva). Si no (lo más común con tickets torcidos o con sombras), usamos
// el rectángulo rotado que lo envuelve, que igual endereza la inclinación.
function findDocQuad(cv: any, gray: any, imgArea: number): [Pt, Pt, Pt, Pt] | null {
  const tmp: any[] = []
  const t = <T>(m: T): T => { tmp.push(m); return m }
  try {
    const blurred = t(new cv.Mat())
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    const edges = t(new cv.Mat())
    cv.Canny(blurred, edges, 60, 180)
    // Cerrar huecos en los bordes para que el contorno del papel quede completo.
    const kernel = t(cv.Mat.ones(7, 7, cv.CV_8U))
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel)

    const contours = t(new cv.MatVector())
    const hierarchy = t(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    // Contorno externo más grande (que ocupe al menos ~15% de la foto).
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
        // Fallback: rectángulo rotado que envuelve el papel (endereza la inclinación).
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

// Curva (LUT) que convierte un gris ya "aplanado" en un look escaneado:
// oscurece los grises medios (texto más negro y nítido) y lleva los casi-blancos
// a blanco puro (fondo limpio), como CamScanner.
function scannerLut(cv: any): any {
  const gamma = 1.7      // >1 = más contraste / texto más oscuro
  const whitePoint = 238 // de acá para arriba → blanco puro
  const arr = new Array<number>(256)
  for (let i = 0; i < 256; i++) {
    let v = Math.pow(i / 255, gamma) * 255
    if (i >= whitePoint) v = 255
    arr[i] = Math.max(0, Math.min(255, Math.round(v)))
  }
  return cv.matFromArray(1, 256, cv.CV_8U, arr)
}

function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

async function process(cv: any, bitmap: ImageBitmap): Promise<Blob> {
  const mats: any[] = []
  const track = <T>(m: T): T => { mats.push(m); return m }
  try {
    const imageData = bitmapToImageData(bitmap)
    const W = imageData.width, H = imageData.height
    const imgArea = W * H

    const src = track(cv.matFromImageData(imageData))
    const gray = track(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // --- Detección del documento (recorte + enderezado) ---
    const quad = findDocQuad(cv, gray, imgArea)

    // Imagen sobre la que aplicar el realce: recortada+enderezada o la completa.
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

    // --- Realce tipo escáner: gris + normalización de fondo ---
    // El fondo difuso se estima en BAJA resolución (≈1/4) y se vuelve a escalar.
    // Es visualmente equivalente a un GaussianBlur enorme pero muchísimo más
    // rápido, así el escaneo termina en ~1-2s.
    const wgray = track(new cv.Mat())
    cv.cvtColor(work, wgray, cv.COLOR_RGBA2GRAY)
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

    // Look escaneado: curva de contraste + recorte a blanco puro.
    const lut = track(scannerLut(cv))
    const enhanced = track(new cv.Mat())
    cv.LUT(norm, lut, enhanced)

    // Mat (gris) → ImageData (RGBA) → JPEG, sin depender de cv.imshow.
    const rgba = track(new cv.Mat())
    cv.cvtColor(enhanced, rgba, cv.COLOR_GRAY2RGBA)
    const out = new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows)
    const outCanvas = new OffscreenCanvas(rgba.cols, rgba.rows)
    ;(outCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(out, 0, 0)
    return await outCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  } finally {
    for (const m of mats) { try { m.delete() } catch { /* ignore */ } }
  }
}

self.onmessage = async (e: MessageEvent) => {
  const bitmap: ImageBitmap = e.data?.bitmap
  if (!bitmap) { ;(self as any).postMessage({ ok: false }); return }
  try {
    const cv = await loadCv()
    const blob = await process(cv, bitmap)
    const buffer = await blob.arrayBuffer()
    ;(self as any).postMessage({ ok: true, buffer, type: blob.type || 'image/jpeg' }, [buffer])
  } catch {
    ;(self as any).postMessage({ ok: false })
  } finally {
    try { bitmap.close() } catch { /* ignore */ }
  }
}
