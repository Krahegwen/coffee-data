/**
 * Las versiones nuevas: buscarlas, bajarlas y ponerlas **sin sorprender a nadie**.
 *
 * La app registra su propio service worker (`plugins/actualizar.client.ts`) en
 * vez de dejárselo al módulo de PWA, porque el del módulo recargaba la página
 * que estuvieras viendo en cuanto la versión nueva mandaba. Aquí se decide
 * cuándo y hacia dónde:
 *
 * - **Al abrir**, detrás del splash de arranque. Si hay versión nueva se baja
 *   y se pone antes de enseñar nada; si no, no cuesta tiempo, que la pregunta
 *   va a la par que la de la sesión.
 * - **Al cambiar de página**, si ya está bajada: esa navegación se hace como
 *   una carga entera *hacia la página a la que ibas*, y llegas en la nueva.
 * - **Al volver a la app**, si ya está bajada, antes de que toques nada.
 * - **A mano**, desde ajustes.
 *
 * Y nunca si hay algo que perder (`hayAlgoQuePerder`): recargar tira lo que
 * vive en memoria de la pestaña.
 *
 * **Lo que no se puede dar por hecho** es que la página que llega tras poner
 * la versión sea la nueva. El worker nuevo no se activa mientras el viejo
 * tenga algo en marcha, y la navegación que sale de la página vieja la puede
 * contestar todavía el viejo: se probó, y llegaba la página de antes con el
 * worker nuevo ya al mando. Por eso cada arranque comprueba que su versión es
 * la que sirve el worker (`desfasada`) y, si no, se recarga una vez más.
 */

/** Cuánto se espera a que conteste el servidor antes de arrancar sin más. */
const PLAZO_PREGUNTA_MS = 3000
/** Y a que se baje la versión nueva, si la hay. */
const PLAZO_DESCARGA_MS = 10_000
/** Y a que se active antes de navegar; si no, se navega y el arranque lo arregla. */
const PLAZO_ACTIVACION_MS = 1500
/** Dónde se apunta para qué versión se recargó ya, para no recargar en bucle. */
const RECARGADA_PARA = 'coffee.version-recargada-para'

let registro: ServiceWorkerRegistration | null = null
let registrando: Promise<ServiceWorkerRegistration | null> | null = null
/** El worker que manda ya no es el que sirvió esta página: la puso otra pestaña. */
let cambioDeMando = false

/** Una promesa con plazo: pasado, resuelve con `alPlazo` en vez de colgarse. */
function conPlazo<T>(promesa: Promise<T>, ms: number, alPlazo: T): Promise<T> {
  return Promise.race([
    promesa,
    new Promise<T>((resolver) => setTimeout(() => resolver(alPlazo), ms)),
  ])
}

/** Espera a que un worker llegue a `estado`. Con plazo. */
function esperarEstado(worker: ServiceWorker, estado: ServiceWorkerState, ms: number) {
  if (worker.state === estado) return Promise.resolve(true)
  return conPlazo(new Promise<boolean>((resolver) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === estado) resolver(true)
      if (worker.state === 'redundant') resolver(false)
    })
  }), ms, false)
}

/**
 * Los campos del alta que son **de esa taza** —los que el propio alta vacía
 * al guardar—. Con alguno escrito, el borrador tiene algo que perder; lo
 * demás (temperatura, clics…) lo vuelve a poner el arranque desde la anterior.
 */
const DE_LA_TAZA = ['tiempo_total', 'drawdown_s', 'extraido_g', 'variable_cambiada', 'notas_cata']

const escrito = (valor: unknown) => String(valor ?? '').trim() !== ''

