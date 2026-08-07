<script setup lang="ts">
const { cafes, crearCafe } = useApi()
const router = useRouter()
const route = useRoute()

const { data: bolsas } = await useAsyncData('cafes-nueva', cafes)

/**
 * De qué bolsa se copia, si vienes de duplicar una.
 *
 * Una fila por bolsa y no por café es deliberado: lo que hace la taza no es
 * «Gary», es este Gary tostado el 20 de mayo. Si dos bolsas compartieran id,
 * el motor emparejaría extracciones de tuestes distintos como si fueran
 * comparables. Lo que sobraba era volver a teclear la ficha, no la fila.
 */
const copiaDe = computed(() => {
  const ref = String(route.query.de ?? '')
  return (bolsas.value ?? []).find((c) => c.slug === ref || c.id === ref) ?? null
})

useHead({ title: () => (copiaDe.value ? `Otra de ${copiaDe.value.nombre}` : 'Nueva bolsa') })

/**
 * El mismo `?de=` de «Otra bolsa», elegible también desde aquí: no hace
 * falta pasar por la ficha para partir de una que ya tienes. Va a la URL en
 * vez de a un ref para que copiar el enlace copie también el punto de
 * partida.
 */
const partirDe = computed({
  get: () => String(route.query.de ?? ''),
  set: (cual) => { void router.replace({ query: cual ? { de: cual } : {} }) },
})

const EN_BLANCO = (): Record<string, any> => ({
  nombre: '', tostador: '', origen: '', region: '', variedad: '',
  proceso: '', altitud_m: '', sca: '', fecha_tueste: '', consumir_antes: '',
  peso_g: '', precio_eur: '', notas_tostador: '', estado: 'abierto',
  fecha_apertura: '', url: '', conservacion: '',
})

/**
 * Borrador en memoria de la app: salir a mitad de ficha y volver no borra lo
 * tecleado. Se vacía al dar de alta o con «Vaciar»; un F5 también.
 */
const form = useState('borrador-bolsa', EN_BLANCO).value

/**
 * De qué bolsa se copió ya este borrador. Sin el sello, volver con `?de=` en
 * la URL pisaría lo editado con los datos de la bolsa de partida otra vez.
 */
const copiadaYa = useState('borrador-bolsa-de', () => '')

/**
 * Lo que describe al café y se repite en cada bolsa. El peso entra porque casi
 * siempre compras el mismo formato, y la conservación porque es tu bote.
 *
 * Fuera quedan las fechas, el precio y la foto: eso es de *esta* bolsa, y
 * heredarlo sería mentir sobre el tueste, que es justo el dato del que cuelga
 * todo lo demás.
 */
const DEL_CAFE = [
  'nombre', 'tostador', 'origen', 'region', 'variedad', 'proceso', 'altitud_m',
  'sca', 'notas_tostador', 'url', 'conservacion', 'peso_g',
]

watchEffect(() => {
  const origen = copiaDe.value as Record<string, unknown> | null
  if (!origen) return
  if (copiadaYa.value === String(origen.id)) return
  copiadaYa.value = String(origen.id)
  for (const campo of DEL_CAFE) {
    const valor = origen[campo]
    if (valor !== null && valor !== undefined) form[campo] = valor
  }
})

const enviando = ref(false)
const errores = ref<string[]>([])

/** La ficha en blanco otra vez, preset de la URL incluido. */
async function vaciar() {
  // La URL primero: si el sello se limpiara con la `?de=` aún puesta, el
  // watchEffect del preset volvería a copiar la bolsa en esa ventana.
  if (route.query.de !== undefined) await router.replace({ query: {} })
  Object.assign(form, EN_BLANCO())
  copiadaYa.value = ''
}

async function enviar() {
  errores.value = []
  enviando.value = true
  try {
    // Los vacíos no se mandan: el servidor los dejaría a null igual, pero así
    // el cuerpo dice solo lo que sabes.
    const datos = Object.fromEntries(
      Object.entries(form).filter(([, v]) => String(v ?? '').trim() !== ''),
    )
    const { cafe } = await crearCafe(datos)
    // Dada de alta, el borrador ya no es un borrador: la próxima empieza
    // limpia en vez de precargada con esta.
    await vaciar()
    await router.push(`/cafes/${cafe.slug}`)
  } catch (fallo) {
    errores.value = erroresDe(fallo)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <Migas
    :ruta="[
      { texto: 'Bolsas', a: '/cafes' },
      { texto: copiaDe ? `Otra de ${copiaDe.nombre}` : 'Nueva' },
    ]"
  />

  <form @submit.prevent="enviar">
    <!-- Arriba a la derecha, como en el resto de formularios: lo escrito
         sobrevive a salir y volver, y esto lo tira a propósito. -->
    <div class="cabecera-form">
      <button type="button" class="limpiar" @click="vaciar">Vaciar</button>
    </div>
    <label v-if="(bolsas ?? []).length" class="partir">
      Partir de otra bolsa
      <select v-model="partirDe">
        <option value="">— desde cero —</option>
        <option v-for="c in bolsas ?? []" :key="c.id" :value="c.slug">{{ c.nombre }}</option>
      </select>
    </label>
    <p v-if="copiaDe" class="pista">
      Copiado de <strong>{{ copiaDe.nombre }}</strong>: falta lo que cambia en
      cada bolsa —tueste, compra, precio y foto—. El id lo pone el servidor.
    </p>
    <CafeCampos v-model="form" nuevo />
    <button type="submit" :disabled="enviando">
      {{ enviando ? 'Guardando…' : 'Dar de alta' }}
    </button>
  </form>

  <section v-if="errores.length" class="tarjeta errores">
    <strong>No se ha guardado nada</strong>
    <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
  </section>
</template>

<style scoped>
.pista {
  color: var(--suave);
  font-size: 0.82rem;
  margin: 0 0 0.9rem;
}

.cabecera-form { display: flex; justify-content: flex-end; margin-bottom: -0.4rem; }

/* Texto pequeño y sin peso: vacía un borrador, no borra datos guardados. */
.limpiar {
  font: inherit;
  font-size: 0.8rem;
  color: var(--suave);
  background: none;
  border: 0;
  padding: 0.25rem 0;
  cursor: pointer;
  text-decoration: underline;
}

.limpiar:hover { color: var(--acento); }

.partir {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--suave);
  margin: 0 0 0.9rem;
}

.partir select {
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
.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.fallo { color: #c2410c; font-size: 0.85rem; }
.errores { border-color: #c2410c; }
.errores ul { margin: 0.5rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; }
a { color: var(--acento); }
</style>
