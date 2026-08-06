import type { BeforeInstallPromptEvent } from '~/composables/instalar'

/**
 * El aviso de «esto se puede instalar» llega pronto, a veces antes de que
 * monte ninguna pantalla, y pasa una sola vez. Se escucha desde un plugin
 * para no perderlo.
 */
export default defineNuxtPlugin(() => {
  const puedeInstalar = usePuedeInstalar()
  const yaInstalada = useYaInstalada()
  const enTactilAhora = useEnTactil()

  yaInstalada.value = enModoApp()
  enTactilAhora.value = enTactil()

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Sin esto, el navegador puede sacar su propio cartel cuando le parezca
    // y perdemos la ocasión de guardarlo para el botón.
    evento.preventDefault()
    guardarEvento(evento as BeforeInstallPromptEvent)
    puedeInstalar.value = true
  })

  window.addEventListener('appinstalled', () => {
    guardarEvento(null)
    puedeInstalar.value = false
    yaInstalada.value = true
  })
})
