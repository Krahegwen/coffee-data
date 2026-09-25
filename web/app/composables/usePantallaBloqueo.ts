/**
 * El cronómetro fuera de la app: la pantalla de bloqueo, la cortina de
 * notificaciones y lo que cada sistema haga con eso — la Dynamic Island de un
 * iPhone, la cápsula de OxygenOS.
 *
 * Ninguna de esas piezas está al alcance de una web. Las Live Activities de
 * iOS y las notificaciones con cronómetro de Android son solo nativas. Lo que
 * sí llega es el reproductor del sistema: si la página suena por un `<audio>`,
 * Media Session le pone título, subtítulo, carátula y una barra de progreso
 * que avanza sola. Así que aquí se reproduce un silencio en bucle y el paso
 * de la receta se escribe como si fuera una canción.
 *
 * El silencio no puede salir de Web Audio, que es por donde suenan los pips
 * (`useSonido`): el reproductor del sistema solo se entera de los elementos
 * multimedia. Y tiene que durar más de 5 s, porque Chrome trata lo más corto
 * como un aviso suelto y no le saca notificación.
 *
 * La barra es **el paso**, no la extracción: la misma vuelta que da la bola
 * del anillo. Con el móvil bloqueado, lo que se lee es cuánto falta para el
 * siguiente, que es el número grande del reloj.
 *
 * Y al ser una canción, es **la única**: el sistema da el audio a un solo
 * reproductor, así que arrancar el silencio detiene la música que sonara.
 * Por eso nace apagado en los ajustes, y por eso, si otra app se queda con el
 * audio a mitad de taza, esto se aparta en vez de pelearse por él (`ceder`).
 *
 * Hay dos usuarios: el reloj, que lo maneja desde su estado, y la prueba de la
 * portada. Todo vive a nivel de módulo porque el `<audio>` y la sesión son
 * uno por página, y el que llega detrás le quita el sitio al anterior.
 */
import { relojDe } from '@coffee/nucleo/validacion'

/** Lo que enseña el sistema. `tramo` son los segundos del paso en el plan. */
export type EnSistema = {
  titulo: string
  subtitulo: string
  album: string
  tramo: { desde: number; hasta: number } | null
  segundo: number
  andando: boolean
  /**
   * Cambia cuando el reloj se re-ancla —un salto, reanudar—: la barra hay que
   * volver a decírsela aunque el paso sea el mismo.
   */
  ancla: number
}

type Mandos = Partial<Record<'play' | 'pause' | 'nexttrack' | 'previoustrack' | 'stop', () => void>>

export const hayPantallaBloqueo = () =>
  typeof navigator !== 'undefined' && 'mediaSession' in navigator

/**
 * Diez segundos de «silencio» en WAV de 16 bits a 8 kHz, hecho en memoria.
 *
 * No es cero exacto: alterna entre 0 y 1, un zumbido a -90 dB que no oye
 * nadie. Un cero digital puro es lo que un navegador podría tomar por «no
 * suena nada» y dejar de tratar como reproducción.
 */
function silencio(): Blob {
  const hz = 8000
  const muestras = hz * 10
  const vista = new DataView(new ArrayBuffer(44 + muestras * 2))
  const texto = (at: number, s: string) =>
    [...s].forEach((c, i) => vista.setUint8(at + i, c.charCodeAt(0)))
  texto(0, 'RIFF')
  vista.setUint32(4, 36 + muestras * 2, true)
  texto(8, 'WAVE')
  texto(12, 'fmt ')
  vista.setUint32(16, 16, true)
  vista.setUint16(20, 1, true) // PCM
  vista.setUint16(22, 1, true) // mono
  vista.setUint32(24, hz, true)
  vista.setUint32(28, hz * 2, true)
  vista.setUint16(32, 2, true)
  vista.setUint16(34, 16, true)
  texto(36, 'data')
  vista.setUint32(40, muestras * 2, true)
  for (let i = 0; i < muestras; i++) vista.setInt16(44 + i * 2, i % 2, true)
  return new Blob([vista.buffer], { type: 'audio/wav' })
}

let audio: HTMLAudioElement | null = null
let url: string | null = null
/** Lo último que se escribió, para no repintar la tarjeta del sistema en cada tic. */
let escrito = ''
/**
 * Quién tiene la sesión, y cómo se despide cuando se la quitan: otro dueño que
 * llega, u otra app que se queda con el audio.
 */
let dueno: string | null = null
let alQuitarle: (() => void) | null = null
/**
 * Si el silencio suena porque lo arrancamos y nadie lo ha parado. Cuando lo
 * para este módulo —el reloj en pausa— baja antes a false, así que un audio
 * parado con esto a true lo ha parado otro.
 */
let sonando = false

const ACCIONES: (keyof Mandos)[] = ['play', 'pause', 'nexttrack', 'previoustrack', 'stop']

/** Si la sesión es de ése: nadie apaga ni escribe en la de otro. */
export const sistemaEsDe = (quien: string) => dueno === quien

