<script setup lang="ts">
// Navegar por ruta pasa por aquí: desde el inglés, `/crono` llevaría al
// castellano y se perdería el idioma a mitad de camino.
const localePath = useLocalePath()

import type { PasoEditable } from '~/components/RecetaPasos.vue'

/**
 * Alta y edición de recetas. Comparten pantalla porque el formulario es el
 * mismo: la única diferencia es si el id se escribe o ya está puesto.
 *
 * Duplicar es un alta con el formulario relleno desde otra receta
 * (`/recetas/nueva?de=<id>`): no hay endpoint de copia porque no hace falta
 * ninguno, el POST de siempre ya recibe la receta entera con sus pasos.
 */
const { recetas, crearReceta, guardarReceta, borrarReceta } = useApi()
const route = useRoute()
const router = useRouter()

const id = String(route.params.id)
const esNueva = computed(() => id === 'nueva')
const copiaDe = computed(() => (esNueva.value ? String(route.query.de ?? '') : ''))

const { data: catalogo, refresh: recargarCatalogo } = await useAsyncData('recetas-editar', recetas)
// La URL lleva el slug; los enlaces viejos con uuid también resuelven.
const buscar = (cual: string) =>
  (catalogo.value ?? []).find((r) => r.slug === cual || r.id === cual) ?? null
const original = computed(() => (esNueva.value ? null : buscar(id)))
const fuente = computed(() => (copiaDe.value ? buscar(copiaDe.value) : null))

useHead({
  title: () => {
    if (!esNueva.value) return original.value?.nombre ?? 'Receta'
    return fuente.value ? `Copia de ${fuente.value.nombre}` : 'Nueva receta'
  },
})

/**
 * El mismo `?de=` del botón «Duplicar», elegible desde el propio formulario:
 * variar una receta que funciona no obliga a pasar por su ficha. En la URL y
 * no en un ref, para que el enlace copiado lleve el punto de partida.
 */
const partirDe = computed({
  get: () => copiaDe.value,
  set: (cual) => { void router.replace({ query: cual ? { de: cual } : {} }) },
})

// Sin campo de id: el slug sale del nombre en el servidor, como en las bolsas.
const VACIA = () => ({ nombre: '', ratio: 15 as number | '', notas: '' })
const PASO_INICIAL = (): PasoEditable[] => [
  { accion: 'verter', estilo: '', agua_g: 60, t_inicio_s: 0, notas: '' },
]

/**
 * En el alta, el formulario es un borrador en memoria de la app: montar los
 * pasos lleva un rato y salir a mirar algo no puede tirarlos. Editando, el
 * estado es propio de la ficha y se rellena del original como siempre.
 */
const borradorForm = useState('borrador-receta', VACIA)
const borradorPasos = useState<PasoEditable[]>('borrador-receta-pasos', PASO_INICIAL)
const form = esNueva.value ? borradorForm.value : reactive(VACIA())
const pasos = esNueva.value ? borradorPasos : ref<PasoEditable[]>(PASO_INICIAL())

/** De qué receta se copió ya el borrador, para no pisarlo al volver. */
const copiadaYa = useState('borrador-receta-de', () => '')

const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref(false)
const dialogoBorrar = ref<HTMLDialogElement | null>(null)
const borrando = ref(false)

watchEffect(() => {
  // Al duplicar se copia todo menos la identidad: el id no se puede cambiar
  // luego, así que se elige a mano, y el nombre avisa de que es una copia.
  const modelo = original.value ?? fuente.value
  if (!modelo) return
  // En el alta, cada fuente puebla el borrador una sola vez: volver con el
  // ?de= en la URL no pisa lo que ya se haya retocado.
  if (esNueva.value) {
    if (copiadaYa.value === modelo.id) return
    copiadaYa.value = modelo.id
  }
  form.nombre = fuente.value ? `${modelo.nombre} (copia)` : modelo.nombre
  form.ratio = modelo.ratio ?? ''
  form.notas = modelo.notas ?? ''
  pasos.value = modelo.pasos.map((p) => ({
    accion: p.accion,
    estilo: p.estilo ?? '',
    agua_g: p.accion === 'verter' ? p.agua_g : '',
    t_inicio_s: p.t_inicio_s ?? '',
    notas: p.notas ?? '',
  }))
})

