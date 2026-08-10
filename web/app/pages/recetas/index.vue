<script setup lang="ts">
const { t } = useI18n()
useHead({ title: () => t('recetas.titulo') })

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
  <Migas :ruta="[{ texto: $t('recetas.titulo') }]" />

  <!-- Sin título: lo dice la última miga. -->
  <div class="cabecera">
    <NuxtLinkLocale :to="`/recetas/${$t('rutas.nueva')}`" class="boton">{{ $t('comun.nueva') }}</NuxtLinkLocale>
  </div>

  <p v-if="!(catalogo ?? []).length" class="vacio">{{ $t('recetas.vacio') }}</p>

  <NuxtLinkLocale
    v-for="r in catalogo ?? []" :key="r.id"
    :to="`/recetas/${r.slug}`" class="tarjeta"
  >
    <strong>{{ r.nombre }}</strong>
    <p class="meta">
      {{ $t('recetas.resumen', {
        reparto: reparto(r.pasos), referencia: referencia(r.pasos), pasos: r.pasos.length,
      }) }}
    </p>
    <p v-if="r.notas" class="meta">{{ r.notas }}</p>
  </NuxtLinkLocale>
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
