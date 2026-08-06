<script setup lang="ts">
/**
 * Migas de pan.
 *
 * Sustituyen al «‹ Volver» de cada pantalla, que decía a dónde ibas pero no
 * dónde estabas: desde la ficha de una bolsa, «volver» podía ser el listado o
 * la portada según por dónde hubieras entrado.
 *
 * La ruta la declara cada pantalla en vez de deducirla de la URL. Los tramos
 * dinámicos son ids —`gary`, `3`— y lo que hay que leer es el nombre de la
 * bolsa o el número de la extracción, que solo sabe la pantalla.
 */
export interface Miga {
  texto: string
  /** Sin destino es la pantalla actual: el último y no se pulsa. */
  a?: string
}

defineProps<{ ruta: Miga[] }>()
</script>

<template>
  <nav class="migas" aria-label="Dónde estás">
    <ol>
      <li><NuxtLink to="/">Inicio</NuxtLink></li>
      <li v-for="(miga, i) in ruta" :key="i">
        <NuxtLink v-if="miga.a" :to="miga.a">{{ miga.texto }}</NuxtLink>
        <span v-else aria-current="page">{{ miga.texto }}</span>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.migas { margin: 0 0 0.35rem; }

.migas ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.78rem;
}

.migas li { display: flex; align-items: center; }

/* El separador va en CSS y no en la plantilla: así no lo lee un lector de
   pantalla, que ya sabe que esto es una lista. */
.migas li + li::before {
  content: '›';
  color: var(--linea);
  margin: 0 0.4rem;
}

/* 44 px de alto para el dedo, como el resto de la app. El «‹ Volver» de antes
   ya los tenía y no hay motivo para que estos midan menos. */
.migas a, .migas span {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  text-decoration: none;
  letter-spacing: 0.02em;
}

.migas a {
  color: var(--suave);
  border-bottom: 1px solid transparent;
}

/* Sin hover en el móvil, así que el color ya distingue lo pulsable; el
   subrayado es para el ratón. */
.migas a:hover { color: var(--acento); border-bottom-color: var(--acento); }

.migas [aria-current] { color: var(--tinta); font-weight: 600; }
</style>