async function enviar() {
  errores.value = []
  guardado.value = false
  enviando.value = true
  try {
    const cuerpo = {
      nombre: form.nombre,
      ratio: form.ratio === '' ? null : form.ratio,
      notas: form.notas,
      pasos: pasos.value.map((p) => ({
        accion: p.accion,
        estilo: p.estilo || null,
        agua_g: p.accion === 'verter' ? p.agua_g : 0,
        t_inicio_s: p.t_inicio_s,
        notas: p.notas,
      })),
    }
    if (esNueva.value) {
      const { receta } = await crearReceta(cuerpo)
      // Creada, el borrador ya no es borrador: la próxima alta empieza
      // limpia en vez de precargada con esta.
      await vaciar()
      // El catálogo se comparte por clave entre las dos pantallas: sin
      // recargarlo, la ficha recién creada aterrizaba en «no hay ninguna
      // receta con ese id».
      await recargarCatalogo()
      await router.push(localePath(`/recetas/${receta.slug}`))
    } else {
      await guardarReceta(id, cuerpo)
      guardado.value = true
    }
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}

/** El alta en blanco otra vez, preset de la URL incluido. */
async function vaciar() {
  // La URL primero: si el sello se limpiara con la `?de=` aún puesta, el
  // watchEffect del preset volvería a copiar la receta en esa ventana.
  if (route.query.de !== undefined) await router.replace({ query: {} })
  Object.assign(form, VACIA())
  pasos.value = PASO_INICIAL()
  copiadaYa.value = ''
}

/**
 * Borrar de verdad. El servidor se niega si alguna extracción usa la receta,
 * así que el aviso del modal no es la única defensa: si dice que no, el
 * motivo sale en la lista de errores.
 */
async function borrar() {
  errores.value = []
  borrando.value = true
  try {
    await borrarReceta(id)
    dialogoBorrar.value?.close()
    await recargarCatalogo()
    await router.push(localePath('/recetas'))
  } catch (fallo) {
    dialogoBorrar.value?.close()
    errores.value = erroresDe(fallo)
  } finally {
    borrando.value = false
  }
}
</script>

<template>
  <Migas
    :ruta="[
      { texto: 'Recetas', a: '/recetas' },
      { texto: esNueva ? (fuente ? `Copia de ${fuente.nombre}` : 'Nueva') : original?.nombre ?? id },
    ]"
  />

  <p v-if="!esNueva && !original" class="meta">No hay ninguna receta «{{ id }}».</p>

  <template v-else>
    <form @submit.prevent="enviar">
      <!-- Sin título: el nombre de la receta ya está en la última miga. -->
      <div class="cabecera">
        <NuxtLink v-if="!esNueva" :to="`/recetas/nueva?de=${id}`" class="secundario">Duplicar</NuxtLink>
        <!-- El borrador del alta sobrevive a salir y volver; esto lo tira. -->
        <button v-else type="button" class="limpiar" @click="vaciar">Vaciar</button>
      </div>

      <label v-if="esNueva && (catalogo ?? []).length" class="partir">
        Partir de otra receta
        <select v-model="partirDe">
          <option value="">— desde cero —</option>
          <option v-for="r in catalogo ?? []" :key="r.id" :value="r.slug">{{ r.nombre }}</option>
        </select>
      </label>

      <p v-if="copiaDe && !fuente" class="fallo">
        No hay ninguna receta «{{ copiaDe }}»: el formulario sale vacío.
      </p>

      <!-- Sin campo de id: el slug de la URL sale del nombre, como en las
           bolsas, y la clave de verdad es un uuid que no se enseña. -->
      <label>Nombre<input v-model="form.nombre" placeholder="4:6 con más cuerpo" required></label>

      <div class="pareja">
        <label>Ratio<input v-model.number="form.ratio" type="number" step="0.5" min="1" inputmode="decimal"></label>
        <label>Notas<input v-model="form.notas"></label>
      </div>

      <h3>Pasos</h3>
      <RecetaPasos v-model="pasos" />

      <button type="submit" :disabled="enviando">
        {{ enviando ? 'Guardando…' : esNueva ? 'Crear receta' : 'Guardar receta' }}
      </button>

      <p v-if="!esNueva" class="aviso">
        Al guardar, los pasos reemplazan a los que había. Las extracciones ya
        registradas no cambian: guardaron su propio <code>reparto</code>.
      </p>

      <!-- Abajo y solo: separado del botón de guardar a propósito, para que no
           se pulse con el pulgar buscando el de al lado. -->
      <button
        v-if="!esNueva" type="button" class="peligro"
        :disabled="borrando" @click="dialogoBorrar?.showModal()"
      >
        Borrar receta
      </button>
    </form>

    <dialog ref="dialogoBorrar" @cancel="dialogoBorrar?.close()">
      <h3>¿Borrar «{{ original?.nombre }}»?</h3>
      <p>
        Esta no tiene papelera como las extracciones: se van la receta y sus
        pasos, y no hay vuelta atrás. Si alguna extracción la usó, el servidor
        se negará.
      </p>
      <div class="botones">
        <button type="button" class="cancelar" @click="dialogoBorrar?.close()">Cancelar</button>
        <button type="button" class="peligro" :disabled="borrando" @click="borrar">
          {{ borrando ? 'Borrando…' : 'Borrar' }}
        </button>
      </div>
    </dialog>
  </template>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>No se ha guardado nada</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="guardado" class="tarjeta exito"><strong>Guardada</strong></section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0; }

