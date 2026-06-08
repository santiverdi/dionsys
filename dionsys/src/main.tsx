import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Auto-actualización: con registerType 'autoUpdate' la nueva versión se aplica
// y recarga sola. Forzamos el chequeo cada 60s y cada vez que se vuelve a la app
// (clave en el celular, que suele "reabrir" desde segundo plano sin recargar).
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => { registration.update() }, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
