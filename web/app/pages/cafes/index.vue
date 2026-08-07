<script setup lang="ts">
useHead({ title: 'Bolsas' })

const { cafes, extracciones } = useApi()

const { data: bolsas } = await useAsyncData('cafes-lista', cafes)
const { data: historial } = await useAsyncData('ext-lista', () => extracciones())

const porEstado = computed(() => {
  const orden = { abierto: 0, pendiente: 1, terminado: 2 }
  return [...(bolsas.value ?? [])].sort(
    (a, b) => orden[a.estado] - orden[b.estado] || a.nombre.localeCompare(b.nombre),
  )
})

/** Solo cuenta lo registrado, así que se queda corto si no apuntas siempre. */
function restante(cafeId: string, pesoG: number | null) {
  if (!pesoG) return null
  const usado = (historial.value ?? [])
    .filter((e) => e.cafe_id === cafeId)
    .reduce((total, e) => total + (e.dosis_g ?? 0), 0)
  return Math.max(0, Math.round(pesoG - usado))
}
</script>

<template>
  <Migas :ruta="[{ texto: 'Bolsas' }]" />

  <!-- Sin título: lo dice la última miga, y repetirlo aquí era leer «Bolsas»
       dos veces seguidas. -->
  <div class="cabecera">
    <NuxtLink to="/cafes/nueva" class="boton">Nueva</NuxtLink>
  </div>

  <p v-if="!porEstado.length" class="vacio">
    No tienes ninguna bolsa registrada. Cada café que entra en casa es una
    bolsa —con su tueste y sus fechas— y toda extracción se apunta a la suya:
    estrena la primera con «Nueva».
  </p>

  <NuxtLink
    v-for="cafe in porEstado" :key="cafe.id"
    :to="`/cafes/${cafe.slug}`" class="tarjeta"
  >
    <CafeFoto :foto="cafe.foto" :nombre="cafe.nombre" />
    <div class="cuerpo">
      <div class="fila">
        <strong>{{ cafe.nombre }}</strong>
        <span :class="['estado', cafe.estado]">{{ cafe.estado }}</span>
      </div>
      <p class="meta">
        <span v-if="cafe.tostador">{{ cafe.tostador }}</span>
        <span v-if="cafe.origen"> · {{ cafe.origen }}</span>
        <span v-if="diasDesdeTueste(cafe.fecha_tueste) !== null">
          · {{ diasDesdeTueste(cafe.fecha_tueste) }} d de tueste
        </span>
      </p>
      <p v-if="restante(cafe.id, cafe.peso_g) !== null" class="meta">
        quedan ~{{ restante(cafe.id, cafe.peso_g) }} g de {{ cafe.peso_g }}
      </p>
    </div>
  </NuxtLink>

  <p v-if="porEstado.length" class="nota">
    Los gramos restantes salen de restar las dosis <em>registradas</em>. Si
    preparas café sin apuntarlo, sobreestiman lo que queda.
  </p>
</template>

<style scoped>
/* Solo queda el botón, que se va a la derecha él solo. */
.cabecera {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin: 0.5rem 0 0.75rem;
}

.boton {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  background: var(--acento);
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  border-radius: 0.5rem;
  padding: 0.55rem 0.9rem;
  text-decoration: none;
}

.tarjeta {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.6rem;
  color: inherit;
  text-decoration: none;
}

/* min-width: 0 o un nombre largo desborda en vez de partirse. */
.cuerpo { flex: 1; min-width: 0; }

.fila { display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
.meta { margin: 0.25rem 0 0; color: var(--suave); font-size: 0.85rem; }

.estado {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--suave);
  white-space: nowrap;
}

.estado.abierto { color: var(--acento); }
.estado.terminado { opacity: 0.55; }

.nota { color: var(--suave); font-size: 0.8rem; margin-top: 1.5rem; }
.vacio { color: var(--suave); font-size: 0.9rem; }
a { color: var(--acento); }
</style>
