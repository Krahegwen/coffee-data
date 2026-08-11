<script setup lang="ts">
// Navegar por ruta pasa por aquí: desde el inglés, `/crono` llevaría al
// castellano y se perdería el idioma a mitad de camino.
const localePath = useLocalePath()

import type { Extraccion } from '~/composables/useApi'
import { textoDeVariables } from '@coffee/nucleo/sugerencias'
import { defectosDe } from '@coffee/nucleo/validacion'
const { t } = useI18n()
const { DRIPPERS, VARIABLES, fechaCorta, nombreCafe, textoDeCambios } = useTextos()

const { cafes, recetas, extracciones, retiradas, editarExtraccion, retirarExtraccion } = useApi()
const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const { data: historial } = await useAsyncData(`ext-${id}`, () => extracciones())
const { data: bolsas } = await useAsyncData('cafes-ext', cafes)
const { data: catalogo } = await useAsyncData('recetas-ext', recetas)
// La papelera hace falta para una sola cosa: que el desplegable de la madre
// pueda representar su propio valor si la madre se retiró después de elegirla.
const { data: papelera } = await useAsyncData(`ext-papelera-${id}`, retiradas)

const original = computed(() => (historial.value ?? []).find((e) => e.id === id) ?? null)

/** «Gary · 6 ago» — o «Sin bolsa · 6 ago» si la taza se apuntó suelta. */
const titulo = computed(() =>
  original.value
    ? `${nombreCafe(original.value.cafe_nombre)} · ${fechaCorta(original.value.fecha)}`
    : t('extraccion.titulo'),
)

useHead({ title: () => titulo.value })

const clave = (e: Extraccion) => `${e.creado_en}|${e.id}`

/**
 * De qué extracción puede ser variación ésta: las de su bolsa **anteriores a
 * ella**, de la más nueva a la más vieja. No vale cualquiera: nadie es
 * variación de algo que se hizo después, y el servidor lo rechaza.
 *
 * Se cuela además la madre que ya tenga aunque esté retirada, marcada como
 * tal. Si no, al abrir una ficha cuya madre se retiró después, el desplegable
 * no podría representar su propio valor y lo cambiaría solo al guardar. La
 * regla vale para todos los desplegables de la app: **uno nunca debe poder
 * perder el valor que ya tiene**.
 */
const candidatas = computed(() => {
  const mia = original.value
  if (!mia || !mia.cafe_id) return []
  const vivas = (historial.value ?? [])
    .filter((e) => e.cafe_id === mia.cafe_id && clave(e) < clave(mia))
  const puesta = (papelera.value ?? []).find((e) => e.id === mia.desde_id)
  return [...vivas, ...(puesta ? [puesta] : [])]
    .sort((a, b) => (clave(a) < clave(b) ? 1 : -1))
})

const cambiadas = ref<string[]>([])

const opciones = computed(() => ({
  receta_id: (catalogo.value ?? []).map((r) => ({ valor: r.id, etiqueta: r.nombre })),
  dripper: Object.entries(DRIPPERS.value).map(([valor, etiqueta]) => ({ valor, etiqueta })),
}))

const EDITABLES = [
  'fecha', 'cafe_id', 'desde_id', 'dosis_g', 'agua_g', 'temp_c', 'clics',
  'receta_id', 'reparto', 'dripper', 'tiempo_total', 'drawdown_s', 'extraido_g',
  'variable_cambiada', 'defecto', 'notas_cata', 'nota', 'siguiente_ajuste',
] as const

const form = reactive<Record<string, any>>({})

/**
 * La madre: contra ella se miden los deltas y de ella sale «Temperatura 91 →
 * 88». La del formulario mientras se edita, que es la que se va a guardar.
 *
 * Una taza suelta no tiene madre: las demás sueltas comparten el `cafe_id`
 * vacío, pero cada una es un café distinto.
 */
const anterior = computed(() =>
  form.desde_id ? candidatas.value.find((e) => e.id === form.desde_id) ?? null : null,
)

/** Las que cuelgan de ésta: lo que se queda sin madre si se retira. */
const hijas = computed(() => (historial.value ?? []).filter((e) => e.desde_id === id))
const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref<string[] | null>(null)
const avisos = ref<string[]>([])
const dialogo = ref<HTMLDialogElement | null>(null)
const retirando = ref(false)

