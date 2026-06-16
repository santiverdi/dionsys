// Escaneo de documento: detecta el papel, recorta, endereza y realza (fondo
// blanco + texto oscuro) para que quede como escaneado. Devuelve un File JPEG.
//
// Arquitectura pensada para iPhone/Safari (donde casi todo lo demás falla):
//  - El hilo principal solo rasteriza la foto a píxeles (<canvas> normal) y dibuja
//    el resultado. NO usa OffscreenCanvas (problemático en iOS).
//  - OpenCV.js corre en un Web Worker CLÁSICO (ver scanWorker.ts) que lo carga con
//    importScripts('/opencv.js') (NO import ESM, que falla en iOS). Así los ~10MB
//    de OpenCV no congelan la UI, y un watchdog real puede matar el worker si tarda.
//
// Best-effort: ante cualquier problema (sin Worker, OpenCV no carga, timeout, etc.)
// devuelve la foto original para que igual se suba.

/* eslint-disable @typescript-eslint/no-explicit-any */

const WORK_MAX = 1800            // px del lado más largo para procesar
const SCAN_TIMEOUT_MS = 45000    // tope total (incluye bajar OpenCV la 1ª vez)

// Info opcional sobre cómo salió el escaneo (para diagnóstico/avisos en la UI).
export interface ScanInfo {
  scanned: boolean   // true = se procesó con OpenCV; false = se subió la foto original
  error?: string     // motivo si scanned === false
}

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) {
    // Worker CLÁSICO (sin { type: 'module' }): usa importScripts adentro.
    worker = new Worker(new URL('./scanWorker.ts', import.meta.url))
  }
  return worker
}
function killWorker() {
  if (worker) { try { worker.terminate() } catch { /* ignore */ } worker = null }
}

async function fileToImageData(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, WORK_MAX / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const cctx = canvas.getContext('2d')!
  cctx.drawImage(bitmap, 0, 0, w, h)
  try { bitmap.close() } catch { /* ignore */ }
  return cctx.getImageData(0, 0, w, h)
}

function imageDataToJpeg(data: Uint8ClampedArray, w: number, h: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const img = new ImageData(w, h)
  img.data.set(data)
  canvas.getContext('2d')!.putImageData(img, 0, 0)
  return new Promise(res => canvas.toBlob(b => res(b), 'image/jpeg', 0.9))
}

export async function scanImageFile(file: File, onInfo?: (i: ScanInfo) => void): Promise<File> {
  if (!file.type.startsWith('image/')) { onInfo?.({ scanned: false, error: 'no es imagen' }); return file }
  if (typeof Worker === 'undefined') { onInfo?.({ scanned: false, error: 'sin Worker' }); return file }

  let imageData: ImageData
  try {
    imageData = await fileToImageData(file)
  } catch (e) {
    onInfo?.({ scanned: false, error: 'no se pudo preparar la imagen: ' + ((e as any)?.message || String(e)) })
    return file
  }

  const opencvUrl = new URL(`${import.meta.env.BASE_URL}opencv.js`, self.location.href).href

  return await new Promise<File>(resolve => {
    let done = false
    const finish = (f: File, info: ScanInfo) => {
      if (done) return
      done = true
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      onInfo?.(info)
      resolve(f)
    }

    let w: Worker
    try {
      w = getWorker()
    } catch (e) {
      onInfo?.({ scanned: false, error: 'no se pudo crear el worker: ' + String(e) })
      resolve(file)
      return
    }

    // Watchdog real (el hilo principal está libre porque OpenCV corre en el worker).
    const timer = setTimeout(() => { killWorker(); finish(file, { scanned: false, error: 'tardó demasiado (timeout)' }) }, SCAN_TIMEOUT_MS)

    const onMsg = async (e: MessageEvent) => {
      const d = e.data
      if (d && d.ok && d.buffer) {
        try {
          const blob = await imageDataToJpeg(new Uint8ClampedArray(d.buffer), d.width, d.height)
          if (blob) {
            finish(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }), { scanned: true })
            return
          }
          finish(file, { scanned: false, error: 'no se pudo exportar el JPEG' })
        } catch (err) {
          finish(file, { scanned: false, error: 'exportar: ' + ((err as any)?.message || String(err)) })
        }
      } else {
        finish(file, { scanned: false, error: (d && d.error) || 'el worker no devolvió imagen' })
      }
    }
    const onErr = (ev: ErrorEvent) => { killWorker(); finish(file, { scanned: false, error: 'error en el worker: ' + (ev?.message || 'desconocido') }) }

    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    // Transferimos el buffer de píxeles (no se copia).
    w.postMessage({ opencvUrl, data: imageData.data, width: imageData.width, height: imageData.height }, [imageData.data.buffer])
  })
}
