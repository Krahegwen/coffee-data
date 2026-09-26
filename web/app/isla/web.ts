/**
 * El adaptador web de la isla: el reproductor del sistema.
 *
 * Ninguna de las piezas nativas —Live Activities, notificaciones con
 * cronómetro— está al alcance de una web. Lo que sí llega es el reproductor
 * del sistema: si la página suena por un `<audio>`, Media Session le pone
 * título, subtítulo, carátula y una barra de progreso que avanza sola. Así
 * que aquí se reproduce un silencio en bucle y el tramo vigente se escribe
 * como si fuera una canción.
 *
 * El silencio no puede salir de Web Audio, que es por donde suenan los pips
 * (`useSonido`): el reproductor del sistema solo se entera de los elementos
 * multimedia. Y tiene que durar más de 5 s, porque Chrome trata lo más corto
 * como un aviso suelto y no le saca notificación.
 *
 * La barra es **el tramo**, no la extracción: la misma vuelta que da la bola
 * del anillo. Con el móvil bloqueado, lo que se lee es cuánto falta para el
 * siguiente, que es el número grande del reloj.
 *
 * Y al ser una canción, es **la única**: el sistema da el audio a un solo
 * reproductor, así que arrancar el silencio detiene la música que sonara.
 * Por eso nace apagado en los ajustes, y por eso, si otra app se queda con el
 * audio a mitad de taza, esto se aparta en vez de pelearse por él (`ceder`).
 *
 * Todo vive a nivel de módulo porque el `<audio>` y la sesión son uno por
 * página: el reloj y la prueba de la portada se turnan, y el que llega detrás
 * le quita el sitio al anterior. Y el tramo lo deriva este módulo él solo,
 * con el plan y el anclaje que tiene, en un intervalo propio: con el móvil
 * bloqueado la pantalla no pinta, y la tarjeta tiene que cambiar de paso
 * justo cuando es lo único que se ve.
 */
import { tramoEn } from '@coffee/nucleo/crono'

import type { Anclaje, Isla, Mando, PlanIsla } from './puerto'

type Accion = 'play' | 'pause' | 'nexttrack' | 'previoustrack' | 'stop'

/** A qué botón del reproductor va cada mando. `gotear` no tiene: es nativo. */
const ACCION_DE: Partial<Record<Mando, Accion>> = {
  reanudar: 'play',
  pausar: 'pause',
  siguiente: 'nexttrack',
  anterior: 'previoustrack',
  parar: 'stop',
}

const disponible = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator

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
 * Quién tiene la isla, y cómo se despide cuando se la quitan: otro dueño que
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

let plan: PlanIsla | null = null
let anclaje: Anclaje = { estado: 'cerrado' }
/** El `performance.now()` del segundo 0 mientras corre: no se mueve con la hora. */
let origen = 0
/** Cuántas veces se ha anclado: re-anclar obliga a volver a decir la barra aunque el tramo sea el mismo. */
let anclas = 0
let bucle: ReturnType<typeof setInterval> | null = null
let oyente: ((mando: Mando) => void) | null = null

const esDe = (quien: string) => dueno === quien

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
  apagar()
  despedida?.()
}

/** El `pause` del silencio: si no lo pedimos, el audio ya es de otro. */
function alPararse() {
  if (loParoOtro()) ceder()
}

/** El segundo del plan ahora mismo, según el anclaje. */
function segundoAhora(): number {
  switch (anclaje.estado) {
    case 'corriendo': return (performance.now() - origen) / 1000
    case 'pausado':
    case 'cuenta_atras': return anclaje.segundo
    default: return 0
  }
}

