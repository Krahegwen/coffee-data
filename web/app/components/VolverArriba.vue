<script setup lang="ts">
/**
 * El botón de volver arriba en las pantallas largas.
 *
 * Va en `app.vue` una sola vez y no pantalla por pantalla. Lo que hace larga
 * una lista son **tus datos** —cuántas bolsas tengas, cuántas extracciones
 * lleves—, no el fichero: una lista fija de rutas acertaría hoy y fallaría en
 * tres meses, y habría que acordarse de añadir cada pantalla nueva.
 *
 * **Se pega solo, no se calcula.** Va dentro de `main`, con un ancla
 * `position: sticky` de altura cero: el navegador lo mantiene pegado al fondo
 * de la ventana mientras haya contenido y lo suelta al llegar al final, que
 * es justo donde empieza el pie. Antes esto lo hacía JS midiendo el pie y
 * empujando el botón con un `transform`, y se notaba: la medida iba a saltos
 * de cien milisegundos, así que el botón daba tirones en vez de acompañar al
 * scroll. Lo que el compositor hace gratis no hay que calcularlo.
 *
 * Al JS solo le queda decidir si asomarse.
 */
const { t } = useI18n()
const ruta = useRoute()
const localePath = useLocalePath()

const visible = ref(false)

/**
 * En el cronómetro no. Es la única pantalla que se usa con el hervidor en la
 * mano, no tiene scroll que merezca la pena, y un botón flotante ahí es una
 * pulsación sin querer esperando.
 */
const permitido = computed(() => ruta.path !== localePath('/crono/reloj'))

/**
 * Media pantalla de recorrido, no un número de píxeles: «he bajado un buen
 * rato» son píxeles distintos en el móvil y en el escritorio, y las mismas
 * pantallas. Solo lee `scrollY`, que no fuerza reflujo.
 */
function mirar() {
  visible.value = window.scrollY > window.innerHeight * 0.5
}

onMounted(() => {
  window.addEventListener('scroll', mirar, { passive: true })
  window.addEventListener('resize', mirar, { passive: true })
  mirar()
})

onUnmounted(() => {
  window.removeEventListener('scroll', mirar)
  window.removeEventListener('resize', mirar)
})

function subir() {
  // Suave, salvo que el sistema pida menos movimiento: un salto largo con
  // animación marea a quien ha pedido justo lo contrario.
  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' })
}
</script>

<template>
  <!-- El ancla no ocupa sitio (alto cero) para no empujar el contenido; el
       botón cuelga de ella hacia arriba. -->
  <div class="ancla" aria-hidden="false">
    <Transition name="asomar">
      <button
        v-if="visible && permitido"
        type="button" class="arriba" :aria-label="t('comun.arriba')"
        @click="subir"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.ancla {
  position: sticky;
  /* Sobre la zona segura: en un iPhone, pegarlo al cero lo mete debajo de la
     barra de gestos. */
  bottom: calc(1.25rem + env(safe-area-inset-bottom));
  height: 0;
  /* Sin sitio propio no hay nada que desbordar, pero el botón sí sobresale. */
  overflow: visible;
  z-index: 20;
  pointer-events: none;
}

.arriba {
  position: absolute;
  right: calc(0.25rem + env(safe-area-inset-right));
  /* Sube su propia altura desde el ancla: así el borde de abajo del botón
     queda donde está el ancla, y no la mitad por debajo. */
  bottom: 0;
  pointer-events: auto;

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
  /* Lo único que lo despega del contenido que pasa por debajo; con los temas
     oscuros apenas se nota y ahí el borde hace el trabajo. */
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.18);
}

.arriba:hover { border-color: var(--acento); }

.asomar-enter-active, .asomar-leave-active { transition: opacity 0.18s ease; }
.asomar-enter-from, .asomar-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  .asomar-enter-active, .asomar-leave-active { transition: none; }
}
</style>
