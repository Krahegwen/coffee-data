<script setup lang="ts">
import { relojDe } from '@coffee/nucleo/validacion'

/**
 * Preparar: qué café, con qué receta y en qué cantidades.
 *
 * Es una ruta aparte del reloj a propósito. Antes las dos pantallas vivían en
 * `/crono` y se decidía con una bandera dentro del estado, así que el
 * navegador no las distinguía: no había URL que llevara al reloj y el botón de
 * atrás no hacía lo que uno espera. Molestaba poco cuando la pantalla no
 * recordaba nada; desde que el estado sobrevive a salir y volver, estorbaba de
 * verdad.
 */
const { t } = useI18n()
// El catálogo de etiquetas y las rutas, los dos conscientes del idioma:
// desde el inglés, un `/crono` pelado llevaría al castellano.
const { etiquetaPaso, fechaCorta } = useTextos()
const localePath = useLocalePath()

useHead({ title: () => t('preparar.titulo') })

const { cafes, recetas, guion, extracciones } = useApi()
const router = useRouter()
const { estado, hayMedicion, olvidarTodo } = useCrono()

const { data: bolsas } = await useAsyncData('cafes-crono', cafes)
const { data: catalogo } = await useAsyncData('recetas-crono', recetas)

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))

/**
 * Sin receta no hay guion y el cronómetro no sabría qué marcar: este sí
 * corta el paso. La bolsa en cambio es opcional de punta a punta: se puede
 * cronometrar sin ella y el alta también guarda sin ella — la taza queda
 * suelta, sin serie con la que comparar.
 */
const sinRecetas = computed(() => !(catalogo.value ?? []).length)

const { cafeId, recetaId, desdeId, dosis, agua, pasos } = toRefs(estado.value)

/*
 * Lo elegido la última vez, del cajón.
 *
 * El `await` no es adorno y el orden es lo único que importa aquí: los dos
 * `watchEffect` de abajo corrigen la selección cuando no cuadra con lo que
 * hay, y si se registraran antes de que llegue lo guardado la corregirían
 * contra un estado en blanco — te encontrarías la primera bolsa de la lista y
 * 300 g cada vez que abres la pantalla, con tu selección llegando un tick
 * después para no cambiar ya nada.
 *
 * Se siembra una vez por pestaña: a partir de ahí manda lo que haya en
 * memoria, que es lo que estás tocando ahora mismo.
 */
const { ajustes, cargar: cargarAjustes, guardar: guardarAjustes } = usePreferencias()
await cargarAjustes()

const sembrado = useState('crono-sembrado', () => false)
if (!sembrado.value) {
  sembrado.value = true
  if (ajustes.value.crono_cafe_id) cafeId.value = ajustes.value.crono_cafe_id
  if (ajustes.value.crono_receta_id) recetaId.value = ajustes.value.crono_receta_id
  dosis.value = ajustes.value.crono_dosis_g
  agua.value = ajustes.value.crono_agua_g
}

/*
 * Y de vuelta al cajón cuando cambia, con un respiro: el agua y la dosis son
 * campos numéricos y guardar en cada tecla escribiría cuatro veces para
 * llegar a «450».
 *
 * Se manda **solo lo que cambió**, no las cuatro claves cada vez. Mandarlas
 * juntas las tomaba de esta memoria, que no se entera de lo que baja al
 * sincronizar: cambiabas la dosis en el móvil, tocabas el agua en el
 * portátil, y el PATCH del portátil reenviaba su dosis vieja con sello nuevo
 * y se llevaba por delante la del móvil. El PATCH parcial existe justo para
 * que eso no pase, y así se cumple también dentro del grupo.
 */
const CLAVES_CRONO = {
  crono_cafe_id: cafeId, crono_receta_id: recetaId,
  crono_dosis_g: dosis, crono_agua_g: agua,
} as const

let pluma: ReturnType<typeof setTimeout> | null = null
let sucias: Record<string, unknown> = {}

function apuntar(cambios: Record<string, unknown>) {
  sucias = { ...sucias, ...cambios }
  if (pluma) clearTimeout(pluma)
  pluma = setTimeout(escribir, 600)
}

function escribir() {
  if (pluma) { clearTimeout(pluma); pluma = null }
  if (!Object.keys(sucias).length) return
  const van = sucias
  sucias = {}
  void guardarAjustes(van).catch(() => { /* un ajuste no interrumpe el café */ })
}

