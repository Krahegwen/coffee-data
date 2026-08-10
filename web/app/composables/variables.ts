import { CLAVES_VARIABLE } from '~/composables/textos'

/**
 * Mantiene la tabla de variables cambiadas al día cuando el valor se toca
 * desde su campo de siempre y no desde la tabla.
 *
 * Los dos sitios editan el mismo dato, así que la tabla tiene que enterarse:
 * si bajas la temperatura en su campo y eso la aleja de la extracción
 * anterior, ahí hay un cambio y le toca su fila.
 *
 * **Lo que no hace es quitarlas.** Si devuelves el valor a donde estaba, la
 * fila se queda con el mismo número a los dos lados hasta que recargues o
 * cambies de pantalla —entonces ya no sale, porque la tabla se deduce de las
 * columnas—. Es a propósito: una tabla que se encoge sola mientras escribes
 * mueve de sitio lo que estás mirando, y basta pasar por un valor intermedio
 * al teclear para que desaparezca la fila que acabas de crear. Para quitarla
 * está su ✕, que además devuelve el valor.
 */
export function useTablaAlDia(
  form: Record<string, unknown>,
  previa: () => Record<string, unknown> | null,
  cambiadas: Ref<string[]>,
) {
  // Las claves, no las etiquetas: aquí se comparan columnas.
  const claves = [...CLAVES_VARIABLE]
  const foto = () => claves.map((c) => String(form[c] ?? '')).join('|')

  watch(foto, () => {
    const anterior = previa()
    if (!anterior) return
    const nuevas = claves.filter((c) => {
      if (cambiadas.value.includes(c)) return false
      const antes = anterior[c]
      if (antes === undefined || antes === null) return false
      return String(form[c] ?? '') !== String(antes)
    })
    if (nuevas.length) cambiadas.value = [...cambiadas.value, ...nuevas]
  })
}
