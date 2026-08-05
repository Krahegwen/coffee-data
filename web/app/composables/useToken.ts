/**
 * El token de escritura, guardado en el navegador.
 *
 * Va en localStorage, que queda expuesto a XSS. Es asumible aquí porque la app
 * no carga ni un script de terceros y se sirve de un dominio propio, pero es
 * el punto débil de la autenticación actual: la mejora es Cloudflare Access
 * por delante, y entonces el navegador no guarda ningún secreto.
 */
const CLAVE = 'coffee.token'

export function useToken() {
  const token = useState<string>('token', () => '')

  onMounted(() => {
    if (!token.value) token.value = localStorage.getItem(CLAVE) ?? ''
  })

  function guardar(valor: string) {
    const limpio = valor.trim()
    token.value = limpio
    if (limpio) localStorage.setItem(CLAVE, limpio)
    else localStorage.removeItem(CLAVE)
  }

  const configurado = computed(() => token.value.length > 0)

  return { token, guardar, configurado }
}
