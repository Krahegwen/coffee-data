<script setup lang="ts">
/**
 * Los ajustes: lo que se decide una vez y la app respeta después.
 *
 * Cada interruptor se guarda solo, sin botón de guardar. Un ajuste no es un
 * formulario —no hay nada que revisar antes de confirmar— y una pantalla con
 * seis switches y un «Guardar» abajo pide un viaje de más para algo que se
 * entiende al tocarlo.
 */
const { t } = useI18n()
useHead({ title: () => t('ajustes.titulo') })

const { ajustes, cargar, guardar } = usePreferencias()
await cargar()

const fallo = ref('')

/** Los interruptores, en el orden en que se explican. */
const INTERRUPTORES = [
  { clave: 'sonido', titulo: 'ajustes.sonido', pista: 'ajustes.sonido_pista' },
  { clave: 'cuenta_atras', titulo: 'ajustes.cuenta_atras', pista: 'ajustes.cuenta_atras_pista' },
  { clave: 'latido', titulo: 'ajustes.latido', pista: 'ajustes.latido_pista' },
] as const

async function cambiar(clave: (typeof INTERRUPTORES)[number]['clave'], valor: boolean) {
  fallo.value = ''
  try {
    await guardar({ [clave]: valor })
  } catch (error) {
    fallo.value = erroresDe(error)[0] ?? ''
  }
}
</script>

<template>
  <Migas :ruta="[{ texto: $t('ajustes.titulo') }]" />

  <section>
    <h2>{{ $t('ajustes.crono_titulo') }}</h2>
    <p class="meta">{{ $t('ajustes.crono_intro') }}</p>

    <label v-for="i in INTERRUPTORES" :key="i.clave" class="fila">
      <span class="texto">
        <span class="titulo">{{ $t(i.titulo) }}</span>
        <span class="pista">{{ $t(i.pista) }}</span>
      </span>
      <input
        type="checkbox" role="switch" :checked="ajustes[i.clave]"
        @change="cambiar(i.clave, ($event.target as HTMLInputElement).checked)"
      >
    </label>

    <p v-if="fallo" class="fallo">{{ fallo }}</p>

    <!-- Dónde vive esto, dicho una vez: es la diferencia entre «se me ha
         desconfigurado el móvil» y «esto es lo que hace». -->
    <p class="meta nota">{{ $t('ajustes.donde_viven') }}</p>
  </section>
</template>

<style scoped>
h2 { font-size: 1.05rem; margin: 0 0 0.25rem; }

section { display: flex; flex-direction: column; }

/* Etiqueta y control en los extremos: el dedo va al interruptor sin mirar, y
   la fila entera es pulsable porque es un <label>. */
.fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 0;
  border-bottom: 1px solid var(--linea);
  cursor: pointer;
}

.fila:first-of-type { border-top: 1px solid var(--linea); }

.texto { display: flex; flex-direction: column; gap: 0.15rem; }
.titulo { font-size: 0.95rem; color: var(--tinta); }
.pista { font-size: 0.8rem; color: var(--suave); }

/*
 * El interruptor nativo del navegador con `role="switch"`: en iOS y en Android
 * ya se pinta como el del sistema, y lo que no se dibuja a mano no se
 * desalinea con el tema ni pierde el foco del teclado.
 */
input[type="checkbox"] {
  appearance: none;
  flex: 0 0 auto;
  width: 3rem;
  height: 1.75rem;
  border-radius: 1rem;
  background: var(--linea);
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease;
}

input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s ease;
}

input[type="checkbox"]:checked { background: var(--acento); }
input[type="checkbox"]:checked::after { transform: translateX(1.25rem); }
input[type="checkbox"]:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }

.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.nota { margin-top: 1.25rem; }
.fallo { color: #c2410c; font-size: 0.85rem; margin: 0.75rem 0 0; }
</style>
