<script setup lang="ts">
import type { Creada, NuevaExtraccion } from '~/composables/useApi'

const { t } = useI18n()
useHead({ title: () => t('alta.titulo') })

import { defectosDe } from '@coffee/nucleo/validacion'
const { DRIPPERS, VARIABLES, fechaCorta, nombreCafe, textoDeCambios } = useTextos()

const { cafes, recetas, extracciones, crear } = useApi()
const route = useRoute()
const router = useRouter()
// Guardar la extracción es lo que cierra esa taza, así que es aquí donde
// muere la medición del cronómetro. Ver la regla entera en `useCrono`.
const { soltarReloj } = useCrono()

const { data: bolsas } = await useAsyncData('cafes-form', cafes)
const { data: catalogo } = await useAsyncData('recetas-form', recetas)
const { data: historial, refresh: releerHistorial } = await useAsyncData('ext-form', () => extracciones())

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

const q = route.query
const numero = (v: unknown, porDefecto: number) => (v === undefined ? porDefecto : Number(v))

/** El formulario en blanco: la receta base del README. */
const EN_BLANCO = (): Record<string, unknown> => ({
  cafe_id: '',
  desde_id: '',
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
// La bolsa recién dada de alta: el alta reenvía aquí con ?bolsa= cuando se
// fue desde este formulario, y llega ya elegida. El resto del borrador sigue
// como estaba.
if (q.bolsa !== undefined) form.cafe_id = String(q.bolsa)

// Sin receta en la URL, la de siempre. Por slug, que los uuids no son de fiar
// entre bases.
watchEffect(() => {
  if (form.receta_id || !catalogo.value?.length) return
  const base = catalogo.value.find((r) => r.slug === 'kasuya-46-base')
  form.receta_id = (base ?? catalogo.value[0]!).id
})

/**
 * Las de esta bolsa, de la más nueva a la más vieja: lo que puede elegirse
 * como madre. Las retiradas no vienen en el histórico, y está bien — de un
 * error de registro no se parte.
 */
const deLaBolsa = computed(() =>
  form.cafe_id ? (historial.value ?? []).filter((e) => e.cafe_id === form.cafe_id) : [],
)

/**
 * De qué extracción es variación ésta: la madre. Por defecto la última de la
 * bolsa —el protocolo es repetir y mover una cosa—, y el desplegable permite
 * volver a otra cuando la última fue un callejón sin salida.
 *
 * Es también de donde salen los valores «de antes»: contra ella se compone
 * `variable_cambiada` y contra ella mide la tabla de variables. Sin bolsa no
 * hay madre: las sueltas también tienen `cafe_id` vacío, pero cada una es un
 * café distinto y compararlas mentiría.
 */
const anterior = computed(() =>
  form.cafe_id
    ? deLaBolsa.value.find((e) => e.id === form.desde_id) ?? deLaBolsa.value[0] ?? null
    : null,
)

/**
 * Lo que enseña el desplegable, que no es exactamente lo que guarda el
 * borrador: vacío ahí significa «la última», y así el formulario no tiene que
 * reescribirse solo cada vez que llega el histórico o se cambia de bolsa —que
 * era lo que pisaba lo tecleado en los presets—.
 */
const madreElegida = computed({
  get: () => anterior.value?.id ?? '',
  set: (id: string) => { form.desde_id = id },
})

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

/**
 * La última suelta, cuando registras sin bolsa. El café será otro —o eso hay
 * que suponer—, pero el molinillo, el hervidor y la mano son los mismos, así
 * que la siguiente parte de tus últimos parámetros y no de los de fábrica.
 *
 * Solo rellena campos, como la bolsa anterior: entre sueltas sigue sin haber
 * «antes», ni deltas, ni nada que comparar.
 */
const sueltaPrevia = computed(() =>
  form.cafe_id ? null : (historial.value ?? []).find((e) => !e.cafe_id) ?? null,
)

// Parte del borrador: las filas de variables también vuelven al volver.
const cambiadas = useState<string[]>('borrador-extraccion-variables', () => [])

/** Las variables que son de elegir, no de teclear. */
const opciones = computed(() => ({
  receta_id: (catalogo.value ?? []).map((r) => ({ valor: r.id, etiqueta: r.nombre })),
  dripper: Object.entries(DRIPPERS.value).map(([valor, etiqueta]) => ({ valor, etiqueta })),
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
 * Y el último escalón: tu última taza, sea del café que sea.
 *
 * Estrenar un café que no continúa a ninguno dejaba el formulario en los
 * valores de fábrica —92 °C, 28 clics—, y eso no es de donde uno parte: el café
 * es otro, pero el molinillo, el hervidor y la mano son los mismos. Es el mismo
 * argumento que ya valía para las sueltas, que lo tenían, y para las bolsas
 * nuevas no.
 */
const cualquiera = computed(() => (historial.value ?? [])[0] ?? null)

/**
 * De dónde parte el formulario, en escalones: la última de esta bolsa; si está
 * estrenada, la última de la bolsa anterior del mismo café; sin bolsa, la
 * última suelta; y si nada de eso existe, la última que hicieras.
 *
 * **Esta cadena no es la del `desde_id`, y no hay que confundirlas.** Aquélla
 * dice contra qué se compara la taza y nunca sale de la bolsa, porque el tueste
 * es lo que hace la taza. Ésta dice de dónde se copian los números al abrir el
 * formulario, y puede venir de donde sea porque solo rellena campos y no afirma
 * nada. Cuando las dos no coinciden, la extracción es una primera y no forma
 * par — que es justo lo que ya pasaba al estrenar bolsa.
 */
const arranque = computed(
  () => anterior.value ?? bolsaPrevia.value ?? sueltaPrevia.value ?? cualquiera.value,
)

/**
 * De qué extracción se rellenó ya este borrador. Sin el sello, volver a la
 * pantalla re-aplicaría «la anterior» y pisaría lo que se hubiera tecleado:
 * el arranque puebla una vez por extracción de partida, no en cada visita.
 */
const arranqueAplicado = useState('borrador-extraccion-arranque', () => '')

function aplicarArranque(previa: Record<string, unknown>) {
  for (const clave of Object.keys(VARIABLES.value)) {
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
// otro café, y el formulario se rellena con la última de la nueva. La madre se
// suelta con ellas: nunca sale de la bolsa.
watch(() => form.cafe_id, () => { cambiadas.value = []; form.desde_id = '' })

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
 * Hay algo medido dentro. El tiempo y el goteo salen de cronometrar una taza
 * que ya está colada: no se pueden volver a sacar, a diferencia de la
 * temperatura o los clics, que son ajustes y se reescriben tecleando.
 */
const hayMedido = computed(
  () => String(form.tiempo_total).trim() !== '' || String(form.drawdown_s).trim() !== '',
)

// Y los dos son la misma marca vista desde dos sitios, así que van atados.
const { movido, anotar, desdeElTiempo, desdeElGoteo } = useAtadura(form)

const dialogo = ref<HTMLDialogElement | null>(null)

/** Vaciar en blanco no necesita ceremonia; vaciar una medición, sí. */
function pedirVaciar() {
  if (hayMedido.value) dialogo.value?.showModal()
  else vaciar()
}

/**
 * El formulario como recién entrado: en blanco, sin filas de variables, sin
 * query del crono, y con la última extracción puesta otra vez de partida.
 * Para el borrador a medias que ya no es verdad —o el preset que no era—.
 */
function vaciar() {
  dialogo.value?.close()
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

/**
 * Los defectos como lista, sobre la misma cadena que se guarda.
 *
 * El borrador sigue teniendo un solo campo de texto —`"amargor,astringente"`,
 * que es exactamente lo que acaba en la columna— y la lista es una vista de
 * él. Así lo que se compara y lo que se manda no se pueden desincronizar, que
 * es lo que pasaría con un array al lado.
 */
const defectos = computed({
  get: () => defectosDe(form.defecto),
  set: (lista: string[]) => { form.defecto = lista.join(',') },
})

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
    // La madre solo viaja si se eligió otra: sin ella, el servidor cuelga la
    // nueva de la última de la bolsa, que es lo mismo que enseña el formulario.
    if (form.cafe_id && form.desde_id) datos.desde_id = String(form.desde_id)
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

    /*
     * La que se acaba de guardar pasa a ser el punto de partida, así que hay
     * que releer el histórico: sin eso, registrar dos seguidas sin salir de
     * aquí compararía la segunda contra la madre de la primera. Y la elección
     * de madre se suelta con ella —volver a una rama es una decisión de esa
     * taza, no del formulario—, que si no la siguiente saldría colgando del
     * mismo sitio sin haberlo pedido.
     */
    form.desde_id = ''
    await releerHistorial()

    /*
     * Y con ella muere la medición del cronómetro: esa taza ya está apuntada.
     * Antes se limpiaba al salir del reloj, que no termina nada — guardar y
     * volver al crono te dejaba el tiempo de la taza anterior puesto, listo
     * para registrarlo por segunda vez.
     *
     * La query se va con el mismo gesto: es de dónde salieron el tiempo y el
     * goteo, y volver aquí con ella los reharía aparecer.
     */
    soltarReloj()
    if (Object.keys(route.query).length) void router.replace({ query: {} })
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <Migas :ruta="[{ texto: $t('alta.titulo') }]" />

  <form @submit.prevent="enviar">
    <div class="titulo">
      <h2>{{ $t('alta.nueva') }}</h2>
      <!-- Lo escrito aquí sobrevive a salir y volver; esto lo tira a
           propósito cuando el borrador ya no es verdad. Con una medición
           dentro pregunta antes: eso no se puede volver a medir. -->
      <button type="button" class="limpiar" @click="pedirVaciar">{{ $t('comun.vaciar') }}</button>
    </div>

    <p v-if="desdeCrono" class="delcrono">{{ $t('alta.del_crono') }}</p>

    <!-- La bolsa ya no es obligatoria: el café de un amigo o una muestra
         suelta se guardan sin ficha. Eso sí, una taza suelta no compara con
         nada, y el aviso ofrece el alta antes que inventarse una bolsa. -->
    <label>
      {{ $t('alta.cafe') }}
      <select v-model="form.cafe_id">
        <option value="">{{ $t('comun.sin_bolsa') }}</option>
        <option v-for="c in abiertas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>
    <i18n-t v-if="!form.cafe_id" keypath="alta.sin_bolsa_aviso" tag="p" class="meta" scope="global">
      <template #enlace>
        <NuxtLinkLocale :to="{ path: '/cafes/nueva', query: { volver: '/nueva' } }">
          {{ $t('alta.sin_bolsa_enlace') }}
        </NuxtLinkLocale>
      </template>
    </i18n-t>

    <!-- De qué extracción parte ésta. Solo con más de una en la bolsa: con una
         sola no hay nada que elegir, y con ninguna tampoco. -->
    <label v-if="deLaBolsa.length > 1">
      {{ $t('alta.variacion_de') }}
      <select v-model="madreElegida">
        <option v-for="e in deLaBolsa" :key="e.id" :value="e.id">
          {{ $t('alta.opcion_madre', {
            fecha: fechaCorta(e.fecha), temp: e.temp_c, clics: e.clics,
          }) }}{{ e.nota ? $t('alta.opcion_nota', { n: e.nota }) : '' }}
        </option>
      </select>
    </label>
    <p v-if="deLaBolsa.length > 1 && anterior && anterior.id !== deLaBolsa[0]!.id" class="meta">
      {{ $t('alta.vuelves_atras') }}
    </p>

    <div class="pareja">
      <label>{{ $t('alta.dosis') }}<input
        v-model.number="form.dosis_g" type="number" step="0.1" min="1" required></label>
      <label>{{ $t('alta.agua') }}<input
        v-model.number="form.agua_g" type="number" step="1" min="1" required></label>
    </div>
    <p class="meta">{{ $t('alta.ratio', { n: ratio }) }}</p>

    <div class="pareja">
      <label>{{ $t('alta.temp') }}<input
        v-model.number="form.temp_c" type="number" step="1" min="0" max="100" required></label>
      <label>{{ $t('alta.clics') }}<input
        v-model.number="form.clics" type="number" step="1" min="0" required></label>
    </div>

    <label>
      {{ $t('alta.receta') }}
      <select v-model="form.receta_id">
        <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </label>

    <label>
      {{ $t('alta.dripper') }}
      <select v-model="form.dripper">
        <option v-for="(etiqueta, clave) in DRIPPERS" :key="clave" :value="clave">
          {{ etiqueta }}
        </option>
      </select>
    </label>

    <!-- Atados: el goteo se cuenta dentro del total, así que tocar uno mueve
         el otro. Ver `useAtadura`. -->
    <div class="pareja">
      <label>{{ $t('alta.tiempo_total') }}<input
        v-model="form.tiempo_total" placeholder="3:30" required
        @focus="anotar" @change="desdeElTiempo"></label>
      <label>{{ $t('alta.goteo') }}<input
        v-model="form.drawdown_s" type="number" step="1" min="0" placeholder="45"
        @focus="anotar" @change="desdeElGoteo"></label>
    </div>
    <p v-if="movido" class="meta">
      {{ movido === 'goteo' ? $t('alta.movido_goteo') : $t('alta.movido_tiempo') }}
    </p>

    <label>
      {{ $t('alta.en_la_taza') }}
      <input v-model="form.extraido_g" type="number" step="1" min="1" placeholder="260">
    </label>
    <p v-if="retencion !== null" class="meta">
      {{ $t('alta.retencion', { n: retencion.toFixed(1) }) }}
    </p>

    <h3>{{ $t('alta.variables_titulo') }}</h3>
    <VariablesCambiadas
      v-model="cambiadas" :valores="form" :anterior="anterior" :opciones="opciones"
      @cambia="(clave, valor) => (form[clave] = valor)"
    />
    <!-- El dato pelado y sin umbral: quién decide qué es «mucho» es el
         servidor, y ya lo dirá en sus avisos al registrar. -->
    <p v-if="bolsaPrevia" class="meta">
      {{ $t('alta.desde_bolsa_previa', {
        fecha: bolsaPrevia.fecha,
        abierta: bolsaPrevia.dias_abierta !== null
          ? $t('alta.dias_abierta', { n: bolsaPrevia.dias_abierta }) : '',
      }) }}
    </p>
    <!-- El mismo trato que la bolsa anterior: se dice de dónde parten los
         números, y que partir no es comparar. -->
    <!-- El último escalón, y el mismo trato: de dónde parten los números y que
         partir no es comparar. -->
    <p v-if="arranque && arranque === cualquiera" class="meta">
      {{ $t('alta.desde_cualquiera', {
        fecha: fechaCorta(cualquiera.fecha),
        cafe: cualquiera.cafe_nombre
          ? $t('alta.desde_cualquiera_cafe', { nombre: cualquiera.cafe_nombre }) : '',
      }) }}
    </p>
    <p v-if="sueltaPrevia" class="meta">
      {{ $t('alta.desde_suelta', { fecha: fechaCorta(sueltaPrevia.fecha) }) }}
    </p>
    <!-- Con la lista puesta el texto lo escribe ella, y enseñarlo aquí sería
         repetir lo de arriba. Sin filas es el único sitio donde decirlo: hay
         cambios que no son una columna —la báscula nueva, el agua de otra
         botella— y la primera de una bolsa no cambia nada. -->
    <label v-if="!cambiadas.length">
      {{ $t('alta.variable_cambiada') }}
      <input
        v-model="form.variable_cambiada" :placeholder="$t('alta.primera_extraccion')" required>
    </label>

    <!-- Varios, en orden de relevancia: el ajuste sale solo del primero. -->
    <h3>{{ $t('alta.defectos_titulo') }}</h3>
    <DefectosElegidos v-model="defectos" />

    <label>
      {{ $t('alta.nota') }} <strong>{{ form.nota }}</strong>
      <input v-model.number="form.nota" type="range" min="1" max="10" step="1">
    </label>

    <label>
      {{ $t('alta.notas_cata') }}
      <textarea v-model="form.notas_cata" rows="2" />
    </label>

    <button type="submit" :disabled="enviando">
      {{ enviando ? $t('comun.guardando') : $t('alta.guardar') }}
    </button>
  </form>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>{{ $t('alta.vaciar_titulo') }}</h3>
    <p class="ojo">{{ $t('alta.vaciar_ojo') }}</p>
    <p>{{ $t('alta.vaciar_resto') }}</p>
    <div class="botones">
      <button type="button" class="secundario" @click="dialogo?.close()">{{ $t('comun.cancelar') }}</button>
      <button type="button" class="peligro" @click="vaciar">{{ $t('comun.vaciar') }}</button>
    </div>
  </dialog>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>{{ $t('comun.no_guardado') }}</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="resultado" class="tarjeta exito">
    <strong>{{ $t('alta.guardada', {
      cafe: nombreCafe(resultado.cafe), fecha: fechaCorta(resultado.extraccion.fecha),
    }) }}</strong>
    <p class="meta">
      {{ $t('alta.resumen_guardado', {
        reparto: resultado.extraccion.reparto, ratio: resultado.extraccion.ratio,
      }) }}
      <span v-if="resultado.extraccion.dias_tueste !== null">
        {{ $t('alta.dias_tueste', { n: resultado.extraccion.dias_tueste }) }}
      </span>
    </p>

    <!--
      Las notas de cata, de vuelta y textuales.

      El campo se limpia al guardar a propósito —no se repiten entre tazas—,
      pero encima salía este aviso hablando de otra cosa y lo que se veía era
      la nota desaparecida y ningún acuse de recibo. Nunca se perdieron: están
      en la base desde el primer momento. Enseñarlas aquí lo demuestra en vez
      de pedir que te fíes, y de paso lo que se lee es lo que **guardó el
      servidor**, no lo que quedó en el formulario.
    -->
    <p v-if="resultado.extraccion.notas_cata" class="notas copiable">
      <span class="etiqueta">{{ $t('alta.etiqueta_cata') }}</span>
      «{{ resultado.extraccion.notas_cata }}»
    </p>

    <p v-for="a in resultado.sugerencias.avisos" :key="a" class="aviso">⚠ {{ a }}</p>

    <template v-if="resultado.sugerencias.cambios.length">
      <i18n-t keypath="alta.cambia_una" tag="p" class="meta" scope="global">
        <template #una_sola><strong>{{ $t('alta.cambia_una_enfasis') }}</strong></template>
      </i18n-t>
      <!-- Seleccionable: la sugerencia es lo que uno copia para apuntársela. -->
      <ol class="copiable">
        <li v-for="c in resultado.sugerencias.cambios" :key="c.variable">
          <code>{{ c.variable }} {{ c.cambio }}</code> — {{ c.porque }}
        </li>
      </ol>
    </template>
    <p v-else-if="resultado.sugerencias.conforme">{{ $t('alta.conforme') }}</p>
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

/* Lo que escribiste, devuelto tal cual: por eso es seleccionable y va en
   cursiva, para que se lea como una cita y no como un mensaje de la app. */
.notas {
  font-size: 0.88rem;
  font-style: italic;
  color: var(--tinta);
  margin: 0.5rem 0;
  overflow-wrap: anywhere;
}

.notas .etiqueta {
  display: block;
  font-style: normal;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--suave);
}

dialog {
  border: 1px solid var(--linea);
  border-radius: 0.8rem;
  background: var(--tarjeta);
  color: var(--tinta);
  padding: 1.25rem;
  max-width: min(28rem, calc(100% - 2rem));
  margin: auto;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { font-size: 1.05rem; font-weight: 600; color: var(--tinta); margin: 0 0 0.6rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }
dialog .ojo { color: #c2410c; }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.secundario { background: transparent; color: var(--suave); border: 1px solid var(--linea); font-weight: 400; }
.peligro { background: #c2410c; }
ol { margin: 0.35rem 0 0; padding-left: 1.2rem; font-size: 0.88rem; }
code { font-size: 0.85em; }
a { color: var(--acento); }
</style>
