<script setup lang="ts">
import { almacenLocal } from '~/almacen/local'

/**
 * El título de cada pantalla se cuelga del nombre de la app. Importa más de
 * lo que parece: es lo que se lee en la pestaña, en los marcadores y, ya
 * instalada, en el conmutador de aplicaciones del móvil.
 */
const APP = 'Bitácora de café'

/**
 * La versión la sube el hook de pre-commit y viaja dentro del bundle. En el
 * pie porque, instalada como PWA, es la única forma de saber si el service
 * worker ya te ha dado el despliegue nuevo o sigues con el de ayer.
 */
const { version } = useRuntimeConfig().public

/**
 * Todo vive en el cajón local; la sesión, detrás del pie, solo decide si
 * además se sincroniza.
 *
 * Sin sesión, los datos son de este navegador y ahí se quedan. Con ella, la
 * cola de salida sube cada escritura al Worker y el refresco trae de vuelta
 * la copia buena: al abrir, al volver a la pestaña, al recuperar la red y a
 * mano desde el pie. El primer pintado espera a ese refresco —si hay red,
 * dura lo que cuatro GET; si no, nada— para no enseñar un cajón viejo.
 *
 * La puerta a la sesión son cinco toques en el número de versión. No es
 * seguridad, es discreción: a quien la app le funciona en local no le sale
 * un formulario de token que no le sirve, y lo que protege de verdad sigue
 * siendo el token.
 */
const { activa, comprobada, comprobar, abrir, cerrar } = useSesion()
const ruta = useRoute()

/**
 * El atajo a las recetas, solo donde es atajo: en la portada y en el
 * formulario de preparar, que es donde uno cae con la receta en la cabeza.
 * En /recetas era un enlace a la página que ya estás viendo, y en el resto
 * compite con las migas, que ya llevan a todas partes.
 */
const conAtajo = computed(() => ruta.path === '/' || ruta.path === '/crono')
const { pendientes, atasco, sincronizando, refrescar, recontar } = useSincro()
const tokenVisible = ref('')
const errorSesion = ref('')
const abriendo = ref(false)
const panelSesion = ref(false)
const lista = ref(false)

let toques = 0
let ultimoToque = 0

function tocarVersion() {
  const ahora = Date.now()
  if (ahora - ultimoToque > 2000) toques = 0
  ultimoToque = ahora
  toques += 1
  if (toques >= 5) {
    toques = 0
    panelSesion.value = !panelSesion.value
  }
}

/** Refresca y, si de verdad bajó algo, repinta lo que haya cargado. */
async function actualizar(opciones: { minimo?: number } = {}) {
  if (await refrescar(opciones)) await refreshNuxtData()
}

onMounted(async () => {
  await comprobar()
  if (activa.value) await refrescar()
  await recontar()
  lista.value = true

  // En local, el navegador es el único sitio donde existen los datos: en
  // cuanto hay algo que perder se le pide que no limpie el cajón. Con
  // sesión no hace falta — la copia buena es el servidor.
  if (!activa.value) void persistirConDatos()

  // Al volver a la pestaña tras un rato, y en cuanto vuelva la red: es como
  // se entera este dispositivo de lo que se registró en el otro.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void actualizar({ minimo: 60_000 })
  })
  window.addEventListener('online', () => void actualizar())
})

async function iniciarSesion() {
  errorSesion.value = ''
  abriendo.value = true
  try {
    await abrir(tokenVisible.value)
    tokenVisible.value = ''
    panelSesion.value = false
    // Lo local pasa a ser la copia del servidor, y se repinta con ella.
    await refrescar()
    await refreshNuxtData()
  } catch {
    errorSesion.value = 'Ese token no es'
  } finally {
    abriendo.value = false
  }
}

async function cerrarSesion() {
  await cerrar()
  panelSesion.value = false
  // Y de vuelta al cajón local de este navegador.
  await refreshNuxtData()
}

/** Pide la persistencia solo si el cajón ya guarda algo propio. */
async function persistirConDatos() {
  const almacen = await almacenLocal()
  const [bolsas, extracciones] = await Promise.all([
    almacen.cafes.listar(),
    almacen.extracciones.listar(),
  ])
  if (bolsas.length || extracciones.length) await pedirPersistencia()
}

useHead({
  // El título estático del HTML ya es el nombre de la app: si se colase por
  // la plantilla saldría repetido en la portada.
  titleTemplate: (pantalla?: string) =>
    !pantalla || pantalla === APP ? APP : `${pantalla} · ${APP}`,
})
</script>

