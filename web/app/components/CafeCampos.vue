<script setup lang="ts">
import { ESTADOS } from '~/composables/useApi'

/**
 * Los campos de una bolsa, compartidos por el alta y la corrección.
 *
 * Arriba lo que se rellena siempre; el resto en un desplegable, que en el móvil
 * un formulario de veinte campos no lo termina nadie.
 */
const modelo = defineModel<Record<string, any>>({ required: true })
const props = defineProps<{ nuevo?: boolean }>()

/**
 * El id sale del nombre y no se pide: es ruido para quien registra y una
 * fuente de erratas. Esto solo lo enseña; quien lo calcula de verdad es el
 * servidor, para que salga igual venga de la app o de un script.
 */
const idPrevisto = computed(() =>
  String(modelo.value.nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, ''),
)
</script>

<template>
  <label>
    Nombre
    <input v-model="modelo.nombre" placeholder="Etiopía Guji" required>
    <span v-if="props.nuevo && idPrevisto" class="idprevisto">
      se guardará como <code>{{ idPrevisto }}</code>
    </span>
  </label>

  <div class="pareja">
    <label>Tostador<input v-model="modelo.tostador"></label>
    <label>Origen<input v-model="modelo.origen"></label>
  </div>

  <div class="pareja">
    <label>Peso (g)<input v-model="modelo.peso_g" type="number" step="1" min="1" inputmode="numeric"></label>
    <label>
      Estado
      <select v-model="modelo.estado">
        <option v-for="e in ESTADOS" :key="e" :value="e">{{ e }}</option>
      </select>
    </label>
  </div>

  <!-- Los dos relojes de la frescura, juntos y arriba: mientras la bolsa está
       precintada manda el tueste; desde que la abres, la oxidación. -->
  <div class="pareja">
    <label>Fecha de tueste<input v-model="modelo.fecha_tueste" type="date"></label>
    <label>Abierta el<input v-model="modelo.fecha_apertura" type="date"></label>
  </div>

  <label>
    Conservación
    <input v-model="modelo.conservacion" placeholder="bolsa, tarro de vacío…">
  </label>

  <details>
    <summary>Más datos</summary>

    <div class="pareja">
      <label>Región<input v-model="modelo.region"></label>
      <label>Proceso<input v-model="modelo.proceso" placeholder="Lavado"></label>
    </div>

    <label>Variedad<input v-model="modelo.variedad"></label>

    <div class="pareja">
      <label>Altitud (m)<input v-model="modelo.altitud_m" type="number" step="1" min="1" inputmode="numeric"></label>
      <label>SCA<input v-model="modelo.sca" type="number" step="0.5" min="0" max="100" inputmode="decimal"></label>
    </div>

    <div class="pareja">
      <label>Precio (€)<input v-model="modelo.precio_eur" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label>Consumir antes<input v-model="modelo.consumir_antes" type="date"></label>
    </div>

    <!-- «Recibido el» ya no se pide: no lo leía nadie. La columna sigue ahí con
         lo que tenía, porque quitarla obliga a rehacer la tabla entera. -->
    <label>Comprado el<input v-model="modelo.fecha_compra" type="date"></label>

    <label>Notas del tostador<textarea v-model="modelo.notas_tostador" rows="2" /></label>
    <label>Ficha del tostador (url)<input v-model="modelo.url" type="url" inputmode="url"></label>
  </details>
</template>

<style scoped>
label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--suave);
  margin-bottom: 0.85rem;
}

.pareja { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }

input, select, textarea {
  font: inherit;
  font-size: 16px; /* menos, y iOS hace zoom al enfocar */
  color: var(--tinta);
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  padding: 0.6rem 0.65rem;
  min-width: 0;
}

details {
  border-top: 1px solid var(--linea);
  padding-top: 0.85rem;
  margin-bottom: 0.5rem;
}

.idprevisto { font-size: 0.75rem; color: var(--suave); }
.idprevisto code { color: var(--acento); }

summary {
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--acento);
  margin-bottom: 0.85rem;
}
</style>
