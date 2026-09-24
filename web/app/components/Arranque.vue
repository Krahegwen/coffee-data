<script setup lang="ts">
/**
 * El splash: lo que se ve mientras la app arranca, y mientras se pone una
 * versión nueva.
 *
 * Tapa la pantalla entera a propósito. Detrás está pasando lo que antes se
 * veía como un «Un momento…» con la cabecera y el pie puestos —comprobar la
 * sesión, bajar lo último del servidor y, ahora, buscar versión nueva—, y si
 * la hay la página se carga otra vez: mejor que eso ocurra aquí que después
 * de que hayas empezado a tocar.
 */
defineProps<{ actualizando: boolean }>()
</script>

<template>
  <div class="arranque" role="status" aria-live="polite">
    <img src="/icono-192.png" width="88" height="88" alt="">
    <p class="nombre">{{ $t('app.nombre') }}</p>
    <p class="que">{{ actualizando ? $t('app.actualizando') : $t('app.cargando') }}</p>
  </div>
</template>

<style scoped>
.arranque {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: var(--fondo);
  color: var(--tinta);
}

img { border-radius: 1.4rem; margin-bottom: 0.6rem; }
.nombre { margin: 0; font-size: 1.3rem; font-weight: 700; letter-spacing: -0.01em; }
.que { margin: 0; font-size: 0.85rem; color: var(--suave); }
</style>
