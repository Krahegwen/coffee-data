<script setup lang="ts">
const { cafes, crearCafe } = useApi()
const { activa, comprobada, comprobar, abrir } = useSesion()
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
const copiaDe = computed(
  () => (bolsas.value ?? []).find((c) => c.id === String(route.query.de ?? '')) ?? null,
)

useHead({ title: () => (copiaDe.value ? `Otra de ${copiaDe.value.nombre}` : 'Nueva bolsa') })

const form = reactive<Record<string, any>>({
  nombre: '', tostador: '', origen: '', region: '', variedad: '',
  proceso: '', altitud_m: '', sca: '', fecha_tueste: '', consumir_antes: '',
  peso_g: '', precio_eur: '', notas_tostador: '', estado: 'abierto',
  fecha_apertura: '', url: '', conservacion: '',
})

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
  for (const campo of DEL_CAFE) {
    const valor = origen[campo]
    if (valor !== null && valor !== undefined) form[campo] = valor
  }
})

const enviando = ref(false)
const errores = ref<string[]>([])
const tokenVisible = ref('')
const errorSesion = ref('')

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
  enviando.value = true
  try {
    // Los vacíos no se mandan: el servidor los dejaría a null igual, pero así
    // el cuerpo dice solo lo que sabes.
    const datos = Object.fromEntries(
      Object.entries(form).filter(([, v]) => String(v ?? '').trim() !== ''),
    )
    const { cafe } = await crearCafe(datos)
    await router.push(`/cafes/${cafe.id}`)
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

  <p v-if="!comprobada" class="meta">Comprobando sesión…</p>

  <section v-else-if="!activa" class="tarjeta">
    <h2>Abrir sesión</h2>
    <p class="meta">
      Una vez por dispositivo. El token no se guarda aquí: se cambia por una
      cookie que este código no puede leer.
    </p>
    <input v-model="tokenVisible" type="password" placeholder="token" autocomplete="off">
    <p v-if="errorSesion" class="fallo">{{ errorSesion }}</p>
    <button :disabled="!tokenVisible.trim()" @click="iniciarSesion">Entrar</button>
  </section>

  <form v-else @submit.prevent="enviar">
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