// Ojo al nombre: llamar `ref` a esta variable tapaba el `ref` de Vue que
// auto-importa Nuxt, y la página entera dejaba de arrancar.
for (const [clave, campo] of Object.entries(CLAVES_CRONO)) {
  watch(campo, (valor) => apuntar({ [clave]: valor }))
}

/*
 * Al salir se escribe lo pendiente en vez de cancelarlo. Salir es lo normal
 * —«Al cronómetro» desmonta esta página—, así que cancelar tiraba justo el
 * cambio que acababas de hacer: subías la dosis a 22, pulsabas, y al volver
 * seguían siendo 20.
 */
onUnmounted(escribir)

// La selección guardada puede apuntar a una bolsa ya cerrada o borrada: si no
// está entre las abiertas, la primera. Y si no hay ninguna, nada — aquí se
// puede cronometrar sin bolsa.
watchEffect(() => {
  if (!abiertas.value.length) return
  // La primera de la lista **ordenada**, que es la que el desplegable enseña
  // arriba: eligiendo por el orden crudo, la bolsa que salía puesta no era la
  // que se veía primero.
  if (!abiertas.value.some((c) => c.id === cafeId.value)) {
    cafeId.value = bolsasOrdenadas.value[0]!.id
  }
})

// La receta de siempre como arranque. Por slug, que es lo único estable: los
// uuids cambian entre la base local y la de verdad.
watchEffect(() => {
  if (!catalogo.value?.length) return
  if (catalogo.value.some((r) => r.id === recetaId.value)) return
  const base = catalogo.value.find((r) => r.slug === 'kasuya-46-base')
  recetaId.value = (base ?? catalogo.value[0]!).id
})

async function cargar() {
  if (!recetaId.value) return
  pasos.value = await guion(recetaId.value, agua.value)
}

watch([recetaId, agua], cargar, { immediate: true })

// --- lo que ya sabemos de antes -------------------------------------------

/**
 * El histórico, para tres cosas: ordenar por lo último usado, proponer los
 * valores de cada bolsa y enseñar lo que el motor sugirió la última vez.
 *
 * Una sola lectura del cajón —es local, va en un suspiro— en vez de tres
 * consultas distintas.
 */
const { data: historial } = await useAsyncData('ext-crono', () => extracciones())

/** Cuándo se usó cada cosa por última vez, para ordenar por ello. */
function ultimoUso(campo: 'cafe_id' | 'receta_id') {
  const cuando = new Map<string, string>()
  for (const e of historial.value ?? []) {
    const clave = String(e[campo] ?? '')
    const sello = String(e.creado_en ?? '')
    if (clave && sello > (cuando.get(clave) ?? '')) cuando.set(clave, sello)
  }
  return cuando
}

/**
 * Las bolsas abiertas, la usada más recientemente primero.
 *
 * Ordenar por nombre era ordenar por una casualidad del alfabeto. Lo que uno
 * busca al abrir esta pantalla es casi siempre el café de ayer.
 */
const bolsasOrdenadas = computed(() => {
  const cuando = ultimoUso('cafe_id')
  return [...abiertas.value].sort((a, b) => {
    const ua = cuando.get(a.id) ?? ''
    const ub = cuando.get(b.id) ?? ''
    if (ua !== ub) return ua < ub ? 1 : -1
    // Las que nunca se han usado, detrás y por nombre: son las recién dadas
    // de alta y no hay nada que las ordene mejor.
    return a.nombre < b.nombre ? -1 : 1
  })
})

const recetasOrdenadas = computed(() => {
  const cuando = ultimoUso('receta_id')
  return [...(catalogo.value ?? [])].sort((a, b) => {
    const ua = cuando.get(a.id) ?? ''
    const ub = cuando.get(b.id) ?? ''
    if (ua !== ub) return ua < ub ? 1 : -1
    return a.slug < b.slug ? -1 : 1
  })
})

/** Las de esta bolsa, de la más nueva a la más vieja. */
const deLaBolsa = computed(() =>
  cafeId.value ? (historial.value ?? []).filter((e) => e.cafe_id === cafeId.value) : [],
)

const ultimaDeLaBolsa = computed(() => deLaBolsa.value[0] ?? null)