/** Escribe el tramo vigente en la tarjeta del sistema. Barato si nada cambió. */
function pintar() {
  if (!disponible() || !audio || !plan || anclaje.estado === 'cerrado') return
  // Parado por otro y sin que el `pause` haya llegado aún: sonar aquí sería
  // quitarle el audio a quien se lo acaba de llevar.
  if (loParoOtro()) {
    ceder()
    return
  }
  const ms = navigator.mediaSession
  // La cuenta atrás cuenta como andando: el reloj está a punto y el sistema
  // debe enseñar el botón de pausar, no el de seguir.
  const andando = anclaje.estado !== 'pausado'

  // El audio sigue al reloj: en pausa, el sistema enseña el botón de seguir.
  if (andando && audio.paused) void sonar().catch(() => { /* sin permiso, sin sonido */ })
  if (!andando && !audio.paused) callar()

  const segundo = segundoAhora()
  const tramo = plan.tramos[tramoEn(plan.tramos, segundo)]!
  const clave = JSON.stringify([tramo.titulo, tramo.subtitulo, plan.album, tramo.desde, tramo.hasta, andando, anclas])
  if (clave === escrito) return
  escrito = clave

  ms.metadata = new MediaMetadata({
    title: tramo.titulo,
    artist: tramo.subtitulo,
    album: plan.album,
    artwork: [{ src: '/icono-512.png', sizes: '512x512', type: 'image/png' }],
  })
  ms.playbackState = andando ? 'playing' : 'paused'
  // La barra la extrapola el sistema desde aquí: basta con decírsela en cada
  // cambio, y no en cada segundo. Sin final —el último tramo no tiene
  // siguiente contra el que medir— se quita.
  try {
    if (tramo.hasta === null) {
      ms.setPositionState()
    } else {
      const duracion = Math.max(1, tramo.hasta - tramo.desde)
      ms.setPositionState({
        duration: duracion,
        position: Math.min(duracion, Math.max(0, segundo - tramo.desde)),
        playbackRate: 1,
      })
    }
  } catch { /* Safari antiguo no la tiene */ }
}

/**
 * El tic que cambia de tramo mientras corre. Un intervalo y no
 * `requestAnimationFrame`: con el móvil bloqueado o la app de fondo el
 * navegador congela las animaciones, pero al intervalo solo lo estrangula a
 * uno por segundo —y con el audio sonando ni eso—, que para cambiar de paso
 * sobra.
 */
function andar() {
  if (bucle) return
  bucle = setInterval(pintar, 250)
}

function quieto() {
  if (bucle) clearInterval(bucle)
  bucle = null
}

async function encender(quien: string, nuevoPlan: PlanIsla, alCeder: () => void) {
  if (!disponible()) return
  if (dueno !== quien) alQuitarle?.()
  dueno = quien
  alQuitarle = alCeder
  plan = nuevoPlan
  if (!audio) {
    url = URL.createObjectURL(silencio())
    audio = new Audio(url)
    audio.loop = true
    audio.addEventListener('pause', alPararse)
  }
  if (audio.paused) await sonar()
}

function planificar(nuevoPlan: PlanIsla) {
  plan = nuevoPlan
  pintar()
}

function anclar(nuevo: Anclaje) {
  anclaje = nuevo
  anclas += 1
  if (nuevo.estado === 'cerrado') {
    apagar()
    return
  }
  if (nuevo.estado === 'corriendo') {
    // Al reloj monótono en el acto: a partir de aquí la hora del sistema
    // puede cambiar sin mover el paso.
    origen = performance.now() - (Date.now() - nuevo.epochMs)
    andar()
  } else {
    quieto()
  }
  pintar()
}

/** Los botones del sistema, los que el plan declare. Los que no, se quitan. */
function atender(quien: ((mando: Mando) => void) | null) {
  oyente = quien
  if (!disponible()) return
  for (const [mando, accion] of Object.entries(ACCION_DE) as [Mando, Accion][]) {
    const activo = oyente !== null && plan !== null && mando in plan.mandos
    // No todos los navegadores conocen todas las acciones, y una que no
    // conocen lanza: se queda sin ese botón y ya.
    try {
      navigator.mediaSession.setActionHandler(accion, activo ? () => oyente?.(mando) : null)
    } catch { /* no la conoce */ }
  }
}

/** Silencio fuera, tarjeta fuera y botones fuera. */
function apagar() {
  dueno = null
  alQuitarle = null
  plan = null
  anclaje = { estado: 'cerrado' }
  escrito = ''
  sonando = false
  quieto()
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
  if (!disponible()) return
  atender(null)
  navigator.mediaSession.metadata = null
  navigator.mediaSession.playbackState = 'none'
}

export const islaWeb: Isla = { disponible, encender, esDe, planificar, anclar, atender, apagar }
