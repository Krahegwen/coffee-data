<script setup lang="ts">
/**
 * La prueba del cronómetro en la pantalla de bloqueo, a un toque desde la
 * portada: quien la prueba en su móvil no tiene que saber usar el crono.
 * Todo lo que hace está en `usePruebaIsla`.
 */
const { disponible, estado, texto, duracion, empezar, pausar, reanudar, parar } = usePruebaIsla()
const fallo = ref(false)

async function probar() {
  fallo.value = false
  try {
    await empezar()
  } catch {
    // `play()` rechaza si el navegador no deja sonar: se dice, no se calla.
    fallo.value = true
  }
}
</script>

<template>
  <section v-if="disponible" class="prueba">
    <button v-if="estado === 'parado'" type="button" class="probar" @click="probar">
      {{ $t('bloqueo.probar') }}
    </button>
    <template v-else>
      <p class="en-curso">{{ texto }}</p>
      <div class="botones">
        <button v-if="estado === 'corriendo'" type="button" class="probar" @click="pausar">
          {{ $t('bloqueo.pausar') }}
        </button>
        <button v-else type="button" class="probar" @click="reanudar">
          {{ $t('bloqueo.reanudar') }}
        </button>
        <button type="button" class="probar" @click="parar">{{ $t('bloqueo.parar') }}</button>
      </div>
    </template>
    <p class="ayuda">{{ $t('bloqueo.explicacion', { duracion }) }}</p>
    <p v-if="fallo" class="ayuda">{{ $t('bloqueo.fallo') }}</p>
  </section>
</template>

<style scoped>
.prueba { margin-top: 0.75rem; }

.botones {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.probar {
  font: inherit;
  width: 100%;
  min-height: 44px;
  background: transparent;
  border: 1px dashed var(--linea);
  border-radius: 0.6rem;
  color: var(--acento);
  padding: 0.7rem;
  cursor: pointer;
}

.en-curso {
  margin: 0 0 0.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.ayuda {
  color: var(--suave);
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
}
</style>