watchEffect(() => {
  if (!original.value) return
  for (const campo of EDITABLES) form[campo] = (original.value as Extraccion)[campo] ?? ''
})

// El tiempo total y el goteo son la misma marca vista desde dos sitios, así
// que tocar uno mueve el otro. Corregir aquí uno solo es cómo se rompió la
// fila del 2026-08-07.
const { movido, anotar, desdeElTiempo, desdeElGoteo } = useAtadura(form)

// Mudar la taza de bolsa se lleva su madre por delante: era de la bolsa vieja,
// y la madre nunca sale de la bolsa. El servidor hace lo mismo; esto es para
// que el formulario no enseñe un valor que va a perder.
watch(() => form.cafe_id, (ahora, antes) => {
  if (antes !== undefined && ahora !== antes) form.desde_id = ''
})

/**
 * Lo que de verdad cambió respecto a la anterior, mirando las columnas.
 *
 * No se lee del texto guardado: el texto es una etiqueta y las columnas son el
 * dato. Si alguna vez discrepan, mandan las columnas.
 */
const derivadas = computed(() => {
  if (!anterior.value || !original.value) return []
  const antes = anterior.value as Record<string, unknown>
  const ahora = original.value as unknown as Record<string, unknown>
  return Object.keys(VARIABLES.value).filter(
    (c) => String(antes[c] ?? '') !== String(ahora[c] ?? ''),
  )
})

// La tabla sale puesta al abrir la ficha, y sale de ahí. Sembrar una sola vez:
// a partir de entonces la lista es del usuario y lo que quite no debe volver.
let sembrada = false
watchEffect(() => {
  if (sembrada || !original.value) return
  cambiadas.value = derivadas.value
  sembrada = true
})

/**
 * La bolsa recién creada vuelve elegida: el alta reenvía aquí con `?bolsa=`
 * al llegar desde el enlace de abajo. Pisa el formulario una vez y solo si
 * la bolsa existe de verdad; guardar sigue siendo cosa tuya.
 */
const bolsaRecien = String(route.query.bolsa ?? '')
let bolsaPuesta = false
watchEffect(() => {
  if (bolsaPuesta || !bolsaRecien || !original.value) return
  if (!(bolsas.value ?? []).some((c) => c.id === bolsaRecien)) return
  bolsaPuesta = true
  form.cafe_id = bolsaRecien
})

// Tocar un campo de arriba crea su fila si el valor se aleja de la anterior.
useTablaAlDia(form, () => anterior.value as unknown as Record<string, unknown> | null, cambiadas)

/** Has metido mano en la tabla, acabe donde acabe. Lo dice el componente. */
const manoseada = ref(false)

/**
 * La etiqueta que describe la tabla de ahora mismo. Null si no hay tabla.
 *
 * En el formato canónico del núcleo —columna y slug—, que es el que escribe
 * el servidor: componiéndolo aquí con etiquetas traducidas, ninguna fila
 * rellenada por el servidor coincidía nunca con su propia tabla y la ficha se
 * abría con «Guardar cambios» puesto sin que nadie hubiera tocado nada.
 */
const compuesta = computed(() =>
  cambiadas.value.length
    ? textoDeVariables(cambiadas.value, anterior.value, {
      ...form,
      receta_slug: (catalogo.value ?? []).find((r) => r.id === form.receta_id)?.slug ?? null,
    })
    : null,
)

/**
 * Cuándo hay que reescribir la etiqueta. Tres motivos, y los tres hacen falta:
 *
 * - has tocado la tabla, aunque la dejes como estaba: añadir una fila y
 *   quitarla te devuelve al mismo sitio, pero la etiqueta guardada puede seguir
 *   diciendo otra cosa;
 * - has cambiado el valor de una variable, aunque sea desde su campo de
 *   siempre y no desde la tabla;
 * - la etiqueta guardada no cuadra con la tabla. Pasa con fichas viejas o si se
 *   corrigió una columna sin tocarla, y si no contara no habría forma de
 *   arreglarlas: el botón se quedaba en «Sin cambios» para siempre.
 */