/** Que suene el silencio. Si el navegador no deja, rechaza y no queda apuntado. */
async function sonar() {
  const este = audio!
  sonando = true
  try {
    await este.play()
  } catch (error) {
    if (este === audio) sonando = false
    throw error
  }
}

/** La pausa que pide el dueño, apuntada para no confundirla con la de otro. */
function callar() {
  sonando = false
  audio?.pause()
}

const loParoOtro = () => sonando && audio !== null && audio.paused

/**
 * Otra app se ha quedado con el audio —la música que vuelves a poner, una
 * llamada— o se ha tocado la tarjeta sin un reloj que la atienda: el sistema
 * nos ha parado el silencio. Se suelta la tarjeta y se avisa al dueño para que
 * no la vuelva a pedir. Volver a sonar en el paso siguiente, que es lo que se
 * hacía, le quitaba el audio a tu música en cada paso.
 *
 * Con el reloj en pausa no hay aviso posible: el silencio ya está parado y
 * nadie más puede pararlo. Poner tu música entonces y reanudar desde la app te
 * la para — es el precio de que la tarjeta enseñe en pausa el botón de seguir.
 */
function ceder() {
  const despedida = alQuitarle
  apagarSistema()
  despedida?.()
}

/** El `pause` del silencio: si no lo pedimos, el audio ya es de otro. */
function alPararse() {
  if (loParoOtro()) ceder()
}

/**
 * Arranca el silencio. **Tiene que llamarse desde un toque** la primera vez:
 * iOS solo deja sonar un elemento que ya sonó por un gesto, y a partir de ahí
 * `contarAlSistema` lo pausa y lo reanuda solo. Si otro tenía la sesión, se
 * le avisa para que suelte lo suyo.
 */
export async function encenderSistema(quien: string, despedida?: () => void) {
  if (!hayPantallaBloqueo()) return
  if (dueno !== quien) alQuitarle?.()
  dueno = quien
  alQuitarle = despedida ?? null
  if (!audio) {
    url = URL.createObjectURL(silencio())
    audio = new Audio(url)
    audio.loop = true
    audio.addEventListener('pause', alPararse)
  }
  if (audio.paused) await sonar()
}

/** Los botones del sistema. Los que no se pasan se quitan. */
export function mandosDelSistema(m: Mandos) {
  if (!hayPantallaBloqueo()) return
  for (const accion of ACCIONES) {
    // No todos los navegadores conocen todas las acciones, y una que no
    // conocen lanza: se queda sin ese botón y ya.
    try { navigator.mediaSession.setActionHandler(accion, m[accion] ?? null) } catch { /* no la conoce */ }
  }
}

/** Escribe el estado en la tarjeta del sistema. Barato si nada cambió. */
export function contarAlSistema(e: EnSistema) {
  if (!hayPantallaBloqueo() || !audio) return
  // Parado por otro y sin que el `pause` haya llegado aún: sonar aquí sería
  // quitarle el audio a quien se lo acaba de llevar.
  if (loParoOtro()) {
    ceder()
    return
  }
  const ms = navigator.mediaSession

  // El audio sigue al reloj: en pausa, el sistema enseña el botón de seguir.
  if (e.andando && audio.paused) void sonar().catch(() => { /* sin permiso, sin sonido */ })
  if (!e.andando && !audio.paused) callar()

  const clave = JSON.stringify([e.titulo, e.subtitulo, e.album, e.tramo, e.andando, e.ancla])
  if (clave === escrito) return
  escrito = clave

  ms.metadata = new MediaMetadata({
    title: e.titulo,
    artist: e.subtitulo,
    album: e.album,
    artwork: [{ src: '/icono-512.png', sizes: '512x512', type: 'image/png' }],
  })
  ms.playbackState = e.andando ? 'playing' : 'paused'
  // La barra la extrapola el sistema desde aquí: basta con decírsela en cada
  // cambio, y no en cada segundo. Sin tramo —el último paso no tiene
  // siguiente contra el que medir— se quita.
  try {
    if (!e.tramo) {
      ms.setPositionState()
    } else {
      const duracion = Math.max(1, e.tramo.hasta - e.tramo.desde)
      ms.setPositionState({
        duration: duracion,
        position: Math.min(duracion, Math.max(0, e.segundo - e.tramo.desde)),
        playbackRate: 1,
      })
    }
  } catch { /* Safari antiguo no la tiene */ }
}

/** Silencio fuera, tarjeta fuera y botones fuera. */
export function apagarSistema() {
  dueno = null
  alQuitarle = null
  escrito = ''
  sonando = false
  if (audio) {
    audio.removeEventListener('pause', alPararse)
    audio.pause()
    /*
     * Y sin fuente, que es como el estándar suelta un reproductor. Pausado sin
     * más sigue vivo hasta que pase el recolector, y con él la tarjeta y su
     * botón de seguir: tocarlo arrancaría otra vez el silencio, ya sin nadie
     * que lo pare, y le quitaría el audio a tu música.
     */
    audio.removeAttribute('src')
    audio.load()
    audio = null
  }
  if (url) URL.revokeObjectURL(url)
  url = null
  if (!hayPantallaBloqueo()) return
  mandosDelSistema({})
  navigator.mediaSession.metadata = null
  navigator.mediaSession.playbackState = 'none'
}

