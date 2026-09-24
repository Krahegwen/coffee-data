/**
 * El service worker y las versiones nuevas: cuándo se pregunta y cuándo se
 * pone. El cómo vive en `useVersion`.
 *
 * El navegador solo pregunta al cargar la página, y la app instalada en
 * Android casi nunca se carga: vuelve del fondo tal y como estaba. Así que
 * aquí se pregunta además al volver a la app, al cambiar de página y cada
 * media hora mientras está a la vista. Preguntar no pone nada: si hay versión
 * nueva se baja por detrás, y se pone en el siguiente momento en que no
 * sorprende —volver a la app, o cambiar de página, llegando a la que ibas—.
 * El arranque tiene su propio momento, detrás del splash: ver `app.vue`.
 */
const CADA = 30 * 60_000
const COMO_MUCHO = 60_000

export default defineNuxtPlugin(() => {
  const { registrar, buscar, aplicar, pendiente, hayAlgoQuePerder } = useVersion()
  void registrar()

  let ultima = Date.now()
  function preguntar() {
    if (Date.now() - ultima < COMO_MUCHO) return
    ultima = Date.now()
    void buscar()
  }

  /*
   * Al volver a la app. Si la versión ya estaba bajada —la pidió una vuelta
   * anterior, o el reloj de media hora— se pone ahora, que es cuando se abre
   * la app de verdad en un móvil y todavía no has tocado nada.
   */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (!hayAlgoQuePerder.value && pendiente()) {
      void aplicar()
      return
    }
    preguntar()
  })
  window.setInterval(() => {
    if (document.visibilityState === 'visible') preguntar()
  }, CADA)

  /*
   * Al cambiar de página. Con la versión bajada, la navegación se cancela y se
   * hace como una carga entera hacia la página a la que ibas: llegas donde
   * querías, ya en la nueva, pasando por el splash. La primera navegación no
   * cuenta, que es el propio arranque.
   */
  useRouter().beforeEach((to, from) => {
    if (!from.matched.length || to.fullPath === from.fullPath) return
    if (!hayAlgoQuePerder.value && pendiente()) {
      void aplicar(to.fullPath)
      return false
    }
    preguntar()
  })
})
