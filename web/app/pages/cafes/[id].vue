<script setup lang="ts">
import type { Cafe } from '~/composables/useApi'

const { cafes, editarCafe, subirFotoCafe, quitarFotoCafe, urlFoto } = useApi()
const route = useRoute()
const id = String(route.params.id)

const { data: bolsas } = await useAsyncData(`cafe-${id}`, cafes)
// La URL lleva el slug; los enlaces viejos con uuid también resuelven.
const original = computed(
  () => (bolsas.value ?? []).find((c) => c.slug === id || c.id === id) ?? null,
)

useHead({ title: () => original.value?.nombre ?? 'Bolsa' })

const form = reactive<Record<string, any>>({})
const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref<string[] | null>(null)

// Los null de la API pasan a cadena vacía: un input no sabe qué hacer con null.
const EDITABLES = [
  'nombre', 'tostador', 'origen', 'region', 'variedad', 'proceso', 'altitud_m',
  'sca', 'fecha_tueste', 'consumir_antes', 'peso_g', 'precio_eur',
  'notas_tostador', 'estado', 'fecha_apertura', 'url',
  'conservacion',
] as const

watchEffect(() => {
  if (!original.value) return
  for (const campo of EDITABLES) {
    form[campo] = (original.value as Cafe)[campo] ?? ''
  }
})

/** Solo lo que de verdad cambió: así el PATCH dice la verdad de lo tocado. */
const cambios = computed(() => {
  if (!original.value) return {}
  const salida: Record<string, unknown> = {}
  for (const campo of EDITABLES) {
    const antes = (original.value as Cafe)[campo] ?? ''
    const ahora = form[campo] ?? ''
    if (String(antes) !== String(ahora)) salida[campo] = ahora === '' ? null : ahora
  }
  return salida
})

const hayCambios = computed(() => Object.keys(cambios.value).length > 0)

/**
 * La ficha que devuelve el servidor pisa a la de la lista cargada. El array
 * se reasigna entero: `bolsas` es un shallowRef y mutarlo por índice no
 * despierta a nadie. Se compara contra el uuid de la ficha devuelta, no
 * contra el parámetro de la URL: la URL lleva el slug y nunca casaría.
 */
function reemplazaBolsa(cafe: Cafe) {
  bolsas.value = (bolsas.value ?? []).map((c) => (c.id === cafe.id ? cafe : c))
}

