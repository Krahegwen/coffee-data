<script setup lang="ts">
import type { Cafe } from '~/composables/useApi'

const { cafes, editarCafe, subirFotoCafe, quitarFotoCafe, urlFoto } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
const route = useRoute()
const id = String(route.params.id)

const { data: bolsas } = await useAsyncData(`cafe-${id}`, cafes)
const original = computed(() => (bolsas.value ?? []).find((c) => c.id === id) ?? null)

const form = reactive<Record<string, any>>({})
const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref<string[] | null>(null)
const tokenVisible = ref('')
const errorSesion = ref('')

// Los null de la API pasan a cadena vacía: un input no sabe qué hacer con null.
const EDITABLES = [
  'nombre', 'tostador', 'origen', 'region', 'variedad', 'proceso', 'altitud_m',
  'sca', 'fecha_tueste', 'consumir_antes', 'peso_g', 'precio_eur',
  'notas_tostador', 'estado', 'fecha_compra', 'fecha_recepcion', 'url',
  'conservacion',
] as const

watchEffect(() => {
  if (!original.value) return
  for (const campo of EDITABLES) {
    form[campo] = (original.value as Cafe)[campo] ?? ''
  }
})

onMounted(comprobar)

async function iniciarSesion() {
  errorSesion.value = ''
  try {
    await abrir(tokenVisible.value)
    tokenVisible.value = ''
  } catch {
    errorSesion.value = 'Ese token no es'
  }
}

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
 * despierta a nadie.
 */
function reemplazaBolsa(cafe: Cafe) {
  bolsas.value = (bolsas.value ?? []).map((c) => (c.id === id ? cafe : c))
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

async function subirFoto(evento: Event) {
  const fichero = (evento.target as HTMLInputElement).files?.[0]
  if (!fichero) return
  erroresFoto.value = []
  subiendoFoto.value = true
  try {
    const r = await subirFotoCafe(id, fichero)
    reemplazaBolsa(r.cafe)
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
  subiendoFoto.value = true
  try {
    const r = await quitarFotoCafe(id)
    reemplazaBolsa(r.cafe)
  } catch (fallo) {
    erroresFoto.value = erroresDe(fallo)
  } finally {
    subiendoFoto.value = false
  }
}
</script>

<template>
  <p><NuxtLink to="/cafes">‹ Bolsas</NuxtLink></p>

  <p v-if="!original" class="meta">No hay ninguna bolsa con id «{{ id }}».</p>

  <template v-else>
    <!-- Nombre y foto van antes del muro de sesión: mirar la bolsa no es
         editarla, y en un móvil recién instalado no habría sesión todavía. -->
    <h2>{{ original.nombre }}</h2>

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
      <div v-if="activa" class="botones-foto">
        <button type="button" :disabled="subiendoFoto" @click="ficheroFoto?.click()">
          {{ subiendoFoto ? 'Subiendo…' : original.foto ? 'Cambiar foto' : 'Subir foto' }}
        </button>
        <button
          v-if="original.foto"
          type="button"
          class="secundario"
          :disabled="subiendoFoto"
          @click="quitarFoto"
        >
          Quitar
        </button>
      </div>
      <p v-if="erroresFoto.length" class="fallo">{{ erroresFoto.join(' · ') }}</p>
    </section>

    <p v-if="!comprobada" class="meta">Comprobando sesión…</p>

    <section v-else-if="!activa" class="tarjeta">
      <h2>Abrir sesión</h2>
      <p class="meta">Hace falta para corregir la ficha.</p>
      <input v-model="tokenVisible" type="password" placeholder="token" autocomplete="off">
      <p v-if="errorSesion" class="fallo">{{ errorSesion }}</p>
      <button :disabled="!tokenVisible.trim()" @click="iniciarSesion">Entrar</button>
    </section>

    <form v-else @submit.prevent="enviar">
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
.sin-foto { margin: 0; }

.secundario {
  background: transparent;
  color: var(--tinta);
  border: 1px solid var(--linea);
}
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0 0.9rem; }
.fallo { color: #c2410c; font-size: 0.85rem; }
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
code { font-size: 0.9em; }
a { color: var(--acento); }
</style>
