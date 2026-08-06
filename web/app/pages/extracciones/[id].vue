<script setup lang="ts">
import type { Extraccion } from '~/composables/useApi'
import { DEFECTOS, DRIPPERS } from '~/composables/textos'

const { cafes, recetas, extracciones, editarExtraccion, retirarExtraccion } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)

useHead({ title: `Extracción #${id}` })

const { data: historial } = await useAsyncData(`ext-${id}`, () => extracciones())
const { data: bolsas } = await useAsyncData('cafes-ext', cafes)
const { data: catalogo } = await useAsyncData('recetas-ext', recetas)

const original = computed(() => (historial.value ?? []).find((e) => e.id === id) ?? null)

const EDITABLES = [
  'fecha', 'cafe_id', 'dosis_g', 'agua_g', 'temp_c', 'clics', 'receta_id',
  'reparto', 'dripper', 'tiempo_total', 'drawdown_s', 'extraido_g',
  'variable_cambiada', 'defecto', 'notas_cata', 'nota', 'siguiente_ajuste',
] as const

const form = reactive<Record<string, any>>({})
const enviando = ref(false)
const errores = ref<string[]>([])
const guardado = ref<string[] | null>(null)
const tokenVisible = ref('')
const errorSesion = ref('')
const dialogo = ref<HTMLDialogElement | null>(null)
const retirando = ref(false)

watchEffect(() => {
  if (!original.value) return
  for (const campo of EDITABLES) form[campo] = (original.value as Extraccion)[campo] ?? ''
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

const cambios = computed(() => {
  if (!original.value) return {}
  const salida: Record<string, unknown> = {}
  for (const campo of EDITABLES) {
    const antes = (original.value as Extraccion)[campo] ?? ''
    const ahora = form[campo] ?? ''
    if (String(antes) !== String(ahora)) salida[campo] = ahora === '' ? null : ahora
  }
  return salida
})

const hayCambios = computed(() => Object.keys(cambios.value).length > 0)

async function guardar() {
  errores.value = []
  guardado.value = null
  enviando.value = true
  try {
    const r = await editarExtraccion(id, cambios.value)
    guardado.value = r.cambiado
    if (historial.value) {
      const i = historial.value.findIndex((e) => e.id === id)
      if (i >= 0) historial.value[i] = r.extraccion
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
    await router.push('/')
  } catch (fallo) {
    errores.value = erroresDe(fallo)
    dialogo.value?.close()
  } finally {
    retirando.value = false
  }
}
</script>

<template>
  <p class="volver"><NuxtLink to="/">‹ Volver</NuxtLink></p>

  <p v-if="!original" class="meta">No hay ninguna extracción #{{ id }}.</p>

  <template v-else>
    <p v-if="!comprobada" class="meta">Comprobando sesión…</p>

    <section v-else-if="!activa" class="tarjeta">
      <h2>Abrir sesión</h2>
      <p class="meta">Hace falta para corregir.</p>
      <input v-model="tokenVisible" type="password" placeholder="token" autocomplete="off">
      <p v-if="errorSesion" class="fallo">{{ errorSesion }}</p>
      <button :disabled="!tokenVisible.trim()" @click="iniciarSesion">Entrar</button>
    </section>

    <form v-else @submit.prevent="guardar">
      <h2>Extracción #{{ original.id }} · {{ original.cafe_nombre }}</h2>

      <label>
        Café
        <select v-model="form.cafe_id">
          <option v-for="c in bolsas ?? []" :key="c.id" :value="c.id">{{ c.nombre }}</option>
        </select>
      </label>

      <div class="pareja">
        <label>Fecha<input v-model="form.fecha" type="date"></label>
        <label>Tiempo total<input v-model="form.tiempo_total" placeholder="3:30"></label>
      </div>

      <div class="pareja">
        <label>Dosis (g)<input v-model="form.dosis_g" type="number" step="0.1" min="1" inputmode="decimal"></label>
        <label>Agua (g)<input v-model="form.agua_g" type="number" step="1" min="1" inputmode="numeric"></label>
      </div>

      <div class="pareja">
        <label>Temperatura (°C)<input v-model="form.temp_c" type="number" step="1" min="0" max="100" inputmode="numeric"></label>
        <label>Clics<input v-model="form.clics" type="number" step="1" min="0" inputmode="numeric"></label>
      </div>

      <div class="pareja">
        <label>
          Receta
          <select v-model="form.receta_id">
            <option v-for="r in catalogo ?? []" :key="r.id" :value="r.id">{{ r.nombre }}</option>
          </select>
        </label>
        <label>Goteo (s)<input v-model="form.drawdown_s" type="number" step="1" min="0" inputmode="numeric"></label>
      </div>

      <div class="pareja">
        <label>
          Dripper
          <select v-model="form.dripper">
            <option v-for="(etiqueta, clave) in DRIPPERS" :key="clave" :value="clave">
              {{ etiqueta }}
            </option>
          </select>
        </label>
        <label>En la taza (g)<input v-model="form.extraido_g" type="number" step="1" min="1" inputmode="numeric"></label>
      </div>

      <label>Reparto<input v-model="form.reparto" placeholder="60-60-90-90"></label>
      <label>Variable cambiada<input v-model="form.variable_cambiada"></label>

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

      <label>Notas de cata<textarea v-model="form.notas_cata" rows="2" /></label>
      <label>Siguiente ajuste<input v-model="form.siguiente_ajuste"></label>

      <button type="submit" :disabled="enviando || !hayCambios">
        {{ enviando ? 'Guardando…' : hayCambios ? 'Guardar cambios' : 'Sin cambios' }}
      </button>

      <button type="button" class="retirar" @click="dialogo?.showModal()">
        Retirar esta extracción
      </button>
    </form>
  </template>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>¿Retirar la extracción #{{ id }}?</h3>
    <p>
      No se borra: queda marcada y deja de contar para las sugerencias. Se puede
      restaurar.
    </p>
    <p class="ojo">
      Retira solo <strong>errores de registro</strong>. Si quitas las
      extracciones que salieron mal, las medias suben solas y los deltas
      emparejados dejan de significar nada.
    </p>
    <div class="botones">
      <button type="button" class="secundario" @click="dialogo?.close()">Cancelar</button>
      <button type="button" class="peligro" :disabled="retirando" @click="retirar">
        {{ retirando ? 'Retirando…' : 'Retirar' }}
      </button>
    </div>
  </dialog>

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
  color: #fff;
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
  color: #c2410c;
  border: 1px solid #c2410c;
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
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }
dialog .ojo { color: #c2410c; }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.secundario { background: transparent; color: var(--suave); border: 1px solid var(--linea); font-weight: 400; }
.peligro { background: #c2410c; }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
}

.tarjeta input { width: 100%; margin: 0.5rem 0; }
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.fallo { color: #c2410c; font-size: 0.85rem; }
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
.exito { border-color: var(--acento); }
a { color: var(--acento); }
</style>