/* ------------------------------------------------------------------------ */

type Paso = { accion: string; estilo?: string; agua_g?: number; t: number }

/** El 4:6 Kasuya base de `almacen/semilla.js`, con 20 g de café. */
const RECETA = '4:6 Kasuya base'
const PASOS: Paso[] = [
  { accion: 'verter', estilo: 'espiral', agua_g: 60, t: 0 },
  { accion: 'esperar', t: 15 },
  { accion: 'verter', estilo: 'espiral', agua_g: 120, t: 45 },
  { accion: 'esperar', t: 60 },
  { accion: 'verter', estilo: 'espiral', agua_g: 210, t: 90 },
  { accion: 'esperar', t: 115 },
  { accion: 'verter', estilo: 'espiral', agua_g: 300, t: 145 },
  { accion: 'esperar', t: 170 },
  { accion: 'retirar', t: 200 },
]
const DURACION_S = 210

const estado = ref<'parado' | 'corriendo' | 'pausado'>('parado')
const segundo = ref(0)
const paso = ref(0)
/** El `performance.now()` que corresponde al segundo 0 de la prueba. */
let origen = 0
let bucle: ReturnType<typeof setInterval> | null = null

/**
 * La prueba de la portada: una extracción de 3:30 con la receta base, sin
 * pasar por el crono ni registrar nada. Es para ver en un móvil concreto qué
 * enseña su sistema sin tener que saber usar la app.
 */
export function usePruebaPantallaBloqueo() {
  const { t } = useI18n()
  const { etiquetaPaso } = useTextos()
  const sonido = useSonido()

  const ahora = () => (performance.now() - origen) / 1000
  const indiceEn = (s: number) => PASOS.findLastIndex((p) => p.t <= s)

  const titulo = (p: Paso) =>
    p.agua_g
      ? t('sistema.titulo_verter', { paso: etiquetaPaso(p.accion, p.estilo), n: p.agua_g })
      : etiquetaPaso(p.accion, p.estilo)

  function contarPrueba() {
    const p = PASOS[paso.value]!
    const siguiente = PASOS[paso.value + 1]
    contarAlSistema({
      titulo: titulo(p),
      subtitulo: siguiente ? t('sistema.luego', { paso: titulo(siguiente) }) : t('sistema.ultimo'),
      album: t('sistema.prueba', { receta: RECETA }),
      tramo: { desde: p.t, hasta: siguiente?.t ?? DURACION_S },
      segundo: segundo.value,
      andando: estado.value === 'corriendo',
      ancla: origen,
    })
  }

  function tic() {
    segundo.value = ahora()
    if (segundo.value >= DURACION_S) {
      sonido.pitido('cadencia')
      parar()
      return
    }
    const i = indiceEn(segundo.value)
    if (i !== paso.value) {
      paso.value = i
      sonido.pitido('go')
    }
    contarPrueba()
  }

  function andar() {
    if (bucle) clearInterval(bucle)
    bucle = setInterval(tic, 250)
  }

  /** Tiene que llamarse desde un toque: sin gesto no suena nada. */
  async function empezar() {
    sonido.desbloquear()
    await encenderSistema('prueba', soltar)
    origen = performance.now()
    segundo.value = 0
    paso.value = 0
    estado.value = 'corriendo'
    sonido.pitido('go')
    mandosDelSistema({ play: reanudar, pause: pausar, stop: parar })
    contarPrueba()
    andar()
  }

  function pausar() {
    if (estado.value !== 'corriendo') return
    if (bucle) clearInterval(bucle)
    bucle = null
    segundo.value = ahora()
    estado.value = 'pausado'
    contarPrueba()
  }

  function reanudar() {
    if (estado.value !== 'pausado') return
    // El segundo en que se paró pasa a ser el de ahora: la pausa no cuenta.
    origen = performance.now() - segundo.value * 1000
    estado.value = 'corriendo'
    contarPrueba()
    andar()
  }

  /** Lo de la prueba, sin tocar la sesión: por aquí se va si llega el reloj. */
  function soltar() {
    if (bucle) clearInterval(bucle)
    bucle = null
    estado.value = 'parado'
  }

  function parar() {
    soltar()
    apagarSistema()
  }

  const texto = computed(() =>
    estado.value === 'parado'
      ? ''
      : `${titulo(PASOS[paso.value]!)} · ${relojDe(segundo.value)} / ${relojDe(DURACION_S)}`,
  )

  return {
    disponible: hayPantallaBloqueo(), estado: readonly(estado), texto,
    duracion: relojDe(DURACION_S), empezar, pausar, reanudar, parar,
  }
}
