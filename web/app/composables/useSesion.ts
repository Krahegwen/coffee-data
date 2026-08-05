/**
 * Sesión de escritura.
 *
 * El token viaja una sola vez, al abrir sesión, y a partir de ahí lo lleva una
 * cookie `HttpOnly` que este código no puede leer ni necesita. Antes vivía en
 * `localStorage`, donde cualquier XSS lo habría leído; solo se pudo cambiar
 * cuando la app y la API pasaron a compartir origen.
 *
 * Aquí no se guarda el token en ninguna parte: se manda y se olvida.
 */
export function useSesion() {
  const { base } = useApi()
  const activa = useState('sesion', () => false)
  const comprobada = useState('sesion-comprobada', () => false)

  async function comprobar() {
    // La versión anterior guardaba el token aquí. Ya no se usa, pero seguiría
    // siendo un secreto legible por cualquier script: fuera al pasar por aquí.
    if (import.meta.client) localStorage.removeItem('coffee.token')

    try {
      const r = await $fetch<{ activa: boolean }>(`${base}/api/sesion`)
      activa.value = r.activa
    } catch {
      activa.value = false
    } finally {
      comprobada.value = true
    }
  }

  async function abrir(token: string) {
    await $fetch(`${base}/api/sesion`, {
      method: 'POST',
      body: { token: token.trim() },
    })
    activa.value = true
  }

  async function cerrar() {
    await $fetch(`${base}/api/sesion`, { method: 'DELETE' })
    activa.value = false
  }

  return { activa, comprobada, comprobar, abrir, cerrar }
}
