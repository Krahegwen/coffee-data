/**
 * Qué tema rige, y ponerlo donde el CSS lo vea.
 *
 * Tres decisiones que no son la misma: si sigues al teléfono o mandas tú
 * (`tema_modo`), y qué juego de colores usar en claro y en oscuro
 * (`tema_claro`, `tema_oscuro`). Quien pone el móvil en oscuro de noche
 * quiere que la app le siga, y eso no dice nada de qué tema le gusta de día.
 *
 * Toda la lógica vive aquí y el CSS solo sabe pintar juegos: en `app.vue` no
 * hay condiciones, solo `:root[data-tema="…"]` con sus variables.
 */

/** Si ya se enganchó el seguimiento del sistema. Una vez por app, no por página. */
let enganchado = false

export function useTema() {
  const { ajustes } = usePreferencias()

  /**
   * Lo que dice el sistema ahora mismo.
   *
   * En `useState` y no en un `ref` del composable: cada pantalla que llama a
   * `useTema()` recibiría el suyo, y como solo `app.vue` engancha el
   * seguimiento, el de las demás se quedaba en `false` para siempre. Con el
   * móvil en oscuro y el modo en automático, la pantalla de ajustes se creía
   * en claro y ofrecía los dos temas claros: no había forma de elegir entre
   * los oscuros sin forzar antes el modo a mano.
   */
  const sistemaOscuro = useState('tema-sistema-oscuro', () => (
    typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches
  ))

  /** Claro u oscuro de verdad, ya resuelto el «auto». */
  const modo = computed(() => {
    const elegido = ajustes.value.tema_modo
    if (elegido === 'claro' || elegido === 'oscuro') return elegido
    return sistemaOscuro.value ? 'oscuro' : 'claro'
  })

  /** El juego concreto: el elegido para el modo que toca. */
  const tema = computed(() =>
    modo.value === 'oscuro' ? ajustes.value.tema_oscuro : ajustes.value.tema_claro,
  )

  /**
   * Arranca el seguimiento del sistema y aplica el tema a la raíz. Se llama
   * una vez, desde `app.vue`; llamarlo otra vez no engancha un segundo
   * escuchador —en desarrollo, cada recarga en caliente montaba uno nuevo
   * sobre el mismo `MediaQueryList` y se iban acumulando—.
   */
  function seguir() {
    if (typeof window === 'undefined' || enganchado) return
    enganchado = true

    const consulta = window.matchMedia('(prefers-color-scheme: dark)')
    sistemaOscuro.value = consulta.matches
    consulta.addEventListener('change', (e) => { sistemaOscuro.value = e.matches })

    watchEffect(() => {
      /*
       * Sin tema resuelto no se toca el atributo. Escribir `undefined` deja
       * puesto un `data-tema="undefined"` que no casa con ningún juego **y**
       * desactiva el `:not([data-tema])` del oscuro automático: la pantalla
       * se iría a blanco justo en el arranque a oscuras.
       */
      if (!tema.value) return
      document.documentElement.dataset.tema = tema.value
      /*
       * La barra del navegador va con el fondo del tema. Se lee del CSS ya
       * aplicado en vez de repetir el color aquí: dos listas acabarían
       * discrepando, y ésta se olvidaría al añadir un tema nuevo.
       */
      const fondo = getComputedStyle(document.documentElement)
        .getPropertyValue('--fondo').trim()
      const meta = document.querySelector('meta[name="theme-color"]')
      if (fondo && meta) meta.setAttribute('content', fondo)
    })
  }

  return { modo, tema, seguir }
}
