<script setup lang="ts">
import type { PasoGuion } from '~/composables/useApi'

useHead({ title: 'Cronómetro' })

const { cafes, recetas, guion } = useApi()
const router = useRouter()

const { data: bolsas } = await useAsyncData('cafes-crono', cafes)
const { data: catalogo } = await useAsyncData('recetas-crono', recetas)

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

const cafeId = ref('')
const recetaId = ref('kasuya-46-base')
const dosis = ref(20)
const agua = ref(300)

watchEffect(() => { if (!cafeId.value && abiertas.value.length) cafeId.value = abiertas.value[0]!.id })

const pasos = ref<PasoGuion[]>([])
/** En la pantalla del cronómetro; no implica que el reloj vaya. */
const enCrono = ref(false)
const corriendo = ref(false)
const transcurrido = ref(0)
const finGoteo = ref<number | null>(null)

let animacion = 0
let inicio = 0
let despierta: WakeLockSentinel | null = null
/**
 * Si el reloj iba al marcar el fin del goteo. Solo entonces tiene sentido
 * ponerse al día si se deshace: si estaba en pausa, la parada fue a propósito.
 */
let goteoEnMarcha = false

/** Cuando acaba el último vertido: desde ahí se cuenta el goteo. */
const finVertidos = computed(() => {
  const conAgua = pasos.value.filter((p) => p.accion === 'verter')
  const ultimo = conAgua[conAgua.length - 1]
  const siguiente = pasos.value.find(
    (p) => p.accion !== 'verter' && p.t_inicio_s !== null && p.t_inicio_s >= (ultimo?.t_inicio_s ?? 0),
  )
  return siguiente?.t_inicio_s ?? null
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

/** Arrancado y sin cerrar el goteo: o va el reloj, o está en pausa. */
const enMarcha = computed(
  () => finGoteo.value === null && (corriendo.value || transcurrido.value > 0),
)

const pausado = computed(() => enMarcha.value && !corriendo.value)

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

function reloj_mmss(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = Math.floor(segundos % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function cargar() {
  pasos.value = await guion(recetaId.value, agua.value)
}

watch([recetaId, agua], cargar, { immediate: true })

/**
 * Lleva al cronómetro, pero con el reloj parado: se arranca al verter, no al
 * llegar. Entre una cosa y otra hay que coger el hervidor.
 */
async function alCronometro() {
  if (!pasos.value.length) await cargar()
  transcurrido.value = 0
  finGoteo.value = null
  corriendo.value = false
  enCrono.value = true
}

/** Segundos desde el arranque, leídos del reloj del sistema. */
function ahora() {
  return (performance.now() - inicio) / 1000
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
  inicio = performance.now() - desde * 1000
  transcurrido.value = desde
  corriendo.value = true

  const tic = () => {
    transcurrido.value = ahora()
    animacion = requestAnimationFrame(tic)
  }
  animacion = requestAnimationFrame(tic)

  // Que no se apague la pantalla con las manos ocupadas.
  try {
    despierta = await navigator.wakeLock?.request('screen')
  } catch { /* sin wake lock se sigue igual */ }
}

async function iniciar() {
  finGoteo.value = null
  await arrancarDesde(0)
}

/** Pausa de verdad: lo que dure no cuenta para la extracción. */
function pausar() {
  transcurrido.value = ahora()
  parar()
}

/** Dentro del círculo y en el botón: pausa, y otra vez reanuda. */
function alternarPausa() {
  if (!enMarcha.value) return
  if (corriendo.value) pausar()
  else arrancarDesde(transcurrido.value)
}

function marcarFinGoteo() {
  goteoEnMarcha = corriendo.value
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
  arrancarDesde(goteoEnMarcha ? ahora() : transcurrido.value)
}

function parar() {
  if (animacion) { cancelAnimationFrame(animacion); animacion = 0 }
  corriendo.value = false
  despierta?.release?.()
  despierta = null
}

function reiniciar() {
  parar()
  enCrono.value = false
  transcurrido.value = 0
  finGoteo.value = null
}

/** Al alta, con lo que el cronómetro ya sabe. */
function registrar() {
  router.push({
    path: '/nueva',
    query: {
      cafe: cafeId.value,
      receta: recetaId.value,
      dosis: String(dosis.value),
      agua: String(agua.value),
      tiempo: reloj_mmss(finGoteo.value ?? transcurrido.value),
      ...(drawdown.value !== null ? { drawdown: String(drawdown.value) } : {}),
    },
  })
}

onUnmounted(parar)
</script>

<template>
  <p class="volver"><NuxtLink to="/">‹ Volver</NuxtLink></p>

  <section v-if="!enCrono">
    <h2>Preparar</h2>
    <label>
      Café
      <select v-model="cafeId">
        <option v-for="c in abiertas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>
    <label>
      Receta
      <select v-model="recetaId">
        <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </label>
    <div class="pareja">
      <label>Dosis (g)<input v-model.number="dosis" type="number" step="0.1" min="1"></label>
      <label>Agua (g)<input v-model.number="agua" type="number" step="1" min="1"></label>
    </div>

    <ol class="plan">
      <li v-for="p in pasos" :key="p.orden">
        <span class="t">{{ p.t_inicio_s === null ? '—' : reloj_mmss(p.t_inicio_s) }}</span>
        <span class="que">{{ etiquetaPaso(p.accion, p.estilo) }}</span>
        <span v-if="p.accion === 'verter'" class="ag">hasta {{ p.acumulado_g }} g</span>
      </li>
    </ol>

    <button @click="alCronometro">Al cronómetro</button>
  </section>

  <section v-else class="corriendo">
    <!-- El anillo es decorativo: lo que hay que saber está en los números.
         Toda la esfera es el botón de pausa: es lo más grande de la pantalla
         y se acierta sin mirar, que es de lo que se trata con el hervidor en
         la mano. -->
    <button
      type="button" class="esfera" :class="{ pausada: pausado }"
      :disabled="!enMarcha" :aria-label="corriendo ? 'Pausar' : 'Reanudar el cronómetro'"
      @click="alternarPausa"
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
        <p class="crono">{{ reloj_mmss(transcurrido) }}</p>
        <template v-if="actual">
          <p class="accion">{{ etiquetaPaso(actual.accion, actual.estilo) }}</p>
          <!-- El espacio va explícito: Vue se come el salto de línea entre
               etiquetas y quedaba «60 g(+60)». -->
          <p v-if="actual.accion === 'verter'" class="objetivo">
            hasta <strong>{{ actual.acumulado_g }} g</strong>&#32;<span
              class="delta"
            >(+{{ actual.agua_g }})</span>
          </p>
        </template>
        <p v-else class="accion">preparados…</p>
      </div>
    </button>

    <!-- Fuera del anillo: los textos largos no caben dentro sin estrujarlo. -->
    <p v-if="actual && !actual.lectura_fiable" class="ojo">
      No mires la báscula: la cuchara pesa mientras está dentro.
    </p>
    <p v-if="actual?.notas" class="notas">{{ actual.notas }}</p>

    <p v-if="siguiente && corriendo" class="faltan">
      {{ etiquetaPaso(siguiente.accion, siguiente.estilo) }}{{ siguiente.accion === 'verter' ? ` hasta ${siguiente.acumulado_g} g` : '' }}
      en <strong>{{ Math.ceil(faltan ?? 0) }} s</strong>
    </p>

    <p v-else-if="pausado" class="faltan">
      En pausa · toca el círculo para seguir
    </p>

    <button v-if="!enMarcha && finGoteo === null" @click="iniciar">Iniciar</button>

    <template v-else-if="finGoteo === null">
      <button class="pausa" @click="alternarPausa">
        {{ corriendo ? 'Pausa' : 'Reanudar' }}
      </button>
      <button class="goteo" @click="marcarFinGoteo">Dejó de gotear</button>
    </template>

    <div v-if="finGoteo !== null" class="tarjeta">
      <p><strong>{{ reloj_mmss(finGoteo) }}</strong> en total</p>
      <p v-if="drawdown !== null" class="meta">Goteo: {{ drawdown }} s, medido solo</p>
      <button @click="registrar">Registrar esta extracción</button>
      <!-- Marcar el goteo cerraba la extracción sin vuelta atrás, y se pulsa
           sin querer con el hervidor en la mano. -->
      <button class="secundario" @click="seguirGoteando">
        Fue sin querer: seguir contando
      </button>
    </div>

    <button class="secundario" @click="reiniciar">
      {{ corriendo || finGoteo !== null ? 'Reiniciar' : 'Atrás' }}
    </button>
  </section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--suave);
  margin-bottom: 0.75rem;
}

.pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

input, select {
  font: inherit;
  font-size: 16px;
  color: var(--tinta);
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  padding: 0.6rem 0.65rem;
}

button {
  font: inherit;
  font-weight: 600;
  font-size: 1rem;
  color: #fff;
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

.plan {
  margin: 1rem 0;
  padding: 0;
  list-style: none;
  font-size: 0.85rem;
}

.plan li {
  display: grid;
  grid-template-columns: 3.5rem 1fr auto;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--linea);
}

.plan .t { color: var(--suave); font-variant-numeric: tabular-nums; }
.plan .ag { color: var(--acento); }

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
  color: #c2410c;
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.notas, .meta { color: var(--suave); font-size: 0.85rem; margin: 0.3rem 0; }

.faltan {
  color: var(--suave);
  font-size: 0.95rem;
  margin: 0.75rem 0;
}

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--acento);
  border-radius: 0.7rem;
  padding: 1rem;
  margin-top: 1.25rem;
}

a { color: var(--acento); }
</style>
