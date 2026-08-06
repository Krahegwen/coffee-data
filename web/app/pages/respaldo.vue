<script setup lang="ts">
/**
 * Respaldo y restauración. Se llama respaldo y no «exportar» a propósito:
 * restaurar **reemplaza**, no fusiona, y el nombre tiene que poner esa
 * expectativa antes que ningún aviso.
 *
 * Con sesión solo se ofrece descargar: la copia buena es el servidor y una
 * restauración local la pisaría el siguiente refresco. La restauración es
 * del modo local — la mudanza de un navegador a otro.
 */
import { almacenLocal, cajonLocal } from '~/almacen/local'
import {
  aplicarRestauracion, crearRespaldo, leerRespaldo, prepararRestauracion,
} from '~/almacen/respaldo'

const { activa } = useSesion()
const { version } = useRuntimeConfig().public

useHead({ title: 'Respaldo' })

const { data: resumen, refresh: recontar } = await useAsyncData('respaldo-resumen', async () => {
  const almacen = await almacenLocal(!activa.value)
  const [cafes, recetas, extracciones] = await Promise.all([
    almacen.cafes.listar(), almacen.recetas.listar(), almacen.extracciones.listar(),
  ])
  return { cafes: cafes.length, recetas: recetas.length, extracciones: extracciones.length }
})

const ultimo = ref(localStorage.getItem('coffee.respaldo'))
const generando = ref(false)
const erroresDescarga = ref<string[]>([])

async function descargar() {
  erroresDescarga.value = []
  generando.value = true
  try {
    const almacen = await almacenLocal(!activa.value)
    const { nombre, bytes } = await crearRespaldo(almacen, { version: String(version) })
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = nombre
    enlace.click()
    URL.revokeObjectURL(url)
    ultimo.value = new Date().toISOString()
    localStorage.setItem('coffee.respaldo', ultimo.value)
  } catch (fallo) {
    erroresDescarga.value = erroresDe(fallo)
  } finally {
    generando.value = false
  }
}

/* La vuelta: elegir el ZIP, ver qué trae, y solo entonces reemplazar. */
const fichero = ref<HTMLInputElement | null>(null)
const dialogo = ref<HTMLDialogElement | null>(null)
const leyendo = ref(false)
const restaurando = ref(false)
const restaurado = ref(false)
const erroresRestauracion = ref<string[]>([])
/*
 * shallowRef y no ref: dentro van las filas que acabarán en IndexedDB, y el
 * proxy reactivo de Vue no se deja clonar — `put` revienta con DataCloneError.
 * De la caja solo se lee; la reactividad profunda no pintaba nada.
 */
const cargado = shallowRef<{
  contenido: Awaited<ReturnType<typeof leerRespaldo>>
  preparado: Awaited<ReturnType<typeof prepararRestauracion>>
} | null>(null)

async function elegir(evento: Event) {
  const zip = (evento.target as HTMLInputElement).files?.[0]
  if (!zip) return
  erroresRestauracion.value = []
  restaurado.value = false
  cargado.value = null
  leyendo.value = true
  try {
    const contenido = await leerRespaldo(new Uint8Array(await zip.arrayBuffer()))
    const preparado = await prepararRestauracion(contenido)
    cargado.value = { contenido, preparado }
    dialogo.value?.showModal()
  } catch (fallo) {
    erroresRestauracion.value = erroresDe(fallo)
  } finally {
    leyendo.value = false
    if (fichero.value) fichero.value.value = ''
  }
}

const urlsFotos = useState<Record<string, string>>('fotos-locales', () => ({}))

async function restaurar() {
  if (!cargado.value) return
  restaurando.value = true
  try {
    await aplicarRestauracion(cajonLocal(), cargado.value.preparado, cargado.value.contenido.fotos)
    // Los object URL apuntaban a los Blob de antes: fuera, y que las
    // pantallas los vuelvan a pedir del cajón ya restaurado.
    for (const url of Object.values(urlsFotos.value)) URL.revokeObjectURL(url)
    urlsFotos.value = {}
    dialogo.value?.close()
    cargado.value = null
    restaurado.value = true
    await recontar()
    await refreshNuxtData()
  } catch (fallo) {
    dialogo.value?.close()
    erroresRestauracion.value = erroresDe(fallo)
  } finally {
    restaurando.value = false
  }
}

const fechaLegible = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : null
</script>

