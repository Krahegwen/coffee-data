<script setup lang="ts">
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
 * El portero de toda la app: desde que los GET van protegidos, sin sesión no
 * hay ni una pantalla que pueda pintar datos, así que se pregunta una vez
 * aquí en vez de repetir la tarjeta en cada pantalla.
 *
 * Es la situación de esta fase del plan, no la final: cuando exista el modo
 * local, quien no tenga sesión trabajará contra su navegador y esta tarjeta
 * quedará detrás del gesto del pie.
 */
const { activa, comprobada, comprobar, abrir } = useSesion()
const tokenVisible = ref('')
const errorSesion = ref('')
const abriendo = ref(false)

onMounted(comprobar)

async function iniciarSesion() {
  errorSesion.value = ''
  abriendo.value = true
  try {
    await abrir(tokenVisible.value)
    tokenVisible.value = ''
    // Las pantallas ya dispararon sus cargas y recibieron 401: se repiten
    // ahora que la cookie existe.
    await refreshNuxtData()
  } catch {
    errorSesion.value = 'Ese token no es'
  } finally {
    abriendo.value = false
  }
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
      <NuxtLink to="/recetas" class="atajo">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
          <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
          <path d="M8 7.5h7M8 11h5" />
        </svg>
        Recetas
      </NuxtLink>
    </header>
    <main>
      <p v-if="!comprobada" class="meta-sesion">Comprobando sesión…</p>

      <section v-else-if="!activa" class="portero">
        <h2>Abrir sesión</h2>
        <p>
          La bitácora es privada: hace falta el token también para mirar. Se
          pide una vez por dispositivo y se cambia por una cookie que este
          código no puede leer.
        </p>
        <input
          v-model="tokenVisible" type="password" placeholder="token"
          autocomplete="off" @keyup.enter="iniciarSesion"
        >
        <p v-if="errorSesion" class="fallo-sesion">{{ errorSesion }}</p>
        <button type="button" :disabled="abriendo || !tokenVisible.trim()" @click="iniciarSesion">
          {{ abriendo ? 'Abriendo…' : 'Entrar' }}
        </button>
      </section>

      <NuxtPage v-else />
    </main>
    <footer>
      <p>v{{ version }}</p>
      <p>© 2026 Krahegwen · MIT</p>
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

/* El portero de sesión. Mismo aire que las tarjetas de las pantallas. */
.portero {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.9rem;
  margin-top: 1.25rem;
}

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
