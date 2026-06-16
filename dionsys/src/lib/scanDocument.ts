// Realce "tipo escáner" SIN OpenCV: solo Canvas 2D, liviano e instantáneo, anda
// en cualquier iPhone (OpenCV pesaba 10MB y no cargaba en el celular).
//
// Pipeline:
//   1) Gris + denoise (mediana 3×3, saca granito sin desdibujar el texto).
//   2) Recorte de la hoja: detecta la caja blanca grande (papel) y descarta la
//      mesa/superficie de alrededor, que si no se vuelve ruido. (Recorte rectangular,
//      sin enderezar perspectiva — eso requería OpenCV.)
//   3) Umbral ADAPTATIVO: compara cada píxel con el brillo de su entorno; si es más
//      oscuro que el fondo local → tinta (negro), si no → blanco. Hace el texto negro
//      aunque la impresión sea clarita, y deja el fondo bien limpio (como un escáner).
//
// Best-effort: ante cualquier problema devuelve la foto original para que igual se suba.

const WORK_MAX = 1800 // px del lado más largo del resultado

// Umbral adaptativo: un píxel es "tinta" si está al menos C por debajo del brillo
// local. SOFT es el ancho de la rampa (anti-aliasing para que el texto no quede dentado).
const ADAPT_C = 8     // subir = atrapa texto más clarito (pero más riesgo de ruido)
const ADAPT_SOFT = 14 // ancho de la transición gris entre negro y blanco

export interface ScanInfo {
  scanned: boolean
  error?: string
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

// Mediana 3×3: saca ruido/manchitas aisladas SIN desdibujar el texto (respeta bordes).
function median3x3(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h)
  const win = new Uint8Array(9)
  for (let y = 0; y < h; y++) {
    const y0 = y > 0 ? y - 1 : 0
    const y2 = y < h - 1 ? y + 1 : h - 1
    for (let x = 0; x < w; x++) {
      const x0 = x > 0 ? x - 1 : 0
      const x2 = x < w - 1 ? x + 1 : w - 1
      win[0] = src[y0 * w + x0]; win[1] = src[y0 * w + x]; win[2] = src[y0 * w + x2]
      win[3] = src[y * w + x0];  win[4] = src[y * w + x];  win[5] = src[y * w + x2]
      win[6] = src[y2 * w + x0]; win[7] = src[y2 * w + x]; win[8] = src[y2 * w + x2]
      for (let a = 1; a < 9; a++) {
        const v = win[a]
        let b = a - 1
        while (b >= 0 && win[b] > v) { win[b + 1] = win[b]; b-- }
        win[b + 1] = v
      }
      out[y * w + x] = win[4]
    }
  }
  return out
}

// Umbral de Otsu: valor que mejor separa lo claro (papel) de lo oscuro (mesa/tinta).
function otsu(luma: Uint8ClampedArray, n: number): number {
  const hist = new Float64Array(256)
  for (let p = 0; p < n; p++) hist[luma[p]]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0, wB = 0, maxVar = -1, thr = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (wB === 0) continue
    const wF = n - wB
    if (wF === 0) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) { maxVar = between; thr = i }
  }
  return thr
}

interface Box { x: number; y: number; w: number; h: number }

// Detecta la caja del papel (región clara grande) para recortar la mesa de alrededor.
// Cuenta, por fila y columna, cuántos píxeles superan el umbral de papel; se queda
// con el rango donde hay suficiente papel. Si no encuentra algo razonable, no recorta.
function detectPaper(luma: Uint8ClampedArray, w: number, h: number): Box {
  const full: Box = { x: 0, y: 0, w, h }
  const thr = Math.max(otsu(luma, w * h), 120) // papel = brillo > thr
  const colCount = new Int32Array(w)
  const rowCount = new Int32Array(h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (luma[row + x] > thr) { colCount[x]++; rowCount[y]++ }
    }
  }
  // Una fila/columna "tiene papel" si al menos el 30% de sus píxeles son claros.
  const colMin = Math.floor(h * 0.30)
  const rowMin = Math.floor(w * 0.30)
  let x0 = 0; while (x0 < w && colCount[x0] < colMin) x0++
  let x1 = w - 1; while (x1 > x0 && colCount[x1] < colMin) x1--
  let y0 = 0; while (y0 < h && rowCount[y0] < rowMin) y0++
  let y1 = h - 1; while (y1 > y0 && rowCount[y1] < rowMin) y1--
  const cw = x1 - x0 + 1
  const ch = y1 - y0 + 1
  // Sanity: tiene que ser una región grande; si abarca casi todo, no hay nada que recortar.
  if (cw < w * 0.4 || ch < h * 0.4) return full
  if (cw > w * 0.97 && ch > h * 0.97) return full
  return { x: x0, y: y0, w: cw, h: ch }
}

