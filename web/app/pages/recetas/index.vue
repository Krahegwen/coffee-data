<script setup lang="ts">
useHead({ title: 'Recetas' })

const { recetas } = useApi()
const { data: catalogo } = await useAsyncData('recetas-lista', recetas)

function referencia(pasos: { accion: string; agua_g: number }[]) {
  return pasos.filter((p) => p.accion === 'verter').reduce((t, p) => t + p.agua_g, 0)
}

function reparto(pasos: { accion: string; agua_g: number }[]) {
  return pasos.filter((p) => p.accion === 'verter').map((p) => p.agua_g).join('-')
}
</script>

<template>
  <Migas :ruta="[{ texto: 'Recetas' }]" />

  <!-- Sin título: lo dice la última miga. -->
  <div class="cabecera">
    <NuxtLink to="/recetas/nueva" class="boton">Nueva</NuxtLink>
  </div>

  <p v-if="!(catalogo ?? []).length" class="vacio">
    No queda ninguna receta, y sin al menos una el cronómetro no tiene qué
    guiar. Crea una con «Nueva».
  </p>

  <NuxtLink
    v-for="r in catalogo ?? []" :key="r.id"
    :to="`/recetas/${r.slug}`" class="tarjeta"
  >
    <strong>{{ r.nombre }}</strong>
    <p class="meta">{{ reparto(r.pasos) }} sobre {{ referencia(r.pasos) }} g · {{ r.pasos.length }} pasos</p>
    <p v-if="r.notas" class="meta">{{ r.notas }}</p>
  </NuxtLink>
</template>

<style scoped>
/* Solo queda el botón, que se va a la derecha él solo. */
.cabecera { display: flex; justify-content: flex-end; align-items: center; margin: 0.5rem 0 0.75rem; }

.boton {
  display: inline-flex; align-items: center; min-height: 44px;
  background: var(--acento); color: #fff; font-weight: 600; font-size: 0.9rem;
  border-radius: 0.5rem; padding: 0.55rem 0.9rem; text-decoration: none;
}

.tarjeta {
  display: block; background: var(--tarjeta); border: 1px solid var(--linea);
  border-radius: 0.7rem; padding: 0.8rem 0.9rem; margin-bottom: 0.6rem;
  color: inherit; text-decoration: none;
}

.meta { margin: 0.25rem 0 0; color: var(--suave); font-size: 0.85rem; }
.vacio { color: var(--suave); font-size: 0.9rem; }
a { color: var(--acento); }
</style>
