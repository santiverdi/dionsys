import { useEffect, useState } from 'react'

// Campo de fecha en formato dd/mm/aaaa (independiente del idioma del dispositivo).
// Hacia afuera trabaja con 'YYYY-MM-DD' (value/onChange); muestra/edita dd/mm/aaaa.

function isoToDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayToIso(s: string): string {
  const m = s.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (!m) return ''
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  const dn = +d, mn = +mo
  if (dn < 1 || dn > 31 || mn < 1 || mn > 12) return ''
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

interface Props {
  value: string                 // 'YYYY-MM-DD' o ''
  onChange: (iso: string) => void
  className?: string
  id?: string
}

export default function DateField({ value, onChange, className, id }: Props) {
  const [text, setText] = useState(isoToDisplay(value))

  // Sincroniza el texto cuando el value cambia desde afuera (ej: lo completa la IA),
  // pero sin pisar lo que el usuario está tipeando si ya representa ese mismo value.
  useEffect(() => {
    if (displayToIso(text) !== value) setText(isoToDisplay(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const t = e.target.value
    setText(t)
    onChange(displayToIso(t))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      value={text}
      onChange={handle}
      className={className}
    />
  )
}
