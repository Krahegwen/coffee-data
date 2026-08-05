<script setup lang="ts">
/**
 * Miniatura de la bolsa para los listados. No pinta nada si no hay foto: es
 * preferible a un hueco gris, y la ficha ya explica cómo subirla.
 */
const props = defineProps<{ foto: string | null, nombre: string }>()

const { urlFoto } = useApi()
const src = computed(() => urlFoto(props.foto))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="`Bolsa de ${nombre}`"
    class="miniatura"
    width="64"
    height="64"
    loading="lazy"
  >
</template>

<style scoped>
.miniatura {
  width: 64px;
  height: 64px;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 1px solid var(--linea);
  background: var(--fondo);
  flex-shrink: 0;
}
</style>
