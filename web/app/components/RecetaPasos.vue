<script setup lang="ts">
/**
 * Editor de los pasos de una receta.
 *
 * Los pasos se editan como lista completa, no uno a uno: es como se piensa una
 * receta y es lo que el servidor espera. El orden lo da la posición.
 */
const ACCIONES = ['verter', 'agitar', 'remover', 'esperar', 'retirar'] as const

export interface PasoEditable {
  accion: string
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
    agua_g: '',
    t_inicio_s: Number.isFinite(t) ? t + 45 : 0,
    notas: '',
  })
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
    <div v-for="(paso, i) in pasos" :key="i" class="paso">
      <div class="linea">
        <span class="num">{{ i + 1 }}</span>
        <select v-model="paso.accion" aria-label="acción">
          <option v-for="a in ACCIONES" :key="a" :value="a">{{ a }}</option>
        </select>
        <input
          v-model="paso.t_inicio_s" type="number" min="0" step="1"
          inputmode="numeric" placeholder="seg" aria-label="segundo de inicio"
        >
        <input
          v-if="paso.accion === 'verter'" v-model="paso.agua_g"
          type="number" min="1" step="1" inputmode="numeric"
          placeholder="g" aria-label="gramos"
        >
        <span v-else class="singramos">—</span>
      </div>
      <div class="pie">
        <span v-if="paso.accion === 'verter'" class="acum">hasta {{ acumulado(i) }} g</span>
        <span v-else-if="paso.accion === 'agitar' || paso.accion === 'remover'" class="ojo">
          la báscula no vale aquí
        </span>
        <span v-else />
        <span class="mandos">
          <button type="button" :disabled="i === 0" @click="mover(i, -1)" aria-label="subir">↑</button>
          <button type="button" :disabled="i === pasos.length - 1" @click="mover(i, 1)" aria-label="bajar">↓</button>
          <button type="button" class="quitar" @click="quitar(i)" aria-label="quitar">✕</button>
        </span>
      </div>
    </div>

    <button type="button" class="anadir" @click="anadir">+ Añadir paso</button>

    <p class="nota">
      Los vertidos suman <strong>{{ referencia }} g</strong>, que es el agua de
      referencia: si preparas con otra cantidad, se escalan proporcionalmente.
    </p>
  </div>
</template>

<style scoped>
.paso {
  border: 1px solid var(--linea);
  border-radius: 0.6rem;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.5rem;
  background: var(--tarjeta);
}

.linea {
  display: grid;
  grid-template-columns: 1.3rem 1fr 4.5rem 4.5rem;
  gap: 0.4rem;
  align-items: center;
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
}

.singramos { color: var(--suave); text-align: center; font-size: 0.85rem; }

.pie {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.4rem;
  font-size: 0.78rem;
  color: var(--suave);
}

.acum { color: var(--acento); }
.ojo { color: #c2410c; }

.mandos button {
  font: inherit;
  background: transparent;
  border: 1px solid var(--linea);
  border-radius: 0.35rem;
  color: var(--suave);
  padding: 0.2rem 0.45rem;
  margin-left: 0.25rem;
  cursor: pointer;
  min-height: 2rem;
  min-width: 2rem;
}

.mandos button:disabled { opacity: 0.35; cursor: default; }
.mandos .quitar { color: #c2410c; border-color: #c2410c; }

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