/**
 * Al elegir otra bolsa **a mano**, se proponen los valores de su última taza:
 * cada café pide su dosis, y arrastrar la del anterior obliga a corregir dos
 * campos cada vez que se cambia de bolsa.
 *
 * Colgado del evento del desplegable y no de un `watch` sobre `cafeId`, que
 * es la diferencia entre «lo has elegido tú» y «se ha movido solo». `cafeId`
 * también lo cambian la siembra de preferencias y la corrección automática
 * cuando la bolsa deja de estar abierta; con un watch, marcar una bolsa como
 * terminada desde otro dispositivo te reescribía la dosis y el agua que
 * acababas de teclear, sin tocar nada y sin decir nada.
 */
function alElegirBolsa() {
  const ultima = (historial.value ?? []).find((e) => e.cafe_id === cafeId.value)
  if (!ultima) return
  if (ultima.dosis_g) dosis.value = Number(ultima.dosis_g)
  if (ultima.agua_g) agua.value = Number(ultima.agua_g)
  if (ultima.receta_id) recetaId.value = String(ultima.receta_id)
}

// --- el ratio --------------------------------------------------------------

/** El de la receta elegida, si lo tiene: puede no tenerlo. */
const ratioReceta = computed(() =>
  (catalogo.value ?? []).find((r) => r.id === recetaId.value)?.ratio ?? null,
)

/**
 * El que sale de lo que hay puesto ahora mismo.
 *
 * Los dos campos tienen que traer un número mayor que cero: al vaciar el agua
 * para reescribirla, `v-model.number` deja la cadena vacía y el cociente daba
 * 0 —no `null`—, así que entre una tecla y otra saltaba «vas a 1:0» en rojo.
 */
const ratioPuesto = computed(() => {
  const d = Number(dosis.value)
  const a = Number(agua.value)
  if (!(d > 0) || !(a > 0)) return null
  return a / d
})

/**
 * Lo que tendría que valer el campo que **no** estás tocando para volver al
 * ratio de la receta.
 *
 * Ninguno de los dos campos mueve al otro por su cuenta: se propone y decides
 * tú. Que un número cambie solo porque tocaste otro es lo que hace que uno
 * deje de fiarse de la pantalla.
 */
/*
 * Arranca en `dosis` para que lo primero que se proponga sea el agua. Sin
 * haber tocado nada, «el campo que no estás tocando» no existe, y había que
 * elegir uno: el agua se echa y la dosis se pesa antes de moler, así que
 * proponer mover la dosis nada más entrar es proponer volver a la báscula.
 */
const ultimoTocado = ref<'dosis' | 'agua'>('dosis')

const propuesta = computed(() => {
  const r = ratioReceta.value
  if (!r || !ratioPuesto.value) return null
  if (ultimoTocado.value === 'dosis') {
    const aguaIdeal = Math.round(dosis.value * r)
    return aguaIdeal === agua.value ? null : { campo: 'agua' as const, valor: aguaIdeal }
  }
  const dosisIdeal = Math.round((agua.value / r) * 10) / 10
  return dosisIdeal === dosis.value ? null : { campo: 'dosis' as const, valor: dosisIdeal }
})

function aplicarPropuesta() {
  const p = propuesta.value
  if (!p) return
  if (p.campo === 'agua') agua.value = p.valor
  else dosis.value = p.valor
}

/**
 * Cuánto puede desviarse el ratio antes de decir nada. Por debajo es
 * redondeo y ruido de báscula, y un aviso que salta siempre se deja de leer.
 */
const DESVIO_RATIO = 0.3

const ratioDesviado = computed(() =>
  ratioReceta.value !== null && ratioPuesto.value !== null
  && Math.abs(ratioPuesto.value - ratioReceta.value) >= DESVIO_RATIO,
)

const unDecimal = (n: number) => Math.round(n * 10) / 10

// --- de dónde parte esta taza ---------------------------------------------

/**
 * Contra qué extracción se va a medir ésta. Por defecto la última de la
 * bolsa, que es lo que hace el servidor solo; se elige otra al volver a una
 * rama anterior tras un callejón sin salida.
 *
 * Se decide aquí y no en el alta porque es una decisión de **antes** de
 * preparar: «hoy vuelvo a la de 91 grados» se piensa con el molinillo en la
 * mano, no veinte minutos después con la taza delante.
 */
const madre = computed({
  get: () => desdeId.value || (ultimaDeLaBolsa.value?.id ?? ''),
  /*
   * Elegir la última **es** el valor por defecto, así que se guarda vacío.
   * Con el uuid puesto, la taza quedaba clavada a esa fila: si mientras
   * tanto registrabas otra —desde el móvil, o a mano—, la nueva colgaba de
   * la penúltima. Y guardado así, `desdeId` con valor significa siempre «he
   * vuelto atrás», que es lo que miran las dos salidas de esta pantalla.
   */
  set: (id: string) => {
    desdeId.value = id === ultimaDeLaBolsa.value?.id ? '' : id
  },
})

