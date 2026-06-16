// Realce "tipo escáner" SIN OpenCV: solo Canvas 2D, así es liviano e instantáneo
// y funciona en cualquier iPhone (Open.cv pesaba 10MB y no cargaba en el celular).
//
// Qué hace: pasa la foto a gris, aplana la iluminación (divide por un fondo difuso
// estimado con el reescalado nativo del canvas) y aplica una curva de contraste que
// lleva el fondo a blanco puro y oscurece el texto. Resultado: fondo blanco + letras
// negras nítidas, como un escaneo.
//
// Qué NO hace: recorte/enderezado automático (eso requería OpenCV). El encuadre lo
// hace la persona al sacar la foto.
//
// Best-effort: ante cualquier problema devuelve la foto original para que igual se suba.

const WORK_MAX = 1800 // px del lado más largo del resultado

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

// Curva (LUT 0..255): estiramiento de contraste fuerte ("niveles"). Sobre la
// imagen ya aplanada, todo lo que esté por debajo de `black` se va a NEGRO puro
// (tinta bien marcada) y todo lo que esté por encima de `white` a BLANCO puro
// (fondo limpio); entre medio, una rampa lineal. Así el texto resalta como escaneo.
const BLACK_POINT = 150 // ≤ esto → negro (subir = tinta más marcada / más agresivo)
const WHITE_POINT = 216 // ≥ esto → blanco (bajar = fondo más limpio)
function buildLut(): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256)
  const range = Math.max(1, WHITE_POINT - BLACK_POINT)
  for (let i = 0; i < 256; i++) {
    let v: number
    if (i <= BLACK_POINT) v = 0
    else if (i >= WHITE_POINT) v = 255
    else v = ((i - BLACK_POINT) / range) * 255
    lut[i] = Math.max(0, Math.min(255, Math.round(v)))
  }
  return lut
}

export async function scanImageFile(file: File, onInfo?: (i: ScanInfo) => void): Promise<File> {
  if (!file.type.startsWith('image/')) { onInfo?.({ scanned: false, error: 'no es imagen' }); return file }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    // 1) Imagen a tamaño de trabajo.
    const full = makeCanvas(w, h)
    const fctx = full.getContext('2d')!
    fctx.drawImage(bitmap, 0, 0, w, h)
    try { bitmap.close() } catch { /* ignore */ }
    const src = fctx.getImageData(0, 0, w, h).data

    // 2) Escala de grises (luminancia).
    const n = w * h
    const luma = new Uint8ClampedArray(n)
    const grayImg = new ImageData(w, h)
    const gd = grayImg.data
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const y = (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) | 0
      luma[p] = y
      gd[i] = gd[i + 1] = gd[i + 2] = y
      gd[i + 3] = 255
    }
    const grayCanvas = makeCanvas(w, h)
    grayCanvas.getContext('2d')!.putImageData(grayImg, 0, 0)

    // 3) Fondo difuso = bajar el gris a ~1/8 y volver a subirlo (el reescalado del
    //    canvas hace el promediado/suavizado por nosotros, rapidísimo).
    const sw = Math.max(1, Math.round(w / 8))
    const sh = Math.max(1, Math.round(h / 8))
    const smallC = makeCanvas(sw, sh)
    const sctx = smallC.getContext('2d')!
    sctx.imageSmoothingEnabled = true
    sctx.drawImage(grayCanvas, 0, 0, sw, sh)
    const bgC = makeCanvas(w, h)
    const bctx = bgC.getContext('2d')!
    bctx.imageSmoothingEnabled = true
    bctx.drawImage(smallC, 0, 0, w, h)
    const bg = bctx.getImageData(0, 0, w, h).data

    // 4) Aplanar iluminación (gris / fondo) + curva de contraste a blanco puro.
    const lut = buildLut()
    const outImg = new ImageData(w, h)
    const od = outImg.data
    for (let p = 0, i = 0; p < n; p++, i += 4) {
      const b = bg[i] // el fondo es gris: alcanza con un canal
      let v = b > 0 ? (luma[p] / b) * 255 : luma[p]
      if (v > 255) v = 255
      const o = lut[v | 0]
      od[i] = od[i + 1] = od[i + 2] = o
      od[i + 3] = 255
    }
    const outCanvas = makeCanvas(w, h)
    outCanvas.getContext('2d')!.putImageData(outImg, 0, 0)

    const blob: Blob | null = await new Promise(res => outCanvas.toBlob(b => res(b), 'image/jpeg', 0.9))
    if (!blob) { onInfo?.({ scanned: false, error: 'no se pudo exportar el JPEG' }); return file }

    onInfo?.({ scanned: true })
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch (e) {
    onInfo?.({ scanned: false, error: (e instanceof Error ? e.message : String(e)) })
    return file
  }
}
