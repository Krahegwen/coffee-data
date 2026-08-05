<script setup lang="ts">
const { cafes, extracciones } = useApi()

const { data: bolsas, error: errorCafes } = await useAsyncData('cafes', cafes)
const { data: historial, error: errorExt } = await useAsyncData('extracciones', () => extracciones())

const abiertas = computed(() => (bolsas.value ?? []).filter((c) => c.estado === 'abierto'))
const ultimas = computed(() => (historial.value ?? []).slice(0, 8))
const fallo = computed(() => errorCafes.value || errorExt.value)

/** Café molido gastado por bolsa, para saber cuánto queda. */
function consumido(cafeId: string) {
  return (historial.value ?? [])
    .filter((e) => e.cafe_id === cafeId)
    .reduce((total, e) => total + (e.dosis_g ?? 0), 0)
}

function restante(cafeId: string, pesoG: number | null) {
  if (!pesoG) return null
  return Math.max(0, Math.round(pesoG - consumido(cafeId)))
}
</script>

<template>
  <div v-if="fallo" class="aviso">
    No se pudo hablar con la API. Si estás sin cobertura, esto se verá con los
    últimos datos guardados en cuanto la app esté instalada.
  </div>

  <div class="acciones">
    <NuxtLink to="/crono" class="registrar">Preparar · cronómetro</NuxtLink>
    <div class="pareja">
      <NuxtLink to="/nueva" class="registrar secundario">Registrar a mano</NuxtLink>
      <NuxtLink to="/cafes" class="registrar secundario">Bolsas</NuxtLink>
    </div>
  </div>

  <section>
    <h2>Bolsas abiertas</h2>
    <p v-if="!abiertas.length" class="vacio">Ninguna abierta.</p>
    <article v-for="cafe in abiertas" :key="cafe.id" class="tarjeta">
      <div class="fila">
        <strong>{{ cafe.nombre }}</strong>
        <span v-if="diasDesdeTueste(cafe.fecha_tueste) !== null"
              :class="['dias', { pasado: (diasDesdeTueste(cafe.fecha_tueste) ?? 0) > 60 }]">
          {{ diasDesdeTueste(cafe.fecha_tueste) }} d
        </span>
      </div>
      <p class="meta">
        <span v-if="cafe.tostador">{{ cafe.tostador }}</span>
        <span v-if="cafe.origen"> · {{ cafe.origen }}</span>
        <span v-if="cafe.proceso"> · {{ cafe.proceso }}</span>
      </p>
      <p class="meta">
        <span v-if="restante(cafe.id, cafe.peso_g) !== null">
          quedan ~{{ restante(cafe.id, cafe.peso_g) }} g
        </span>
        <span v-if="cafe.conservacion"> · {{ cafe.conservacion }}</span>
      </p>
    </article>
  </section>

  <section>
    <h2>Últimas extracciones</h2>
    <p v-if="!ultimas.length" class="vacio">Todavía ninguna.</p>
    <article v-for="e in ultimas" :key="e.id" class="tarjeta">
      <div class="fila">
        <strong>#{{ e.id }} {{ e.cafe_nombre }}</strong>
        <span v-if="e.nota" class="nota">{{ e.nota }}/10</span>
      </div>
      <p class="meta">
        {{ e.fecha }} · {{ e.temp_c }} °C · {{ e.clics }} clics · 1:{{ e.ratio }}
        <span v-if="e.tiempo_total"> · {{ e.tiempo_total }}</span>
      </p>
      <p v-if="e.variable_cambiada" class="variable">{{ e.variable_cambiada }}</p>
      <p v-if="e.notas_cata" class="cata">{{ e.notas_cata }}</p>
    </article>
  </section>
</template>

<style scoped>
h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--suave);
  margin: 1.75rem 0 0.6rem;
}

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.6rem;
}

.fila {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}

.meta {
  margin: 0.25rem 0 0;
  color: var(--suave);
  font-size: 0.85rem;
}

.variable {
  margin: 0.4rem 0 0;
  font-size: 0.82rem;
  color: var(--acento);
}

.cata {
  margin: 0.3rem 0 0;
  font-size: 0.88rem;
}

.nota, .dias {
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  color: var(--suave);
  white-space: nowrap;
}

.dias.pasado { color: #c2410c; }

.acciones { display: grid; gap: 0.5rem; }
.acciones .pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }

.registrar {
  display: block;
  text-align: center;
  font-weight: 600;
  color: #fff;
  background: var(--acento);
  border-radius: 0.6rem;
  padding: 0.85rem;
  text-decoration: none;
  min-height: 3rem;
}

.registrar.secundario {
  background: transparent;
  color: var(--suave);
  font-weight: 400;
  border: 1px solid var(--linea);
  min-height: 2.5rem;
  padding: 0.6rem;
}

.vacio, .aviso {
  color: var(--suave);
  font-size: 0.9rem;
}

.aviso {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
}
</style>