export function useVersion() {
  const actualizando = useState('version-actualizando', () => false)
  const { app } = useRuntimeConfig()

  // La medición, con la regla de siempre: la de `useCrono`, que es de quien es.
  const { hayMedicion } = useCrono()
  /*
   * Los borradores, sin inicializador: si la pantalla todavía no los creó, no
   * existen, y crearlos aquí con otro valor le cambiaría el suyo de partida.
   */
  const taza = useState<Record<string, unknown> | undefined>('borrador-extraccion')
  const tazaVariables = useState<string[] | undefined>('borrador-extraccion-variables')
  const bolsa = useState<Record<string, unknown> | undefined>('borrador-bolsa')
  const receta = useState<Record<string, unknown> | undefined>('borrador-receta')
  const recetaPasos = useState<unknown[] | undefined>('borrador-receta-pasos')

  /**
   * Si recargar ahora tiraría algo. La medición del reloj, sobre todo: el café
   * ya está colado y ese tiempo no se repite. Y los borradores, que sobreviven
   * a cambiar de pantalla pero no a una recarga. Los criterios pecan de
   * prudentes —una bolsa con nombre ya cuenta, aunque lo pusiera un «Otra
   * bolsa»—: equivocarse hacia aquí solo retrasa la versión nueva.
   */
  const hayAlgoQuePerder = computed(() => {
    if (hayMedicion.value) return true
    if (taza.value && DE_LA_TAZA.some((campo) => escrito(taza.value![campo]))) return true
    if ((tazaVariables.value?.length ?? 0) > 0) return true
    if (bolsa.value && escrito(bolsa.value.nombre)) return true
    if (receta.value && escrito(receta.value.nombre)) return true
    return (recetaPasos.value?.length ?? 0) > 1
  })

  /** Registra el service worker. Una vez por app; lo llama el plugin. */
  function registrar() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null)
    if (!registrando) {
      navigator.serviceWorker.addEventListener('controllerchange', () => { cambioDeMando = true })
      // En desarrollo, el que genera el módulo con `devOptions`, que va como
      // módulo; en producción, el de siempre.
      const [url, type] = import.meta.dev
        ? ['/dev-sw.js?dev-sw', 'module' as const]
        : ['/sw.js', 'classic' as const]
      registrando = navigator.serviceWorker.register(url, { scope: '/', type })
        .then((r) => (registro = r))
        .catch(() => null)
    }
    return registrando
  }

  /**
   * Hay versión nueva **para esta página**: un worker nuevo esperando o
   * instalándose mientras manda otro. Sin controlador es la primera visita, y
   * lo que se instala no es una versión nueva sino la primera.
   */
  const hayNueva = () =>
    Boolean(navigator.serviceWorker?.controller && (registro?.waiting || registro?.installing))

  /**
   * Si esta página es de una versión anterior a la que sirve el worker. Se
   * compara la id de construcción de Nuxt con la del `builds/latest.json` que
   * contesta el worker, que es la de la versión que tiene en caché. Sin
   * controlador, sin red o sin respuesta, no se sabe y se da por buena.
   */
  async function desfasada(): Promise<string | null> {
    if (!navigator.serviceWorker?.controller) return null
    const servida = await conPlazo(
      fetch('/_nuxt/builds/latest.json').then((r) => r.json()).catch(() => null),
      PLAZO_PREGUNTA_MS,
      null,
    ) as { id?: string } | null
    return servida?.id && servida.id !== app.buildId ? servida.id : null
  }

  /** Pregunta al servidor. Sin red o sin registro, simplemente no hay nada. */
  async function buscar(): Promise<boolean> {
    const r = await registrar()
    if (!r) return false
    await conPlazo(r.update().then(() => true).catch(() => false), PLAZO_PREGUNTA_MS, false)
    return hayNueva()
  }

  /** Si hay versión nueva, espera a que esté bajada. Con plazo. */
  async function lista(): Promise<boolean> {
    if (!hayNueva()) return false
    if (registro!.waiting) return true
    return esperarEstado(registro!.installing!, 'installed', PLAZO_DESCARGA_MS)
  }

  /** Una carga entera de `destino`, con el splash puesto mientras tanto. */
  function ir(destino: string) {
    actualizando.value = true
    location.assign(destino)
    return true
  }

  /**
   * Pone la versión que espera y carga `destino` con ella —por defecto, la
   * página de ahora—. Si no hay ninguna esperando pero otra pestaña ya puso
   * una (`cambioDeMando`), basta con la carga entera.
   *
   * Se espera un momento a que el worker nuevo se active, que entonces la
   * navegación la contesta él y se llega a la primera. Si tarda, se navega
   * igual: el viejo no suelta mientras esta página siga abierta, y el
   * arranque de la siguiente comprueba la versión y se recarga si hace falta.
   */
  async function aplicar(destino = location.pathname + location.search + location.hash) {
    const esperando = registro?.waiting
    if (!esperando) return cambioDeMando ? ir(destino) : false
    actualizando.value = true
    esperando.postMessage({ type: 'SKIP_WAITING' })
    await esperarEstado(esperando, 'activated', PLAZO_ACTIVACION_MS)
    return ir(destino)
  }

  /** Si hay que poner algo al cambiar de página o al volver: sin esperar a nada. */
  const pendiente = () => Boolean(registro?.waiting) || cambioDeMando

  /**
   * Lo del arranque, detrás del splash. Devuelve si la página se va a cargar
   * otra vez, que entonces no hay que seguir arrancando.
   *
   * Primero, que esta página sea de la versión que sirve el worker: si no, una
   * recarga, y solo una por versión —si después de recargar sigue sin
   * cuadrar, algo raro pasa y es mejor arrancar que entrar en bucle—.
   * Después, si hay versión nueva en el servidor, bajarla y ponerla.
   */
  async function alAbrir(): Promise<boolean> {
    await registrar()
    const servida = await desfasada()
    if (servida) {
      // Sin almacenamiento no se puede llevar la cuenta, y entonces no se
      // recarga: mejor una página vieja que un bucle.
      let yaRecargada = true
      try {
        yaRecargada = sessionStorage.getItem(RECARGADA_PARA) === servida
        sessionStorage.setItem(RECARGADA_PARA, servida)
      } catch { /* sigue como recargada */ }
      if (!yaRecargada) return ir(location.pathname + location.search + location.hash)
    }
    if (!(await buscar())) return false
    if (!(await lista())) return false
    return aplicar()
  }

  return {
    actualizando, hayAlgoQuePerder, registrar, buscar, lista, aplicar, pendiente, alAbrir,
  }
}
