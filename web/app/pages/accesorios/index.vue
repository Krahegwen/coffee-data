<script setup lang="ts">
import { TIPOS_ACCESORIO } from '~/composables/useApi'

/**
 * El catálogo de accesorios: los drippers y los molinillos con los que se
 * hace cada taza. De aquí salen los desplegables del alta, y el motor lee de
 * aquí qué dripper tiene masa térmica.
 *
 * Por tipo y con lo que está en uso delante, que es el orden del manejador.
 * Cada tarjeta dice cuántas tazas lo usaron: es lo que decide si se puede
 * borrar o solo sacar de uso.
 */
const { t } = useI18n()
useHead({ title: () => t('accesorios.titulo') })

const { accesorios, extracciones, retiradas } = useApi()
const { data: equipo } = await useAsyncData('accesorios-lista', accesorios)
// Retiradas incluidas, como cuenta el servidor al negarse a borrar.
const { data: vivas } = await useAsyncData('accesorios-usos', () => extracciones())
const { data: papelera } = await useAsyncData('accesorios-usos-retiradas', retiradas)

const usos = computed(() => {
  const cuenta = new Map<string, number>()
  for (const e of [...(vivas.value ?? []), ...(papelera.value ?? [])]) {
    for (const tipo of TIPOS_ACCESORIO) {
      const id = e[tipo]
      if (id) cuenta.set(id, (cuenta.get(id) ?? 0) + 1)
    }
  }
  return cuenta
})

const grupos = computed(() =>
  TIPOS_ACCESORIO.map((tipo) => ({
    tipo,
    filas: (equipo.value ?? []).filter((a) => a.tipo === tipo),
  })),
)
</script>

<template>
  <Migas :ruta="[{ texto: $t('menu.titulo'), a: '/menu' }, { texto: $t('accesorios.titulo') }]" />

  <!-- Sin título: lo dice la última miga. -->
  <div class="cabecera">
    <NuxtLinkLocale :to="`/accesorios/${$t('rutas.nuevo')}`" class="boton">{{ $t('comun.nuevo') }}</NuxtLinkLocale>
  </div>

  <p v-if="!(equipo ?? []).length" class="vacio">{{ $t('accesorios.vacio') }}</p>

  <template v-for="g in grupos" :key="g.tipo">
    <section v-if="g.filas.length">
      <h2>{{ $t(`accesorios.tipos.${g.tipo}`) }}</h2>
      <NuxtLinkLocale
        v-for="a in g.filas" :key="a.id"
        :to="`/accesorios/${a.slug}`" class="tarjeta" :class="{ apagado: !a.en_uso }"
      >
        <strong>{{ a.nombre }}</strong>
        <p class="meta">
          {{ usos.get(a.id)
            ? $t('accesorios.usos', { n: usos.get(a.id) }, usos.get(a.id)!)
            : $t('accesorios.sin_usos') }}
          <span v-if="a.masa_termica" class="marca">{{ $t('accesorios.masa_corto') }}</span>
          <span v-if="!a.en_uso" class="marca">{{ $t('accesorios.fuera_de_uso') }}</span>
        </p>
        <p v-if="a.notas" class="meta">{{ a.notas }}</p>
      </NuxtLinkLocale>
    </section>
  </template>
</template>

<style scoped>
/* Solo queda el botón, que se va a la derecha él solo. */
.cabecera { display: flex; justify-content: flex-end; align-items: center; margin: 0.5rem 0 0.75rem; }

.boton {
  display: inline-flex; align-items: center; min-height: 44px;
  background: var(--acento); color: var(--sobre-acento); font-weight: 600; font-size: 0.9rem;
  border-radius: 0.5rem; padding: 0.55rem 0.9rem; text-decoration: none;
}

h2 {
  font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--suave); margin: 1.25rem 0 0.6rem;
}

section:first-of-type h2 { margin-top: 0.25rem; }

.tarjeta {
  display: block; background: var(--tarjeta); border: 1px solid var(--linea);
  border-radius: 0.7rem; padding: 0.8rem 0.9rem; margin-bottom: 0.6rem;
  color: inherit; text-decoration: none;
}

/* Lo que ya no está en casa, un paso atrás: sigue ahí porque hay tazas que
   lo nombran, pero no es lo que se busca al entrar. */
.apagado { opacity: 0.65; }

.meta { margin: 0.25rem 0 0; color: var(--suave); font-size: 0.85rem; }

.marca {
  display: inline-block; margin-left: 0.4rem; padding: 0 0.45rem;
  border: 1px solid var(--linea); border-radius: 1rem; font-size: 0.75rem;
}

.vacio { color: var(--suave); font-size: 0.9rem; }
</style>
