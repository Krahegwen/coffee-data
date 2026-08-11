<script setup lang="ts">
/**
 * Qué es cada defecto y qué hace el motor con él.
 *
 * Las descripciones son textos de la app —viven en los locales—, pero **las
 * palancas se leen del núcleo en vivo**: son la misma tabla `PALANCAS` que
 * decide la sugerencia al registrar. Copiarlas aquí habría dejado dos
 * verdades, y el día que se calibre un umbral esta pantalla mentiría sin que
 * nadie se enterase.
 *
 * A pantalla completa y no en una tarjeta: se abre con la taza delante para
 * decidir qué marcar, y en el móvil un diálogo pequeño con siete apartados
 * obliga a leer por una rendija.
 */
import { PALANCAS } from '@coffee/nucleo/sugerencias'
import { textos } from '@coffee/nucleo/textos'
import { SIN_DEFECTO } from '@coffee/nucleo/validacion'
import { CLAVES_DEFECTO } from '~/composables/textos'

const { locale } = useI18n()
const { DEFECTOS, VARIABLES } = useTextos()

const dialogo = ref<HTMLDialogElement | null>(null)

function abrir() {
  dialogo.value?.showModal()
}

/**
 * Lo que el motor movería por cada defecto, con su porqué.
 *
 * El catálogo del núcleo en el idioma de la app: los porqués son claves y se
 * traducen igual que los mensajes de validación.
 */
const t = computed(() => textos(locale.value))

const fichas = computed(() => [...CLAVES_DEFECTO].map((clave) => ({
  clave,
  nombre: DEFECTOS.value[clave] ?? clave,
  palancas: (PALANCAS[clave] ?? []).map(([variable, cambio, porque]: string[]) => ({
    // El nombre de la columna sin su unidad: dentro de una frase, «(°C)» estorba.
    variable: (VARIABLES.value[variable!] ?? variable!).replace(/\s*\(.*\)$/, ''),
    cambio,
    porque: t.value(porque!),
  })),
})))
</script>

<template>
  <button type="button" class="info" :aria-label="$t('defecto.que_es')" @click="abrir">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.6v.4" />
    </svg>
  </button>

  <!-- El título, atado: sin `aria-labelledby` el lector de pantalla anuncia
       un diálogo sin nombre y hay que ir a buscarlo. -->
  <dialog ref="dialogo" class="hoja" aria-labelledby="defectos-info-titulo" @cancel="dialogo?.close()">
    <header>
      <h3 id="defectos-info-titulo">{{ $t('defecto.que_es') }}</h3>
      <button type="button" class="cerrar" :aria-label="$t('comun.cerrar')" @click="dialogo?.close()">
        ✕
      </button>
    </header>

    <p class="intro">{{ $t('defecto.info_intro') }}</p>

    <article v-for="f in fichas" :key="f.clave">
      <h4>{{ f.nombre }}</h4>
      <p class="que">{{ $t(`defectos_info.${f.clave}`) }}</p>

      <!-- «Equilibrado» no mueve nada, y decirlo vale más que dejar el hueco:
           es la diferencia entre «no hay palanca» y «se me olvidó mirarlo». -->
      <p v-if="f.clave === SIN_DEFECTO" class="palanca sin">
        {{ $t('defecto.sin_palanca') }}
      </p>
      <ul v-else class="palancas">
        <li v-for="p in f.palancas" :key="p.variable">
          <code>{{ p.variable }} {{ p.cambio }}</code>
          <span class="porque">{{ p.porque }}</span>
        </li>
      </ul>
    </article>

    <p class="pie">{{ $t('defecto.info_pie') }}</p>
  </dialog>
</template>

<style scoped>
/* Del tamaño de la etiqueta que acompaña, y con área de toque de sobra. */
.info {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  min-height: 0;
  border: 0;
  background: transparent;
  color: var(--suave);
  cursor: pointer;
}

.info:hover { color: var(--acento); }

/* A pantalla completa: se lee con la taza en la mano, no de refilón. */
.hoja {
  width: 100%;
  max-width: none;
  height: 100%;
  max-height: none;
  margin: 0;
  border: 0;
  padding: 1.25rem 1rem calc(2rem + env(safe-area-inset-bottom));
  background: var(--fondo);
  color: var(--tinta);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.hoja::backdrop { background: var(--fondo); }

/*
 * Pegado arriba del todo. `top` se mide contra el **padding box** del que
 * scrollea, así que un valor negativo para «compensar» el padding del diálogo
 * dejaba el encabezado esa misma franja por encima del borde visible: al
 * bajar, el título salía cortado por arriba.
 */
.hoja header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  position: sticky;
  top: 0;
  background: var(--fondo);
  padding: 0.25rem 0 0.5rem;
}

.hoja h3 { font-size: 1.05rem; margin: 0; }

.cerrar {
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--suave);
  background: transparent;
  border: 0;
  padding: 0.5rem;
  margin: 0;
  min-height: 0;
  cursor: pointer;
}

.intro, .pie { color: var(--suave); font-size: 0.88rem; margin: 0 0 1rem; }
.pie { margin: 1.5rem 0 0; }

article { border-top: 1px solid var(--linea); padding: 0.9rem 0; }

h4 { font-size: 0.98rem; margin: 0 0 0.3rem; color: var(--acento); }
.que { font-size: 0.9rem; margin: 0 0 0.5rem; }

.palancas { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.35rem; }

.palancas li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.85rem;
}

code {
  font-size: 0.85em;
  background: var(--tarjeta);
  border: 1px solid var(--linea);
  border-radius: 0.35rem;
  padding: 0.1rem 0.4rem;
  white-space: nowrap;
}

.porque { color: var(--suave); }
.palanca.sin { font-size: 0.85rem; color: var(--suave); margin: 0; }
</style>
