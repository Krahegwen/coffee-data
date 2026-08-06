<script setup lang="ts">
import type { Creada, NuevaExtraccion } from '~/composables/useApi'

useHead({ title: 'Registrar extracción' })

import { DEFECTOS, DRIPPERS, textoDeCambios, VARIABLES } from '~/composables/textos'

const { cafes, recetas, extracciones, crear } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
const route = useRoute()

const { data: bolsas } = await useAsyncData('cafes-form', cafes)
const { data: catalogo } = await useAsyncData('recetas-form', recetas)
const { data: historial } = await useAsyncData('ext-form', () => extracciones())

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

const q = route.query
const numero = (v: unknown, porDefecto: number) => (v === undefined ? porDefecto : Number(v))

// La receta base del README, salvo lo que traiga el cronómetro en la URL.
const form = reactive<Record<string, unknown>>({
  cafe_id: String(q.cafe ?? ''),
  dosis_g: numero(q.dosis, 20),
  agua_g: numero(q.agua, 300),
  temp_c: 92,
  clics: 28,
  receta_id: String(q.receta ?? 'kasuya-46-base'),
  dripper: 'v60-02-plastico',
  tiempo_total: String(q.tiempo ?? ''),
  drawdown_s: (q.drawdown === undefined ? '' : Number(q.drawdown)) as number | '',
  extraido_g: '' as number | '',
  variable_cambiada: '',
  defecto: 'equilibrado',
  notas_cata: '',
  nota: 7,
})

/** La última de este café: de ahí salen los valores «de antes». */
const anterior = computed(
  () => (historial.value ?? []).find((e) => e.cafe_id === form.cafe_id) ?? null,
)

const cambiadas = ref<string[]>([])

/** Las variables que son de elegir, no de teclear. */
const opciones = computed(() => ({
  receta_id: (catalogo.value ?? []).map((r) => ({ valor: r.id, etiqueta: r.nombre })),
  dripper: Object.entries(DRIPPERS).map(([valor, etiqueta]) => ({ valor, etiqueta })),
}))

/*
 * Se arranca con la anterior puesta: el protocolo es repetir y mover una sola
 * cosa, así que lo que se teclea debería ser justo esa cosa. Lo que traiga el
 * cronómetro en la URL manda sobre esto.
 */
const DESDE_LA_URL: Record<string, string> = {
  dosis_g: 'dosis', agua_g: 'agua', receta_id: 'receta',
}

watch(anterior, (previa) => {
  if (!previa) return
  for (const clave of Object.keys(VARIABLES)) {
    const enUrl = DESDE_LA_URL[clave]
    if (enUrl && q[enUrl] !== undefined) continue
    const valor = (previa as Record<string, unknown>)[clave]
    if (valor !== null && valor !== undefined) form[clave] = valor
  }
}, { immediate: true })

/** «Temperatura 91 → 88». Sale de los valores, nunca al revés. */
const textoVariables = computed(() =>
  textoDeCambios(cambiadas.value, anterior.value, form, opciones.value),
)

/*
 * El texto no se escribe en el formulario mientras editas: se compone al
 * enviar. Reescribirlo en caliente hacía que la etiqueta cambiara sola cada
 * vez que se añadía o se quitaba una fila.
 *
 * «basal» sí se pone y se quita solo, porque ese sí se teclea: solo es verdad
 * mientras no haya nada anterior con lo que comparar, así que si cambias de
 * bolsa se va con ella.
 */
watchEffect(() => {
  if (cambiadas.value.length) return
  if (!anterior.value && !form.variable_cambiada) form.variable_cambiada = 'basal'
  if (anterior.value && form.variable_cambiada === 'basal') form.variable_cambiada = ''
})

