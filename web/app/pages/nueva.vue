<script setup lang="ts">
import type { Creada, NuevaExtraccion } from '~/composables/useApi'

const { cafes, recetas, crear } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
const route = useRoute()

const { data: bolsas } = await useAsyncData('cafes-form', cafes)
const { data: catalogo } = await useAsyncData('recetas-form', recetas)

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

const DEFECTOS = ['equilibrado', 'amargor', 'astringente', 'plano', 'agrio', 'salado', 'carton']
const DRIPPERS = ['v60-02-plastico', 'v60-02-ceramica']

const q = route.query
const numero = (v: unknown, porDefecto: number) => (v === undefined ? porDefecto : Number(v))

// La receta base del README, salvo lo que traiga el cronómetro en la URL.
const form = reactive({
  cafe_id: String(q.cafe ?? ''),
  dosis_g: numero(q.dosis, 20),
  agua_g: numero(q.agua, 300),
  temp_c: 92,
  clics: 28,
  receta_id: String(q.receta ?? 'kasuya-46-base'),
  dripper: 'v60-02-plastico',
  tiempo_total: String(q.tiempo ?? ''),
  drawdown_s: (q.drawdown === undefined ? '' : Number(q.drawdown)) as number | '',
  variable_cambiada: '',
  defecto: 'equilibrado',
  notas_cata: '',
  nota: 7,
})

const desdeCrono = computed(() => q.tiempo !== undefined)

const enviando = ref(false)
const errores = ref<string[]>([])
const resultado = ref<Creada | null>(null)
const tokenVisible = ref('')
const errorSesion = ref('')

onMounted(comprobar)

watchEffect(() => { if (!form.cafe_id && abiertas.value.length) form.cafe_id = abiertas.value[0]!.id })

async function iniciarSesion() {
  errorSesion.value = ''
  try {
    await abrir(tokenVisible.value)
    tokenVisible.value = ''
  } catch {
    errorSesion.value = 'Ese token no es'
  }
}

const ratio = computed(() =>
  form.dosis_g > 0 ? (form.agua_g / form.dosis_g).toFixed(1) : '—',
)

