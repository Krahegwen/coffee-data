<script setup lang="ts">
import { cuesDe } from '@coffee/nucleo/crono'
import { finDeLosVertidos } from '@coffee/nucleo/recetas'
import { relojDe } from '@coffee/nucleo/validacion'

/**
 * El reloj. La otra mitad de `/crono`, ahora con URL propia: se puede volver
 * aquí desde preparar, y el botón de atrás del navegador hace lo que parece.
 *
 * Todo el estado vive en `useCrono()`, fuera del componente: salir a mirar una
 * ficha con el reloj andando y volver no cuesta la extracción. `inicioMs`
 * guarda el origen en la escala de `performance.now()`, que no se reinicia
 * entre navegaciones, así que el tiempo sigue corriendo aunque la pantalla no
 * esté.
 */
// El catálogo de etiquetas y las rutas, los dos conscientes del idioma:
// desde el inglés, un `/crono` pelado llevaría al castellano.
const { t } = useI18n()
const { etiquetaPaso } = useTextos()
const localePath = useLocalePath()

useHead({ title: () => t('reloj.titulo') })

const router = useRouter()
const { estado, soltarReloj } = useCrono()

const {
  cafeId, recetaId, dosis, agua, pasos, corriendo, transcurrido,
  finGoteo, inicioMs, goteoIba,
} = toRefs(estado.value)

const { pitido, cuentaAtras, programar, detener, silenciar } = useSonido()
const { ajustes, cargar: cargarAjustes } = usePreferencias()
void cargarAjustes()

// El interruptor del pie llega hasta el sintetizador. Como efecto y no una
// vez: los ajustes se leen del cajón después de pintar, y cambiarlos en otra
// pestaña tiene que callar ésta sin recargar.
watchEffect(() => silenciar(!ajustes.value.sonido))

/**
 * La cuenta atrás de arrancar o reanudar: 3-2-1 en pantalla mientras suenan
 * los pips, y el reloj no se mueve hasta el GO. Es del componente y no del
 * estado compartido: salir del reloj a mitad de cuenta la cancela, que
 * todavía no había empezado nada.
 */
const preroll = ref<number | null>(null)
let cancelarPreroll: (() => void) | null = null

/*
 * Sin pasos escalados no hay guion que enseñar, así que esto no es una
 * pantalla a la que se pueda entrar directo: pasa al recargar aquí con F5,
 * que el estado vive en memoria. Se vuelve a preparar, que es donde se
 * eligen.
 */
if (!pasos.value.length) await router.replace(localePath('/crono'))

let animacion = 0
let despierta: WakeLockSentinel | null = null

/**
 * Cuando acaba el último vertido: desde ahí se cuenta el goteo.
 *
 * La regla es del núcleo y no de aquí: el servidor la usa para comprobar que
 * el goteo y el tiempo total de una fila cuadran, y si el reloj midiera desde
 * otro sitio se avisaría de sus propias mediciones.
 */
const finVertidos = computed(() => finDeLosVertidos(pasos.value))

/** La agenda sonora del guion, del núcleo: qué suena en qué segundo. */
const cues = computed(() => cuesDe(pasos.value))

/** Los pasos con hora, los únicos que el reloj puede situar. */
const conTiempo = computed(() => pasos.value.filter((p) => p.t_inicio_s !== null))

const ultimoPaso = computed(() => conTiempo.value[conTiempo.value.length - 1] ?? null)

/**
 * El plan acaba en retirar: trae escrita la hora de bajarse del dripper, y
 * pasada esa hora el círculo cuenta en negativo lo que el goteo se alarga
 * sobre lo previsto. Si no acaba en retirar, se cuenta el goteo en vivo.
 */
const acabaEnRetirar = computed(() => ultimoPaso.value?.accion === 'retirar')

/**
 * El número quieto antes de arrancar: lo primero que el reloj va a contar.
 *
 * Casi siempre es lo que dura el primer paso, pero una receta puede empezar
 * en un segundo que no sea el cero —la validación solo pide tiempos
 * crecientes—, y entonces lo primero que se cuenta es la espera hasta ese
 * paso. Enseñar la duración del paso ahí daba un salto al arrancar.
 */