const tocada = computed(() => {
  if (!original.value) return false
  if (manoseada.value) return true
  const fila = original.value as unknown as Record<string, unknown>
  if (Object.keys(VARIABLES.value).some((c) => String(form[c] ?? '') !== String(fila[c] ?? ''))) {
    return true
  }
  return compuesta.value !== null && compuesta.value !== String(form.variable_cambiada ?? '')
})

/**
 * El texto que se guardará. Se compone al vuelo, y nada lo reescribe mientras
 * editas: eso era lo que hacía que añadir una fila truncase la etiqueta de una
 * ficha que tenía dos variables.
 */
const textoVariables = computed(() =>
  tocada.value && compuesta.value !== null
    ? compuesta.value
    : String(form.variable_cambiada ?? ''),
)

/**
 * Los defectos como lista, sobre la misma cadena que guarda la fila. Igual que
 * en el alta: la columna sigue siendo un texto y la lista es una vista de él,
 * así que `cambios` compara lo de siempre y no hace falta tocarlo.
 */
const defectos = computed({
  get: () => defectosDe(form.defecto),
  set: (lista: string[]) => { form.defecto = lista.join(',') },
})

const cambios = computed(() => {
  if (!original.value) return {}
  const salida: Record<string, unknown> = {}
  for (const campo of EDITABLES) {
    const antes = (original.value as Extraccion)[campo] ?? ''
    // La etiqueta sale de la tabla, no de un campo que se teclee.
    const ahora = campo === 'variable_cambiada' ? textoVariables.value : form[campo] ?? ''
    if (String(antes) !== String(ahora)) salida[campo] = ahora === '' ? null : ahora
  }
  return salida
})

const hayCambios = computed(() => Object.keys(cambios.value).length > 0)

