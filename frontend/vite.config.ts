import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA instalable (RF-30, RNF-12): Workbox guarda la aplicación en el captor para que abra sin señal.
// Las llamadas a /api nunca se sirven desde la caché: sin señal, la interfaz usa lo que guardó
// cifrado en el dispositivo (RNF-16).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['arbol.svg', 'icono-192.png', 'icono-512.png'],
      manifest: {
        name: 'Dictaminación Técnica de Arbolado Público',
        short_name: 'Dictaminación',
        description: 'Dictámenes técnicos de arbolado público · Dirección Técnica de Arbolado, Municipalidad de Rosario',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#2c3e50',
        icons: [
          { src: '/icono-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Teselas del mapa ya vistas: permiten ver el mapa de la ruta sin señal.
            urlPattern: /^https:\/\/[abc]?\.?tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'teselas', expiration: { maxEntries: 400, maxAgeSeconds: 7 * 86_400 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    // Reglas del dominio compartidas con el servidor (firma, formulario, catálogos).
    alias: { '@dominio': fileURLToPath(new URL('../backend/src/dominio', import.meta.url)) },
  },
  // El servidor de la API: el de desarrollo en el 3000, o el que indique API_URL (pruebas en navegador).
  server: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  preview: { proxy: { '/api': process.env.API_URL ?? 'http://localhost:3000' } },
  test: { environment: 'jsdom', setupFiles: ['./src/pruebas/preparar.ts'] },
} as never);