<template>
  <Migas :ruta="[{ texto: 'Respaldo' }]" />

  <section class="tarjeta">
    <h2>Descargar respaldo</h2>
    <p class="meta">
      Un ZIP con la bitácora entera: bolsas, recetas, extracciones y fotos,
      en los mismos CSV que guarda el repo. Sirve de copia y de mudanza a
      otro navegador.
    </p>
    <p v-if="resumen" class="meta">
      Ahora mismo: {{ resumen.cafes }} bolsas, {{ resumen.recetas }} recetas y
      {{ resumen.extracciones }} extracciones.
      <template v-if="ultimo">Último respaldo: {{ fechaLegible(ultimo) }}.</template>
      <template v-else>Todavía no has descargado ninguno.</template>
    </p>
    <button type="button" :disabled="generando" @click="descargar">
      {{ generando ? 'Preparando…' : 'Descargar respaldo' }}
    </button>
    <p v-if="erroresDescarga.length" class="fallo">{{ erroresDescarga.join(' · ') }}</p>
  </section>

  <section class="tarjeta">
    <h2>Restaurar</h2>
    <template v-if="activa">
      <p class="meta">
        Con la sesión abierta, la copia buena es el servidor: restaurar aquí
        no tendría efecto, porque el siguiente refresco volvería a traer lo
        del servidor. La restauración es para el modo local.
      </p>
    </template>
    <template v-else>
      <p class="meta">
        Restaurar <strong>reemplaza</strong> lo que hay en este navegador por
        lo que traiga el respaldo. No fusiona: lo de ahora se va.
      </p>
      <input
        ref="fichero" type="file" accept=".zip,application/zip" hidden
        @change="elegir"
      >
      <button type="button" class="secundario" :disabled="leyendo" @click="fichero?.click()">
        {{ leyendo ? 'Leyendo…' : 'Elegir un respaldo' }}
      </button>
      <p v-if="erroresRestauracion.length" class="fallo">
        No se ha restaurado nada · {{ erroresRestauracion.join(' · ') }}
      </p>
      <p v-if="restaurado" class="exito-linea">
        Restaurado. La bitácora es ahora la del respaldo.
      </p>
    </template>
  </section>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>¿Restaurar este respaldo?</h3>
    <template v-if="cargado">
      <p>
        Del {{ fechaLegible(cargado.contenido.manifiesto.creado) }}:
        {{ cargado.preparado.cafes.length }} bolsas,
        {{ cargado.preparado.recetas.length }} recetas,
        {{ cargado.preparado.extracciones.length }} extracciones y
        {{ cargado.contenido.fotos.length }} fotos.
      </p>
      <p v-if="resumen">
        Reemplazará lo que hay ahora — {{ resumen.cafes }} bolsas,
        {{ resumen.recetas }} recetas y {{ resumen.extracciones }}
        extracciones — y no hay vuelta atrás.
      </p>
      <p v-for="aviso in cargado.preparado.avisos" :key="aviso" class="fallo">{{ aviso }}</p>
    </template>
    <div class="botones">
      <button type="button" class="cancelar" @click="dialogo?.close()">Cancelar</button>
      <button type="button" class="peligro" :disabled="restaurando" @click="restaurar">
        {{ restaurando ? 'Restaurando…' : 'Restaurar' }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-bottom: 1rem;
}

.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }

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

.secundario {
  background: transparent;
  color: var(--tinta);
  border: 1px solid var(--linea);
}

.fallo { color: #c2410c; font-size: 0.85rem; margin: 0.5rem 0 0; }
.exito-linea { color: var(--acento); font-size: 0.85rem; font-weight: 600; margin: 0.5rem 0 0; }

dialog {
  border: 1px solid var(--linea);
  border-radius: 0.8rem;
  background: var(--tarjeta);
  color: var(--tinta);
  padding: 1rem;
  max-width: min(28rem, calc(100% - 2rem));
  margin: auto;
  overflow-wrap: anywhere;
}

dialog::backdrop { background: rgb(0 0 0 / 0.5); }
dialog h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
dialog p { font-size: 0.88rem; margin: 0 0 0.75rem; color: var(--suave); }

.botones { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.botones button { margin-top: 0; }
.peligro { background: #c2410c; }
.cancelar { background: transparent; color: var(--tinta); border: 1px solid var(--linea); }
</style>
