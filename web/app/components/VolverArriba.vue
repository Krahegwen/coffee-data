<script setup lang="ts">
/**
 * El botón de volver arriba en las pantallas largas.
 *
 * Va en `app.vue` una sola vez y no pantalla por pantalla. Lo que hace larga
 * una lista son **tus datos** —cuántas bolsas tengas, cuántas extracciones
 * lleves—, no el fichero: una lista fija de rutas acertaría hoy y fallaría en
 * tres meses, y habría que acordarse de añadir cada pantalla nueva. Aquí la
 * condición es la de verdad: hay bastante que subir.
 *
 * Con dos excepciones escritas abajo: el reloj, donde las manos están
 * ocupadas, y el pie, que se lo tapaba.
 */
const { t } = useI18n()
const ruta = useRoute()
const localePath = useLocalePath()

const visible = ref(false)
/** Cuánto se levanta para no pisar el pie, en píxeles. */
const levanta = ref(0)

/**
 * En el cronómetro no. Es la única pantalla que se usa con el hervidor en la
 * mano, no tiene scroll que merezca la pena, y un botón flotante ahí es una
 * pulsación sin querer esperando.
 */
const permitido = computed(() => ruta.path !== localePath('/crono/reloj'))

/**
 * Media pantalla de recorrido, no un número de píxeles: «he bajado un buen
 * rato» son píxeles distintos en el móvil y en el escritorio, y las mismas
 * pantallas.
 *
 * Y el apartado del pie. El botón flota en la esquina, que en un móvil es
 * justo donde acaba el pie: al llegar al final tapaba el selector de idioma.
 * **Se levanta en vez de esconderse** — esconderlo dejaba el botón inútil en
 * media app, porque en una pantalla de alto normal el pie ya asoma en cuanto
 * bajas lo suficiente para quererlo, y entonces no aparecía nunca.
 */
function medir() {
  visible.value = window.scrollY > window.innerHeight * 0.5
  const pie = document.querySelector('footer')
  const arriba = pie ? pie.getBoundingClientRect().top : Number.POSITIVE_INFINITY
  levanta.value = Math.max(0, Math.round(window.innerHeight - arriba))
}

/*
 * Como mucho una medida cada 100 ms: leer la posición del pie fuerza un
 * reflujo y el scroll es el evento que más se dispara de la app.
 *
 * Con reloj y no con `requestAnimationFrame`, que era lo primero que salió:
 * el navegador congela los cuadros cuando la pestaña no está pintando, y con
 * ella se congelaba la medida — el botón aparecía pero se quedaba encima del
 * pie sin apartarse. Es el mismo motivo por el que el cronómetro programa sus
 * avisos con un intervalo.
 */
let ultima = 0
let alFinal: ReturnType<typeof setTimeout> | null = null
function mirar() {
  const resto = 100 - (Date.now() - ultima)
  if (resto <= 0) {
    ultima = Date.now()
    medir()
    return
  }
  /*
   * Y si toca esperar, se apunta una medida para el final del respiro. Sin
   * esto —descartando a secas— la última posición no se medía nunca: un
   * scroll largo dispara docenas de eventos en pocos milisegundos, se atendía
   * el primero y se tiraban todos los demás, incluido el que decía dónde
   * habías parado. El botón se quedaba con la medida de hace medio segundo.
   */
  if (alFinal) return
  alFinal = setTimeout(() => {
    alFinal = null
    ultima = Date.now()
    medir()
  }, resto)
}

onMounted(() => {
  window.addEventListener('scroll', mirar, { passive: true })
  window.addEventListener('resize', mirar, { passive: true })
  medir()
})

onUnmounted(() => {
  window.removeEventListener('scroll', mirar)
  window.removeEventListener('resize', mirar)
  if (alFinal) clearTimeout(alFinal)
})

function subir() {
  // Suave, salvo que el sistema pida menos movimiento: un salto largo con
  // animación marea a quien ha pedido justo lo contrario.
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' })
}
</script>

<template>
  <Transition name="asomar">
    <button
      v-if="visible && permitido"
      type="button" class="arriba" :aria-label="t('comun.arriba')"
      :style="{ transform: `translateY(-${levanta}px)` }"
      @click="subir"
    >
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.arriba {
  position: fixed;
  /* Sobre la zona segura: en un iPhone, `1.25rem` a secas lo mete debajo de
     la barra de gestos. */
  bottom: calc(1.25rem + env(safe-area-inset-bottom));
  right: calc(1.25rem + env(safe-area-inset-right));
  z-index: 20;

  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  padding: 0;
  border: 1px solid var(--linea);
  border-radius: 50%;
  background: var(--tarjeta);
  color: var(--acento);
  cursor: pointer;
  /* La sombra es lo único que lo despega del contenido que pasa por debajo;
     con los temas oscuros apenas se nota, y ahí el borde hace el trabajo. */
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.18);
}

.arriba:hover { border-color: var(--acento); }

/* La entrada solo desvanece: el `transform` lo lleva el estilo en línea para
   apartarse del pie, y animarlo aquí pelearía con él. */
.asomar-enter-active, .asomar-leave-active { transition: opacity 0.18s ease; }
.asomar-enter-from, .asomar-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .asomar-enter-active, .asomar-leave-active { transition: none; }
}
</style>
