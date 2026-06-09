import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Las credenciales viven en variables de entorno (Vite las inyecta con prefijo VITE_).
// En local: archivo .env.local (gitignoreado). En producción: Vercel → Project Settings → Environment Variables.
// Si faltan, la app sigue funcionando 100% con localStorage (sin sync entre dispositivos).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null

export const cloudEnabled = supabase !== null
