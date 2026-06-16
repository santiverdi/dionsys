// Web Worker CLÁSICO (no módulo) que corre OpenCV.js fuera del hilo principal,
// para que cargar/procesar los ~10MB de OpenCV no congele la UI del iPhone.
//
// Claves de compatibilidad con Safari/iPhone:
//  - Worker clásico + importScripts('/opencv.js') (NO import ESM, que falla en iOS).
//  - NO usa OffscreenCanvas (problemático en iOS): recibe los píxeles (ImageData)
//    ya rasterizados desde el hilo principal y devuelve píxeles; el <canvas> lo
//    maneja el hilo principal.
//
// Recibe { opencvUrl, data, width, height } y devuelve { ok, buffer, width, height }
// con la imagen recortada + realzada en RGBA. Si algo falla, ok:false + error.

/* eslint-disable @typescript-eslint/no-explicit-any */

const ctx: any = self as any

let cvReady: Promise<any> | null = null
function ensureCv(url: string): Promise<any> {
  if (!cvReady) {
    cvReady = new Promise<any>((resolve, reject) => {
      try {
        if (!ctx.cv) ctx.importScripts(url)
      } catch (e) {
        reject(new Error('importScripts falló: ' + ((e as any)?.message || String(e))))
        return
      }
      const cv = ctx.cv
      if (!cv) { reject(new Error('cv no quedó definido')); return }
      if (cv.calledRun) { resolve(cv); return }
      const prev = cv.onRuntimeInitialized
      cv.onRuntimeInitialized = () => { if (typeof prev === 'function') prev(); resolve(cv) }
    })
    cvReady.catch(() => { cvReady = null })
  }
  return cvReady
}

interface Pt { x: number; y: number }

function orderPoints(pts: Pt[]): [Pt, Pt, Pt, Pt] {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return [bySum[0], byDiff[0], bySum[3], byDiff[3]]
}
function dist(a: Pt, b: Pt): number { return Math.hypot(a.x - b.x, a.y - b.y) }

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
      } else { c.delete() }
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
    } finally { best.delete() }
    return quad
  } catch {
    return null
  } finally {
    for (const m of tmp) { try { m.delete() } catch { /* ignore */ } }
  }
}

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

// Procesa una imagen (RGBA) y devuelve { buffer, width, height } también en RGBA.
function process(cv: any, imageData: { data: Uint8ClampedArray; width: number; height: number }): { buffer: ArrayBuffer; width: number; height: number } {
  const mats: any[] = []
  const track = <T>(m: T): T => { mats.push(m); return m }
  try {
    const imgArea = imageData.width * imageData.height
    const src = track(cv.matFromImageData(imageData))
    const gray = track(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    const quad = findDocQuad(cv, gray, imgArea)

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

    // Realce: aplanar iluminación (fondo en baja resolución) + contraste/blanco puro.
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
    const lut = track(scannerLut(cv))
    const enhanced = track(new cv.Mat())
    cv.LUT(norm, lut, enhanced)

    const rgba = track(new cv.Mat())
    cv.cvtColor(enhanced, rgba, cv.COLOR_GRAY2RGBA)
    const width = rgba.cols, height = rgba.rows
    // Copia de los píxeles a un buffer propio (transferible).
    const copy = new Uint8ClampedArray(rgba.data)
    return { buffer: copy.buffer, width, height }
  } finally {
    for (const m of mats) { try { m.delete() } catch { /* ignore */ } }
  }
}

ctx.onmessage = (e: MessageEvent) => {
  const d = e.data || {}
  ensureCv(d.opencvUrl).then(cv => {
    ctx.postMessage({ phase: 'loaded' }) // avisar que OpenCV ya cargó (para el watchdog)
    try {
      const out = process(cv, { data: d.data, width: d.width, height: d.height })
      ctx.postMessage({ ok: true, buffer: out.buffer, width: out.width, height: out.height }, [out.buffer])
    } catch (err) {
      ctx.postMessage({ ok: false, error: 'procesar: ' + ((err as any)?.message || String(err)) })
    }
  }, (err: any) => {
    ctx.postMessage({ ok: false, error: 'cargar OpenCV: ' + ((err as any)?.message || String(err)) })
  })
}