const primerTramo = computed(() => {
  const [a, b] = conTiempo.value
  if (!a) return null
  const t0 = Number(a.t_inicio_s)
  if (t0 > 0) return t0
  return b ? Number(b.t_inicio_s) - t0 : null
})

const indiceActual = computed(() => {
  let i = -1
  pasos.value.forEach((p, n) => {
    if (p.t_inicio_s !== null && transcurrido.value >= p.t_inicio_s) i = n
  })
  return i
})

const actual = computed(() => pasos.value[indiceActual.value] ?? null)
const siguiente = computed(() => {
  for (let i = indiceActual.value + 1; i < pasos.value.length; i += 1) {
    if (pasos.value[i]!.t_inicio_s !== null) return pasos.value[i]!
  }
  return null
})

const faltan = computed(() =>
  siguiente.value ? Math.max(0, siguiente.value.t_inicio_s! - transcurrido.value) : null,
)

/** Segundos de goteo, si ya se marcó el final. */
const drawdown = computed(() =>
  finGoteo.value !== null && finVertidos.value !== null
    ? Math.max(0, Math.round(finGoteo.value - finVertidos.value))
    : null,
)

/**
 * Segundos de goteo en vivo desde el fin de los vertidos: el mismo número
 * que se guardará como drawdown, viéndose crecer. Null mientras se vierte —
 * o si la receta cierra con el vertido, que entonces nadie apuntó cuándo se
 * dejó de verter y contar sería inventar; el servidor lo trata igual.
 */
const goteoVivo = computed(() =>
  finVertidos.value !== null && transcurrido.value >= finVertidos.value
    // Redondeado como `drawdown`, no truncado: si no, la mitad de las veces
    // el contador decía 41 en el instante de marcar y la tarjeta respondía
    // 42, que es el número que se guarda.
    ? Math.round(transcurrido.value - finVertidos.value)
    : null,
)

/** Arrancado y sin cerrar el goteo: o va el reloj, o está en pausa. */
const enMarcha = computed(
  () => finGoteo.value === null && (corriendo.value || transcurrido.value > 0),
)

const pausado = computed(() => enMarcha.value && !corriendo.value)

/** Dentro del último paso: ya no hay siguiente contra el que contar. */
const enElUltimo = computed(
  () => enMarcha.value && actual.value !== null && siguiente.value === null,
)

/** Contando el goteo en el círculo: último paso de un plan sin retirar. */
const enGoteoVivo = computed(
  () => enElUltimo.value && !acabaEnRetirar.value && goteoVivo.value !== null,
)

/**
 * El número grande. La cuenta atrás del paso va en segundos pelados y el
 * total debajo en m:ss: dos formatos para dos significados, imposible
 * confundir qué número miras. En el último tramo, lo que toque: negativo
 * pasada la hora de retirar, goteo en vivo si el plan no la trae.
 */
const numeroPaso = computed(() => {
  if (preroll.value !== null) return String(preroll.value)
  if (finGoteo.value !== null) return relojDe(finGoteo.value)
  if (!enMarcha.value) return primerTramo.value !== null ? String(primerTramo.value) : relojDe(0)
  if (siguiente.value !== null) return String(Math.max(0, Math.ceil(faltan.value ?? 0)))
  if (acabaEnRetirar.value) {
    const sobre = Math.floor(transcurrido.value - Number(ultimoPaso.value?.t_inicio_s ?? 0))
    return sobre <= 0 ? '0' : `−${sobre}`
  }
  if (goteoVivo.value !== null) return String(goteoVivo.value)
  return relojDe(transcurrido.value)
})

/**
 * El latido: los tres últimos segundos del paso, a la vez que los pips. Es
 * el canal visual del aviso — el que queda cuando el sonido va apagado o el
 * interruptor del iPhone decide por ti.
 */
const late = computed(() =>
  ajustes.value.latido
  && (preroll.value !== null
    || (corriendo.value && siguiente.value !== null && (faltan.value ?? Infinity) <= 3)),
)

const etiquetaEsfera = computed(() => {
  if (preroll.value !== null) return t('comun.cancelar')
  if (!enMarcha.value) return t('reloj.iniciar_esfera')
  return corriendo.value ? t('reloj.pausar') : t('reloj.reanudar_esfera')
})

// El anillo: la bola da una vuelta entera por paso.
const RADIO = 45
const VUELTA = 2 * Math.PI * RADIO