async function enviar() {
  errores.value = []
  resultado.value = null
  enviando.value = true
  try {
    const datos: NuevaExtraccion = {
      cafe_id: form.cafe_id,
      temp_c: form.temp_c,
      clics: form.clics,
      tiempo_total: form.tiempo_total,
      variable_cambiada: form.variable_cambiada,
      defecto: form.defecto,
      nota: form.nota,
      dosis_g: form.dosis_g,
      agua_g: form.agua_g,
      receta_id: form.receta_id,
      dripper: form.dripper,
    }
    if (form.drawdown_s !== '') datos.drawdown_s = Number(form.drawdown_s)
    if (form.notas_cata.trim()) datos.notas_cata = form.notas_cata.trim()

    resultado.value = await crear(datos)
    // Lo que no se repite entre extracciones se limpia; el resto se queda,
    // que lo normal es cambiar una cosa y volver a medir.
    form.tiempo_total = ''
    form.drawdown_s = ''
    form.variable_cambiada = ''
    form.notas_cata = ''
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <p class="volver"><NuxtLink to="/">‹ Volver</NuxtLink></p>

  <p v-if="!comprobada" class="meta">Comprobando sesión…</p>

  <section v-else-if="!activa" class="tarjeta">
    <h2>Abrir sesión</h2>
    <p class="meta">
      Una vez por dispositivo. El token no se guarda aquí: se cambia por una
      cookie que este código no puede leer.
    </p>
    <input v-model="tokenVisible" type="password" placeholder="token" autocomplete="off">
    <p v-if="errorSesion" class="fallo">{{ errorSesion }}</p>
    <button :disabled="!tokenVisible.trim()" @click="iniciarSesion">Entrar</button>
  </section>

  <form v-else @submit.prevent="enviar">
    <h2>Nueva extracción</h2>

    <p v-if="desdeCrono" class="delcrono">
      Tiempo y goteo vienen del cronómetro.
    </p>

    <label>
      Café
      <select v-model="form.cafe_id" required>
        <option v-for="c in abiertas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>

    <div class="pareja">
      <label>Dosis (g)<input v-model.number="form.dosis_g" type="number" step="0.1" min="1" required></label>
      <label>Agua (g)<input v-model.number="form.agua_g" type="number" step="1" min="1" required></label>
    </div>
    <p class="meta">Ratio 1:{{ ratio }}</p>

    <div class="pareja">
      <label>Temperatura (°C)<input v-model.number="form.temp_c" type="number" step="1" min="0" max="100" required></label>
      <label>Clics<input v-model.number="form.clics" type="number" step="1" min="0" required></label>
    </div>

    <label>
      Receta
      <select v-model="form.receta_id">
        <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </label>

    <label>
      Dripper
      <select v-model="form.dripper">
        <option v-for="d in DRIPPERS" :key="d" :value="d">{{ d }}</option>
      </select>
    </label>

    <div class="pareja">
      <label>Tiempo total<input v-model="form.tiempo_total" placeholder="3:30" required></label>
      <label>Goteo (s)<input v-model="form.drawdown_s" type="number" step="1" min="0" placeholder="45"></label>
    </div>

    <label>
      Variable cambiada
      <input v-model="form.variable_cambiada" placeholder="91 °C" required>
    </label>

    <label>
      Defecto
      <select v-model="form.defecto">
        <option v-for="d in DEFECTOS" :key="d" :value="d">{{ d }}</option>
      </select>
    </label>

    <label>
      Nota: <strong>{{ form.nota }}</strong>
      <input v-model.number="form.nota" type="range" min="1" max="10" step="1">
    </label>

    <label>
      Notas de cata
      <textarea v-model="form.notas_cata" rows="2" />
    </label>

    <button type="submit" :disabled="enviando">
      {{ enviando ? 'Guardando…' : 'Guardar extracción' }}
    </button>
  </form>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>No se ha guardado nada</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="resultado" class="tarjeta exito">
    <strong>Guardada la #{{ resultado.extraccion.id }} · {{ resultado.cafe }}</strong>
    <p class="meta">
      reparto {{ resultado.extraccion.reparto }} · 1:{{ resultado.extraccion.ratio }}
      <span v-if="resultado.extraccion.dias_tueste !== null">
        · {{ resultado.extraccion.dias_tueste }} días de tueste
      </span>
    </p>

    <p v-for="a in resultado.sugerencias.avisos" :key="a" class="aviso">⚠ {{ a }}</p>

    <template v-if="resultado.sugerencias.cambios.length">
      <p class="meta">Cambia <strong>una sola</strong> cosa:</p>
      <ol>
        <li v-for="c in resultado.sugerencias.cambios" :key="c.variable">
          <code>{{ c.variable }} {{ c.cambio }}</code> — {{ c.porque }}
        </li>
      </ol>
    </template>
    <p v-else-if="resultado.sugerencias.conforme">
      Equilibrado y con buena nota: no toques nada, repite para confirmar.
    </p>
  </section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }

form { display: flex; flex-direction: column; gap: 0.85rem; }

label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--suave);
}

.pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

input, select, textarea {
  font: inherit;
  color: var(--tinta);
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  padding: 0.6rem 0.65rem;
  /* 16px o iOS hace zoom al enfocar. */
  font-size: 16px;
}

input[type="range"] { padding: 0; accent-color: var(--acento); }

button {
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--acento);
  border: 0;
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
  margin-top: 0.4rem;
  cursor: pointer;
  /* Objetivo táctil cómodo con una mano. */
  min-height: 3rem;
}

button:disabled { opacity: 0.5; cursor: default; }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
}

.tarjeta input { width: 100%; margin: 0.5rem 0; }

.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.fallo { color: #c2410c; font-size: 0.85rem; margin: 0.35rem 0; }

.delcrono {
  background: var(--tarjeta);
  border: 1px solid var(--acento);
  border-radius: 0.5rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.85rem;
  color: var(--acento);
  margin: 0 0 0.25rem;
}
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; }
.exito { border-color: var(--acento); }
.aviso { font-size: 0.85rem; margin: 0.5rem 0; }
ol { margin: 0.35rem 0 0; padding-left: 1.2rem; font-size: 0.88rem; }
code { font-size: 0.85em; }
a { color: var(--acento); }
</style>
