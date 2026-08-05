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
      // La API vive en otro origen; se puede apuntar a la local con COFFEE_API.
      apiBase: process.env.COFFEE_API || 'https://coffee.krahegwen.com',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'theme-color', content: '#3b2314' },
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
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/coffee\.krahegwen\.com\/api\/.*/,
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
