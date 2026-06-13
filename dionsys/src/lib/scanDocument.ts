// Escaneo de documento en el navegador con OpenCV.js:
// detecta los bordes del papel, recorta, endereza la perspectiva y realza
// (fondo blanco parejo) para que quede como escaneado. Devuelve un File JPEG.
//
// Es best-effort: si no encuentra el documento o algo falla, devuelve una versión
// realzada de la foto completa; si OpenCV ni siquiera carga, devuelve el original.
// La librería se carga on-demand (import dinámico) para no pesar en el bundle inicial.

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORK_MAX = 1800 // px del lado más largo para procesar

let cvPromise: Promise<any> | null = null
function loadCv(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js')
      const cv = mod.default ?? mod
      if (cv && cv.Mat) return cv
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('OpenCV tardó demasiado en cargar')), 20000)
        cv.onRuntimeInitialized = () => { clearTimeout(t); resolve() }
      })
      return cv
    })()
  }
  return cvPromise
}

interface Pt { x: number; y: number }

// Ordena 4 puntos como [topLeft, topRight, bottomRight, bottomLeft].
function orderPoints(pts: Pt[]): [Pt, Pt, Pt, Pt] {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  const tl = bySum[0]
  const br = bySum[3]
  const tr = byDiff[0]
  const bl = byDiff[3]
  return [tl, tr, br, bl]
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

async function bitmapToWorkCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas
}

export async function scanImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  let cv: any
  try {
    cv = await loadCv()
  } catch {
    return file // OpenCV no cargó: subimos la foto tal cual
  }

  const mats: any[] = []
  const track = <T>(m: T): T => { mats.push(m); return m }

  try {
    const inCanvas = await bitmapToWorkCanvas(file)
    const W = inCanvas.width, H = inCanvas.height
    const imgArea = W * H

    const src = track(cv.imread(inCanvas))
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
      const maxW = Math.max(dist(br, bl), dist(tr, tl))
      const maxH = Math.max(dist(tr, br), dist(tl, bl))
      const dstW = Math.max(1, Math.round(maxW))
      const dstH = Math.max(1, Math.round(maxH))
      const srcTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]))
      const dstTri = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, dstW - 1, 0, dstW - 1, dstH - 1, 0, dstH - 1]))
      const M = track(cv.getPerspectiveTransform(srcTri, dstTri))
      cv.warpPerspective(src, work, M, new cv.Size(dstW, dstH))
    } else {
      src.copyTo(work)
    }

    // --- Realce tipo escáner: gris + normalización de fondo (división por fondo difuso) ---
    const wgray = track(new cv.Mat())
    cv.cvtColor(work, wgray, cv.COLOR_RGBA2GRAY)
    const bg = track(new cv.Mat())
    // Kernel grande para estimar la iluminación de fondo.
    const k = Math.max(21, Math.floor(Math.min(wgray.rows, wgray.cols) / 12) | 1)
    cv.GaussianBlur(wgray, bg, new cv.Size(k, k), 0)
    const norm = track(new cv.Mat())
    cv.divide(wgray, bg, norm, 255)

    const outCanvas = document.createElement('canvas')
    cv.imshow(outCanvas, norm)

    const blob: Blob | null = await new Promise(res => outCanvas.toBlob(b => res(b), 'image/jpeg', 0.9))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  } finally {
    for (const m of mats) { try { m.delete() } catch { /* ignore */ } }
  }
}
