import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PokerSite',
        short_name: 'PokerSite',
        description: 'Póker Texas Hold\'em multijugador: mesas, torneos y bots. Juega con amigos.',
        lang: 'es',
        theme_color: '#0a0f16',
        background_color: '#0a0f16',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // No cachear la API ni los sockets — el juego es en tiempo real
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // bundle grande (DiceBear+charts)
      },
      // En desarrollo NO registramos el service worker: cacheaba versiones
      // viejas y no se veían los cambios. En producción (build) sí queda activo.
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true,          // expone el dev server en la red local (para probar desde el celular)
    allowedHosts: true,  // acepta la conexión por IP de la LAN
    proxy: { '/api': 'http://localhost:4000', '/socket.io': { target: 'http://localhost:4000', ws: true } },
  },
})
