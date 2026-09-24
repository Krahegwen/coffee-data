<script setup lang="ts">
/**
 * El menú del engranaje: lo que se prepara antes de hacer café y lo que se
 * decide una vez.
 *
 * Una pantalla y no un desplegable. Se llega igual desde todas partes, el
 * botón de atrás del móvil la deshace como cualquier otra y cada entrada
 * tiene sitio para decir qué hay detrás, que en un desplegable no cabe.
 */
const { t } = useI18n()
useHead({ title: () => t('menu.titulo') })

/** En el orden en que se pidieron. Cada icono es de trazo, como el engranaje. */
const ENTRADAS = [
  { a: '/ajustes', titulo: 'ajustes.titulo', pista: 'menu.ajustes_pista', icono: 'ajustes' },
  { a: '/recetas', titulo: 'recetas.titulo', pista: 'menu.recetas_pista', icono: 'recetas' },
  { a: '/cafes', titulo: 'bolsas.titulo', pista: 'menu.bolsas_pista', icono: 'bolsas' },
] as const
</script>

<template>
  <Migas :ruta="[{ texto: $t('menu.titulo') }]" />

  <nav :aria-label="$t('menu.titulo')">
    <NuxtLinkLocale v-for="e in ENTRADAS" :key="e.a" :to="e.a" class="entrada">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="icono">
        <template v-if="e.icono === 'ajustes'">
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </template>
        <template v-else-if="e.icono === 'recetas'">
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
          <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3" />
          <path d="M8 7.5h7M8 11h5" />
        </template>
        <template v-else>
          <path d="M7 3h10l1 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7z" />
          <path d="M6 7h12M10 11h4" />
        </template>
      </svg>
      <span class="texto">
        <strong>{{ $t(e.titulo) }}</strong>
        <span class="pista">{{ $t(e.pista) }}</span>
      </span>
      <span class="flecha" aria-hidden="true">›</span>
    </NuxtLinkLocale>
  </nav>
</template>

<style scoped>
nav { margin-top: 0.75rem; }

.entrada {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-height: 64px;
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.6rem;
  color: inherit;
  text-decoration: none;
}

.entrada:hover { border-color: var(--acento); }
.icono { flex: none; color: var(--acento); }

/* `min-width: 0` para que una pista larga parta línea en vez de empujar la
   flecha fuera de la tarjeta. */
.texto { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.pista { color: var(--suave); font-size: 0.85rem; margin-top: 0.1rem; }
.flecha { flex: none; color: var(--suave); font-size: 1.4rem; line-height: 1; }
</style>
