/**
 * Los sonidos del cronómetro, sintetizados: Web Audio y ni un fichero.
 *
 * La agenda —qué suena en qué segundo— la da `cuesDe()` en el núcleo; aquí
 * solo está el reproductor. Dos relojes conviven y no hay que mezclarlos:
 * el del crono va sobre `performance.now()` y el del audio sobre
 * `ctx.currentTime`, que deriva respecto al primero. Por eso no se programa
 * la extracción entera de golpe: un bucle corto mira los cues de los
 * próximos dos segundos y los ancla al reloj de audio en ese momento. Así
 * pausar, reanudar y los saltos de paso funcionan gratis: la agenda se
 * re-ancla sola.
 *
 * El bucle es un `setInterval`, no `requestAnimationFrame`: con la pestaña
 * de fondo el navegador congela las animaciones pero al intervalo solo lo
 * estrangula a uno por segundo, y con dos segundos de horizonte sobra. Y
 * vive a nivel de módulo, no del componente: salir del reloj a mirar una
 * ficha no calla los avisos, igual que no para el tiempo.
 */

export type Cue = { t: number; tipo: string; clave?: string }

/**
 * Los clips de voz ya decodificados, por clave. Se cargan una vez por idioma
 * y se quedan: son 100 KB y evitan que la primera frase de cada café llegue
 * tarde por estar bajándose.
 */
let vozCargada: { idioma: string; clips: Record<string, AudioBuffer> } | null = null
let cargando: Promise<void> | null = null
/** Cuánto dura cada frase: es lo que el núcleo necesita para colocarlas. */
let manifiesto: Record<string, number> | null = null

/** Frecuencia (Hz), inicio relativo (s), duración (s) y ganancia por tono. */
type Tono = [number, number, number, number]

/**
 * El vocabulario entero: pips agudos y GO una octava justa por encima, que
 * es la distancia que se distingue con el molinillo puesto. La cadencia
 * desciende —se lee como «ya está» sin explicarla— y la confirmación es un
 * toque corto y grave. La ganancia baja al subir la frecuencia, que el oído
 * ya la sube solo.
 */
const TONOS: Record<string, Tono[]> = {
  pip: [[880, 0, 0.08, 0.22]],
  go: [[1760, 0, 0.3, 0.15]],
  go_doble: [[1760, 0, 0.16, 0.15], [1760, 0.28, 0.16, 0.15]],
  cadencia: [[587, 0, 0.18, 0.22], [392, 0.19, 0.18, 0.22]],
  confirmacion: [[523, 0, 0.06, 0.2]],
}

/** Cuánto plan se ancla al reloj de audio por adelantado. */
const HORIZONTE_S = 2

let ctx: AudioContext | null = null
let bucle: ReturnType<typeof setInterval> | null = null
/** Hasta qué segundo del plan hay sonidos ya anclados. */
let anclado = -Infinity
/** Lo anclado y aún sin sonar, por si un salto lo deja mentiroso. */
let pendientes: { t: number; nodos: AudioScheduledSourceNode[] }[] = []

/**
 * Un seno con envolvente: 8 ms de ataque y 12 de caída. Sin ellos, un
 * oscilador arrancado en seco hace clic en vez de pip.
 */
function tono(cuando: number, [hz, desde, dur, pico]: Tono): OscillatorNode {
  const a = ctx as AudioContext
  const osc = a.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = hz
  const gan = a.createGain()
  const inicio = cuando + desde
  gan.gain.setValueAtTime(0, inicio)
  gan.gain.linearRampToValueAtTime(pico, inicio + 0.008)
  gan.gain.setValueAtTime(pico, Math.max(inicio + 0.008, inicio + dur - 0.012))
  gan.gain.linearRampToValueAtTime(0, inicio + dur)
  osc.connect(gan)
  gan.connect(a.destination)
  osc.start(inicio)
  osc.stop(inicio + dur + 0.05)
  return osc
}

/**
 * Con el sonido apagado en los ajustes no se sintetiza nada, pero todo lo
 * demás sigue igual: la cuenta atrás cuenta, el latido late y el planificador
 * planifica. Apagar el altavoz no es apagar el cronómetro, y ponerlo aquí
 * —en el único sitio que crea osciladores— evita tener que acordarse en cada
 * sitio que pide un pitido.
 */
let silenciado = false

/** Todos los tonos de un cue, anclados a un instante del reloj de audio. */
function sonar(tipo: string, cuando: number, clave?: string): AudioScheduledSourceNode[] {
  if (silenciado) return []

  /*
   * La voz va por el mismo reloj que los tonos, no por un `<audio>` con un
   * temporizador: así la frase cae en el instante exacto que dice la agenda,
   * con la misma precisión que los pips, y se calla con ellos al pausar.
   */
  if (tipo === 'voz') {
    const clip = clave ? vozCargada?.clips[clave] : null
    if (!clip || !ctx) return []
    const fuente = ctx.createBufferSource()
    fuente.buffer = clip
    const gan = ctx.createGain()
    gan.gain.value = 0.9
    fuente.connect(gan)
    gan.connect(ctx.destination)
    fuente.start(cuando)
    return [fuente]
  }

  return (TONOS[tipo] ?? []).map((receta) => tono(cuando, receta))
}

function apagar(nodos: AudioScheduledSourceNode[]) {
  // Parar un oscilador ya parado lanza: aquí el silencio no puede fallar.
  nodos.forEach((n) => { try { n.stop() } catch { /* ya calló */ } })
}

