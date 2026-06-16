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

// Info opcional sobre cómo salió el escaneo (para diagnóstico/avisos en la UI).
export interface ScanInfo {
  scanned: boolean   // true = se proceso con OpenCV; false = se subio la foto original
  error?: string     // motivo si scanned === false
}

export async function scanImageFile(file: File, onInfo?: (i: ScanInfo) => void): Promise<File> {
  if (!file.type.startsWith('image/')) { onInfo?.({ scanned: false, error: 'no es imagen' }); return file }

  // Entornos sin Worker/OffscreenCanvas (muy viejos): subimos la foto tal cual.
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    onInfo?.({ scanned: false, error: 'sin Worker/OffscreenCanvas' })
    return file
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    onInfo?.({ scanned: false, error: 'no se pudo decodificar la foto' })
    return file
  }

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

    // Watchdog REAL: corre en el hilo principal (libre, porque OpenCV está en el
    // worker), así que sí se dispara. Si vence, matamos el worker y subimos el original.
    const timer = setTimeout(() => { killWorker(); finish(file, { scanned: false, error: 'tardó demasiado (timeout)' }) }, SCAN_TIMEOUT_MS)

    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d && d.ok && d.buffer) {
        const blob = new Blob([d.buffer], { type: d.type || 'image/jpeg' })
        finish(new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }), { scanned: true })
      } else {
        finish(file, { scanned: false, error: (d && d.error) || 'el worker no devolvió imagen' })
      }
    }
    const onErr = (ev: ErrorEvent) => { killWorker(); finish(file, { scanned: false, error: 'error en el worker: ' + (ev?.message || 'desconocido') }) }

    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    w.postMessage({ bitmap }, [bitmap])
  })
}