/**
 * Lo recorrido del paso actual, de 0 a 1. En el último no hay siguiente hora
 * contra la que medir, así que se da por cerrado: el plan ya no manda nada y
 * lo que queda es esperar al goteo.
 */
const progresoPaso = computed(() => {
  if (!actual.value || siguiente.value === null) return 1
  const desde = actual.value.t_inicio_s ?? 0
  const hasta = siguiente.value.t_inicio_s!
  if (hasta <= desde) return 1
  return Math.min(1, Math.max(0, (transcurrido.value - desde) / (hasta - desde)))
})

/** Posición de la bola sobre el anillo, empezando arriba y hacia la derecha. */
const bola = computed(() => {
  const rad = (progresoPaso.value * 360 - 90) * (Math.PI / 180)
  return { x: 50 + RADIO * Math.cos(rad), y: 50 + RADIO * Math.sin(rad) }
})

/** Segundos desde el arranque, leídos del reloj del sistema. */
function ahora() {
  return inicioMs.value === null ? transcurrido.value : (performance.now() - inicioMs.value) / 1000
}

/**
 * Rearma lo que es del componente —el bucle de animación y el wake lock—
 * sobre el estado que ya hay. Es lo que se repite al volver a la pantalla
 * con el reloj andando: el tiempo nunca dejó de correr, solo la pintura.
 */
async function rearmar() {
  // Idempotente: llamado con el reloj ya andando —un salto de paso— no deja
  // un segundo bucle de animación vivo ni pide otro wake lock.
  if (animacion) { cancelAnimationFrame(animacion); animacion = 0 }
  const tic = () => {
    transcurrido.value = ahora()
    animacion = requestAnimationFrame(tic)
  }
  animacion = requestAnimationFrame(tic)

  // Que no se apague la pantalla con las manos ocupadas.
  if (!despierta) {
    try {
      despierta = await navigator.wakeLock?.request('screen')
    } catch { /* sin wake lock se sigue igual */ }
  }

  // La agenda al bucle de audio, re-anclada desde cero: así los saltos de
  // paso y el volver a la pantalla no dejan sonidos mentirosos pendientes.
  programar({ cues: cues.value, ahora, activo: () => corriendo.value })
}

/**
 * Pone el reloj a andar desde el segundo que se le diga.
 *
 * El origen se recalcula en vez de guardarse una vez: así reanudar es lo
 * mismo que arrancar, solo que desde otro punto, y el tiempo en pausa no
 * cuenta. Se mide contra el reloj del sistema y no sumando ticks —sumar
 * acumula deriva y aquí 45 segundos tienen que ser 45—; con
 * requestAnimationFrame la bola va fluida en vez de a diez saltos por segundo.
 */
async function arrancarDesde(desde: number) {
  inicioMs.value = performance.now() - desde * 1000
  transcurrido.value = desde
  corriendo.value = true
  await rearmar()
}

/** Deja la cuenta atrás a medias como si no hubiera pasado nada. */
function cancelarCuentaAtras() {
  cancelarPreroll?.()
  cancelarPreroll = null
  preroll.value = null
}

/**
 * Tres pips, GO, y el reloj echa a andar desde donde se le diga. El cue del
 * segundo 0 del plan no suena aparte: el GO de esta cuenta es ese arranque,
 * y el bucle solo ancla lo estrictamente futuro.
 */
function conCuentaAtras(desde: number) {
  cancelarCuentaAtras()
  // Sin ella, el reloj arranca en el acto: quien la apaga es porque prefiere
  // el control de siempre, no porque quiera esperar tres segundos en silencio.
  if (!ajustes.value.cuenta_atras) {
    void arrancarDesde(desde)
    return
  }
  cancelarPreroll = cuentaAtras({
    alTic: (n) => { preroll.value = n },
    alGo: () => {
      cancelarPreroll = null
      preroll.value = null
      void arrancarDesde(desde)
    },
  })
}

function iniciar() {
  finGoteo.value = null
  conCuentaAtras(0)
}

/** Pausa de verdad: lo que dure no cuenta para la extracción. */
function pausar() {
  transcurrido.value = ahora()
  parar()
}

/**
 * El círculo, que es el único mando que se acierta sin mirar: arranca si
 * está parado del todo, y a partir de ahí pausa y reanuda.
 */
