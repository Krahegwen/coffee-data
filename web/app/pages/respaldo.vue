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

const { t, locale } = useI18n()
useHead({ title: () => t('respaldo.titulo') })

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

/*
 * Quien abre esta pantalla está cuidando sus datos: buen momento para pedir
 * la persistencia si aún no está, y para decir en qué quedó. Solo en local
 * — con sesión la copia buena es el servidor— y solo si el navegador sabe
 * contestar; en null no se pinta nada.
 */
const persistente = ref<boolean | null>(null)
onMounted(async () => {
  if (activa.value || !sabePersistir()) return
  persistente.value = await pedirPersistencia()
})

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
  iso
    ? new Date(iso).toLocaleDateString(locale.value === 'en' ? 'en-GB' : 'es-ES', {
        day: 'numeric', month: 'short', year: 'numeric',
      })
    : null
</script>

<template>
  <Migas :ruta="[{ texto: $t('respaldo.titulo') }]" />

  <section class="tarjeta">
    <h2>{{ $t('respaldo.descargar_titulo') }}</h2>
    <p class="meta">{{ $t('respaldo.que_es') }}</p>
    <p v-if="resumen" class="meta">
      {{ $t('respaldo.ahora_mismo', {
        cafes: $t('respaldo.n_bolsas', { n: resumen.cafes }, resumen.cafes),
        recetas: $t('respaldo.n_recetas', { n: resumen.recetas }, resumen.recetas),
        extracciones: $t('respaldo.n_extracciones', { n: resumen.extracciones }, resumen.extracciones),
      }) }}
      {{ ultimo ? $t('respaldo.ultimo', { fecha: fechaLegible(ultimo) }) : $t('respaldo.ninguno') }}
    </p>
    <button type="button" :disabled="generando" @click="descargar">
      {{ generando ? $t('respaldo.preparando') : $t('respaldo.descargar') }}
    </button>
    <p v-if="erroresDescarga.length" class="fallo">{{ erroresDescarga.join(' · ') }}</p>
    <p v-if="persistente === true" class="meta">{{ $t('respaldo.persistente_si') }}</p>
    <p v-else-if="persistente === false" class="meta">{{ $t('respaldo.persistente_no') }}</p>
  </section>

  <section class="tarjeta">
    <h2>{{ $t('respaldo.restaurar_titulo') }}</h2>
    <template v-if="activa">
      <p class="meta">{{ $t('respaldo.con_sesion') }}</p>
    </template>
    <template v-else>
      <i18n-t keypath="respaldo.reemplaza" tag="p" class="meta" scope="global">
        <template #reemplaza><strong>{{ $t('respaldo.reemplaza_enfasis') }}</strong></template>
      </i18n-t>
      <input
        ref="fichero" type="file" accept=".zip,application/zip" hidden
        @change="elegir"
      >
      <button type="button" class="secundario" :disabled="leyendo" @click="fichero?.click()">
        {{ leyendo ? $t('respaldo.leyendo') : $t('respaldo.elegir') }}
      </button>
      <p v-if="erroresRestauracion.length" class="fallo">
        {{ $t('respaldo.no_restaurado') }} · {{ erroresRestauracion.join(' · ') }}
      </p>
      <p v-if="restaurado" class="exito-linea">{{ $t('respaldo.restaurado') }}</p>
    </template>
  </section>

  <dialog ref="dialogo" @cancel="dialogo?.close()">
    <h3>{{ $t('respaldo.confirmar_titulo') }}</h3>
    <template v-if="cargado">
      <p>
        {{ $t('respaldo.del_dia', {
          fecha: fechaLegible(cargado.contenido.manifiesto.creado),
          cafes: $t('respaldo.n_bolsas', { n: cargado.preparado.cafes.length }, cargado.preparado.cafes.length),
          recetas: $t('respaldo.n_recetas', { n: cargado.preparado.recetas.length }, cargado.preparado.recetas.length),
          extracciones: $t('respaldo.n_extracciones', { n: cargado.preparado.extracciones.length }, cargado.preparado.extracciones.length),
          fotos: $t('respaldo.n_fotos', { n: cargado.contenido.fotos.length }, cargado.contenido.fotos.length),
        }) }}
      </p>
      <p v-if="resumen">
        {{ $t('respaldo.reemplazara', {
          cafes: $t('respaldo.n_bolsas', { n: resumen.cafes }, resumen.cafes),
          recetas: $t('respaldo.n_recetas', { n: resumen.recetas }, resumen.recetas),
          extracciones: $t('respaldo.n_extracciones', { n: resumen.extracciones }, resumen.extracciones),
        }) }}
      </p>
      <p v-for="aviso in cargado.preparado.avisos" :key="aviso" class="fallo">{{ aviso }}</p>
    </template>
    <div class="botones">
      <button type="button" class="cancelar" @click="dialogo?.close()">{{ $t('comun.cancelar') }}</button>
      <button type="button" class="peligro" :disabled="restaurando" @click="restaurar">
        {{ restaurando ? $t('respaldo.restaurando') : $t('respaldo.restaurar') }}
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
  color: var(--sobre-acento);
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

.fallo { color: var(--peligro); font-size: 0.85rem; margin: 0.5rem 0 0; }
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
.peligro { background: var(--peligro); color: var(--sobre-peligro); }
.cancelar { background: transparent; color: var(--tinta); border: 1px solid var(--linea); }
</style>
