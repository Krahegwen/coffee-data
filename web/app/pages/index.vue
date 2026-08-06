<script setup lang="ts">
import { fechaCorta } from '~/composables/textos'

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

const puedeInstalar = usePuedeInstalar()
const yaInstalada = useYaInstalada()
const enTactilAhora = useEnTactil()
const comoInstalar = ref(false)

/**
 * El botón dice «en el móvil» y solo sale ahí.
 *
 * No basta con `puedeInstalar`: en el Chrome de escritorio el evento también
 * llega —una PWA se instala igual en un PC— y el botón aparecía en medio de
 * la portada prometiendo algo que no era. Y al revés, en iOS el evento no
 * llega nunca, así que gatearlo por él dejaría sin botón justo al sitio donde
 * más falta hace la ayuda del menú.
 */
const ofrecerInstalar = computed(() => enTactilAhora.value && !yaInstalada.value)

async function instalar() {
  // Que no quede colgada la ayuda de un intento anterior si ahora sí hay
  // diálogo: el navegador puede mandar el evento más tarde.
  comoInstalar.value = false
  const respuesta = await pedirInstalacion()
  // Si el navegador nunca mandó el evento no hay diálogo que abrir: lo único
  // honesto es contar dónde está la opción en el menú.
  if (respuesta === 'sin-evento') comoInstalar.value = true
  if (respuesta === 'accepted') puedeInstalar.value = false
}
</script>

<template>
  <div v-if="fallo" class="aviso">
    No se pudo hablar con la API. Si estás sin cobertura, esto se verá con los
    últimos datos guardados en cuanto la app esté instalada.
  </div>

  <!-- Una sola puerta: preparar. Registrar a mano vive dentro, al lado del
       cronómetro, porque hasta ahí llegas con la misma información delante
       —café, receta, dosis y agua— y solo entonces se sabe cuál de las dos
       quieres. Las bolsas y las recetas se alcanzan desde su sitio. -->
  <div class="acciones">
    <NuxtLink to="/crono" class="registrar">Preparar café</NuxtLink>
  </div>

  <!-- Solo en el móvil y mientras no esté instalada: instalada sobra, y en el
       PC nunca fue para él. -->
  <section v-if="ofrecerInstalar" class="instalacion">
    <button type="button" class="instalar" @click="instalar">
      Instalar en el móvil
    </button>
    <p v-if="comoInstalar" class="ayuda">
      Este navegador no ofrece el diálogo. Búscalo en su menú (⋮) como
      «Instalar aplicación» o «Añadir a pantalla de inicio». Si acabas de
      actualizar la app, recarga una vez y vuelve a intentarlo.
    </p>
  </section>

  <section>
    <!-- El lápiz es la puerta a las bolsas ahora que no hay botón: desde la
         portada ves cuáles tienes abiertas, y si quieres tocarlas se entra por
         aquí. -->
    <h2>
      Bolsas abiertas
      <NuxtLink to="/cafes" class="editar" aria-label="Editar las bolsas">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </NuxtLink>
    </h2>
    <p v-if="!abiertas.length" class="vacio">Ninguna abierta.</p>
    <NuxtLink
      v-for="cafe in abiertas" :key="cafe.id"
      :to="`/cafes/${cafe.slug}`" class="tarjeta bolsa"
    >
      <CafeFoto :foto="cafe.foto" :nombre="cafe.nombre" />
      <div class="cuerpo">
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
      </div>
    </NuxtLink>
  </section>

  <section>
    <h2>Últimas extracciones</h2>
    <p v-if="!ultimas.length" class="vacio">Todavía ninguna.</p>
    <!-- La id es un uuid opaco: lo que identifica una taza para un humano es
         el café y el día. -->
    <NuxtLink v-for="e in ultimas" :key="e.id" :to="`/extracciones/${e.id}`" class="tarjeta enlace">
      <div class="fila">
        <strong>{{ e.cafe_nombre }} · {{ fechaCorta(e.fecha) }}</strong>
        <span v-if="e.nota" class="nota">{{ e.nota }}/10</span>
      </div>
      <p class="meta">
        {{ e.temp_c }} °C · {{ e.clics }} clics · 1:{{ e.ratio }}
        <span v-if="e.tiempo_total"> · {{ e.tiempo_total }}</span>
      </p>
      <p v-if="e.variable_cambiada" class="variable">{{ e.variable_cambiada }}</p>
      <p v-if="e.notas_cata" class="cata copiable">{{ e.notas_cata }}</p>
    </NuxtLink>
  </section>
</template>

<style scoped>
h2 {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--suave);
  margin: 1.75rem 0 0.6rem;
}

/*
 * Al final de la fila, a ras del borde derecho como el atajo de la cabecera.
 * 44 px para el dedo aunque el lápiz mida 17: los negativos de arriba y abajo
 * evitan que la fila del título crezca el doble, y el de la derecha cancela el
 * relleno de la zona de toque.
 */
.editar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  /* -0.85rem y no -0.75: el lápiz va centrado en sus 44 px, así que hay que
     descontar también ese medio hueco para que la punta acabe donde acaba el
     texto de «Recetas» y donde acaban las tarjetas. */
  margin: -0.7rem -0.85rem -0.7rem auto;
  color: var(--suave);
}

.editar:hover { color: var(--acento); }

.tarjeta {
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.7rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0.6rem;
}

.tarjeta.enlace { display: block; color: inherit; text-decoration: none; }

.tarjeta.bolsa {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  color: inherit;
  text-decoration: none;
}

/* min-width: 0 o un nombre largo desborda en vez de partirse. */
.cuerpo { flex: 1; min-width: 0; }

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

.instalacion { margin-top: 0.75rem; }

.instalar {
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

.ayuda {
  color: var(--suave);
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
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
