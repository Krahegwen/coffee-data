<script setup lang="ts">
import type { Creada, NuevaExtraccion } from '~/composables/useApi'

useHead({ title: 'Registrar extracción' })

import { DEFECTOS, DRIPPERS, fechaCorta, nombreCafe, textoDeCambios, VARIABLES } from '~/composables/textos'

const { cafes, recetas, extracciones, crear } = useApi()
const route = useRoute()
const router = useRouter()

const { data: bolsas } = await useAsyncData('cafes-form', cafes)
const { data: catalogo } = await useAsyncData('recetas-form', recetas)
const { data: historial } = await useAsyncData('ext-form', () => extracciones())

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

const q = route.query
const numero = (v: unknown, porDefecto: number) => (v === undefined ? porDefecto : Number(v))

/** El formulario en blanco: la receta base del README. */
const EN_BLANCO = (): Record<string, unknown> => ({
  cafe_id: '',
  dosis_g: 20,
  agua_g: 300,
  temp_c: 92,
  clics: 28,
  receta_id: '',
  dripper: 'v60-02-plastico',
  tiempo_total: '',
  drawdown_s: '' as number | '',
  extraido_g: '' as number | '',
  variable_cambiada: '',
  defecto: 'equilibrado',
  notas_cata: '',
  nota: 7,
})

/**
 * El formulario es un borrador en memoria de la app: salir a mitad —a dar de
 * alta la bolsa que faltaba, a mirar una ficha— y volver no borra lo
 * escrito. Se vacía al guardar lo que no se repite, o entero con «Vaciar»;
 * un F5 también lo tira, que la memoria es de la pestaña.
 */
const form = useState('borrador-extraccion', EN_BLANCO).value

/*
 * Lo que traiga el cronómetro en la URL pisa el borrador: venir del reloj
 * con el tiempo medido es intención fresca. Al volver atrás la query es la
 * misma, así que re-aplicarla deja el borrador como estaba.
 */
if (q.cafe !== undefined) form.cafe_id = String(q.cafe)
if (q.receta !== undefined) form.receta_id = String(q.receta)
if (q.dosis !== undefined) form.dosis_g = numero(q.dosis, 20)
if (q.agua !== undefined) form.agua_g = numero(q.agua, 300)
if (q.tiempo !== undefined) form.tiempo_total = String(q.tiempo)
if (q.drawdown !== undefined) form.drawdown_s = Number(q.drawdown)

// Sin receta en la URL, la de siempre. Por slug, que los uuids no son de fiar
// entre bases.
watchEffect(() => {
  if (form.receta_id || !catalogo.value?.length) return
  const base = catalogo.value.find((r) => r.slug === 'kasuya-46-base')
  form.receta_id = (base ?? catalogo.value[0]!).id
})

/**
 * La última de este café: de ahí salen los valores «de antes». Sin bolsa no
 * hay «antes»: las sueltas también tienen cafe_id vacío, pero cada una es un
 * café distinto y compararlas mentiría.
 */
const anterior = computed(() =>
  form.cafe_id
    ? (historial.value ?? []).find((e) => e.cafe_id === form.cafe_id) ?? null
    : null,
)

/**
 * La última extracción de la bolsa **anterior del mismo café**, cuando la de
 * ahora está estrenada.
 *
 * Sirve para arrancar la primera donde lo dejaste y no en los valores de
 * fábrica: la bolsa es nueva, pero el café y tu molinillo son los mismos.
 *
 * La familia se reconoce por el slug, que es como el servidor los reparte al
 * duplicar: `gary`, `gary_2`, `gary_3`. Es una pista, no una verdad —un café
 * que se llamara «Finca 2» caería en la familia de «Finca»—, pero lo único que
 * está en juego es de dónde parte un formulario que vas a repasar igual.
 */
const familia = (slug: string) => slug.replace(/_\d+$/, '')

const bolsaPrevia = computed(() => {
  if (!form.cafe_id || anterior.value) return null
  const mia = (bolsas.value ?? []).find((c) => c.id === form.cafe_id)
  if (!mia) return null
  const base = familia(mia.slug)
  // Las sueltas no tienen slug ni familia: no son la bolsa anterior de nadie.
  return (historial.value ?? []).find(
    (e) => e.cafe_id !== form.cafe_id && e.cafe_slug && familia(e.cafe_slug) === base,
  ) ?? null
})

