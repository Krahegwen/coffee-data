<script setup lang="ts">
/**
 * Qué se ha tocado respecto a la extracción anterior.
 *
 * No guarda nada por su cuenta: lo que escribes va a la columna de verdad
 * —`temp_c`, `clics`…— y el texto de `variable_cambiada` se genera a partir de
 * ahí. Es a propósito: el servidor tampoco lee ese texto para nada, los pares
 * los calcula comparando las columnas, así que un texto guardado aparte solo
 * podría contradecirlas.
 *
 * El valor anterior sale de la extracción previa de ese café y es de solo
 * lectura por el mismo motivo: ya está guardado en su fila, y copiarlo aquí
 * sería un segundo sitio donde puede mentir.
 */
import { VARIABLES } from '~/composables/textos'

export type Opciones = Record<string, { valor: string; etiqueta: string }[]>

const props = defineProps<{
  /** Los valores actuales del formulario, por clave de variable. */
  valores: Record<string, unknown>
  /** La extracción anterior de ese café, si la hay. */
  anterior: Record<string, unknown> | null
  /** Para las variables que son listas: receta y dripper. */
  opciones?: Opciones
}>()

const emit = defineEmits<{ cambia: [clave: string, valor: unknown] }>()

const elegidas = defineModel<string[]>({ required: true })

const claves = Object.keys(VARIABLES) as (keyof typeof VARIABLES)[]

/** Las que quedan libres, para no poder elegir dos veces la misma. */
function disponibles(actual: string) {
  return claves.filter((c) => c === actual || !elegidas.value.includes(c))
}

function etiquetaValor(clave: string, valor: unknown) {
  if (valor === null || valor === undefined || valor === '') return '—'
  const lista = props.opciones?.[clave]
  return lista?.find((o) => o.valor === String(valor))?.etiqueta ?? String(valor)
}

function anteriorDe(clave: string) {
  return etiquetaValor(clave, props.anterior?.[clave])
}

function anadir() {
  const libre = claves.find((c) => !elegidas.value.includes(c))
  if (libre) elegidas.value = [...elegidas.value, libre]
}

function quitar(i: number) {
  elegidas.value = elegidas.value.filter((_, n) => n !== i)
}

function cambiarVariable(i: number, clave: string) {
  elegidas.value = elegidas.value.map((c, n) => (n === i ? clave : c))
}
</script>

<template>
  <div class="variables">
    <p v-if="!anterior" class="pista">
      No hay ninguna extracción previa de este café: esta es la basal.
    </p>

    <div v-for="(clave, i) in elegidas" :key="clave" class="fila">
      <select
        :value="clave" aria-label="variable"
        @change="cambiarVariable(i, ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="c in disponibles(clave)" :key="c" :value="c">{{ VARIABLES[c] }}</option>
      </select>

      <div class="par">
        <label>
          antes
          <input :value="anteriorDe(clave)" readonly tabindex="-1">
        </label>
        <label>
          ahora
          <select
            v-if="opciones?.[clave]" :value="valores[clave]"
            @change="emit('cambia', clave, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="o in opciones[clave]" :key="o.valor" :value="o.valor">
              {{ o.etiqueta }}
            </option>
          </select>
          <input
            v-else :value="valores[clave]" type="number" step="any" inputmode="decimal"
            @input="emit('cambia', clave, Number(($event.target as HTMLInputElement).value))"
          >
        </label>
      </div>

      <button type="button" class="quitar" aria-label="quitar" @click="quitar(i)">✕</button>
    </div>

    <button
      v-if="elegidas.length < claves.length" type="button" class="anadir"
      @click="anadir"
    >
      + Añadir variable
    </button>

    <p v-if="elegidas.length > 1" class="ojo">
      Dos variables a la vez: el dato no servirá para comparar. Regístralo si
      quieres, pero sabiendo que ese par no dirá nada.
    </p>
  </div>
</template>

<style scoped>
.fila {
  display: grid;
  grid-template-columns: 1fr 44px;
  gap: 0.4rem;
  align-items: end;
  border: 1px solid var(--linea);
  border-radius: 0.6rem;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.5rem;
  background: var(--tarjeta);
}

/* El selector de variable manda una línea entera: los nombres son largos y en
   el móvil no caben al lado de los dos valores. */
.fila > select { grid-column: 1 / -1; }

.par { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; }

label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--suave);
  min-width: 0;
  margin: 0;
}

select, input {
  font: inherit;
  font-size: 16px;
  color: var(--tinta);
  background: var(--fondo);
  border: 1px solid var(--linea);
  border-radius: 0.4rem;
  padding: 0.45rem 0.4rem;
  min-width: 0;
  min-height: 44px;
}

/* El valor de antes se enseña, no se toca: ya está guardado en su fila. */
input[readonly] { color: var(--suave); background: transparent; }

.quitar {
  font: inherit;
  background: transparent;
  border: 1px solid #c2410c;
  border-radius: 0.35rem;
  color: #c2410c;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
  padding: 0;
}

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

.pista { color: var(--suave); font-size: 0.8rem; margin: 0 0 0.5rem; }
.ojo { color: #c2410c; font-size: 0.8rem; margin: 0.5rem 0 0; }
</style>
