<script setup lang="ts">
import { TIPOS_ACCESORIO } from '~/composables/useApi'
import type { TipoAccesorio } from '~/composables/useApi'

// Navegar por ruta pasa por aquí: desde el inglés, `/crono` llevaría al
// castellano y se perdería el idioma a mitad de camino.
const localePath = useLocalePath()

/**
 * Alta y ficha de un accesorio. Comparten pantalla, como las recetas: el
 * formulario es el mismo salvo el tipo, que se elige al darlo de alta y ya no
 * se toca — las tazas que lo usan lo apuntaron en su columna.
 *
 * `?tipo=molinillo` llega preelegido desde el alta de extracción, que es
 * donde uno se entera de que no tiene ninguno.
 */
const { accesorios, extracciones, retiradas, crearAccesorio, editarAccesorio, borrarAccesorio } = useApi()
const route = useRoute()
const router = useRouter()

const id = String(route.params.id)
// El sentinela de la URL lo pone el idioma: `/accesorios/nuevo` y `/gear/new`.
const esNuevo = computed(() => id === 'nuevo' || id === 'new')

const { data: equipo, refresh: recargar } = await useAsyncData('accesorios-editar', accesorios)
// La URL lleva el slug; un enlace con la id también resuelve.
const original = computed(() =>
  esNuevo.value ? null : (equipo.value ?? []).find((a) => a.slug === id || a.id === id) ?? null,
)

const { data: vivas } = await useAsyncData(`accesorio-usos-${id}`, () => extracciones())
const { data: papelera } = await useAsyncData(`accesorio-usos-retiradas-${id}`, retiradas)

/** Cuántas tazas lo usan, retiradas incluidas: lo mismo que mira el servidor. */
const usos = computed(() => {
  const a = original.value
  if (!a) return 0
  return [...(vivas.value ?? []), ...(papelera.value ?? [])].filter((e) => e[a.tipo] === a.id).length
})

const { t } = useI18n()
useHead({
  title: () => original.value?.nombre ?? `${t('accesorios.titulo')} · ${t('comun.nuevo')}`,
})

const tipoPedido = String(route.query.tipo ?? '')
const VACIO = () => ({
  tipo: (TIPOS_ACCESORIO as readonly string[]).includes(tipoPedido)
    ? tipoPedido as TipoAccesorio
    : 'dripper' as TipoAccesorio,
  nombre: '',
  masa_termica: false,
  en_uso: true,
  notas: '',
})
const form = reactive(VACIO())

watchEffect(() => {
  const a = original.value
  if (!a) return
  form.tipo = a.tipo
  form.nombre = a.nombre
  form.masa_termica = Boolean(a.masa_termica)
  form.en_uso = Boolean(a.en_uso)
  form.notas = a.notas ?? ''
})

// La masa térmica es cosa del dripper: al cambiar a molinillo en el alta se
// apaga, o el servidor rechazaría un interruptor que ni se ve.
watch(() => form.tipo, (tipo) => { if (tipo !== 'dripper') form.masa_termica = false })

const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref(false)
const dialogoBorrar = ref<HTMLDialogElement | null>(null)
const borrando = ref(false)

/** En la ficha, solo lo que cambió: el PATCH toca lo que llega y nada más. */
function cambiosDe() {
  const a = original.value!
  const cambios: Record<string, unknown> = {}
  if (form.nombre.trim() !== a.nombre) cambios.nombre = form.nombre
  if (form.masa_termica !== Boolean(a.masa_termica)) cambios.masa_termica = form.masa_termica
  if (form.en_uso !== Boolean(a.en_uso)) cambios.en_uso = form.en_uso
  if (form.notas.trim() !== (a.notas ?? '')) cambios.notas = form.notas
  return cambios
}

const hayCambios = computed(() => esNuevo.value || Object.keys(original.value ? cambiosDe() : {}).length > 0)