// Parte del borrador: las filas de variables también vuelven al volver.
const cambiadas = useState<string[]>('borrador-extraccion-variables', () => [])

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

/**
 * De dónde parte el formulario: la última de esta bolsa y, si está estrenada,
 * la última de la bolsa anterior del mismo café.
 *
 * Lo segundo **solo rellena campos**. El motor de sugerencias empieza de cero
 * igual, porque empareja por `cafe_id` y este es otro: no habrá deltas contra
 * la bolsa vieja ni fila en la tabla, y la extracción queda como «Primera
 * extracción». Y tiene que ser así — el tueste es nuevo, la taza no compara.
 */
const arranque = computed(() => anterior.value ?? bolsaPrevia.value)

/**
 * De qué extracción se rellenó ya este borrador. Sin el sello, volver a la
 * pantalla re-aplicaría «la anterior» y pisaría lo que se hubiera tecleado:
 * el arranque puebla una vez por extracción de partida, no en cada visita.
 */
const arranqueAplicado = useState('borrador-extraccion-arranque', () => '')

function aplicarArranque(previa: Record<string, unknown>) {
  for (const clave of Object.keys(VARIABLES)) {
    const enUrl = DESDE_LA_URL[clave]
    if (enUrl && route.query[enUrl] !== undefined) continue
    const valor = previa[clave]
    if (valor !== null && valor !== undefined) form[clave] = valor
  }
}

watch(arranque, (previa) => {
  if (!previa) return
  const sello = String((previa as Record<string, unknown>).id ?? '')
  if (arranqueAplicado.value === sello) return
  arranqueAplicado.value = sello
  aplicarArranque(previa as Record<string, unknown>)
}, { immediate: true })

// Tocar un campo de arriba crea su fila si el valor se aleja de la anterior.
useTablaAlDia(form, () => anterior.value as unknown as Record<string, unknown> | null, cambiadas)

// Al cambiar de bolsa, las filas de la de antes no valen: sus «antes» eran de
// otro café, y el formulario se rellena con la última de la nueva.
watch(() => form.cafe_id, () => { cambiadas.value = [] })

/** «Temperatura 91 → 88». Sale de los valores, nunca al revés. */
const textoVariables = computed(() =>
  textoDeCambios(cambiadas.value, anterior.value, form, opciones.value),
)

/*
 * El texto no se escribe en el formulario mientras editas: se compone al
 * enviar. Reescribirlo en caliente hacía que la etiqueta cambiara sola cada
 * vez que se añadía o se quitaba una fila.
 *
 * «Primera extracción» sí se pone y se quita solo, porque ese sí se teclea:
 * solo es verdad mientras no haya nada anterior con lo que comparar, así que
 * si cambias de bolsa se va con ella.
 */
watchEffect(() => {
  if (cambiadas.value.length) return
  if (!anterior.value && !form.variable_cambiada) form.variable_cambiada = 'Primera extracción'
  if (anterior.value && form.variable_cambiada === 'Primera extracción') form.variable_cambiada = ''
})

/** Lo que se queda el lecho, por gramo de café. El juicio lo da el servidor. */
const retencion = computed(() => {
  const extraido = Number(form.extraido_g)
  const agua = Number(form.agua_g)
  const dosis = Number(form.dosis_g)
  if (!extraido || !agua || !dosis) return null
  return (agua - extraido) / dosis
})

// Sobre la query viva, no la de llegada: «Vaciar» la limpia y el cartel
// tiene que irse con ella.
const desdeCrono = computed(() => route.query.tiempo !== undefined)

/**
 * El formulario como recién entrado: en blanco, sin filas de variables, sin
 * query del crono, y con la última extracción puesta otra vez de partida.
 * Para el borrador a medias que ya no es verdad —o el preset que no era—.
 */
function vaciar() {
  Object.assign(form, EN_BLANCO())
  cambiadas.value = []
  arranqueAplicado.value = ''
  if (Object.keys(route.query).length) void router.replace({ query: {} })
  if (abiertas.value.length) form.cafe_id = abiertas.value[0]!.id
  const previa = arranque.value as Record<string, unknown> | null
  if (previa) {
    arranqueAplicado.value = String(previa.id ?? '')
    aplicarArranque(previa)
  }
}

