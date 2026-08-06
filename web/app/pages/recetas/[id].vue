<script setup lang="ts">
import type { PasoEditable } from '~/components/RecetaPasos.vue'

/**
 * Alta y edición de recetas. Comparten pantalla porque el formulario es el
 * mismo: la única diferencia es si el id se escribe o ya está puesto.
 *
 * Duplicar es un alta con el formulario relleno desde otra receta
 * (`/recetas/nueva?de=<id>`): no hay endpoint de copia porque no hace falta
 * ninguno, el POST de siempre ya recibe la receta entera con sus pasos.
 */
const { recetas, crearReceta, guardarReceta } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
const route = useRoute()
const router = useRouter()

const id = String(route.params.id)
const esNueva = computed(() => id === 'nueva')
const copiaDe = computed(() => (esNueva.value ? String(route.query.de ?? '') : ''))

const { data: catalogo } = await useAsyncData('recetas-editar', recetas)
const buscar = (cual: string) => (catalogo.value ?? []).find((r) => r.id === cual) ?? null
const original = computed(() => (esNueva.value ? null : buscar(id)))
const fuente = computed(() => (copiaDe.value ? buscar(copiaDe.value) : null))

useHead({
  title: () => {
    if (!esNueva.value) return original.value?.nombre ?? 'Receta'
    return fuente.value ? `Copia de ${fuente.value.nombre}` : 'Nueva receta'
  },
})

const form = reactive({ id: '', nombre: '', ratio: 15 as number | '', notas: '' })
const pasos = ref<PasoEditable[]>([
  { accion: 'verter', agua_g: 60, t_inicio_s: 0, notas: '' },
])

const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref(false)
const tokenVisible = ref('')
const errorSesion = ref('')

watchEffect(() => {
  // Al duplicar se copia todo menos la identidad: el id no se puede cambiar
  // luego, así que se elige a mano, y el nombre avisa de que es una copia.
  const modelo = original.value ?? fuente.value
  if (!modelo) return
  form.nombre = fuente.value ? `${modelo.nombre} (copia)` : modelo.nombre
  form.ratio = modelo.ratio ?? ''
  form.notas = modelo.notas ?? ''
  pasos.value = modelo.pasos.map((p) => ({
    accion: p.accion,
    agua_g: p.accion === 'verter' ? p.agua_g : '',
    t_inicio_s: p.t_inicio_s ?? '',
    notas: p.notas ?? '',
  }))
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
        agua_g: p.accion === 'verter' ? p.agua_g : 0,
        t_inicio_s: p.t_inicio_s,
        notas: p.notas,
      })),
    }
    if (esNueva.value) {
      const { receta } = await crearReceta({ ...cuerpo, id: form.id })
      await router.push(`/recetas/${receta.id}`)
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
</script>

<template>
  <p class="volver"><NuxtLink to="/recetas">‹ Recetas</NuxtLink></p>

  <p v-if="!esNueva && !original" class="meta">No hay ninguna receta «{{ id }}».</p>

  <template v-else>
    <p v-if="!comprobada" class="meta">Comprobando sesión…</p>

    <section v-else-if="!activa" class="tarjeta">
      <h2>Abrir sesión</h2>
      <p class="meta">Hace falta para tocar recetas.</p>
      <input v-model="tokenVisible" type="password" placeholder="token" autocomplete="off">
      <p v-if="errorSesion" class="fallo">{{ errorSesion }}</p>
      <button :disabled="!tokenVisible.trim()" @click="iniciarSesion">Entrar</button>
    </section>

    <form v-else @submit.prevent="enviar">
      <div class="cabecera">
        <h2 v-if="!esNueva">{{ original!.nombre }}</h2>
        <h2 v-else-if="fuente">Copia de «{{ fuente.nombre }}»</h2>
        <h2 v-else>Nueva receta</h2>
        <NuxtLink v-if="!esNueva" :to="`/recetas/nueva?de=${id}`" class="secundario">
          Duplicar
        </NuxtLink>
      </div>

      <p v-if="copiaDe && !fuente" class="fallo">
        No hay ninguna receta «{{ copiaDe }}»: el formulario sale vacío.
      </p>

      <label v-if="esNueva">
        id (minúsculas, sin espacios)
        <input v-model="form.id" placeholder="kasuya-46-fuerte" required autocapitalize="none">
      </label>

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
    </form>
  </template>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>No se ha guardado nada</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>

  <section v-if="guardado" class="tarjeta exito"><strong>Guardada</strong></section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0; }

.cabecera { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; }

.secundario {
  display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap;
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.5rem 0.85rem;
  color: var(--acento); font-size: 0.9rem; font-weight: 600; text-decoration: none;
}
h3 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--suave); margin: 1.25rem 0 0.6rem; }

form { display: flex; flex-direction: column; gap: 0.85rem; }
label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.82rem; color: var(--suave); }
.pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

input {
  font: inherit; font-size: 16px; color: var(--tinta); background: var(--tarjeta);
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.6rem 0.65rem; min-width: 0;
}

button {
  font: inherit; font-weight: 600; color: #fff; background: var(--acento);
  border: 0; border-radius: 0.6rem; padding: 0.85rem 1rem; min-height: 3rem; cursor: pointer;
}

button:disabled { opacity: 0.5; cursor: default; }

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
