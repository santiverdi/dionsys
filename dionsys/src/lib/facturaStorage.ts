// Sube el archivo de una factura (PDF o foto) a Supabase Storage y devuelve la
// URL pública + el nombre original. Solo se guarda esa URL (texto) en el pago, así
// el archivo NO viaja en cada sincronización y no satura localStorage.
//
// Setup (una sola vez, en Supabase → Storage):
//   1. Crear un bucket público llamado `facturas`.
//   2. Política que permita subir (insert) con la anon key. Ver pasos que te paso aparte.

import { supabase } from './supabase'

const BUCKET = 'facturas'

export interface UploadedFactura {
  url: string
  nombre: string
}

/** Sube el archivo y devuelve { url, nombre }. Lanza Error si falla. */
export async function uploadFactura(file: File): Promise<UploadedFactura> {
  if (!supabase) {
    throw new Error('La nube no está configurada; no se puede adjuntar el archivo.')
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
  const year = new Date().getFullYear()
  const path = `${year}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) {
    throw new Error(`No se pudo subir el archivo: ${error.message}`)
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl, nombre: file.name }
}

/** URL que fuerza la descarga con el nombre original (Content-Disposition: attachment). */
export function downloadUrl(url: string, nombre: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}download=${encodeURIComponent(nombre)}`
}