/* Duplicar en la ficha o Vaciar en el alta, a la derecha ellos solos. */
.cabecera { display: flex; justify-content: flex-end; align-items: center; }

/* Texto pequeño y sin peso: vacía un borrador, no borra datos guardados. */
.limpiar {
  font: inherit;
  font-size: 0.8rem;
  color: var(--suave);
  background: none;
  border: 0;
  padding: 0.25rem 0;
  min-height: 0;
  cursor: pointer;
  text-decoration: underline;
}

.limpiar:hover { color: var(--acento); }

.secundario {
  display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap;
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.5rem 0.85rem;
  color: var(--acento); font-size: 0.9rem; font-weight: 600; text-decoration: none;
}
h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--suave); margin: 1.25rem 0 0.6rem; }

form { display: flex; flex-direction: column; gap: 0.85rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--suave); }
.pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

input, select {
  font: inherit; font-size: 16px; color: var(--tinta); background: var(--tarjeta);
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.6rem 0.65rem; min-width: 0;
}

button {
  font: inherit; font-weight: 600; color: #fff; background: var(--acento);
  border: 0; border-radius: 0.6rem; padding: 0.85rem 1rem; min-height: 3rem; cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: default; }

.peligro { background: #c2410c; }
.cancelar { background: transparent; color: var(--tinta); border: 1px solid var(--linea); }

dialog {
  border: 1px solid var(--linea); border-radius: 0.8rem;
  background: var(--tarjeta); color: var(--tinta); padding: 1rem;
  /* Como en la ficha del café: en el móvil vw no mide lo que se ve y el
     modal se salía a lo ancho. */
  max-width: min(28rem, calc(100% - 2rem)); margin: auto;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; text-transform: none; letter-spacing: normal; color: var(--tinta); }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }

.tarjeta {
  background: var(--tarjeta); border: 1px solid var(--linea);
  border-radius: 0.7rem; padding: 0.9rem; margin-top: 1.25rem;
}

.tarjeta input { width: 100%; margin: 0.5rem 0; }
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.aviso { color: var(--suave); font-size: 0.8rem; margin: 0; }
.fallo { color: #c2410c; font-size: 0.85rem; }
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
code { font-size: 0.9em; }
a { color: var(--acento); }
</style>
