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
const { etiquetaPaso } = useTextos()
const localePath = useLocalePath()

useHead({ title: () => t('preparar.titulo') })

const { cafes, recetas, guion } = useApi()
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

const { cafeId, recetaId, dosis, agua, pasos } = toRefs(estado.value)

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
  if (!abiertas.value.some((c) => c.id === cafeId.value)) cafeId.value = abiertas.value[0]!.id
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
  cafeId.value = abiertas.value[0]?.id ?? ''
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
    <label v-else>
      {{ $t('preparar.cafe') }}
      <select v-model="cafeId">
        <option v-for="c in abiertas" :key="c.id" :value="c.id">{{ c.nombre }}</option>
      </select>
    </label>

    <!-- Este sí corta: sin receta no hay guion que seguir. -->
    <p v-if="sinRecetas" class="sin-recetas">
      {{ $t('preparar.sin_recetas') }}
      <NuxtLinkLocale :to="`/recetas/${$t('rutas.nueva')}`">{{ $t('preparar.crea_una') }}</NuxtLinkLocale>
      {{ $t('preparar.para_seguir') }}
    </p>
    <label v-else>
      {{ $t('preparar.receta') }}
      <select v-model="recetaId">
        <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
      </select>
    </label>
    <div class="pareja">
      <label>{{ $t('preparar.dosis') }}<input v-model.number="dosis" type="number" step="0.1" min="1"></label>
      <label>{{ $t('preparar.agua') }}<input v-model.number="agua" type="number" step="1" min="1"></label>
    </div>

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

.sin-bolsas, .sin-recetas { font-size: 0.9rem; margin: 0 0 1rem; }
.sin-bolsas { color: var(--suave); }
/* El de recetas para en seco, y el color lo dice antes que el texto. */
.sin-recetas { color: #c2410c; }
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
dialog .ojo { color: #c2410c; }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.peligro { background: #c2410c; }

a { color: var(--acento); }
</style>
