/**
 * Instalar la app desde un botón propio.
 *
 * El navegador avisa **una sola vez** de que la app se puede instalar, con
 * el evento `beforeinstallprompt`, y en Android ya no enseña ningún cartel
 * por su cuenta: si no guardas ese evento y ofreces tú el botón, la única
 * vía que le queda al usuario es el menú del navegador, que no encuentra
 * nadie. Por eso el evento se captura en un plugin, lo antes posible, y se
 * guarda hasta que haya dónde pulsar.
 */

/** El evento vive fuera del estado de Nuxt: envolverlo en un ref lo rompe. */
let guardado: BeforeInstallPromptEvent | null = null

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const usePuedeInstalar = () => useState('puede-instalar', () => false)
export const useYaInstalada = () => useState('ya-instalada', () => false)
export const useEnTactil = () => useState('en-tactil', () => false)

export function guardarEvento(evento: BeforeInstallPromptEvent | null) {
  guardado = evento
}

/**
 * Un cacharro donde instalar la app signifique lo que promete el botón:
 * un icono en la pantalla de inicio.
 *
 * Se mira el puntero y no el ancho de la ventana ni el user agent. El ancho
 * miente en cuanto encoges el navegador del portátil, y el user agent miente
 * siempre. `pointer: coarse` es el puntero principal: en un portátil táctil
 * con ratón sale `fine`, que es lo que queremos —ahí el botón sobra—.
 */
export function enTactil() {
  return window.matchMedia('(pointer: coarse)').matches
}

/** Corriendo desde el icono, no desde el navegador. */
export function enModoApp() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    // iOS no implementa display-mode, tiene lo suyo.
    || (navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Si la app ya está instalada, aunque ahora mismo la estés viendo en una
 * pestaña del navegador.
 *
 * `enModoApp()` solo sabe cómo la abriste tú, no si existe en la pantalla de
 * inicio: entrando por la URL diría que no aunque la tengas puesta. Esto lo
 * pregunta de verdad, y hace falta que el manifiesto se declare a sí mismo en
 * `related_applications`.
 *
 * Es de Chromium y de contextos seguros: en iOS y en Firefox no existe, y
 * entonces no se sabe. Ante la duda, no se dice nada.
 */
export async function instaladaAparte() {
  const consulta = (navigator as {
    getInstalledRelatedApps?: () => Promise<unknown[]>
  }).getInstalledRelatedApps
  if (!consulta) return false
  try {
    return (await consulta.call(navigator)).length > 0
  } catch {
    return false
  }
}

/**
 * Abre el diálogo del navegador. Devuelve qué contestó el usuario, o
 * 'sin-evento' si el navegador nunca lo ofreció: el evento no se puede
 * fabricar, así que ahí solo queda el menú.
 */
export async function pedirInstalacion() {
  if (!guardado) return 'sin-evento' as const
  await guardado.prompt()
  const { outcome } = await guardado.userChoice
  // Solo sirve una vez: si lo rechaza, el navegador manda otro más adelante.
  guardado = null
  return outcome
}
