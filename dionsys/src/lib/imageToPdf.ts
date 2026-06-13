// Convierte una foto (imagen) a un PDF de una página, para mandarle a la contadora.
// Si el archivo ya es PDF (o no es imagen), lo devuelve tal cual.
// jsPDF se carga on-demand (import dinámico) para no pesar en el bundle inicial.

const MAX_DIM = 2000 // px del lado más largo

export async function fileToPdf(file: File): Promise<File> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return file
  if (!file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({
      orientation: w >= h ? 'landscape' : 'portrait',
      unit: 'px',
      format: [w, h],
    })
    pdf.addImage(dataUrl, 'JPEG', 0, 0, w, h)
    const blob = pdf.output('blob')
    const name = file.name.replace(/\.[^.]+$/, '') + '.pdf'
    return new File([blob], name, { type: 'application/pdf' })
  } catch {
    // Si algo falla en la conversión, subimos la imagen original (mejor eso que nada).
    return file
  }
}