<template>
  <div class="marco">
    <header>
      <h1>Bitácora de café</h1>
      <!-- Las recetas se consultan a menudo y se editan poco, así que viven
           arriba y siempre a la misma altura en vez de ocupar un botón en la
           portada. -->
      <NuxtLink v-if="conAtajo" to="/recetas" class="atajo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
          <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
          <path d="M8 7.5h7M8 11h5" />
        </svg>
        Recetas
      </NuxtLink>
    </header>
    <main>
      <p v-if="!comprobada || !lista" class="meta-sesion">Un momento…</p>
      <NuxtPage v-else />
    </main>
    <footer>
      <!-- Cinco toques abren el panel de sesión. La coletilla dice el modo:
           sin nada, tus datos viven en este navegador. -->
      <p @click="tocarVersion">v{{ version }}<template v-if="activa"> · en el servidor</template></p>
      <!-- El estado de la cola, siempre a la vista: una cola en silencio es
           una pérdida de datos esperando. Y de paso es el tirador de
           actualizar, para cuando uno desconfía. -->
      <p v-if="activa">
        <button
          type="button" class="sincro" :class="{ pendiente: pendientes, atascada: atasco }"
          :disabled="sincronizando" @click="actualizar()"
        >
          {{ sincronizando ? 'Sincronizando…'
            : pendientes ? `${pendientes} por subir` : 'Al día' }}
        </button>
      </p>
      <!-- El respaldo vive en el pie: se usa poco, pero tiene que poder
           encontrarse sin que nadie te lo cuente. -->
      <p><NuxtLink to="/respaldo" class="enlace-pie">Respaldo</NuxtLink></p>
      <!-- Un enlace y no el widget de Ko-fi: un script de terceros no pinta
           nada en una app que presume de no mandar datos a ningún sitio. Y
           servir esto no cuesta nada — es para quien quiera invitar, no para
           cubrir gastos. -->
      <p>
        © 2026 Krahegwen · MIT ·
        <a class="kofi" href="https://ko-fi.com/krahegwen" target="_blank" rel="noopener">
          Invítame a un café
        </a>
      </p>

      <section v-if="panelSesion" class="portero">
        <template v-if="!activa">
          <h2>Abrir sesión</h2>
          <p>
            Con sesión, lo que registres se sube al servidor y lo que haya
            allí baja aquí. Sin ella, todo vive en este navegador. El token se
            pide una vez y se cambia por una cookie que este código no puede
            leer.
          </p>
          <input
            v-model="tokenVisible" type="password" placeholder="token"
            autocomplete="off" @keyup.enter="iniciarSesion"
          >
          <p v-if="errorSesion" class="fallo-sesion">{{ errorSesion }}</p>
          <button type="button" :disabled="abriendo || !tokenVisible.trim()" @click="iniciarSesion">
            {{ abriendo ? 'Abriendo…' : 'Entrar' }}
          </button>
        </template>
        <template v-else>
          <h2>Sesión abierta</h2>
          <p>
            La bitácora se guarda en este navegador y la cola la va subiendo
            al servidor.
          </p>
          <p v-if="atasco" class="fallo-sesion">
            Hay una escritura que el servidor no acepta: {{ atasco }}
          </p>
          <p v-if="pendientes" class="fallo-sesion">
            Quedan {{ pendientes }} por subir: si cierras la sesión ahora, no
            subirán.
          </p>
          <button type="button" class="cerrar" :disabled="pendientes > 0" @click="cerrarSesion">
            Cerrar sesión
          </button>
        </template>
      </section>
    </footer>
  </div>
</template>

<style>
:root {
  --fondo: #faf7f2;
  --tinta: #2b1d13;
  --suave: #7a6a5c;
  --linea: #e6ddd1;
  --tostado: #3b2314;
  --acento: #8b5a2b;
  --tarjeta: #fff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fondo: #17120e;
    --tinta: #f2ece4;
    --suave: #a3948a;
    --linea: #2f251d;
    --tostado: #d9b892;
    --acento: #c98d4f;
    --tarjeta: #1f1913;
  }
}

* { box-sizing: border-box; }

/*
 * Nada de selección accidental. Esto se usa a dedo y con las manos ocupadas:
 * un pulsado un poco largo en el cronómetro o en un botón sacaba el resaltado
 * y el menú de copiar justo encima de lo que estabas mirando, y en el círculo
 * de pausa, que ahora se pulsa a menudo, pasaba en cuanto el dedo se movía un
 * milímetro.
 *
 * Se deja seleccionable lo que uno querría copiar de verdad: lo que hay en un
 * campo y los textos libres marcados como `.copiable`.
 */
