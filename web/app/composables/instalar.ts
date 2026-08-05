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

export function guardarEvento(evento: BeforeInstallPromptEvent | null) {
  guardado = evento
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