function tocarEsfera() {
  if (finGoteo.value !== null) return
  // A mitad de cuenta atrás, tocar es arrepentirse: aún no ha empezado nada.
  if (preroll.value !== null) {
    cancelarCuentaAtras()
    return
  }
  if (!enMarcha.value) iniciar()
  else if (corriendo.value) pausar()
  // Reanudar también avisa: se pausó por falta de manos, y volver en frío
  // es peor que volver con tres pips de margen.
  else conCuentaAtras(transcurrido.value)
}

/** Mueve el reloj a un segundo dado sin cambiar si va o está en pausa. */
function moverA(segundo: number) {
  if (!corriendo.value) {
    transcurrido.value = segundo
    return
  }
  /*
   * El sonido de llegada lo toca el salto. El bucle solo ancla lo
   * estrictamente futuro —al arrancar y al reanudar ese hueco lo tapa el GO
   * de la cuenta atrás—, pero aquí no hay cuenta atrás, así que sin esto
   * saltar al último vertido aterrizaba en silencio: justo el aviso que
   * dice que ése es el último y hay que soltar el hervidor.
   */
  const llegada = cues.value.find((c) => c.t === segundo && c.tipo !== 'pip')
  if (llegada) pitido(llegada.tipo)
  void arrancarDesde(segundo)
}

function alSiguientePaso() {
  if (siguiente.value?.t_inicio_s != null) moverA(siguiente.value.t_inicio_s)
}

/**
 * Al arranque del paso; recién entrado —menos de 3 s—, al del anterior.
 * Como el doble toque de «pista anterior» de toda la vida: dos pulsaciones
 * seguidas encadenan pasos hacia atrás.
 */
function alInicioDePaso() {
  const desde = actual.value?.t_inicio_s ?? 0
  if (transcurrido.value - desde >= 3) {
    moverA(desde)
    return
  }
  let previo = 0
  for (const p of pasos.value) {
    if (p.t_inicio_s !== null && p.t_inicio_s < desde) previo = p.t_inicio_s
  }
  moverA(previo)
}

function marcarFinGoteo() {
  pitido('confirmacion')
  goteoIba.value = corriendo.value
  // Del reloj del sistema, no de la última pintada: con la pestaña de fondo
  // el navegador congela las animaciones y el valor se quedaría corto. En
  // pausa manda `transcurrido`, que es donde se dejó.
  if (corriendo.value) transcurrido.value = ahora()
  finGoteo.value = transcurrido.value
  parar()
}

/**
 * Deshace un «dejó de gotear» pulsado sin querer.
 *
 * Se retoma con el tiempo real, no donde se marcó: el café siguió goteando
 * mientras se caía en la cuenta del error, así que el reloj no se había
 * parado de verdad. Si estaba en pausa al marcarlo, se sigue donde estaba.
 */
function seguirGoteando() {
  finGoteo.value = null
  arrancarDesde(goteoIba.value ? ahora() : transcurrido.value)
}

/** Suelta el bucle y el wake lock sin tocar el estado: es lo del componente. */
function soltar() {
  if (animacion) { cancelAnimationFrame(animacion); animacion = 0 }
  despierta?.release?.()
  despierta = null
}

function parar() {
  soltar()
  corriendo.value = false
  // Sin esto, lo ya anclado al reloj de audio sonaría en plena pausa.
  detener()
}

const dialogo = ref<HTMLDialogElement | null>(null)

/**
 * Reiniciar tira la medición, y eso no se repite: el café ya está colado. Con
 * el reloj a cero no hay nada que perder y el botón es solo «atrás».
 */
function pedirReiniciar() {
  // Una cuenta atrás a medias no es una medición: se cancela y ya.
  cancelarCuentaAtras()
  if (enMarcha.value || finGoteo.value !== null) dialogo.value?.showModal()
  else void router.push(localePath('/crono'))
}

function reiniciar() {
  dialogo.value?.close()
  soltar()
  detener()
  soltarReloj()
  void router.push(localePath('/crono'))
}

/**
 * Al volver a la pantalla con el reloj andando, la pintura se reengancha al
 * tiempo que nunca dejó de correr. Al salir se suelta solo lo del DOM: el
 * estado se queda, que es la gracia.
 */
