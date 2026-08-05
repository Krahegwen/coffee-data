<template>
  <div class="marco">
    <header>
      <h1>Bitácora de café</h1>
      <p class="lema">V60 · 4:6 Kasuya</p>
    </header>
    <main>
      <NuxtPage />
    </main>
  </div>
</template>

<style>
:root {
  --fondo: #faf7f2;
  --tinta: #2b1d13;
  --suave: #7a6a5c;
  --linea: #e6ddd1;
  --tostado: #3b2314;
  --acento: #8b5a2b;
  --tarjeta: #fff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --fondo: #17120e;
    --tinta: #f2ece4;
    --suave: #a3948a;
    --linea: #2f251d;
    --tostado: #d9b892;
    --acento: #c98d4f;
    --tarjeta: #1f1913;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--fondo);
  color: var(--tinta);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  /* Que el contenido no se meta bajo la barra del móvil. */
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}

.marco {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1.25rem 1rem 3rem;
}

header h1 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: -0.01em;
}

.lema {
  margin: 0.15rem 0 1.5rem;
  color: var(--suave);
  font-size: 0.85rem;
}

/*
 * El «‹ Volver» de cada pantalla. Es un enlace de texto, así que de alto
 * daba 21 px: la mitad de los 44 que pide un dedo. Crece por dentro con la
 * caja, no con la tipografía, y el párrafo cede su margen para que la
 * cabecera no se separe.
 */
.volver { margin: 0 0 0.5rem; }

.volver a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding-right: 0.75rem;
}

/*
 * Las parejas de campos son un grid de 1fr 1fr, y sus hijos —las etiquetas—
 * llevan de serie min-width: auto. Eso impide que la columna encoja por
 * debajo del ancho intrínseco del campo que envuelven: un input de texto
 * pide 204 px y uno de fecha 169, así que en el móvil la fila se salía y
 * la página se podía arrastrar de lado. Ponerlo en el input no basta: el
 * ítem del grid es la etiqueta. Va aquí porque .pareja se repite en cinco
 * pantallas y el fallo era el mismo en todas.
 */
.pareja > * { min-width: 0; }
</style>