/** Se vuelve a una anterior: el aviso de que eso cambia contra qué se mide. */
const vuelveAtras = computed(() => Boolean(desdeId.value))

// Cambiar de bolsa suelta la madre: nunca sale de la bolsa.
watch(cafeId, () => { desdeId.value = '' })

/*
 * Y si la madre elegida desaparece —se retira desde otro dispositivo—, se
 * suelta también. Si no, seguía viajando al alta un uuid que ya no está en
 * la lista: el desplegable en blanco, el banner sin sugerencia y nada en
 * pantalla que dijera contra qué se iba a medir la taza.
 */
watchEffect(() => {
  if (!desdeId.value || !historial.value) return
  if (!deLaBolsa.value.some((e) => e.id === desdeId.value)) desdeId.value = ''
})

/** La extracción de la que se parte, ya resuelta. */
const partida = computed(() =>
  deLaBolsa.value.find((e) => e.id === madre.value) ?? null,
)

/**
 * Lo que el motor propuso al registrar esa taza. Es la mitad del valor de
 * llevar la bitácora y estaba escrito en una ficha que nadie vuelve a abrir:
 * aquí llega justo cuando sirve para algo, que es antes de moler.
 */
const sugerencia = computed(() => partida.value?.siguiente_ajuste ?? '')

/**
 * Lleva al reloj, pero parado: se arranca al verter, no al llegar. Entre una
 * cosa y otra hay que coger el hervidor.
 */
async function alCronometro() {
  if (!pasos.value.length) await cargar()
  await router.push(localePath('/crono/reloj'))
}

const dialogo = ref<HTMLDialogElement | null>(null)

/**
 * Restablecer se lleva por delante la medición si la hay, y eso no se puede
 * repetir: el café ya está colado. Con el formulario limpio no hay nada que
 * perder y preguntar sería ceremonia.
 */
function pedirRestablecer() {
  if (hayMedicion.value) dialogo.value?.showModal()
  else restablecer()
}

function restablecer() {
  dialogo.value?.close()
  olvidarTodo()
  // La primera de la ordenada, como la corrección automática: la de ayer.
  cafeId.value = bolsasOrdenadas.value[0]?.id ?? ''
  const base = (catalogo.value ?? []).find((r) => r.slug === 'kasuya-46-base')
  recetaId.value = base?.id ?? catalogo.value?.[0]?.id ?? ''
  void cargar()
}

/**
 * Al alta sin pasar por el reloj, con lo elegido aquí ya puesto. Sin tiempo
 * ni goteo: no se han medido, y ponerlos a cero sería peor que dejarlos.
 */
function aMano() {
  router.push({
    path: localePath('/nueva'),
    query: {
      cafe: cafeId.value,
      receta: recetaId.value,
      dosis: String(dosis.value),
      agua: String(agua.value),
      // `desdeId` con valor significa «he vuelto atrás», y vacío «la última»,
      // que es lo que el servidor hace solo. Mismo criterio que el reloj.
      ...(desdeId.value ? { desde: desdeId.value } : {}),
    },
  })
}
</script>