const enviando = ref(false)
const errores = ref<string[]>([])
const resultado = ref<Creada | null>(null)

/*
 * La primera bolsa abierta se propone una sola vez, cuando la lista llega:
 * después manda lo elegido, que «Sin bolsa» también es una elección y un
 * watch permanente la taparía con una bolsa en cuanto la soltaras. Lo que
 * trae la URL cuenta como elegido: viene del cronómetro, con o sin bolsa.
 */
const bolsaPropuesta = useState('borrador-extraccion-bolsa', () => false)
watchEffect(() => {
  if (bolsaPropuesta.value || !bolsas.value) return
  bolsaPropuesta.value = true
  if (q.cafe === undefined && !form.cafe_id && abiertas.value.length) {
    form.cafe_id = abiertas.value[0]!.id
  }
})

const ratio = computed(() =>
  Number(form.dosis_g) > 0 ? (Number(form.agua_g) / Number(form.dosis_g)).toFixed(1) : '—',
)

async function enviar() {
  errores.value = []
  resultado.value = null
  enviando.value = true
  try {
    const datos: NuevaExtraccion = {
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
    // Vacío es una elección: la taza va suelta y el cuerpo no lleva cafe_id.
    if (form.cafe_id) datos.cafe_id = String(form.cafe_id)
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

  <form @submit.prevent="enviar">
    <div class="titulo">
      <h2>Nueva extracción</h2>
      <!-- Lo escrito aquí sobrevive a salir y volver; esto lo tira a
           propósito cuando el borrador ya no es verdad. -->
      <button type="button" class="limpiar" @click="vaciar">Vaciar</button>
    </div>

    <p v-if="desdeCrono" class="delcrono">
      Tiempo y goteo vienen del cronómetro.
    </p>

    <!-- La bolsa ya no es obligatoria: el café de un amigo o una muestra
         suelta se guardan sin ficha. Eso sí, una taza suelta no compara con
         nada, y el aviso ofrece el alta antes que inventarse una bolsa. -->
    <label>
      Café
      <select v-model="form.cafe_id">
        <option value="">Sin bolsa</option>
        <option v-for="c in abiertas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>
    <p v-if="!form.cafe_id" class="meta">
      Sin bolsa la taza queda apuntada, pero no compara con nada ni suma a
      ningún historial. Si este café va a repetir,
      <NuxtLink to="/cafes/nueva">dale de alta su bolsa</NuxtLink>: lo escrito
      aquí no se pierde.
    </p>

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
    <!-- El dato pelado y sin umbral: quién decide qué es «mucho» es el
         servidor, y ya lo dirá en sus avisos al registrar. -->
    <p v-if="bolsaPrevia" class="meta">
      Los valores vienen de la última de la bolsa anterior
      ({{ bolsaPrevia.fecha }}<span v-if="bolsaPrevia.dias_abierta !== null">, que
      llevaba {{ bolsaPrevia.dias_abierta }} días abierta</span>). El tueste es
      otro, así que esta cuenta como primera extracción y no se compara con
      aquélla — y esos ajustes pueden estar compensando un café ya apagado.
    </p>
    <!-- Con la lista puesta el texto lo escribe ella, y enseñarlo aquí sería
         repetir lo de arriba. Sin filas es el único sitio donde decirlo: hay
         cambios que no son una columna —la báscula nueva, el agua de otra
         botella— y la primera de una bolsa no cambia nada. -->
    <label v-if="!cambiadas.length">
      Variable cambiada
      <input v-model="form.variable_cambiada" placeholder="Primera extracción" required>
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
    <strong>Guardada · {{ nombreCafe(resultado.cafe) }}, {{ fechaCorta(resultado.extraccion.fecha) }}</strong>
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

.titulo { display: flex; justify-content: space-between; align-items: baseline; }
.titulo h2 { margin-bottom: 0; }

/* Texto pequeño y sin peso: vacía un borrador, no borra datos guardados. */
.limpiar {
  font: inherit;
  font-size: 0.8rem;
  color: var(--suave);
  background: none;
  border: 0;
  padding: 0.25rem 0;
  margin: 0;
  min-height: 0;
  cursor: pointer;
  text-decoration: underline;
}

.limpiar:hover { color: var(--acento); }

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