export function useSonido() {
  /**
   * Crea o despierta el contexto. Tiene que llamarse desde un gesto del
   * usuario —tocar la esfera, iniciar—, que sin gesto el navegador deja el
   * audio en `suspended` y no suena nada.
   */
  function desbloquear() {
    if (typeof AudioContext === 'undefined') return
    if (!ctx) {
      ctx = new AudioContext()
      // iOS: sin declarar la sesión como reproducción, el interruptor
      // físico de silencio calla Web Audio sin dejar rastro de por qué.
      try {
        (navigator as unknown as { audioSession: { type: string } }).audioSession.type = 'playback'
      } catch { /* solo existe en Safari */ }
    }
    // `!== 'running'` y no `=== 'suspended'`: iOS deja el contexto en
    // `interrupted` —estado que no está en el tipo— tras una llamada o un
    // bloqueo de pantalla, y comparando contra `suspended` no se reanudaba
    // nunca más. Silencio para el resto de la extracción, sin pista de por qué.
    if ((ctx.state as string) !== 'running') void ctx.resume()
  }

  /**
   * Un sonido suelto, ahora mismo: la confirmación de «dejó de gotear».
   * Sin apuntarlo en pendientes a propósito: suele venir pegado a un
   * `detener()` y no queremos que la limpieza lo calle antes de sonar.
   */
  function pitido(tipo: string) {
    if (!ctx) return
    sonar(tipo, ctx.currentTime)
  }

  /**
   * Tres pips y un GO, y el GO avisa: es la cuenta atrás de arrancar y de
   * reanudar, que va anclada al gesto y no al plan. Devuelve cómo
   * cancelarla — tocar la esfera a mitad de cuenta se arrepiente gratis.
   */
  function cuentaAtras(avisos: { alTic: (n: number) => void; alGo: () => void }) {
    desbloquear()
    const base = ctx ? ctx.currentTime + 0.05 : 0
    const nodos: AudioScheduledSourceNode[] = []
    const timeouts: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < 3; i += 1) {
      if (ctx) nodos.push(...sonar('pip', base + i))
      timeouts.push(setTimeout(() => avisos.alTic(3 - i), i * 1000))
    }
    if (ctx) nodos.push(...sonar('go', base + 3))
    timeouts.push(setTimeout(avisos.alGo, 3000))
    return () => {
      timeouts.forEach(clearTimeout)
      apagar(nodos)
    }
  }

  /** Tira lo anclado que aún no sonó: tras un salto, ya no es verdad. */
  function invalidar() {
    pendientes.forEach((p) => apagar(p.nodos))
    pendientes = []
    anclado = -Infinity
  }

  /** Silencio y bucle fuera: pausa, fin del goteo o restablecer. */
  function detener() {
    if (bucle) {
      clearInterval(bucle)
      bucle = null
    }
    invalidar()
  }

  /**
   * Arma el bucle sobre una agenda. `ahora` da el segundo del plan y
   * `activo` si el reloj sigue andando: si deja de andar por alguien que
   * este bucle no conoce —«Restablecer» desde otra pantalla—, se apaga solo.
   */
  function programar(plan: { cues: Cue[]; ahora: () => number; activo: () => boolean }) {
    detener()
    const tic = () => {
      if (!plan.activo()) {
        detener()
        return
      }
      if (!ctx) return
      const t = plan.ahora()
      // Solo lo estrictamente futuro: el cue del segundo 0 lo cubre la
      // cuenta atrás, y tras un salto adelante lo saltado no se recupera.
      const desde = Math.max(anclado, t)
      const hasta = t + HORIZONTE_S
      for (const cue of plan.cues) {
        if (cue.t <= desde || cue.t > hasta) continue
        pendientes.push({
          t: cue.t,
          nodos: sonar(cue.tipo, ctx.currentTime + (cue.t - t), cue.clave),
        })
      }
      anclado = hasta
      pendientes = pendientes.filter((p) => p.t > t - 1)
    }
    tic()
    bucle = setInterval(tic, 250)
  }

  /** Lo dicen los ajustes; el reloj lo repite cada vez que cambian. */
  function silenciar(callado: boolean) {
    silenciado = callado
  }

  /**
   * Baja y decodifica los clips del idioma que toque, una sola vez.
   *
   * Devuelve el manifiesto de duraciones, que es lo que el núcleo necesita
   * para colocar cada frase: sin él la agenda sale sin voz y todo lo demás
   * funciona igual, así que un fallo de red aquí no deja el cronómetro mudo
   * — solo sin hablar.
   */
  async function cargarVoz(idioma: string): Promise<Record<string, number> | null> {
    if (typeof window === 'undefined') return null
    if (vozCargada?.idioma === idioma) return manifiesto
    if (cargando) { await cargando; return vozCargada?.idioma === idioma ? manifiesto : null }

    cargando = (async () => {
      desbloquear()
      if (!ctx) return
      const base = `/audio/${idioma}`
      const duraciones = await $fetch<Record<string, number>>(`${base}/duraciones.json`)
      const clips: Record<string, AudioBuffer> = {}
      await Promise.all(Object.keys(duraciones).map(async (clave) => {
        const datos = await $fetch<Blob>(`${base}/${clave}.m4a`, { responseType: 'blob' })
        clips[clave] = await ctx!.decodeAudioData(await datos.arrayBuffer())
      }))
      manifiesto = duraciones
      vozCargada = { idioma, clips }
    })()

    try {
      await cargando
    } catch {
      // Sin clips el cronómetro pita igual: la voz es una capa, no un requisito.
      manifiesto = null
    } finally {
      cargando = null
    }
    return manifiesto
  }

  return {
    desbloquear, pitido, cuentaAtras, programar, detener, invalidar, silenciar,
    cargarVoz,
  }
}
