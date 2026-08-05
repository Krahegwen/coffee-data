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
</style>
