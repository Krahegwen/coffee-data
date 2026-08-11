<script setup lang="ts">

/**
 * Editor de los pasos de una receta.
 *
 * Los pasos se editan como lista completa, no uno a uno: es como se piensa una
 * receta y es lo que el servidor espera. El orden lo da la posición.
 */

// Las etiquetas de acción y estilo salen del catálogo, que sabe el idioma.
const { ACCIONES, ESTILOS } = useTextos()
export interface PasoEditable {
  accion: string
  /** Vacío es «sin especificar», que es lo normal en los pasos de siempre. */
  estilo: string
  agua_g: number | ''
  t_inicio_s: number | ''
  notas: string
}

const pasos = defineModel<PasoEditable[]>({ required: true })

/** Suma de los vertidos: es el agua de referencia sobre la que se escala. */
const referencia = computed(() =>
  pasos.value
    .filter((p) => p.accion === 'verter')
    .reduce((total, p) => total + (Number(p.agua_g) || 0), 0),
)

function acumulado(hasta: number) {
  return pasos.value
    .slice(0, hasta + 1)
    .reduce((total, p) => total + (Number(p.agua_g) || 0), 0)
}

function anadir() {
  const ultimo = pasos.value[pasos.value.length - 1]
  const t = Number(ultimo?.t_inicio_s)
  pasos.value.push({
    accion: 'verter',
    estilo: '',
    agua_g: '',
    t_inicio_s: Number.isFinite(t) ? t + 45 : 0,
    notas: '',
  })
}

/** El estilo es de los vertidos: si el paso deja de serlo, se va con él. */
function alCambiarAccion(paso: PasoEditable) {
  if (paso.accion !== 'verter') paso.estilo = ''
}

function quitar(i: number) {
  pasos.value.splice(i, 1)
}

function mover(i: number, salto: number) {
  const destino = i + salto
  if (destino < 0 || destino >= pasos.value.length) return
  const [p] = pasos.value.splice(i, 1)
  pasos.value.splice(destino, 0, p!)
}
</script>

<template>
  <div class="pasos">
    <!-- Los campos ya llevan aria-label, así que para un lector de pantalla
         esta fila solo repetiría: es ayuda visual. -->
    <div v-if="pasos.length" class="cabeceras" aria-hidden="true">
      <span />
      <span>{{ $t('pasos.accion') }}</span>
      <span>{{ $t('pasos.desde') }}</span>
      <span>{{ $t('pasos.agua') }}</span>
    </div>

    <div v-for="(paso, i) in pasos" :key="i" class="paso">
      <div class="linea">
        <span class="num">{{ i + 1 }}</span>
        <select v-model="paso.accion" :aria-label="$t('pasos.accion')" @change="alCambiarAccion(paso)">
          <!-- Se guarda la clave y se enseña la etiqueta: la base no sabe de
               castellano. -->
          <option v-for="(etiqueta, clave) in ACCIONES" :key="clave" :value="clave">
            {{ etiqueta }}
          </option>
        </select>
        <input
          v-model="paso.t_inicio_s" type="number" min="0" step="1"
          inputmode="numeric" :placeholder="$t('pasos.seg')" :aria-label="$t('pasos.segundo_inicio')"
        >
        <input
          v-if="paso.accion === 'verter'" v-model="paso.agua_g"
          type="number" min="1" step="1" inputmode="numeric"
          placeholder="g" :aria-label="$t('pasos.gramos')"
        >
        <span v-else class="singramos">—</span>
      </div>
      <!-- Segunda línea: en la rejilla de arriba no caben sin estrujar los
           números. El estilo solo sale en los vertidos, que son los únicos
           que lo admiten. -->
      <div class="detalle" :class="{ vertido: paso.accion === 'verter' }">
        <select
          v-if="paso.accion === 'verter'" v-model="paso.estilo"
          :aria-label="$t('pasos.estilo_vertido')"
        >
          <option value="">{{ $t('pasos.sin_estilo') }}</option>
          <option v-for="(etiqueta, clave) in ESTILOS" :key="clave" :value="clave">
            {{ etiqueta }}
          </option>
        </select>
        <input
          v-model="paso.notas"
          :placeholder="$t('pasos.nota_ejemplo')" :aria-label="$t('pasos.nota_paso')"
        >
      </div>
      <div class="pie">
        <span v-if="paso.accion === 'verter'" class="acum">{{ $t('pasos.hasta', { n: acumulado(i) }) }}</span>
        <span v-else-if="paso.accion === 'agitar' || paso.accion === 'remover'" class="ojo">
          {{ $t('pasos.bascula_no_vale') }}
        </span>
        <span v-else />
        <span class="mandos">
          <button type="button" :disabled="i === 0" :aria-label="$t('pasos.subir')" @click="mover(i, -1)">↑</button>
          <button type="button" :disabled="i === pasos.length - 1" :aria-label="$t('pasos.bajar')" @click="mover(i, 1)">↓</button>
          <button type="button" class="quitar" :aria-label="$t('pasos.quitar')" @click="quitar(i)">✕</button>
        </span>
      </div>
    </div>

    <button type="button" class="anadir" @click="anadir">{{ $t('pasos.anadir') }}</button>

    <i18n-t keypath="pasos.referencia" tag="p" class="nota" scope="global">
      <template #agua><strong>{{ $t('pasos.referencia_agua', { n: referencia }) }}</strong></template>
    </i18n-t>
  </div>
