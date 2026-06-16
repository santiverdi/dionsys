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

const WORK_MAX = 1400 // px del lado más largo para procesar

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

    // --- Detección de bordes del documento ---
    const blurred = track(new cv.Mat())
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0)
    const edges = track(new cv.Mat())
    cv.Canny(blurred, edges, 75, 200)
    const kernel = track(cv.Mat.ones(5, 5, cv.CV_8U))
    cv.dilate(edges, edges, kernel)

    const contours = track(new cv.MatVector())
    const hierarchy = track(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    let quad: [Pt, Pt, Pt, Pt] | null = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      if (area > 0.18 * imgArea && area > bestArea) {
        const peri = cv.arcLength(c, true)
        const approx = new cv.Mat()
        cv.approxPolyDP(c, approx, 0.02 * peri, true)
        if (approx.rows === 4) {
          const pts: Pt[] = []
          for (let r = 0; r < 4; r++) pts.push({ x: approx.intAt(r, 0), y: approx.intAt(r, 1) })
          quad = orderPoints(pts)
          bestArea = area
        }
        approx.delete()
      }
      c.delete()
    }

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

    // Mat (gris) → ImageData (RGBA) → JPEG, sin depender de cv.imshow.
    const rgba = track(new cv.Mat())
    cv.cvtColor(norm, rgba, cv.COLOR_GRAY2RGBA)
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