/** Lo que se queda el lecho, por gramo de café. El juicio lo da el servidor. */
const retencion = computed(() => {
  const extraido = Number(form.extraido_g)
  const agua = Number(form.agua_g)
  const dosis = Number(form.dosis_g)
  if (!extraido || !agua || !dosis) return null
  return (agua - extraido) / dosis
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
  Number(form.dosis_g) > 0 ? (Number(form.agua_g) / Number(form.dosis_g)).toFixed(1) : '—',
)

async function enviar() {
  errores.value = []
  resultado.value = null
  enviando.value = true
  try {
    const datos: NuevaExtraccion = {
      cafe_id: String(form.cafe_id),
      temp_c: Number(form.temp_c),
      clics: Number(form.clics),
      tiempo_total: String(form.tiempo_total),
      variable_cambiada: cambiadas.value.length
        ? textoVariables.value
        : String(form.variable_cambiada),
      defecto: String(form.defecto),
      nota: Number(form.nota),
      dosis_g: Number(form.dosis_g),
      agua_g: Number(form.agua_g),
      receta_id: String(form.receta_id),
      dripper: String(form.dripper),
    }
    if (form.drawdown_s !== '') datos.drawdown_s = Number(form.drawdown_s)
    if (form.extraido_g !== '') datos.extraido_g = Number(form.extraido_g)
    if (String(form.notas_cata).trim()) datos.notas_cata = String(form.notas_cata).trim()

    resultado.value = await crear(datos)
    // Lo que no se repite entre extracciones se limpia; el resto se queda,
    // que lo normal es cambiar una cosa y volver a medir. Las variables
    // cambiadas también: la de ahora ya pasó a ser el punto de partida.
    form.tiempo_total = ''
    form.drawdown_s = ''
    form.extraido_g = ''
    form.variable_cambiada = ''
    form.notas_cata = ''
    cambiadas.value = []
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <Migas :ruta="[{ texto: 'Registrar extracción' }]" />

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
        <option v-for="(etiqueta, clave) in DRIPPERS" :key="clave" :value="clave">
          {{ etiqueta }}
        </option>
      </select>
    </label>

    <div class="pareja">
      <label>Tiempo total<input v-model="form.tiempo_total" placeholder="3:30" required></label>
      <label>Goteo (s)<input v-model="form.drawdown_s" type="number" step="1" min="0" placeholder="45"></label>
    </div>

    <label>
      En la taza (g)
      <input v-model="form.extraido_g" type="number" step="1" min="1" placeholder="260">
    </label>
    <p v-if="retencion !== null" class="meta">
      Se queda {{ retencion.toFixed(1) }} g de agua por gramo de café
    </p>

    <h3>Variable(s) cambiada(s)</h3>
    <VariablesCambiadas
      v-model="cambiadas" :valores="form" :anterior="anterior" :opciones="opciones"
      @cambia="(clave, valor) => (form[clave] = valor)"
    />
    <!-- Con la lista puesta el texto lo escribe ella, y enseñarlo aquí sería
         repetir lo de arriba. Sin filas es el único sitio donde decirlo: hay
         cambios que no son una columna —la báscula nueva, el agua de otra
         botella— y la primera de una bolsa no cambia nada, es la basal. -->
    <label v-if="!cambiadas.length">
      Variable cambiada
      <input v-model="form.variable_cambiada" placeholder="basal" required>
    </label>

    <label>
      Defecto
      <select v-model="form.defecto">
        <option v-for="(etiqueta, clave) in DEFECTOS" :key="clave" :value="clave">
          {{ etiqueta }}
        </option>
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
      <!-- Seleccionable: la sugerencia es lo que uno copia para apuntársela. -->
      <ol class="copiable">
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

/* Del tamaño y el color de una etiqueta: encabeza un bloque de campos, no una
   sección aparte, así que no tiene por qué gritar. */
h3 {
  font: inherit;
  font-size: 0.82rem;
  font-weight: 400;
  color: var(--suave);
  margin: 0.5rem 0 0;
}

form { display: flex; flex-direction: column; gap: 0.85rem; }

/* Sale del formulario, no se toca: es lo que ya está guardado. */
input[readonly] { color: var(--suave); background: transparent; }

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

/*
 * El alto es zona de agarre, no grosor: la barra se sigue viendo fina, pero
 * a 18 px se falla al arrastrar con el dedo.
 */
input[type="range"] { padding: 0; accent-color: var(--acento); height: 44px; }

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
