import { readFileSync } from 'node:fs'

// La versión sale del package.json de la raíz, que es el que sube el hook de
// pre-commit. Se lee aquí, en construcción, y viaja dentro del bundle: la app
// no tiene que preguntársela a nadie.
const paquete = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-05',
  devtools: { enabled: true },

  // Sin SSR: los datos son personales y viven tras la API, así que no hay nada
  // que renderizar en servidor. `nuxt generate` produce ficheros estáticos.
  // El día que haya páginas públicas indexables (recetas, landing), se activa
  // el prerender solo para esas rutas y el resto sigue siendo cliente.
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  runtimeConfig: {
    public: {
      // Vacío: la API vive en el mismo origen, servida por el mismo Worker.
      // COFFEE_API solo hace falta para apuntar a otro sitio a propósito.
      apiBase: process.env.COFFEE_API || '',
      version: paquete.version,
      // El día que se construyó. Con la versión sola bastaría casi siempre,
      // pero esto delata un bundle viejo aunque el número no se haya movido.
      construida: new Date().toISOString().slice(0, 10),
    },
  },

  // En `nuxt dev` la app corre en :3000 y el Worker en :8787. El proxy hace
  // que /api siga siendo del mismo origen también aquí, así que el código no
  // se entera de la diferencia y CORS no hace falta ni en desarrollo.
  nitro: {
    devProxy: {
      '/api': {
        target: 'http://127.0.0.1:8787/api',
        changeOrigin: true,
      },
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      // Estático a propósito: con `ssr: false` el título que pone useHead
      // solo aparece al hidratar, y hasta entonces la pestaña saldría con la
      // URL. Este va en el HTML generado; el de cada pantalla lo afina luego.
      title: 'Bitácora de café',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#3b2314' },
      ],
      // El enlace al manifiesto va a mano: con `ssr: false` el módulo genera
      // el fichero pero no lo enlaza en el HTML, y sin ese enlace el
      // navegador no ofrece instalar la app por mucho service worker que
      // haya. Los iconos existen en public/ pero tampoco se referenciaban.
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Bitácora de café',
      short_name: 'Café',
      description: 'Registro de extracciones en V60 con el método 4:6',
      lang: 'es',
      theme_color: '#3b2314',
      background_color: '#faf7f2',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      // La API va por red primero: unos datos viejos en la bitácora confunden
      // más que un error. Pero si no hay cobertura, la caché responde.
      navigateFallbackDenylist: [/^\/api\//],
      runtimeCaching: [
        {
          urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cafe',
            networkTimeoutSeconds: 5,
            expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
          },
        },
      ],
    },
    devOptions: { enabled: true, type: 'module' },
  },
})
