<script setup lang="ts">
import type { PasoGuion } from '~/composables/useApi'

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
const arrancado = ref(false)
const transcurrido = ref(0)
const finGoteo = ref<number | null>(null)

let reloj: ReturnType<typeof setInterval> | null = null
let inicio = 0
let despierta: WakeLockSentinel | null = null

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

function reloj_mmss(segundos: number) {
  const m = Math.floor(segundos / 60)
  const s = Math.floor(segundos % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

async function cargar() {
  pasos.value = await guion(recetaId.value, agua.value)
}

watch([recetaId, agua], cargar, { immediate: true })

async function arrancar() {
  if (!pasos.value.length) await cargar()
  // Contra el reloj del sistema y no sumando ticks: un setInterval acumula
  // deriva, y aquí 45 segundos tienen que ser 45.
  inicio = performance.now()
  transcurrido.value = 0
  finGoteo.value = null
  arrancado.value = true
  reloj = setInterval(() => { transcurrido.value = (performance.now() - inicio) / 1000 }, 100)

  // Que no se apague la pantalla con las manos ocupadas.
  try {
    despierta = await navigator.wakeLock?.request('screen')
  } catch { /* sin wake lock se sigue igual */ }
}

function marcarFinGoteo() {
  finGoteo.value = transcurrido.value
  parar()
}

function parar() {
  if (reloj) { clearInterval(reloj); reloj = null }
  despierta?.release?.()
  despierta = null
}

function reiniciar() {
  parar()
  arrancado.value = false
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
  <p><NuxtLink to="/">‹ Volver</NuxtLink></p>

  <section v-if="!arrancado">
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
        <span class="que">{{ p.accion }}</span>
        <span v-if="p.accion === 'verter'" class="ag">hasta {{ p.acumulado_g }} g</span>
      </li>
    </ol>

    <button @click="arrancar">Empezar</button>
  </section>

  <section v-else class="corriendo">
    <p class="crono">{{ reloj_mmss(transcurrido) }}</p>

    <div v-if="actual" class="paso">
      <p class="accion">{{ actual.accion }}</p>
      <p v-if="actual.accion === 'verter'" class="objetivo">
        hasta <strong>{{ actual.acumulado_g }} g</strong>
        <span class="delta">(+{{ actual.agua_g }})</span>
      </p>
      <p v-if="!actual.lectura_fiable" class="ojo">
        No mires la báscula: la cuchara pesa mientras está dentro.
      </p>
      <p v-if="actual.notas" class="notas">{{ actual.notas }}</p>
    </div>
    <p v-else class="accion">preparados…</p>

    <p v-if="siguiente" class="faltan">
      {{ siguiente.accion }}{{ siguiente.accion === 'verter' ? ` hasta ${siguiente.acumulado_g} g` : '' }}
      en <strong>{{ Math.ceil(faltan ?? 0) }} s</strong>
    </p>

    <button v-if="finGoteo === null" class="goteo" @click="marcarFinGoteo">
      Dejó de gotear
    </button>

    <div v-else class="tarjeta">
      <p><strong>{{ reloj_mmss(finGoteo) }}</strong> en total</p>
      <p v-if="drawdown !== null" class="meta">Goteo: {{ drawdown }} s, medido solo</p>
      <button @click="registrar">Registrar esta extracción</button>
    </div>

    <button class="secundario" @click="reiniciar">Reiniciar</button>
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

.crono {
  font-size: 4rem;
  font-weight: 200;
  font-variant-numeric: tabular-nums;
  margin: 1.5rem 0 0.5rem;
  letter-spacing: -0.03em;
}

.accion {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
  text-transform: capitalize;
}

.objetivo { font-size: 1.5rem; margin: 0.35rem 0; }
.objetivo strong { color: var(--acento); }
.delta { color: var(--suave); font-size: 1rem; }

.ojo {
  color: #c2410c;
  font-size: 0.9rem;
  margin: 0.5rem 0;
}

.notas, .meta { color: var(--suave); font-size: 0.85rem; margin: 0.3rem 0; }

.faltan {
  color: var(--suave);
  font-size: 0.95rem;
  margin: 1.25rem 0;
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
