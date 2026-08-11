<script setup lang="ts">
/**
 * Lo que le pasa a la taza, en orden de relevancia.
 *
 * Se pueden marcar varios —una taza puede estar amarga y astringente a la
 * vez, y obligar a elegir perdía la mitad del juicio—, pero **el orden
 * importa**: la sugerencia sale solo del primero. Las palancas de dos
 * defectos tiran de los clics en direcciones distintas, y el protocolo entero
 * se sostiene sobre mover una sola cosa por extracción.
 *
 * Por eso el orden se ve y se toca: el número delante, y una flecha para
 * ascender el que más moleste. Sin eso, «el primero manda» sería una regla
 * invisible decidida por el orden en que fuiste tocando.
 */
// El castellano sale del catálogo; la regla de qué es «sin defecto» es del
// dominio y vive en el núcleo, que es quien la hace cumplir al validar.
import { SIN_DEFECTO } from '@coffee/nucleo/validacion'
import { CLAVES_DEFECTO } from '~/composables/textos'

const { DEFECTOS } = useTextos()

const elegidos = defineModel<string[]>({ required: true })

// Las claves son datos: el orden del vocabulario no cambia con el idioma.
const claves = [...CLAVES_DEFECTO]

const puesto = (clave: string) => elegidos.value.indexOf(clave)

/**
 * «Equilibrado» es decir que no hay defecto, así que se lleva por delante a
 * los demás y cualquier otro se lo lleva a él. Es la misma regla que el
 * núcleo hace cumplir al validar; aquí evita que llegues a mandarla.
 */
function alternar(clave: string) {
  const dentro = puesto(clave) !== -1
  if (dentro) {
    elegidos.value = elegidos.value.filter((d) => d !== clave)
    return
  }
  if (clave === SIN_DEFECTO) {
    elegidos.value = [SIN_DEFECTO]
    return
  }
  elegidos.value = [...elegidos.value.filter((d) => d !== SIN_DEFECTO), clave]
}

/** Sube uno un puesto. El de arriba es el que mueve la palanca. */
function subir(i: number) {
  if (i <= 0) return
  const copia = [...elegidos.value]
  const [suyo] = copia.splice(i, 1)
  copia.splice(i - 1, 0, suyo!)
  elegidos.value = copia
}
</script>

<template>
  <div class="defectos">
    <div class="fichas">
      <button
        v-for="clave in claves" :key="clave" type="button"
        class="ficha" :class="{ puesta: puesto(clave) !== -1 }"
        :aria-pressed="puesto(clave) !== -1"
        @click="alternar(clave)"
      >
        {{ DEFECTOS[clave] }}
      </button>
    </div>

    <!-- Con uno solo no hay orden que enseñar: el número y la flecha sobran y
         solo harían ruido en el caso normal, que es marcar una cosa. -->
    <ol v-if="elegidos.length > 1" class="orden">
      <li v-for="(clave, i) in elegidos" :key="clave">
        <span class="puesto">{{ i + 1 }}</span>
        <span class="que">{{ DEFECTOS[clave] ?? clave }}</span>
        <button
          type="button" class="subir" :disabled="i === 0"
          :aria-label="$t('defecto.subir', { que: DEFECTOS[clave] ?? clave })"
          @click="subir(i)"
        >
          ↑
        </button>
      </li>
    </ol>

    <i18n-t v-if="elegidos.length > 1" keypath="defecto.orden_pista" tag="p" class="pista" scope="global">
      <template #principal><strong>{{ DEFECTOS[elegidos[0]!] ?? elegidos[0] }}</strong></template>
    </i18n-t>
  </div>
</template>

<style scoped>
.fichas { display: flex; flex-wrap: wrap; gap: 0.4rem; }

/*
 * Botones y no un <select multiple>: en el móvil el multiselección nativo es
 * casi intocable, y aquí hay que poder marcar dos con el dedo sin pensar.
 */
.ficha {
  font: inherit;
  font-size: 0.85rem;
  color: var(--suave);
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 999px;
  padding: 0 0.8rem;
  min-height: 44px;
  cursor: pointer;
}

.ficha.puesta {
  color: var(--sobre-acento);
  background: var(--acento);
  border-color: var(--acento);
  font-weight: 600;
}

.orden {
  list-style: none;
  margin: 0.6rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.orden li {
  display: grid;
  grid-template-columns: 1.6rem 1fr 44px;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--linea);
  border-radius: 0.5rem;
  padding: 0.3rem 0.5rem;
  background: var(--tarjeta);
  font-size: 0.9rem;
}

/* El primero es el que manda, y se nota sin leer la explicación de abajo. */
.orden li:first-child .puesto { color: var(--acento); font-weight: 700; }

.puesto { color: var(--suave); font-variant-numeric: tabular-nums; }
.que { color: var(--tinta); }

.subir {
  font: inherit;
  background: transparent;
  border: 1px solid var(--linea);
  border-radius: 0.35rem;
  color: var(--acento);
  cursor: pointer;
  min-height: 40px;
  padding: 0;
}

.subir:disabled { opacity: 0.3; cursor: default; }

.pista { color: var(--suave); font-size: 0.8rem; margin: 0.5rem 0 0; }
</style>
