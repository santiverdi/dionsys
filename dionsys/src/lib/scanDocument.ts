// Escaneo de documento en el navegador: detecta los bordes del papel, recorta,
// endereza la perspectiva y realza (fondo blanco parejo) para que quede como
// escaneado. Devuelve un File JPEG.
//
// El trabajo pesado (OpenCV.js) corre en un Web Worker (ver scanWorker.ts) para
// que NUNCA congele la UI ni deje la pantalla en "Escaneando…" para siempre:
// este archivo le pone un tope de tiempo real y, si se pasa, mata el worker y
// devuelve la foto original para que igual se suba.
//
// Es best-effort: ante cualquier problema (sin Worker/OffscreenCanvas, OpenCV no
// carga, timeout, etc.) devuelve el archivo original.

const SCAN_TIMEOUT_MS = 40000 // tope total (incluye bajar OpenCV ~10MB la 1ª vez)

let worker: Worker | null = null
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./scanWorker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}
function killWorker() {
  if (worker) { try { worker.terminate() } catch { /* ignore */ } worker = null }
}

export async function scanImageFile(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  // Entornos sin Worker/OffscreenCanvas (muy viejos): subimos la foto tal cual.
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return file

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // no se pudo decodificar la foto: la subimos tal cual
  }

  return await new Promise<File>(resolve => {
    let done = false
    const finish = (f: File) => {
      if (done) return
      done = true
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      resolve(f)
    }

    const w = getWorker()

    // Watchdog REAL: corre en el hilo principal (libre, porque OpenCV está en el
    // worker), así que sí se dispara. Si vence, matamos el worker y subimos el original.
    const timer = setTimeout(() => { killWorker(); finish(file) }, SCAN_TIMEOUT_MS)

    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d && d.ok && d.buffer) {
        const blob = new Blob([d.buffer], { type: d.type || 'image/jpeg' })
        finish(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
      } else {
        finish(file)
      }
    }
    const onErr = () => { killWorker(); finish(file) }

    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    w.postMessage({ bitmap }, [bitmap])
  })
}
