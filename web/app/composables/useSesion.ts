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
  // Directo de la config y no de useApi(): desde que useApi() pregunta a la
  // sesión para elegir camino, tirar de él desde aquí sería un ciclo.
  const base = useRuntimeConfig().public.apiBase
  const activa = useState('sesion', () => false)
  const comprobada = useState('sesion-comprobada', () => false)

  async function comprobar() {
    // La versión anterior guardaba el token aquí. Ya no se usa, pero seguiría
    // siendo un secreto legible por cualquier script: fuera al pasar por aquí.
    if (import.meta.client) localStorage.removeItem('coffee.token')

    try {
      const r = await $fetch<{ activa: boolean }>(`${base}/api/sesion`)
      activa.value = r.activa
      localStorage.setItem('coffee.sesion', r.activa ? '1' : '0')
    } catch (fallo) {
      /*
       * Sin red no se sabe, y aquí equivocarse hacia el «no» pierde datos:
       * arrancando como local, una extracción registrada sin cobertura no se
       * encolaría y el siguiente refresco la pisaría. Así que ante un fallo
       * de red vale el último estado conocido — es solo un «solía haber
       * sesión», no un secreto—. Si la cookie hubiera caducado de verdad, el
       * drenado dará 401 y la cola quedará a la vista, que no es perder nada.
       */
      const sinRed = !(fallo as { statusCode?: number })?.statusCode
      activa.value = sinRed && localStorage.getItem('coffee.sesion') === '1'
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
    localStorage.setItem('coffee.sesion', '1')
  }

  async function cerrar() {
    await $fetch(`${base}/api/sesion`, { method: 'DELETE' })
    activa.value = false
    localStorage.setItem('coffee.sesion', '0')
  }

  return { activa, comprobada, comprobar, abrir, cerrar }
}
