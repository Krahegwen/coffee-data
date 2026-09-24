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

  modules: ['@vite-pwa/nuxt', '@nuxtjs/i18n'],

  /*
   * Dos idiomas, y el castellano es la casa: con `prefix_except_default` sus
   * URLs no se mueven ni una letra. Eso no es cosmético — la app instalada
   * arranca en `/`, y cambiar las rutas de quien ya la tiene sería romperle
   * los marcadores y el atajo del escritorio para que otro pueda leerla.
   *
   * Las rutas del inglés se traducen enteras y no solo se prefijan: `/en/brew`
   * y no `/en/crono`. Una URL a medias en dos idiomas se lee peor que en uno.
   */
  i18n: {
    defaultLocale: 'es',
    strategy: 'prefix_except_default',
    locales: [
      { code: 'es', language: 'es-ES', name: 'Español', file: 'es.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
    // La cookie recuerda lo que se elige a mano; sin ella manda el idioma del
    // dispositivo. Solo redirige en la raíz: entrar por un enlace directo a
    // una ruta ya dice en qué idioma se quiere leer.
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'coffee.idioma',
      redirectOn: 'root',
      fallbackLocale: 'es',
    },
    customRoutes: 'config',
    pages: {
      index: { es: '/', en: '/' },
      nueva: { es: '/nueva', en: '/new' },
      respaldo: { es: '/respaldo', en: '/backup' },
      ajustes: { es: '/ajustes', en: '/settings' },
      menu: { es: '/menu', en: '/menu' },
      'cafes/index': { es: '/cafes', en: '/coffees' },
      'cafes/nueva': { es: '/cafes/nueva', en: '/coffees/new' },
      'cafes/[id]': { es: '/cafes/[id]', en: '/coffees/[id]' },
      'crono/index': { es: '/crono', en: '/brew' },
      'crono/reloj': { es: '/crono/reloj', en: '/brew/timer' },
      'recetas/index': { es: '/recetas', en: '/recipes' },
      'recetas/[id]': { es: '/recetas/[id]', en: '/recipes/[id]' },
      'accesorios/index': { es: '/accesorios', en: '/gear' },
      'accesorios/[id]': { es: '/accesorios/[id]', en: '/gear/[id]' },
      'extracciones/[id]': { es: '/extracciones/[id]', en: '/brews/[id]' },
    },
  },

  runtimeConfig: {
    public: {
      // Vacío: la API vive en el mismo origen, servida por el mismo Worker.
      // COFFEE_API solo hace falta para apuntar a otro sitio a propósito.
      apiBase: process.env.COFFEE_API || '',
      version: paquete.version,
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
        // El fondo del tema de casa, no el marrón de la marca: `useTema` lo
        // cambia por el del tema elegido en cuanto monta la app —a través de
        // `useHead` en app.vue, que si no unhead lo vuelve a poner—, y con un
        // color distinto de partida la barra parpadeaba en cada carga.
        { name: 'theme-color', content: '#faf7f2' },
        /*
         * Tarjeta de enlace: lo que sale al pegar la dirección en un chat.
         *
         * Va aquí y en estático por el mismo motivo que el título de arriba —
         * con `ssr: false` lo que ponga `useHead` solo existe tras hidratar, y
         * ningún scraper ejecuta JavaScript—, y por otro que es de este
         * proyecto: todas las rutas sirven la misma cáscara, así que la
         * tarjeta es una y describe la app.
         *
         * Que es lo correcto además de lo posible: la bitácora es privada y
         * pide token, y una tarjeta por pantalla no tendría a quién enseñarle
         * nada, salvo el nombre de la pantalla a quien no puede entrar.
         */
        { property: 'og:title', content: 'Bitácora de café' },
        {
          property: 'og:description',
          content:
            'Registro de extracciones en V60 con el método 4:6 de Tetsu Kasuya: '
            + 'una sola variable por taza, y qué mover en la siguiente.',
        },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Bitácora de café' },
        { property: 'og:locale', content: 'es_ES' },
        { property: 'og:url', content: 'https://brew.krahegwen.com/' },
        { property: 'og:image', content: 'https://brew.krahegwen.com/og.png' },
        { property: 'og:image:type', content: 'image/png' },
        // Sin las medidas, WhatsApp y Slack se bajan el PNG entero antes de
        // decidir si la tarjeta es grande o un cuadradito.
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        {
          property: 'og:image:alt',
          content: 'Bitácora de café: extracciones en V60 con el método 4:6',
        },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:image', content: 'https://brew.krahegwen.com/og.png' },
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
    /*
     * `prompt` y no `autoUpdate`: con éste, en cuanto el service worker nuevo
     * se activaba el módulo recargaba la página, estuvieras donde estuvieras
     * —navegando, a medio formulario o con el reloj corriendo—. Con `prompt`
     * la versión nueva espera a que se la pida.
     *
     * Y sin el plugin del módulo (`registerPlugin: false`): el suyo también
     * recargaba la página de ahora al cambiar de versión, y aquí la versión
     * nueva se pone al cambiar de página llegando a la que ibas. El registro,
     * cuándo se pregunta y cuándo se pone viven en `useVersion` y en
     * `plugins/actualizar.client.ts`.
     */
    registerType: 'prompt',
    client: { registerPlugin: false },
    manifest: {
      name: 'Bitácora de café',
      short_name: 'Café',
      description: 'Registro de extracciones en V60 con el método 4:6',
      lang: 'es',
      /*
       * Los dos son de construcción y no se pueden mover en caliente: la
       * pantalla de arranque de la app instalada sale con estos colores pase
       * lo que pase. Van con el tema de casa para que el salto —si elegiste
       * uno oscuro— sea de un color neutro a otro y no del marrón de la marca.
       */
      theme_color: '#faf7f2',
      background_color: '#faf7f2',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      /*
       * Que la app se declare a sí misma como «aplicación relacionada» es lo
       * que permite a `getInstalledRelatedApps()` decir, desde el navegador,
       * que ya la tienes instalada. Sin esta entrada la respuesta es siempre
       * una lista vacía.
       *
       * `prefer_related_applications` se queda en false a propósito: en true,
       * el navegador dejaría de ofrecer la instalación.
       */
      related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
      prefer_related_applications: false,
      icons: [
        { src: 'icono-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icono-512.png', sizes: '512x512', type: 'image/png' },
        { src: 'icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      // `m4a` incluido: sin él los clips de voz no se precachean y la cocina
      // sin cobertura se queda muda justo cuando más falta hace.
      globPatterns: ['**/*.{js,css,html,png,svg,ico,m4a,json}'],
      // La tarjeta de enlace se la bajan los servidores de WhatsApp o Discord,
      // no la app: precacharla cobraba 140 KB a cada instalación por una imagen
      // que nadie ve desde dentro. Los iconos sí se quedan.
      globIgnores: ['og.png'],
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