</template>

<style scoped>
/* Una sola definición de las columnas: la fila de títulos y la de campos
   tienen que cuadrar, y si se tocan por separado acaban desalineándose. */
.pasos { --columnas: 1.3rem 1fr 4.5rem 4.5rem; --hueco: 0.4rem; }

.paso {
  border: 1px solid var(--linea);
  border-radius: 0.6rem;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.5rem;
  background: var(--tarjeta);
}

.linea, .cabeceras {
  display: grid;
  grid-template-columns: var(--columnas);
  gap: var(--hueco);
  align-items: center;
}

.cabeceras {
  /* El borde de la tarjeta cuenta: sin ese píxel los títulos van corridos. */
  padding: 0 calc(0.65rem + 1px);
  margin-bottom: 0.35rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--suave);
}

.num { color: var(--suave); font-size: 0.8rem; text-align: center; }

select, input {
  font: inherit;
  font-size: 16px;
  color: var(--tinta);
  background: var(--fondo);
  border: 1px solid var(--linea);
  border-radius: 0.4rem;
  padding: 0.45rem 0.4rem;
  min-width: 0;
  /* 44 px para el dedo, y de paso igualan con el resto de campos del
     formulario, que ya median eso. */
  min-height: 44px;
}

.singramos { color: var(--suave); text-align: center; font-size: 0.85rem; }

/* Fuera de la rejilla de arriba: aquí manda el estilo, que solo está a veces.
   Con él, dos columnas; sin él, la nota se lleva la línea entera. */
.detalle { display: grid; grid-template-columns: 1fr; gap: var(--hueco); margin-top: 0.4rem; }
.detalle.vertido { grid-template-columns: 7.5rem 1fr; }
.detalle input, .detalle select { width: 100%; }

.pie {
  display: flex;
  justify-content: space-between;
  align-items: center;
  /* Con los mandos a 44 px, en una pantalla de 320 no caben junto al aviso
     de la báscula: que bajen a su línea en vez de estrujar el texto. */
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: var(--suave);
}

.acum { color: var(--acento); }
.ojo { color: var(--peligro); }

.mandos button {
  font: inherit;
  background: transparent;
  border: 1px solid var(--linea);
  border-radius: 0.35rem;
  color: var(--suave);
  padding: 0.2rem 0.45rem;
  margin-left: 0.25rem;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
}

.mandos button:disabled { opacity: 0.35; cursor: default; }
.mandos .quitar { color: var(--peligro); border-color: var(--peligro); }

.anadir {
  font: inherit;
  width: 100%;
  background: transparent;
  border: 1px dashed var(--linea);
  border-radius: 0.6rem;
  color: var(--acento);
  padding: 0.7rem;
  cursor: pointer;
  min-height: 2.75rem;
}

.nota { color: var(--suave); font-size: 0.8rem; margin: 0.75rem 0 0; }
</style>
