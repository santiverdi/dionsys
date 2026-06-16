/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // lo registramos manualmente en main.tsx
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'DionSys - Hotel Dion',
        short_name: 'DionSys',
        description: 'Sistema de gestion hotelera',
        theme_color: '#1e293b',
        background_color: '#f5f0e8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // OpenCV (~10MB, solo para escanear facturas) NO va al precache: se baja
        // on-demand desde la red la primera vez que se escanea.
        globIgnores: ['**/opencv-*.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  server: {
    host: true,
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
