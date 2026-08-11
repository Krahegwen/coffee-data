import type { Preferencias } from '~/composables/useApi'

/** La lectura en vuelo, una para toda la app y no una por composable. */
let leyendo: Promise<void> | null = null

/**
 * Los ajustes, en memoria de la app y respaldados por el cajón.
 *
 * Se leen una vez por sesión de pestaña y se quedan: lo que consume esto es
 * el cronómetro, y el cronómetro no puede esperar a IndexedDB en mitad de un
 * vertido. Mientras la lectura vuelve rigen los valores de fábrica, que son
 * los mismos que devolvería el núcleo.
 *
 * **Guardar es optimista**: el interruptor se mueve en el acto y la escritura
 * va detrás. Si el cajón la rechaza se deshace y se dice; esperar a que
 * confirme dejaba el interruptor pensándoselo medio segundo, que en un
 * control de encender y apagar se lee como que no funciona.
 */
export function usePreferencias() {
  const { preferencias: leer, guardarPreferencias } = useApi()

  const valores = useState<Preferencias | null>('preferencias', () => null)
  const cargando = useState('preferencias-cargando', () => false)

  /** Lo de fábrica mientras no haya llegado lo guardado. */
  const POR_DEFECTO: Preferencias = {
    sonido: true,
    latido: true,
    cuenta_atras: true,
    crono_cafe_id: '',
    crono_receta_id: '',
    crono_dosis_g: 20,
    crono_agua_g: 300,
  }

  const ajustes = computed<Preferencias>(() => valores.value ?? POR_DEFECTO)

  /** Si ya se leyó del cajón. Lo mira quien no puede actuar antes de saber. */
  const listas = computed(() => valores.value !== null)

  /**
   * Una sola lectura en vuelo, compartida entre todo el que pregunte. La
   * bandera vive en el módulo y no dentro del composable: cada pantalla que
   * llama a `usePreferencias()` recibe su propio cierre, así que declararla
   * dentro prometía una exclusión que no existía.
   */
  function cargar() {
    if (valores.value || leyendo) return leyendo ?? Promise.resolve()
    cargando.value = true
    leyendo = leer()
      .then((p) => { valores.value = p })
      .catch(() => { valores.value = { ...POR_DEFECTO } })
      .finally(() => { cargando.value = false; leyendo = null })
    return leyendo
  }

  /**
   * Vuelve a leer del cajón, para después de sincronizar.
   *
   * Sin esto, lo que baja del servidor entraba en IndexedDB pero no en la
   * pantalla: el interruptor apagado en el móvil seguía pitando aquí hasta
   * recargar, porque `valores` se llena una vez y nada lo volvía a mirar.
   */
  async function releer() {
    valores.value = await leer().catch(() => valores.value)
  }

  async function guardar(cambios: Partial<Preferencias>) {
    const antes = { ...ajustes.value }
    valores.value = { ...antes, ...cambios }
    try {
      valores.value = await guardarPreferencias(cambios)
    } catch (fallo) {
      valores.value = antes
      throw fallo
    }
  }

  return { ajustes, listas, cargando, cargar, releer, guardar }
}
