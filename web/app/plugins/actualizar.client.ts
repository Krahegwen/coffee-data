/**
 * Cuándo se pregunta si hay versión nueva.
 *
 * El navegador solo lo mira al cargar la página, y la app instalada en Android
 * casi nunca se carga: vuelve del fondo tal y como estaba. Así que una versión
 * desplegada por la mañana no se enteraba hasta que el sistema mataba la app,
 * y entonces saltaba a los pocos segundos de abrirla, con la mano ya dentro.
 *
 * Se pregunta al volver a la app —que es cuando se abre de verdad en un
 * móvil— y cada media hora mientras está a la vista. Preguntar no instala
 * nada: si hay versión nueva se baja por detrás y espera a que la pidas, con
 * el aviso de `VersionNueva.vue`.
 */
const CADA = 30 * 60_000
const COMO_MUCHO = 60_000

export default defineNuxtPlugin((nuxtApp) => {
  let ultima = Date.now()

  function comprobar() {
    if (Date.now() - ultima < COMO_MUCHO) return
    ultima = Date.now()
    // Sin red o sin registro todavía no hay nada que preguntar: ya caerá.
    void nuxtApp.$pwa?.getSWRegistration()?.update().catch(() => {})
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobar()
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') comprobar()
  }, CADA)
})