async function enviar() {
  errores.value = []
  guardado.value = null
  enviando.value = true
  try {
    const r = await editarCafe(id, cambios.value)
    guardado.value = r.cambiado
    reemplazaBolsa(r.cafe)
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}

const ficheroFoto = ref<HTMLInputElement | null>(null)
const subiendoFoto = ref(false)
const erroresFoto = ref<string[]>([])
const encogida = ref<{ antes: number, despues: number } | null>(null)
const dialogoFoto = ref<HTMLDialogElement | null>(null)

async function subirFoto(evento: Event) {
  const fichero = (evento.target as HTMLInputElement).files?.[0]
  if (!fichero) return
  erroresFoto.value = []
  encogida.value = null
  subiendoFoto.value = true
  try {
    const menguada = await encogerFoto(fichero)
    const r = await subirFotoCafe(id, menguada)
    reemplazaBolsa(r.cafe)
    if (menguada.size < fichero.size) {
      encogida.value = { antes: fichero.size, despues: menguada.size }
    }
  } catch (fallo) {
    erroresFoto.value = erroresDe(fallo)
  } finally {
    subiendoFoto.value = false
    // Sin esto, elegir el mismo fichero otra vez no dispararía el change.
    if (ficheroFoto.value) ficheroFoto.value.value = ''
  }
}

async function quitarFoto() {
  erroresFoto.value = []
  encogida.value = null
  subiendoFoto.value = true
  try {
    const r = await quitarFotoCafe(id)
    reemplazaBolsa(r.cafe)
  } catch (fallo) {
    erroresFoto.value = erroresDe(fallo)
  } finally {
    subiendoFoto.value = false
    dialogoFoto.value?.close()
  }
}
</script>

<template>
  <Migas :ruta="[{ texto: 'Bolsas', a: '/cafes' }, { texto: original?.nombre ?? id }]" />

  <p v-if="!original" class="meta">No hay ninguna bolsa con id «{{ id }}».</p>

  <template v-else>
    <!-- Duplicar arriba y sin sesión: enseñar el botón no es escribir, y quien
         acaba de comprar otra bolsa entra aquí a mirarla, no a editarla. -->
    <div class="cabecera">
      <NuxtLink :to="`/cafes/nueva?de=${id}`" class="secundario">Otra bolsa</NuxtLink>
    </div>

    <!-- La foto va antes del muro de sesión: mirar la bolsa no es editarla, y
         en un móvil recién instalado no habría sesión todavía. El nombre no se
         repite aquí, que ya lo dice la última miga. -->
    <section class="tarjeta">
      <img
        v-if="original.foto"
        :src="urlFoto(original.foto)!"
        alt="La bolsa de este café"
        class="foto"
      >
      <p v-else class="meta sin-foto">Sin foto todavía.</p>
      <input
        ref="ficheroFoto"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        @change="subirFoto"
      >
      <p v-if="encogida" class="meta encogida">
        Encogida antes de subir: {{ pesoLegible(encogida.antes) }} →
        {{ pesoLegible(encogida.despues) }}.
      </p>
      <div class="botones-foto">
        <button type="button" :disabled="subiendoFoto" @click="ficheroFoto?.click()">
          <!-- Corto a propósito: una etiqueta más larga parte en dos líneas y
               el botón pega un salto en mitad de la subida. -->
          {{ subiendoFoto ? 'Subiendo…' : original.foto ? 'Cambiar foto' : 'Subir foto' }}
        </button>
        <button
          v-if="original.foto"
          type="button"
          class="secundario"
          :disabled="subiendoFoto"
          @click="dialogoFoto?.showModal()"
        >
          Quitar
        </button>
      </div>
      <p v-if="erroresFoto.length" class="fallo">{{ erroresFoto.join(' · ') }}</p>
    </section>

    <!-- Quitar borra el objeto de R2 y no se puede deshacer, y en el móvil el
         botón cae al lado del de cambiar la foto. -->
    <dialog ref="dialogoFoto" @cancel="dialogoFoto?.close()">
      <h3>¿Quitar la foto de {{ original.nombre }}?</h3>
      <p>
        Esta sí se borra del todo, no hay papelera: si la quieres de vuelta
        tendrás que subirla otra vez desde el móvil.
      </p>
      <div class="botones">
        <button type="button" class="secundario" @click="dialogoFoto?.close()">Cancelar</button>
        <button type="button" class="peligro" :disabled="subiendoFoto" @click="quitarFoto">
          {{ subiendoFoto ? 'Quitando…' : 'Quitar' }}
        </button>
      </div>
    </dialog>

    <form @submit.prevent="enviar">
      <p class="meta">
        id <code>{{ original.id }}</code> — no se puede cambiar: es la clave a la
        que apuntan las extracciones.
      </p>

      <CafeCampos v-model="form" />

      <button type="submit" :disabled="enviando || !hayCambios">
        {{ enviando ? 'Guardando…' : hayCambios ? 'Guardar cambios' : 'Sin cambios' }}
      </button>
    </form>
  </template>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>No se ha guardado nada</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="guardado" class="tarjeta exito">
    <strong>Guardado</strong>
    <p class="meta">Cambiado: {{ guardado.join(', ') }}</p>
  </section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }

button {
  font: inherit;
  font-weight: 600;
  color: #fff;
  background: var(--acento);
  border: 0;
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
  width: 100%;
  min-height: 3rem;
  cursor: pointer;
  margin-top: 0.4rem;
}

button:disabled { opacity: 0.5; cursor: default; }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
}

.tarjeta input { width: 100%; margin: 0.5rem 0; font-size: 16px; padding: 0.6rem; border-radius: 0.5rem; border: 1px solid var(--linea); background: var(--fondo); color: var(--tinta); }

/* Con tope de alto: una foto vertical de móvil ocuparía tres pantallas. */
.foto {
  display: block;
  max-width: 100%;
  max-height: 55vh;
  margin: 0 auto;
  border-radius: 0.5rem;
  border: 1px solid var(--linea);
}

.botones-foto { display: flex; gap: 0.5rem; margin-top: 0.6rem; }
.botones-foto button { margin-top: 0; }
.sin-foto { margin: 0; }
.encogida { margin: 0.5rem 0 0; }

dialog {
  border: 1px solid var(--linea);
  border-radius: 0.8rem;
  background: var(--tarjeta);
  color: var(--tinta);
  padding: 1rem;
  /*
   * Con % y no con 100vw: en el móvil vw no siempre mide lo que se ve —la
   * barra de direcciones y el zoom lo mueven— y el modal se salía a lo
   * ancho. El % sale del viewport contra el que se posiciona el modal.
   */
  max-width: min(28rem, calc(100% - 2rem));
  margin: auto;
  /* El nombre de la bolsa lo escribe el usuario: si mete una palabra larga
     sin espacios, que se parta en vez de empujar la caja. */
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.peligro { background: #c2410c; color: #fff; border: 0; }

.secundario {
  background: transparent;
  color: var(--tinta);
  border: 1px solid var(--linea);
}

/* Solo lleva «Otra bolsa», que se va a la derecha como el resto de atajos. */
.cabecera { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }

.cabecera a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 0.85rem;
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  color: var(--acento);
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
}
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0 0.9rem; }
.fallo { color: #c2410c; font-size: 0.85rem; }
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
code { font-size: 0.9em; }
a { color: var(--acento); }
</style>
