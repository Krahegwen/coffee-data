<script setup lang="ts">
/**
 * El aviso de versión nueva, y el único sitio desde el que se pone.
 *
 * Antes la app se recargaba sola en cuanto la versión nueva estaba lista, y
 * eso pasaba cuando le daba la gana al navegador: navegando, a medio escribir
 * una nota de cata o con el reloj corriendo. Ahora espera a que la pidas, o a
 * que la app arranque de cero la próxima vez.
 *
 * **No sale con una medición en marcha.** Actualizar es recargar, y recargar
 * se lleva el reloj: el café ya está colado y ese tiempo no se puede volver a
 * medir. Vuelve en cuanto la taza está guardada.
 */
const { $pwa } = useNuxtApp()
const { hayMedicion } = useCrono()

const actualizando = ref(false)

async function actualizar() {
  actualizando.value = true
  // Activa la versión que espera; en cuanto manda, la página se recarga sola.
  await $pwa?.updateServiceWorker()
}
</script>

<template>
  <p v-if="$pwa?.needRefresh && !hayMedicion" class="version-nueva" role="status">
    <span>{{ $t('app.version_nueva') }}</span>
    <button type="button" :disabled="actualizando" @click="actualizar">
      {{ actualizando ? $t('app.actualizando') : $t('app.actualizar') }}
    </button>
  </p>
</template>

<style scoped>
/* Una línea, del color del acento y sin tapar nada: se ve sin estorbar. */
.version-nueva {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: -0.25rem 0 1rem;
  padding: 0.35rem 0.35rem 0.35rem 0.8rem;
  border: 1px solid var(--acento);
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--acento) 10%, transparent);
  color: var(--tinta);
  font-size: 0.85rem;
}

button {
  flex: none;
  font: inherit;
  font-weight: 600;
  min-height: 36px;
  padding: 0 0.8rem;
  border: 0;
  border-radius: 0.45rem;
  color: var(--sobre-acento);
  background: var(--acento);
  cursor: pointer;
}

button:disabled { opacity: 0.6; cursor: default; }
</style>