onMounted(() => {
  if (corriendo.value && inicioMs.value !== null) void rearmar()
})

/** Al alta, con lo que el cronómetro ya sabe. */
function registrar() {
  router.push({
    path: localePath('/nueva'),
    query: {
      cafe: cafeId.value,
      receta: recetaId.value,
      dosis: String(dosis.value),
      agua: String(agua.value),
      tiempo: relojDe(finGoteo.value ?? transcurrido.value),
      ...(drawdown.value !== null ? { drawdown: String(drawdown.value) } : {}),
    },
  })
}

onUnmounted(() => {
  // La cuenta atrás es del componente; los avisos del reloj andando, no:
  // esos siguen sonando aunque salgas a mirar una ficha, igual que el
  // tiempo sigue corriendo. Los para quien pare el reloj.
  cancelarCuentaAtras()
  soltar()
})
</script>

<template>
  <Migas :ruta="[{ texto: $t('preparar.titulo'), a: '/crono' }, { texto: $t('reloj.titulo') }]" />

  <section class="corriendo">
    <!-- El anillo es decorativo: lo que hay que saber está en los números.
         Toda la esfera es el mando: arranca, pausa y reanuda. Es lo más
         grande de la pantalla y se acierta sin mirar, que es de lo que se
         trata con el hervidor en la mano. -->
    <button
      type="button" class="esfera" :class="{ pausada: pausado && preroll === null }"
      :disabled="finGoteo !== null" :aria-label="etiquetaEsfera"
      @click="tocarEsfera"
    >
      <svg class="anillo" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="pista" cx="50" cy="50" :r="RADIO" />
        <circle
          class="avance" cx="50" cy="50" :r="RADIO"
          :stroke-dasharray="`${VUELTA * progresoPaso} ${VUELTA}`"
        />
        <circle class="bola" :cx="bola.x" :cy="bola.y" r="3.6" />
      </svg>

      <div class="dentro">
        <!-- La clave cambia con el número cuando late, y ese remonte es lo
             que rearranca la animación en cada segundo. -->
        <p :key="late ? numeroPaso : 'quieto'" class="crono" :class="{ late }">
          {{ numeroPaso }}
        </p>
        <template v-if="actual">
          <p class="accion">
            {{ enGoteoVivo ? $t('reloj.goteando') : etiquetaPaso(actual.accion, actual.estilo) }}
          </p>
          <!-- El espacio va explícito: Vue se come el salto de línea entre
               etiquetas y quedaba «60 g(+60)». -->
          <i18n-t v-if="actual.accion === 'verter'" keypath="reloj.hasta" tag="p" class="objetivo" scope="global">
            <template #agua>
              <strong>{{ $t('reloj.hasta_agua', { n: actual.acumulado_g }) }}</strong>&#32;<span
                class="delta"
              >(+{{ actual.agua_g }})</span>
            </template>
          </i18n-t>
        </template>
        <p v-else class="accion">{{ $t('reloj.preparados') }}</p>
      </div>
    </button>

    <!-- Fuera del anillo: los textos largos no caben dentro sin estrujarlo. -->
    <p v-if="actual && !actual.lectura_fiable" class="ojo">{{ $t('reloj.bascula_no') }}</p>
    <p v-if="actual" class="notas" :class="{ vacia: !actual.notas }">{{ actual.notas }}</p>

    <!-- Qué viene, sin el cuánto falta: el cuánto ya lo lleva el círculo,
         que cuenta el paso hacia atrás. -->
    <p v-if="siguiente && corriendo" class="faltan">
      {{ $t('reloj.siguiente', {
        que: etiquetaPaso(siguiente.accion, siguiente.estilo)
          + (siguiente.accion === 'verter'
            ? $t('reloj.siguiente_hasta', { n: siguiente.acumulado_g }) : ''),
      }) }}
    </p>

    <!-- En el último tramo la línea queda libre y la ocupa la medida: el
         goteo en vivo es el número del que saldrá la sugerencia de molienda. -->
    <p v-else-if="corriendo && acabaEnRetirar && goteoVivo !== null" class="faltan">
      {{ $t('reloj.goteo_vivo', { n: goteoVivo }) }}
    </p>

    <!-- En pausa de verdad, no a mitad de cuenta atrás: ahí el círculo ya
         está contando y ofrecer «toca para seguir» diría lo contrario. -->
    <p v-else-if="pausado && preroll === null" class="faltan">{{ $t('reloj.en_pausa') }}</p>

    <!-- Que se sepa que el círculo también arranca: es un gesto que nadie
         descubre solo. -->
    <p v-else-if="!enMarcha && finGoteo === null && preroll === null" class="faltan">
      {{ $t('reloj.toca_para_empezar') }}
    </p>

    <!-- El total, siempre a la vista y en su formato: m:ss es el tiempo de
         la taza, los segundos pelados de arriba son el paso. -->
    <p v-if="enMarcha || preroll !== null" class="total">{{ relojDe(transcurrido) }}</p>

    <button
      v-if="!enMarcha && finGoteo === null && preroll === null"
      @click="iniciar"
    >{{ $t('reloj.iniciar') }}</button>

    <template v-else-if="finGoteo === null && preroll === null">
      <!-- Los saltos a los lados del mando grande: te fuiste del guion —un
           vertido que se alargó, un paso que sobraba— y el reloj se realinea
           sin tocar el café. Atrás repite el gesto de «pista anterior»: al
           inicio del paso, y recién entrado, al de antes. -->
      <div class="mando-pasos">
        <button
          type="button" class="salto" :aria-label="$t('reloj.inicio_del_paso')"
          @click="alInicioDePaso"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M6 5h2v14H6z" />
            <path d="M19 5v14l-9.5-7z" />
          </svg>
        </button>
        <button class="pausa" @click="tocarEsfera">
          {{ corriendo ? $t('reloj.pausa') : $t('reloj.reanudar') }}
        </button>
        <button
          type="button" class="salto" :aria-label="$t('reloj.siguiente_paso')"
          :disabled="!siguiente" @click="alSiguientePaso"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
            <path d="M5 5v14l9.5-7z" />
            <path d="M16 5h2v14h-2z" />
          </svg>
        </button>
      </div>
      <button class="goteo" @click="marcarFinGoteo">{{ $t('reloj.dejo_de_gotear') }}</button>
    </template>

    <div v-if="finGoteo !== null" class="tarjeta">
      <i18n-t keypath="reloj.en_total" tag="p" scope="global">
        <template #tiempo><strong>{{ relojDe(finGoteo) }}</strong></template>
      </i18n-t>
      <p v-if="drawdown !== null" class="meta">{{ $t('reloj.goteo_medido', { n: drawdown }) }}</p>
      <button @click="registrar">{{ $t('reloj.registrar') }}</button>
      <!-- Marcar el goteo cerraba la extracción sin vuelta atrás, y se pulsa
           sin querer con el hervidor en la mano. -->
      <button class="secundario" @click="seguirGoteando">
        {{ $t('reloj.sin_querer') }}
      </button>
    </div>

    <button class="secundario" @click="pedirReiniciar">
      {{ enMarcha || finGoteo !== null ? $t('reloj.reiniciar') : $t('reloj.atras') }}
    </button>
  </section>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>{{ $t('reloj.reiniciar_titulo') }}</h3>
    <p class="ojo">{{ $t('reloj.reiniciar_ojo') }}</p>
    <p>{{ $t('reloj.reiniciar_alternativa') }}</p>
    <div class="botones">
      <button type="button" class="secundario" @click="dialogo?.close()">{{ $t('comun.cancelar') }}</button>
      <button type="button" class="peligro" @click="reiniciar">{{ $t('reloj.reiniciar') }}</button>
    </div>
  </dialog>
