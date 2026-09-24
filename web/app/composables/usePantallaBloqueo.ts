/**
 * El cronómetro fuera de la app: la pantalla de bloqueo, la cortina de
 * notificaciones y, en un iPhone que la tenga, la Dynamic Island.
 *
 * Ninguna de las tres está al alcance de una web. Las Live Activities de iOS y
 * las notificaciones con cronómetro de Android son solo nativas. Lo que sí
 * llega es el reproductor del sistema: si la página suena por un `<audio>`,
 * Media Session le pone título, subtítulo, carátula y una barra de progreso
 * que avanza sola. Así que aquí se reproduce un silencio en bucle y el paso
 * de la receta se escribe como si fuera una canción.
 *
 * El silencio no puede salir de Web Audio, que es por donde suenan los pips
 * (`useSonido`): el reproductor del sistema solo se entera de los elementos
 * multimedia. Y tiene que durar más de 5 s, porque Chrome trata lo más corto
 * como un aviso suelto y no le saca notificación.
 *
 * Por ahora es **una prueba** que se lanza desde la portada con una receta
 * fija, sin pasar por el crono: sirve para ver en un móvil de verdad si el
 * sistema lo enseña antes de meterlo en el reloj. El estado vive a nivel de
 * módulo, como el bucle de `useSonido`: salir de la portada no para la prueba.
 */
import { relojDe } from '@coffee/nucleo/validacion'

type Paso = { accion: string; estilo?: string; agua_g?: number; t: number }

/** El 4:6 Kasuya base de `almacen/semilla.js`, con 20 g de café. */
const RECETA = '4:6 Kasuya base'
const PASOS: Paso[] = [
  { accion: 'verter', estilo: 'espiral', agua_g: 60, t: 0 },
  { accion: 'esperar', t: 15 },
  { accion: 'verter', estilo: 'espiral', agua_g: 60, t: 45 },
  { accion: 'esperar', t: 60 },
  { accion: 'verter', estilo: 'espiral', agua_g: 90, t: 90 },
  { accion: 'esperar', t: 115 },
  { accion: 'verter', estilo: 'espiral', agua_g: 90, t: 145 },
  { accion: 'esperar', t: 170 },
  { accion: 'retirar', t: 200 },
]
const DURACION_S = 210

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

const estado = ref<'parado' | 'corriendo' | 'pausado'>('parado')
const segundo = ref(0)
const paso = ref(0)

let audio: HTMLAudioElement | null = null
let url: string | null = null
/** El `performance.now()` que corresponde al segundo 0 de la extracción. */
let origen = 0
let bucle: ReturnType<typeof setInterval> | null = null

export function usePantallaBloqueo() {
  const { t } = useI18n()
  const { ACCIONES, ESTILOS } = useTextos()
  const sonido = useSonido()

  /** Media Session existe en Chrome de Android y en Safari desde iOS 15. */
  const disponible = typeof navigator !== 'undefined' && 'mediaSession' in navigator

  const ahora = () => (performance.now() - origen) / 1000
  const indiceEn = (s: number) => PASOS.findLastIndex((p) => p.t <= s)

  function titulo(p: Paso): string {
    const accion = ACCIONES.value[p.accion] ?? p.accion
    const estilo = p.estilo ? ` ${ESTILOS.value[p.estilo] ?? p.estilo}` : ''
    return `${accion}${estilo}${p.agua_g ? ` · ${p.agua_g} g` : ''}`
  }

  /** Lo que enseña el sistema: la canción es el paso, el disco la receta. */
  function contar() {
    const ms = navigator.mediaSession
    const p = PASOS[paso.value]
    const siguiente = PASOS[paso.value + 1]
    ms.metadata = new MediaMetadata({
      title: titulo(p),
      artist: siguiente
        ? t('bloqueo.siguiente', { paso: titulo(siguiente), a: relojDe(siguiente.t) })
        : t('bloqueo.ultimo'),
      album: t('bloqueo.album', { receta: RECETA }),
      artwork: [{ src: '/icono-512.png', sizes: '512x512', type: 'image/png' }],
    })
    ms.playbackState = estado.value === 'corriendo' ? 'playing' : 'paused'
    // La barra la extrapola el sistema desde aquí: basta con decírsela en
    // cada cambio, y no en cada segundo.
    try {
      ms.setPositionState({
        duration: DURACION_S,
        position: Math.min(segundo.value, DURACION_S),
        playbackRate: 1,
      })
    } catch { /* Safari antiguo no la tiene */ }
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
      contar()
    }
  }

  function andar() {
    if (bucle) clearInterval(bucle)
    bucle = setInterval(tic, 250)
  }

  /** Tiene que llamarse desde un toque: sin gesto no suena nada. */
  async function empezar() {
    if (!disponible) return
    sonido.desbloquear()
    if (!audio) {
      url = URL.createObjectURL(silencio())
      audio = new Audio(url)
      audio.loop = true
    }
    await audio.play()
    origen = performance.now()
    segundo.value = 0
    paso.value = 0
    estado.value = 'corriendo'
    sonido.pitido('go')
    contar()
    andar()

    const ms = navigator.mediaSession
    ms.setActionHandler('play', reanudar)
    ms.setActionHandler('pause', pausar)
    try { ms.setActionHandler('stop', parar) } catch { /* no en todos */ }
  }

  function pausar() {
    if (estado.value !== 'corriendo') return
    if (bucle) clearInterval(bucle)
    bucle = null
    segundo.value = ahora()
    audio?.pause()
    estado.value = 'pausado'
    contar()
  }

  function reanudar() {
    if (estado.value !== 'pausado' || !audio) return
    // El segundo en que se paró pasa a ser el de ahora: la pausa no cuenta.
    origen = performance.now() - segundo.value * 1000
    void audio.play()
    estado.value = 'corriendo'
    contar()
    andar()
  }

  function parar() {
    if (bucle) clearInterval(bucle)
    bucle = null
    if (audio) {
      audio.pause()
      audio = null
    }
    if (url) URL.revokeObjectURL(url)
    url = null
    estado.value = 'parado'
    if (!disponible) return
    const ms = navigator.mediaSession
    ms.metadata = null
    ms.playbackState = 'none'
    for (const accion of ['play', 'pause', 'stop'] as MediaSessionAction[]) {
      try { ms.setActionHandler(accion, null) } catch { /* no en todos */ }
    }
  }

  const texto = computed(() =>
    estado.value === 'parado'
      ? ''
      : `${titulo(PASOS[paso.value])} · ${relojDe(segundo.value)} / ${relojDe(DURACION_S)}`,
  )

  return {
    disponible, estado: readonly(estado), texto, duracion: relojDe(DURACION_S),
    empezar, pausar, reanudar, parar,
  }
}