<template>
  <Migas :ruta="[{ texto: $t('preparar.titulo') }]" />

  <section>
    <div class="titulo">
      <h2>{{ $t('preparar.titulo') }}</h2>
      <!-- La selección y las cantidades se quedan puestas entre visitas; esto
           las devuelve a las de siempre cuando lo que hay es un despiste. -->
      <button type="button" class="vaciar" @click="pedirRestablecer">{{ $t('comun.restablecer') }}</button>
    </div>

    <!-- Con el reloj a medias, la vuelta tiene que estar a la vista: si no, la
         única forma de volver a una medición en marcha era el botón de atrás
         del navegador, que es justo lo que esta ruta vino a arreglar. -->
    <p v-if="hayMedicion" class="enmarcha">
      {{ $t('preparar.medicion_a_medias') }}
      <NuxtLinkLocale to="/crono/reloj">{{ $t('preparar.vuelve_al_reloj') }}</NuxtLinkLocale>.
    </p>

    <!-- Sin bolsa se puede cronometrar y también registrar: la extracción
         queda suelta. El aviso ofrece el alta porque sin ficha no hay
         historial que comparar, no porque haga falta. -->
    <p v-if="!abiertas.length" class="sin-bolsas">
      {{ $t('preparar.sin_bolsas') }}
      <NuxtLinkLocale to="/cafes/nueva">{{ $t('preparar.dala_de_alta') }}</NuxtLinkLocale>
      {{ $t('preparar.si_lo_merece') }}
    </p>
    <!-- Ordenadas por la última usada: lo que uno busca al abrir esto es casi
         siempre el café de ayer. -->
    <label v-else>
      {{ $t('preparar.cafe') }}
      <select v-model="cafeId" @change="alElegirBolsa">
        <option v-for="c in bolsasOrdenadas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>

    <!-- Lo que el motor propuso en la taza de la que se parte. Aquí sirve
         para algo: aún estás a tiempo de moler distinto. -->
    <p v-if="sugerencia" class="sugerido">
      <span class="etiqueta">{{ $t('preparar.sugerido') }}</span>
      <strong>{{ sugerencia }}</strong>
    </p>

    <!-- De qué taza se parte. Solo con más de una en la bolsa: con una sola no
         hay nada que elegir. -->
    <details v-if="deLaBolsa.length > 1" class="rama" :open="vuelveAtras">
      <summary>{{ $t('preparar.partir_de') }}</summary>
      <label>
        {{ $t('preparar.variacion_de') }}
        <select v-model="madre">
          <option v-for="e in deLaBolsa" :key="e.id" :value="e.id">
            {{ $t('preparar.opcion_madre', {
              fecha: fechaCorta(e.fecha), temp: e.temp_c, clics: e.clics,
            }) }}{{ e.nota ? $t('preparar.opcion_nota', { n: e.nota }) : '' }}
          </option>
        </select>
      </label>
    </details>

    <!-- Fuera del plegable a propósito: es el único sitio que dice contra qué
         se va a medir esta taza, y dentro no se veía nunca —el desplegable
         nace cerrado—. Con el aviso a la vista, el plegable se abre solo. -->
    <p v-if="vuelveAtras" class="ojo">{{ $t('preparar.vuelves_atras') }}</p>

    <!-- Este sí corta: sin receta no hay guion que seguir. -->
    <p v-if="sinRecetas" class="sin-recetas">
      {{ $t('preparar.sin_recetas') }}
      <NuxtLinkLocale :to="`/recetas/${$t('rutas.nueva')}`">{{ $t('preparar.crea_una') }}</NuxtLinkLocale>
      {{ $t('preparar.para_seguir') }}
    </p>
    <label v-else>
      {{ $t('preparar.receta') }}
      <select v-model="recetaId">
        <option v-for="r in recetasOrdenadas" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </label>

    <div class="pareja">
      <label>{{ $t('preparar.dosis') }}<input
        v-model.number="dosis" type="number" step="0.1" min="1"
        @input="ultimoTocado = 'dosis'"></label>
      <label>{{ $t('preparar.agua') }}<input
        v-model.number="agua" type="number" step="1" min="1"
        @input="ultimoTocado = 'agua'"></label>
    </div>

    <!-- El cálculo hecho, no aplicado: ninguno de los dos campos mueve al
         otro por su cuenta. Es un botón y se ve que lo es, porque proponer
         algo que no se puede aceptar de un toque es una calculadora de
         mostrador. -->
    <p v-if="propuesta" class="cuadre">
      <button type="button" class="chip" @click="aplicarPropuesta">
        {{ propuesta.campo === 'agua'
          ? $t('preparar.cuadrar_agua', { n: propuesta.valor, ratio: unDecimal(ratioReceta!) })
          : $t('preparar.cuadrar_dosis', { n: propuesta.valor, ratio: unDecimal(ratioReceta!) }) }}
      </button>
    </p>

    <!-- Y el aviso, aparte y sin regañar: desviarse del ratio es una decisión
         legítima —más cuerpo, menos cuerpo—, y el 4:6 no se rompe por ello:
         el reparto escala al agua real. Lo que cambia es la taza. -->
    <p v-if="ratioDesviado" class="ojo">
      {{ $t('preparar.ratio_desviado', {
        receta: unDecimal(ratioReceta!), puesto: unDecimal(ratioPuesto!),
      }) }}
    </p>

    <ol class="plan">
      <li v-for="p in pasos" :key="p.orden">
        <span class="t">{{ p.t_inicio_s === null ? '—' : relojDe(p.t_inicio_s) }}</span>
        <span class="que">{{ etiquetaPaso(p.accion, p.estilo) }}</span>
        <span v-if="p.accion === 'verter'" class="ag">{{ $t('preparar.hasta', { n: p.acumulado_g }) }}</span>
      </li>
    </ol>

    <!-- Las dos salidas juntas y al final: hasta aquí se llega con lo mismo
         delante —café, receta, dosis y agua—, y solo mirando el guion se sabe
         si toca cronometrar o si el café ya está hecho y solo vienes a
         apuntarlo. -->
    <button :disabled="sinRecetas" @click="alCronometro">{{ $t('preparar.al_cronometro') }}</button>
    <button class="secundario" @click="aMano">{{ $t('preparar.a_mano') }}</button>
  </section>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>{{ $t('preparar.restablecer_titulo') }}</h3>
    <p class="ojo">{{ $t('preparar.restablecer_ojo') }}</p>
    <i18n-t keypath="preparar.restablecer_alternativa" tag="p" scope="global">
      <template #vuelve>
        <NuxtLinkLocale to="/crono/reloj">{{ $t('preparar.restablecer_vuelve') }}</NuxtLinkLocale>
      </template>
    </i18n-t>
    <div class="botones">
      <button type="button" class="secundario" @click="dialogo?.close()">{{ $t('comun.cancelar') }}</button>
      <button type="button" class="peligro" @click="restablecer">{{ $t('comun.restablecer') }}</button>
    </div>
  </dialog>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }

.titulo { display: flex; justify-content: space-between; align-items: baseline; }

/* Un botón que parece lo que es: texto pequeño, sin peso. Vacía estado, no
   datos, así que no hace falta ceremonia. */
.vaciar {
  font: inherit;
  font-size: 0.8rem;
  color: var(--suave);
  background: none;
  border: 0;
  padding: 0.25rem 0;
  margin: 0;
  width: auto;
  min-height: 0;
  cursor: pointer;
  text-decoration: underline;
}

.vaciar:hover { color: var(--acento); }

/* Lo que dijo el motor la última vez. Con el color del acento y no en gris:
   es lo único de esta pantalla que viene de haber medido. */
.sugerido {
  background: var(--tarjeta);
  border: 1px solid var(--acento);
  border-radius: 0.5rem;
  padding: 0.55rem 0.7rem;
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
  color: var(--tinta);
}

.sugerido .etiqueta {
  display: block;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--suave);
}

/* Plegado: volver a una rama anterior es la excepción, no el día a día. */
.rama { margin-top: 0.5rem; }

.rama summary {
  font-size: 0.85rem;
  color: var(--suave);
  cursor: pointer;
  padding: 0.35rem 0;
}

.rama summary:hover { color: var(--acento); }
.rama label { margin-top: 0.35rem; }

.cuadre { margin: 0.15rem 0 0; }

/* Un botón con cara de botón: si la propuesta no se puede aceptar de un
   toque, es una calculadora y no una ayuda. */
.chip {
  font: inherit;
  font-size: 0.82rem;
  color: var(--acento);
  background: transparent;
  border: 1px dashed var(--acento);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  width: auto;
  min-height: 0;
  margin: 0;
  cursor: pointer;
}

.chip:hover { background: color-mix(in srgb, var(--acento) 10%, transparent); }

/* Fuera del diálogo también hacen falta: el aviso del ratio y la nota de la
   rama viven en la sección, y ahí `.ojo` no estaba definida. */
.ojo { color: var(--peligro); font-size: 0.85rem; margin: 0.4rem 0 0; }
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.4rem 0 0; }

.sin-bolsas, .sin-recetas { font-size: 0.9rem; margin: 0 0 1rem; }
.sin-bolsas { color: var(--suave); }
/* El de recetas para en seco, y el color lo dice antes que el texto. */
.sin-recetas { color: var(--peligro); }
.sin-bolsas a, .sin-recetas a { color: var(--acento); }

/* Ni aviso ni error: es un camino de vuelta, y por eso lleva el acento. */
.enmarcha {
  background: var(--tarjeta);
  border: 1px solid var(--acento);
  border-radius: 0.5rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.85rem;
  color: var(--acento);
  margin: 0 0 0.75rem;
}

button:disabled { opacity: 0.5; cursor: default; }

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
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }
dialog .ojo { color: var(--peligro); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.peligro { background: var(--peligro); color: var(--sobre-peligro); }

a { color: var(--acento); }
</style>