</template>

<style scoped>
button:disabled { opacity: 0.5; cursor: default; }

button {
  font: inherit;
  font-weight: 600;
  font-size: 1rem;
  color: var(--sobre-acento);
  background: var(--acento);
  border: 0;
  border-radius: 0.6rem;
  padding: 1rem;
  width: 100%;
  min-height: 3.25rem;
  cursor: pointer;
  margin-top: 0.5rem;
}

.secundario { background: transparent; color: var(--suave); font-weight: 400; }
.goteo { background: var(--tostado); }

/* Ni acento ni apagado: es el que más se pulsa después del de gotear, pero no
   es el que cierra la extracción. */
.pausa { background: transparent; color: var(--acento); border: 1px solid var(--linea); }

/* Pausa en medio y los saltos a los lados, cuadrados y discretos: mandan
   sobre el reloj, no sobre el café. */
.mando-pasos {
  display: grid;
  grid-template-columns: 3.25rem 1fr 3.25rem;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.mando-pasos button { margin-top: 0; }

.salto {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--suave);
  border: 1px solid var(--linea);
  padding: 0;
}

.salto:disabled { opacity: 0.35; cursor: default; }

.corriendo { text-align: center; }

/*
 * Cuadrada a la fuerza: el anillo se deforma si el alto no sigue al ancho.
 *
 * Es un <button>, así que hay que deshacerle el estilo de los botones de esta
 * pantalla, que son barras de color de lado a lado.
 */