async function guardar() {
  errores.value = []
  guardado.value = null
  avisos.value = []
  enviando.value = true
  try {
    const r = await editarExtraccion(id, cambios.value)
    guardado.value = r.cambiado
    avisos.value = r.avisos
    /*
     * Lista nueva y no el hueco de siempre: `useAsyncData` devuelve un
     * shallowRef, así que cambiar un elemento por su índice no despierta a
     * nadie. La ficha se quedaba comparándose contra la versión de antes de
     * guardar y el botón no volvía a «Sin cambios» ni aunque estuviera todo
     * escrito ya en la base.
     */
    if (historial.value) {
      historial.value = historial.value.map((e) => (e.id === id ? r.extraccion : e))
    }
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}

async function retirar() {
  retirando.value = true
  errores.value = []
  try {
    await retirarExtraccion(id)
    dialogo.value?.close()
    await router.push(localePath('/'))
  } catch (fallo) {
    errores.value = erroresDe(fallo)
    dialogo.value?.close()
  } finally {
    retirando.value = false
  }
}
</script>

<template>
  <Migas :ruta="[{ texto: titulo }]" />

  <p v-if="!original" class="meta">{{ $t('extraccion.no_existe') }}</p>

  <template v-else>
    <form @submit.prevent="guardar">
      <!-- El uuid no se enseña: el café y el día ya identifican la taza. -->
      <h2>{{ titulo }}<template v-if="original.tiempo_total"> · {{ original.tiempo_total }}</template></h2>

      <!-- «Sin bolsa» suelta la extracción de su ficha; elegir una la ata.
           Vaciar aquí es corregir, no borrar: la taza se queda. -->
      <label>
        {{ $t('alta.cafe') }}
        <select v-model="form.cafe_id">
          <option value="">{{ $t('comun.sin_bolsa') }}</option>
          <option v-for="c in bolsas ?? []" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </label>

      <!-- De qué extracción es variación ésta: contra ella se miden los
           deltas. Solo si hay alguna anterior en su bolsa de la que serlo. -->
      <label v-if="candidatas.length">
        {{ $t('alta.variacion_de') }}
        <select v-model="form.desde_id">
          <option value="">{{ $t('extraccion.madre_ninguna') }}</option>
          <option v-for="e in candidatas" :key="e.id" :value="e.id">
            {{ $t('alta.opcion_madre', {
              fecha: fechaCorta(e.fecha), temp: e.temp_c, clics: e.clics,
            }) }}{{ e.nota ? $t('alta.opcion_nota', { n: e.nota }) : ''
            }}{{ e.borrada_en ? $t('extraccion.opcion_retirada') : '' }}
          </option>
        </select>
      </label>
      <!-- El camino de vuelta lo pone ?volver=: el alta reenvía aquí con la
           bolsa nueva ya elegida, y atarla es solo guardar. -->
      <i18n-t keypath="extraccion.bolsa_no_existe" tag="p" class="meta" scope="global">
        <template #enlace>
          <NuxtLinkLocale :to="{ path: '/cafes/nueva', query: { volver: `/extracciones/${id}` } }">
            {{ $t('extraccion.bolsa_dala_de_alta') }}
          </NuxtLinkLocale>
        </template>
      </i18n-t>

      <div class="pareja">
        <label>{{ $t('extraccion.fecha') }}<input v-model="form.fecha" type="date"></label>
        <!-- Atado al goteo, que va por dentro: ver `useAtadura`. -->
        <label>{{ $t('alta.tiempo_total') }}<input
          v-model="form.tiempo_total" placeholder="3:30"
          @focus="anotar" @change="desdeElTiempo"></label>
      </div>

      <div class="pareja">
        <label>{{ $t('alta.dosis') }}<input
          v-model="form.dosis_g" type="number" step="0.1" min="1" inputmode="decimal"></label>
        <label>{{ $t('alta.agua') }}<input
          v-model="form.agua_g" type="number" step="1" min="1" inputmode="numeric"></label>
      </div>

      <div class="pareja">
        <label>{{ $t('alta.temp') }}<input
          v-model="form.temp_c" type="number" step="1" min="0" max="100" inputmode="numeric"></label>
        <label>{{ $t('alta.clics') }}<input
          v-model="form.clics" type="number" step="1" min="0" inputmode="numeric"></label>
      </div>

      <div class="pareja">
        <label>
          {{ $t('alta.receta') }}
          <select v-model="form.receta_id">
            <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
          </select>
        </label>
        <label>{{ $t('alta.goteo') }}<input
          v-model="form.drawdown_s" type="number" step="1" min="0" inputmode="numeric"
          @focus="anotar" @change="desdeElGoteo"></label>
      </div>
      <p v-if="movido" class="meta">
        {{ movido === 'goteo' ? $t('alta.movido_goteo') : $t('alta.movido_tiempo') }}
      </p>

      <div class="pareja">
        <label>
          {{ $t('alta.dripper') }}
          <select v-model="form.dripper">
            <option v-for="(etiqueta, clave) in DRIPPERS" :key="clave" :value="clave">
              {{ etiqueta }}
            </option>
          </select>
        </label>
        <label>{{ $t('alta.en_la_taza') }}<input
          v-model="form.extraido_g" type="number" step="1" min="1" inputmode="numeric"></label>
      </div>

      <label>{{ $t('extraccion.reparto') }}<input
        v-model="form.reparto" placeholder="60-60-90-90"></label>

      <h3 class="apartado">{{ $t('alta.variables_titulo') }}</h3>
      <VariablesCambiadas
        v-model="cambiadas" :valores="form" :anterior="anterior" :opciones="opciones"
        @cambia="(clave, valor) => (form[clave] = valor)"
        @toca="manoseada = true"
      />
      <!-- Sin campo de texto: lo que se guarda sale de la tabla. Cuando no hay
           nada que tabular —la primera de una bolsa, o un cambio que no es una
           columna— se enseña lo que quedó escrito, para leerlo y no para
           teclearlo. -->
      <p v-if="!cambiadas.length && form.variable_cambiada" class="guardado">
        {{ $t('extraccion.anotado_como', { texto: form.variable_cambiada }) }}
      </p>

      <!-- Varios, en orden de relevancia: el ajuste sale solo del primero. -->
      <h3 class="apartado">{{ $t('alta.defectos_titulo') }}</h3>
      <DefectosElegidos v-model="defectos" />

      <label>
        {{ $t('alta.nota') }} <strong>{{ form.nota }}</strong>
        <input v-model.number="form.nota" type="range" min="1" max="10" step="1">
      </label>

      <label>{{ $t('alta.notas_cata') }}<textarea v-model="form.notas_cata" rows="2" /></label>
      <label>{{ $t('extraccion.siguiente_ajuste') }}<input v-model="form.siguiente_ajuste"></label>

      <button type="submit" :disabled="enviando || !hayCambios">
        {{ enviando ? $t('comun.guardando')
          : hayCambios ? $t('bolsa.guardar_cambios') : $t('comun.sin_cambios') }}
      </button>

      <button type="button" class="retirar" @click="dialogo?.showModal()">
        {{ $t('extraccion.retirar') }}
      </button>
    </form>
  </template>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>{{ $t('extraccion.retirar_titulo') }}</h3>
    <p>{{ $t('extraccion.retirar_que_pasa') }}</p>
    <i18n-t keypath="extraccion.retirar_ojo" tag="p" class="ojo" scope="global">
      <template #errores><strong>{{ $t('extraccion.retirar_ojo_enfasis') }}</strong></template>
    </i18n-t>
    <!-- Blando y no un 409 como el de las recetas en uso: esto se deshace, y
         restaurarla devuelve los pares sola. -->
    <p v-if="hijas.length" class="ojo">
      {{ hijas.length === 1
        ? $t('extraccion.hijas_una', { n: hijas.length })
        : $t('extraccion.hijas_varias', { n: hijas.length }) }}
    </p>
    <div class="botones">
      <button type="button" class="secundario" @click="dialogo?.close()">{{ $t('comun.cancelar') }}</button>
      <button type="button" class="peligro" :disabled="retirando" @click="retirar">
        {{ retirando ? $t('extraccion.retirando') : $t('extraccion.retirar_corto') }}
      </button>
    </div>
  </dialog>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>{{ $t('comun.no_guardado') }}</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="guardado" class="tarjeta exito">
    <strong>{{ $t('comun.guardado') }}</strong>
    <p class="meta">{{ $t('extraccion.cambiado', { lista: guardado.join(', ') }) }}</p>
    <!-- Los mismos avisos que al registrar: corregir un campo puede dejar la
         fila diciendo algo que no se sostiene, y eso se ve aquí o no se ve. -->
    <p v-for="a in avisos" :key="a" class="aviso">⚠ {{ a }}</p>
  </section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.9rem; }

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
  font-size: 16px;
  color: var(--tinta);
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  padding: 0.6rem 0.65rem;
  min-width: 0;
}