body {
  -webkit-user-select: none;
  user-select: none;
  /* El destello azul del navegador al tocar: los botones ya tienen su propio
     estado de pulsado. */
  -webkit-tap-highlight-color: transparent;
}

input, textarea, select, .copiable {
  -webkit-user-select: text;
  user-select: text;
}

/* Sin esto, dos toques seguidos en el mismo sitio —pausar y reanudar— los
   toma el navegador como doble toque y hace zoom. */
button, a, label, select { touch-action: manipulation; }

body {
  margin: 0;
  background: var(--fondo);
  color: var(--tinta);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  /* Que el contenido no se meta bajo la barra del móvil. */
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.marco {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 1rem;
}

/* El hueco lo ponía el lema, que ya no está: ahora lo pone la cabecera. */
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

header h1 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: -0.01em;
}

/*
 * 44 px de alto para el dedo, y el margen negativo de la derecha cancela su
 * relleno: así el texto acaba a ras del borde del contenido y no medio
 * centímetro antes que todo lo demás.
 */
.atajo {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: none;
  min-height: 44px;
  padding: 0 0.7rem;
  margin-right: -0.7rem;
  color: var(--suave);
  font-size: 0.85rem;
  text-decoration: none;
}

.atajo:hover { color: var(--acento); }

/*
 * Las parejas de campos son un grid de 1fr 1fr, y sus hijos —las etiquetas—
 * llevan de serie min-width: auto. Eso impide que la columna encoja por
 * debajo del ancho intrínseco del campo que envuelven: un input de texto
 * pide 204 px y uno de fecha 169, así que en el móvil la fila se salía y
 * la página se podía arrastrar de lado. Ponerlo en el input no basta: el
 * ítem del grid es la etiqueta. Va aquí porque .pareja se repite en cinco
 * pantallas y el fallo era el mismo en todas.
 */
.pareja > * { min-width: 0; }

/*
 * El campo del token, en la tarjeta de abrir sesión que aparece en cinco
 * pantallas. Daba 39 px: es el primer control que toca quien estrena el
 * móvil, y era el más pequeño de la app.
 */
input[type="password"] { min-height: 44px; }

/*
 * El pie. Va callado a propósito —esto se abre para hacer café, no para leer
 * el copyright— pero la versión tiene que estar a mano: es lo que se mira
 * cuando dudas de si la app instalada es la última.
 */
footer {
  margin-top: 3rem;
  padding-top: 1rem;
  border-top: 1px solid var(--linea);
  color: var(--suave);
  font-size: 0.75rem;
  text-align: center;
}

footer p { margin: 0.15rem 0; }

/*
 * El estado de la cola, como texto discreto que además es botón. El color
 * sube de tono con lo que hay: nada que subir, pendientes, o una entrada
 * que el servidor rechaza.
 */
.sincro {
  font: inherit;
  color: var(--suave);
  background: none;
  border: 0;
  padding: 0.35rem 0.6rem;
  min-height: 32px;
  cursor: pointer;
}

.sincro.pendiente { color: var(--acento); font-weight: 600; }
.sincro.atascada { color: #c2410c; font-weight: 600; }
.sincro:disabled { cursor: default; opacity: 0.7; }

.enlace-pie {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 0.6rem;
  color: var(--suave);
  text-decoration: underline;
}

.enlace-pie:hover { color: var(--acento); }

.kofi { color: var(--suave); text-decoration: underline; }
.kofi:hover { color: var(--acento); }

/* El panel de sesión, detrás de los cinco toques. Alineado a la izquierda:
   dentro del pie centrado parecería un aviso y es un formulario. */
.portero {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
  text-align: left;
}

.portero .cerrar { background: transparent; color: #c2410c; border: 1px solid #c2410c; }

.portero h2 { font-size: 1.05rem; margin: 0 0 0.35rem; }
.portero p { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }

.portero input {
  font: inherit; font-size: 16px; width: 100%; margin: 0.5rem 0; min-height: 44px;
  color: var(--tinta); background: var(--fondo);
  border: 1px solid var(--linea); border-radius: 0.5rem; padding: 0.6rem 0.65rem;
}

.portero button {
  font: inherit; font-weight: 600; width: 100%; min-height: 3rem;
  color: #fff; background: var(--acento); border: 0; border-radius: 0.6rem;
  padding: 0.85rem 1rem; cursor: pointer;
}

.portero button:disabled { opacity: 0.5; cursor: default; }
.portero .fallo-sesion { color: #c2410c; }

.meta-sesion { color: var(--suave); font-size: 0.85rem; }
</style>
