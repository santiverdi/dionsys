import { useRef, useState } from 'react'
import { Camera, X, Loader2 } from 'lucide-react'
import { compressImage } from '../../utils/imageCompressor'

interface PhotoCaptureProps {
  photo: string | null
  onCapture: (base64: string) => void
  onRemove: () => void
  label?: string
}

export default function PhotoCapture({ photo, onCapture, onRemove, label = 'Tomar foto' }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    try {
      const compressed = await compressImage(file)
      onCapture(compressed)
    } catch {
      alert('Error al procesar la imagen')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (photo) {
    return (
      <div className="relative rounded-xl overflow-hidden border border-navy-200">
        <img src={photo} alt="Captura" className="w-full h-48 object-cover" />
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full h-36 rounded-xl border-2 border-dashed border-navy-300 hover:border-gold-400 bg-navy-50 hover:bg-gold-50 transition-all flex flex-col items-center justify-center gap-2 text-navy-400 hover:text-gold-600"
      >
        {loading ? (
          <Loader2 size={28} className="animate-spin" />
        ) : (
          <Camera size={28} />
        )}
        <span className="text-sm font-medium">{loading ? 'Procesando...' : label}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </>
  )
}