export async function scanImageFile(file: File, onInfo?: (i: ScanInfo) => void): Promise<File> {
  if (!file.type.startsWith('image/')) { onInfo?.({ scanned: false, error: 'no es imagen' }); return file }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
    const w0 = Math.max(1, Math.round(bitmap.width * scale))
    const h0 = Math.max(1, Math.round(bitmap.height * scale))

    // 1) Imagen a tamaño de trabajo + gris + denoise.
    const full = makeCanvas(w0, h0)
    const fctx = full.getContext('2d')!
    fctx.drawImage(bitmap, 0, 0, w0, h0)
    try { bitmap.close() } catch { /* ignore */ }
    const src = fctx.getImageData(0, 0, w0, h0).data
    const n0 = w0 * h0
    const lumaRaw = new Uint8ClampedArray(n0)
    for (let p = 0, i = 0; p < n0; p++, i += 4) {
      lumaRaw[p] = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) | 0
    }
    const luma0 = median3x3(lumaRaw, w0, h0)

    // 2) Recorte de la hoja (saca la mesa de alrededor).
    const box = detectPaper(luma0, w0, h0)
    const w = box.w, h = box.h, n = w * h
    const luma = new Uint8ClampedArray(n)
    for (let y = 0; y < h; y++) {
      const srcRow = (box.y + y) * w0 + box.x
      const dstRow = y * w
      for (let x = 0; x < w; x++) luma[dstRow + x] = luma0[srcRow + x]
    }

    // Gris recortado a canvas (para estimar el brillo local con el reescalado nativo).
    const grayImg = new ImageData(w, h)
    const gd = grayImg.data
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      gd[i] = gd[i + 1] = gd[i + 2] = luma[p]
      gd[i + 3] = 255
    }
    const grayCanvas = makeCanvas(w, h)
    grayCanvas.getContext('2d')!.putImageData(grayImg, 0, 0)

    // 3) Brillo local (fondo) = bajar el gris a ~1/k y volver a subirlo. Ventana ~30px
    //    para que el promedio refleje el fondo y no el interior de las letras.
    const k = Math.max(1, Math.round(Math.max(w, h) / 55))
    const sw = Math.max(1, Math.round(w / k))
    const sh = Math.max(1, Math.round(h / k))
    const smallC = makeCanvas(sw, sh)
    const sctx = smallC.getContext('2d')!
    sctx.imageSmoothingEnabled = true
    sctx.drawImage(grayCanvas, 0, 0, sw, sh)
    const bgC = makeCanvas(w, h)
    const bctx = bgC.getContext('2d')!
    bctx.imageSmoothingEnabled = true
    bctx.drawImage(smallC, 0, 0, w, h)
    const bg = bctx.getImageData(0, 0, w, h).data

    // 4) Umbral adaptativo suave: negro si está bajo el fondo local, blanco si no.
    const outImg = new ImageData(w, h)
    const od = outImg.data
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const t = bg[i] - ADAPT_C // umbral local
      const v = luma[p]
      let o: number
      if (v >= t) o = 255
      else if (v <= t - ADAPT_SOFT) o = 0
      else o = ((v - (t - ADAPT_SOFT)) / ADAPT_SOFT) * 255
      od[i] = od[i + 1] = od[i + 2] = o
      od[i + 3] = 255
    }
    const outCanvas = makeCanvas(w, h)
    outCanvas.getContext('2d')!.putImageData(outImg, 0, 0)

    const blob: Blob | null = await new Promise(res => outCanvas.toBlob(b => res(b), 'image/jpeg', 0.92))
    if (!blob) { onInfo?.({ scanned: false, error: 'no se pudo exportar el JPEG' }); return file }

    onInfo?.({ scanned: true })
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch (e) {
    onInfo?.({ scanned: false, error: (e instanceof Error ? e.message : String(e)) })
    return file
  }
}