.esfera {
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 50%;
  padding: 0;
  color: inherit;
  font: inherit;
  min-height: 0;
  position: relative;
  width: min(78vw, 20rem);
  aspect-ratio: 1;
  margin: 1rem auto 0.5rem;
  display: grid;
  place-items: center;
  cursor: pointer;
}

/* Antes de arrancar no hay nada que pausar, y no debe parecer pulsable. */
.esfera:disabled { cursor: default; }

/* En pausa el anillo se apaga: el número se queda quieto y sin esto no se
   distingue de un cronómetro que sigue entre dos pasos. */
.esfera.pausada .avance, .esfera.pausada .bola { opacity: 0.3; }
.esfera.pausada .crono { opacity: 0.6; }

.anillo { position: absolute; inset: 0; width: 100%; height: 100%; }

.pista { fill: none; stroke: var(--linea); stroke-width: 2; }

.avance {
  fill: none;
  stroke: var(--acento);
  stroke-width: 2;
  stroke-linecap: round;
  /* El trazo nace a las tres en punto; girándolo empieza arriba, como la
     bola, que se posiciona con la misma referencia. */
  transform: rotate(-90deg);
  transform-origin: 50% 50%;
}

.bola { fill: var(--acento); }

/* Con el margen suficiente para que el texto no toque el anillo. */
.dentro { position: relative; padding: 0 14%; }

.crono {
  /* Se encoge con la pantalla: dentro del círculo no hay sitio de sobra. */
  font-size: clamp(2.4rem, 15vw, 3.6rem);
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  margin: 0 0 0.25rem;
  letter-spacing: -0.03em;
  line-height: 1;
}

.accion {
  font-size: clamp(1.1rem, 5.5vw, 1.5rem);
  font-weight: 600;
  margin: 0;
}

.objetivo { font-size: clamp(0.95rem, 4.5vw, 1.25rem); margin: 0.3rem 0 0; }
.objetivo strong { color: var(--acento); }
.delta { color: var(--suave); font-size: 0.85em; }

.ojo {
  color: var(--peligro);
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.notas, .meta { color: var(--suave); font-size: 0.85rem; margin: 0.3rem 0; }
/* Reservado aunque el paso no traiga nota: si el párrafo entra y sale del
   árbol, todo lo de debajo salta al cambiar de paso. */
.notas { min-height: 1.2em; }
.notas.vacia { visibility: hidden; }

.faltan {
  color: var(--suave);
  font-size: 0.95rem;
  margin: 0.75rem 0;
}

/* El tiempo de la taza, discreto y en su formato: m:ss. */
.total {
  color: var(--suave);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  margin: 0.25rem 0 0.5rem;
}

/* El latido: transform puro —nada de reflow— y quieto si el sistema pide
   menos movimiento. Lo rearranca cada segundo el cambio de clave del nodo. */
.crono.late { animation: latido 0.45s ease-out; }

@keyframes latido {
  0% { transform: scale(1); }
  30% { transform: scale(1.16); }
  100% { transform: scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .crono.late { animation: none; }
}

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--acento);
  border-radius: 0.7rem;
  padding: 1rem;
  margin-top: 1.25rem;
}

dialog {
  border: 1px solid var(--linea);
  border-radius: 0.8rem;
  background: var(--tarjeta);
  color: var(--tinta);
  padding: 1.25rem;
  max-width: min(28rem, calc(100% - 2rem));
  margin: auto;
  text-align: left;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }
dialog .ojo { color: var(--peligro); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.peligro { background: var(--peligro); color: var(--sobre-peligro); }

a { color: var(--acento); }
</style>
