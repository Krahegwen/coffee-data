import type { PasoGuion } from '~/composables/useApi'

/**
 * El estado del cronómetro, fuera de sus pantallas.
 *
 * Vive aquí y no dentro de un componente por dos motivos. Uno: salir a mirar
 * una ficha con el reloj andando —o pulsar atrás sin querer— y volver no puede
 * costar la extracción. Y dos: preparar y el reloj son dos rutas, y las dos
 * hablan de la misma taza.
 *
 * En memoria de la app, no en almacén: un F5 lo reinicia, como cualquier
 * cronómetro.
 *
 * ---
 *
 * **Cuándo caduca un borrador**, que es la regla que faltaba decir en voz alta
 * y que vale para toda la app:
 *
 * > Un borrador dura hasta que lo que describe deja de poder ocurrir.
 *
 * De ahí salen los tres casos, y no de tres criterios inventados por
 * separado:
 *
 * - **La medición** (tiempo, goteo) muere **al guardar la extracción**: se
 *   midió esa taza y ya está apuntada. No al salir del reloj, que salir no
 *   termina nada — por eso `soltarReloj` lo llama el alta y no la pantalla.
 * - **El borrador del formulario** —lo tecleado en el alta— muere también al
 *   guardar, y solo en lo que no se repite: la nota de cata es de esa taza,
 *   la temperatura es el punto de partida de la siguiente.
 * - **La selección de preparar** —café, receta, dosis, agua— no es un
 *   borrador: es una preferencia. Sobrevive a guardar, y solo se va con
 *   «Restablecer».
 */
export const CRONO_EN_BLANCO = () => ({
  cafeId: '',
  recetaId: '',
  dosis: 20,
  agua: 300,
  pasos: [] as PasoGuion[],
  corriendo: false,
  transcurrido: 0,
  finGoteo: null as number | null,
  inicioMs: null as number | null,
  /**
   * Si el reloj iba al marcar el fin del goteo. Solo entonces tiene sentido
   * ponerse al día al deshacer: en pausa, la parada fue a propósito.
   */
  goteoIba: false,
})

export function useCrono() {
  const estado = useState('crono', CRONO_EN_BLANCO)

  /**
   * Hay una medición que se perdería. Es lo que distingue vaciar un formulario
   * en blanco —gratis— de tirar un tiempo que ya no se puede repetir, porque
   * el café está colado.
   *
   * `corriendo` cuenta aunque el reloj marque 0:00 todavía: el agua ya va
   * cayendo. Mirar solo `transcurrido` fallaba en los primeros instantes y,
   * peor, con la pestaña de fondo —ahí el navegador congela
   * requestAnimationFrame y el número se queda clavado mientras el café se
   * cuela igual—.
   */
  const hayMedicion = computed(
    () => estado.value.corriendo
      || estado.value.transcurrido > 0
      || estado.value.finGoteo !== null,
  )

  /** El reloj a cero, sin tocar la selección: la taza siguiente es del mismo café. */
  function soltarReloj() {
    Object.assign(estado.value, {
      corriendo: false,
      transcurrido: 0,
      finGoteo: null,
      inicioMs: null,
      goteoIba: false,
    })
  }

  /** Como recién llegado: fuera también la selección y las cantidades. */
  function olvidarTodo() {
    Object.assign(estado.value, CRONO_EN_BLANCO())
  }

  return { estado, hayMedicion, soltarReloj, olvidarTodo }
}
