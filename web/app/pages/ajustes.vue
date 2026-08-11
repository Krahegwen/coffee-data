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
  { clave: 'voz', titulo: 'ajustes.voz', pista: 'ajustes.voz_pista' },
  { clave: 'cuenta_atras', titulo: 'ajustes.cuenta_atras', pista: 'ajustes.cuenta_atras_pista' },
  { clave: 'latido', titulo: 'ajustes.latido', pista: 'ajustes.latido_pista' },
] as const

async function cambiar(clave: string, valor: boolean | string) {
  fallo.value = ''
  try {
    await guardar({ [clave]: valor })
  } catch (error) {
    fallo.value = erroresDe(error)[0] ?? ''
  }
}

/** El modo, y qué juego usar en cada uno. Tres decisiones, no una. */
const { modo } = useTema()

const MODOS = ['auto', 'claro', 'oscuro'] as const
const TEMAS_CLAROS = ['papel', 'pizarra'] as const
const TEMAS_OSCUROS = ['tostado', 'carbon'] as const

/**
 * Solo se ofrece el juego del modo que se está viendo: enseñar los cuatro a
 * la vez obliga a imaginarse cómo queda el otro, y el que no se ve no se
 * puede juzgar. En «auto» se muestra el que rige ahora mismo.
 */
const temasVisibles = computed(() =>
  modo.value === 'oscuro' ? TEMAS_OSCUROS : TEMAS_CLAROS,
)
const claveDelTema = computed(() =>
  modo.value === 'oscuro' ? 'tema_oscuro' : 'tema_claro',
)
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

    <h2 class="aparte">{{ $t('ajustes.tema_titulo') }}</h2>
    <p class="meta">{{ $t('ajustes.tema_intro') }}</p>

    <div class="grupo" role="group" :aria-label="$t('ajustes.tema_modo')">
      <button
        v-for="m in MODOS" :key="m" type="button"
        class="opcion" :class="{ puesta: ajustes.tema_modo === m }"
        :aria-pressed="ajustes.tema_modo === m" @click="cambiar('tema_modo', m)"
      >{{ $t(`ajustes.modo_${m}`) }}</button>
    </div>

    <!-- Las muestras se pintan con las variables del propio tema, así que lo
         que se ve en el botón es exactamente lo que va a pasar al pulsarlo. -->
    <div class="temas" role="group" :aria-label="$t('ajustes.tema_juego')">
      <button
        v-for="nombre in temasVisibles" :key="nombre" type="button"
        class="muestra" :class="[nombre, { puesta: ajustes[claveDelTema] === nombre }]"
        :aria-pressed="ajustes[claveDelTema] === nombre"
        @click="cambiar(claveDelTema, nombre)"
      >
        <span class="tira">
          <span class="punto fondo" />
          <span class="punto acento" />
          <span class="punto tinta" />
        </span>
        {{ $t(`ajustes.tema_${nombre}`) }}
      </button>
    </div>

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

/*
 * El pomo cambia de color con el estado, y no es capricho: en blanco fijo se
 * quedaba en 1.31 de contraste sobre el carril apagado de los temas claros
 * —un círculo blanco invisible sobre crema—, así que «apagado» no se veía.
 * Apagado va con la tinta, que contrasta con `--linea` por construcción;
 * encendido, con lo que va encima del acento, que es exactamente para eso.
 */
input[type="checkbox"]::after {
  content: "";
  position: absolute;
  top: 0.2rem;
  left: 0.2rem;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 50%;
  background: var(--tinta);
  transition: transform 0.15s ease, background 0.15s ease;
}

input[type="checkbox"]:checked { background: var(--acento); }
input[type="checkbox"]:checked::after {
  transform: translateX(1.25rem);
  background: var(--sobre-acento);
}

@media (prefers-reduced-motion: reduce) {
  input[type="checkbox"]::after { transition: none; }
}
input[type="checkbox"]:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px; }

.meta { color: var(--suave); font-size: 0.85rem; margin: 0.35rem 0; }
.nota { margin-top: 1.25rem; }
.fallo { color: var(--peligro); font-size: 0.85rem; margin: 0.75rem 0 0; }

.aparte { margin-top: 2rem; }

/* Los tres modos en fila, como un selector segmentado: son excluyentes y
   caben, así que un desplegable escondería la mitad de la decisión. */
.grupo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin: 0.6rem 0; }

.opcion {
  font: inherit;
  font-size: 0.9rem;
  color: var(--tinta);
  background: transparent;
  border: 1px solid var(--linea);
  border-radius: 0.55rem;
  padding: 0.6rem 0.5rem;
  min-height: 2.75rem;
  cursor: pointer;
}

.opcion.puesta {
  background: var(--acento);
  color: var(--sobre-acento);
  border-color: var(--acento);
  font-weight: 600;
}

.temas { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.6rem; margin: 0.6rem 0; }

/*
 * Cada muestra se pinta con las variables de **su** tema, no con las del que
 * está puesto: se ve el color antes de elegirlo. Por eso las clases repiten
 * aquí los tres colores que enseña la tira — es el único sitio de la app
 * donde un tema tiene que verse sin estar aplicado.
 */
.muestra {
  font: inherit;
  font-size: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  color: var(--tinta);
  background: transparent;
  border: 1px solid var(--linea);
  border-radius: 0.6rem;
  padding: 0.7rem;
  cursor: pointer;
}

/* La elegida se rellena como los modos, no solo se perfila: un borde de un
   color es toda la señal para quien no distingue tonos. */
.muestra.puesta {
  border-color: var(--acento);
  box-shadow: inset 0 0 0 1px var(--acento);
  background: color-mix(in srgb, var(--acento) 12%, transparent);
  font-weight: 600;
}

.tira { display: flex; gap: 0.3rem; }

/* El borde con suficiente cuerpo: el punto del fondo de un tema claro sobre
   una página clara es del mismo color que la página, y con un gris al 35 %
   sencillamente no se veía. */
.punto {
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  border: 1px solid var(--suave);
}

.papel .fondo { background: #faf7f2; }
.papel .acento { background: #8b5a2b; }
.papel .tinta { background: #2b1d13; }

.pizarra .fondo { background: #f7f8fa; }
.pizarra .acento { background: #2d5d8e; }
.pizarra .tinta { background: #171a1f; }

.tostado .fondo { background: #17120e; }
.tostado .acento { background: #c98d4f; }
.tostado .tinta { background: #f2ece4; }

.carbon .fondo { background: #101215; }
.carbon .acento { background: #8ab4e8; }
.carbon .tinta { background: #e9ecf0; }
</style>