input[type="range"] { padding: 0; accent-color: var(--acento); }

button {
  font: inherit;
  font-weight: 600;
  color: var(--sobre-acento);
  background: var(--acento);
  border: 0;
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
  min-height: 3rem;
  cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: default; }

.retirar {
  background: transparent;
  color: var(--peligro);
  border: 1px solid var(--peligro);
  font-weight: 400;
  min-height: 2.75rem;
}

dialog {
  border: 1px solid var(--linea);
  border-radius: 0.8rem;
  background: var(--tarjeta);
  color: var(--tinta);
  padding: 1.25rem;
  /*
   * Con % y no con 100vw: en el móvil vw no siempre mide lo que se ve —la
   * barra de direcciones y el zoom lo mueven— y el modal se salía a lo
   * ancho. El % sale del viewport contra el que se posiciona el modal.
   */
  max-width: min(28rem, calc(100% - 2rem));
  margin: auto;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
/*
 * El del formulario, no el del modal, que es un título de verdad. Del tamaño
 * y el color de una etiqueta: encabeza un bloque de campos, no una sección.
 */
.apartado {
  font: inherit;
  font-size: 0.82rem;
  font-weight: 400;
  color: var(--suave);
  margin: 0.5rem 0 0;
}

/* Lo escribe la lista de arriba: se enseña, no se teclea. */
input[readonly] { color: var(--suave); background: transparent; }

.guardado { color: var(--suave); font-size: 0.82rem; margin: 0; }

dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }
dialog .ojo { color: var(--peligro); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.secundario { background: transparent; color: var(--suave); border: 1px solid var(--linea); font-weight: 400; }
.peligro { background: var(--peligro); color: var(--sobre-peligro); }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
}

.tarjeta input { width: 100%; margin: 0.5rem 0; }
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.fallo { color: var(--peligro); font-size: 0.85rem; }
.errores { border-color: var(--peligro); }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
.aviso { font-size: 0.85rem; margin: 0.5rem 0; }
a { color: var(--acento); }
</style>
