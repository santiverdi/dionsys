import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export default function Login() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  function handleKey(key: string) {
    setError('')
    if (key === 'del') {
      setPin(prev => prev.slice(0, -1))
      return
    }
    if (pin.length >= 6) return
    const newPin = pin + key
    setPin(newPin)

    if (newPin.length >= 4) {
      const employee = login(newPin)
      if (employee) {
        navigate('/', { replace: true })
      } else if (newPin.length === 6) {
        setError('PIN incorrecto')
        setTimeout(() => setPin(''), 500)
      }
    }
  }

  return (
    <div className="min-h-screen bg-navy-800 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-cream tracking-wide">DionSys</h1>
        <p className="text-navy-300 mt-2 text-sm">Sistema de Gestion - Hotel Dion</p>
      </div>

      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-xs">
        {/* PIN dots */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                pin.length > i
                  ? 'bg-navy-800 border-navy-800 scale-110'
                  : 'bg-transparent border-navy-300'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-500 text-center text-sm mb-4 animate-pulse">{error}</p>
        )}

        {/* Numeric keypad */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((key, i) =>
            key === '' ? (
              <div key={i} />
            ) : (
              <button
                key={i}
                onClick={() => handleKey(key)}
                className={`h-14 rounded-xl text-xl font-semibold transition-all duration-150 active:scale-95 ${
                  key === 'del'
                    ? 'bg-navy-100 text-navy-600 hover:bg-navy-200 text-base'
                    : 'bg-navy-50 text-navy-800 hover:bg-navy-100 active:bg-navy-200'
                }`}
              >
                {key === 'del' ? '\u2190' : key}
              </button>
            )
          )}
        </div>
      </div>

      <p className="text-navy-400 text-xs mt-6">Ingresa tu PIN de 4 digitos</p>
    </div>
  )
}