async function enviar() {
  errores.value = []
  guardado.value = false
  enviando.value = true
  try {
    if (esNuevo.value) {
      const { accesorio } = await crearAccesorio({
        tipo: form.tipo,
        nombre: form.nombre,
        masa_termica: form.masa_termica,
        en_uso: form.en_uso,
        notas: form.notas,
      })
      // El catálogo se comparte por clave entre las dos pantallas: sin
      // recargarlo, la ficha recién creada no se encontraría a sí misma.
      await recargar()
      await router.push(localePath(`/accesorios/${accesorio.slug}`))
    } else {
      await editarAccesorio(original.value!.id, cambiosDe())
      await recargar()
      guardado.value = true
    }
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}

/**
 * Borrar de verdad, solo lo que no usa nadie. El botón ni sale si hay tazas
 * que lo nombran, y si otro dispositivo lo usó entretanto, el servidor se
 * niega y el motivo sale en la lista de errores.
 */
async function borrar() {
  errores.value = []
  borrando.value = true
  try {
    await borrarAccesorio(original.value!.id)
    dialogoBorrar.value?.close()
    await recargar()
    await router.push(localePath('/accesorios'))
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
      { texto: $t('menu.titulo'), a: '/menu' },
      { texto: $t('accesorios.titulo'), a: '/accesorios' },
      { texto: esNuevo ? $t('comun.nuevo') : original?.nombre ?? id },
    ]"
  />

  <p v-if="!esNuevo && !original" class="meta">{{ $t('accesorio.no_existe', { id }) }}</p>

  <template v-else>
    <form @submit.prevent="enviar">
      <label>
        {{ $t('accesorio.tipo') }}
        <select v-model="form.tipo" :disabled="!esNuevo">
          <option v-for="tipo in TIPOS_ACCESORIO" :key="tipo" :value="tipo">
            {{ $t(`accesorios.tipo.${tipo}`) }}
          </option>
        </select>
      </label>
      <p v-if="!esNuevo" class="aviso">{{ $t('accesorio.tipo_fijo') }}</p>

      <label>{{ $t('accesorio.nombre') }}<input
        v-model="form.nombre" :placeholder="$t(`accesorio.ejemplos.${form.tipo}`)" required></label>

      <!-- Los interruptores, como en ajustes: la fila entera es pulsable. -->
      <label v-if="form.tipo === 'dripper'" class="fila">
        <span class="texto">
          <span class="titulo">{{ $t('accesorio.masa_termica') }}</span>
          <span class="pista">{{ $t('accesorio.masa_termica_pista') }}</span>
        </span>
        <input v-model="form.masa_termica" type="checkbox" role="switch">
      </label>

      <label class="fila">
        <span class="texto">
          <span class="titulo">{{ $t('accesorio.en_uso') }}</span>
          <span class="pista">{{ $t('accesorio.en_uso_pista') }}</span>
        </span>
        <input v-model="form.en_uso" type="checkbox" role="switch">
      </label>

      <label>{{ $t('accesorio.notas') }}<input v-model="form.notas"></label>

      <button type="submit" :disabled="enviando || !hayCambios">
        {{ enviando ? $t('comun.guardando')
          : esNuevo ? $t('accesorio.crear')
          : hayCambios ? $t('accesorio.guardar') : $t('comun.sin_cambios') }}
      </button>

      <template v-if="!esNuevo">
        <p v-if="usos" class="aviso">
          {{ $t('accesorio.no_se_borra', { usos: $t('accesorios.usos', { n: usos }, usos) }) }}
        </p>
        <!-- Abajo y solo: separado del botón de guardar a propósito, para que
             no se pulse con el pulgar buscando el de al lado. -->
        <button
          v-else type="button" class="peligro"
          :disabled="borrando" @click="dialogoBorrar?.showModal()"
        >
          {{ $t('accesorio.borrar') }}
        </button>
      </template>
    </form>

    <dialog ref="dialogoBorrar" @cancel="dialogoBorrar?.close()">
      <h3>{{ $t('accesorio.borrar_titulo', { nombre: original?.nombre }) }}</h3>
      <p>{{ $t('accesorio.borrar_ojo') }}</p>
      <div class="botones">
        <button type="button" class="cancelar" @click="dialogoBorrar?.close()">{{ $t('comun.cancelar') }}</button>
        <button type="button" class="peligro" :disabled="borrando" @click="borrar">
          {{ borrando ? $t('accesorio.borrando') : $t('accesorio.borrar') }}
        </button>
      </div>
    </dialog>
  </template>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>{{ $t('comun.no_guardado') }}</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="guardado" class="tarjeta exito"><strong>{{ $t('accesorio.guardado') }}</strong></section>
</template>

<style scoped>
form { display: flex; flex-direction: column; gap: 0.85rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--suave); }

input:not([type="checkbox"]), select {
  font: inherit; font-size: 16px; color: var(--tinta); background: var(--tarjeta);
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.6rem 0.65rem;
  min-width: 0; min-height: 44px;
}

select:disabled { color: var(--suave); background: transparent; }

/* Etiqueta y control en los extremos, como en ajustes. */
.fila {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 0;
  border-top: 1px solid var(--linea);
  border-bottom: 1px solid var(--linea);
  cursor: pointer;
}

.fila + .fila { border-top: 0; }

.texto { display: flex; flex-direction: column; gap: 0.15rem; }
.titulo { font-size: 0.95rem; color: var(--tinta); }
.pista { font-size: 0.8rem; color: var(--suave); }

/* El interruptor de ajustes, con el pomo que cambia de color con el estado:
   en blanco fijo no se veía sobre el carril apagado de los temas claros. */
input[type="checkbox"] {
  appearance: none;
  flex: 0 0 auto;
  width: 3rem;
  height: 1.75rem;
  border-radius: 1rem;
  background: var(--linea);
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
}

input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: var(--tinta);
  transition: transform 0.15s ease, background 0.15s ease;
}

input[type="checkbox"]:checked { background: var(--acento); }
input[type="checkbox"]:checked::after {
  transform: translateX(1.25rem);
  background: var(--sobre-acento);
}

@media (prefers-reduced-motion: reduce) {
  input[type="checkbox"]::after { transition: none; }
}
input[type="checkbox"]:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }

button {
  font: inherit; font-weight: 600; color: var(--sobre-acento); background: var(--acento);
  border: 0; border-radius: 0.6rem; padding: 0.85rem 1rem; min-height: 3rem; cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: default; }

.peligro { background: var(--peligro); color: var(--sobre-peligro); }
.cancelar { background: transparent; color: var(--tinta); border: 1px solid var(--linea); }

dialog {
  border: 1px solid var(--linea); border-radius: 0.8rem;
  background: var(--tarjeta); color: var(--tinta); padding: 1rem;
  max-width: min(28rem, calc(100% - 2rem)); margin: auto;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }

.tarjeta {
  background: var(--tarjeta); border: 1px solid var(--linea);
  border-radius: 0.7rem; padding: 0.9rem; margin-top: 1.25rem;
}

.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.aviso { color: var(--suave); font-size: 0.8rem; margin: 0; }
.errores { border-color: var(--peligro); }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
</style>
