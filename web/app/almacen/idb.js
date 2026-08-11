/**
 * El puerto de almacén sobre IndexedDB: el cajón del modo local.
 *
 * Mismo contrato que el adaptador de D1 y el de memoria, probado con la misma
 * suite (`nucleo/test/contrato.js`). Igual de tonto a propósito: filas dentro,
 * filas fuera, y las únicas decisiones —transacciones y claves— son las que un
 * almacén no puede delegar.
 *
 * Las recetas se guardan como agregado, con sus pasos dentro: es como las
 * habla el puerto, y en IndexedDB no hay JOIN que lo desaconseje.
 *
 * `fotos` no es parte del puerto — R2 tampoco lo era—: es el cajón de los
 * Blob del modo local, y lo usa useApi() directamente.
 *
 * En JS y no en TS a propósito: lo ejecuta también el runner de Node en los
 * tests de contrato, sin transpilar nada.
 */

const NOMBRE = "coffee";
// La 2 añade `cola`: la salida hacia la red del modo con sesión.
// La 3, `preferencias`: los ajustes, con su clave por llave.
const VERSION = 3;

/** Un IDBRequest como promesa. */
function pedir(peticion) {
  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
}

/** La transacción entera como promesa: o entra todo, o no entra nada. */
function completa(transaccion) {
  return new Promise((resolver, rechazar) => {
    transaccion.oncomplete = () => resolver();
    transaccion.onerror = () => rechazar(transaccion.error);
    transaccion.onabort = () => rechazar(transaccion.error ?? new Error("transacción abortada"));
  });
}

function abrir(fabrica, nombre) {
  const peticion = fabrica.open(nombre, VERSION);
  peticion.onupgradeneeded = () => {
    const db = peticion.result;
    for (const tabla of ["cafes", "recetas", "extracciones"]) {
      if (!db.objectStoreNames.contains(tabla)) db.createObjectStore(tabla, { keyPath: "id" });
    }
    if (!db.objectStoreNames.contains("fotos")) db.createObjectStore("fotos", { keyPath: "clave" });
    if (!db.objectStoreNames.contains("cola")) db.createObjectStore("cola", { keyPath: "id" });
    if (!db.objectStoreNames.contains("preferencias")) {
      db.createObjectStore("preferencias", { keyPath: "clave" });
    }
  };

  return new Promise((resolver, rechazar) => {
    peticion.onsuccess = () => {
      const db = peticion.result;
      /*
       * Si otra pestaña estrena versión, ésta suelta su conexión en vez de
       * ser quien bloquea. Sus lecturas fallarán y se rearmarán al recargar,
       * que es mejor que dejar a la otra esperando indefinidamente.
       */
      db.onversionchange = () => db.close();
      resolver(db);
    };
    peticion.onerror = () => rechazar(peticion.error);
    /*
     * Y el caso contrario: una pestaña vieja tiene la base abierta en la
     * versión anterior y bloquea esta subida. Sin escuchar `blocked` la
     * promesa ni resolvía ni fallaba, y como `db()` la memoriza, **toda**
     * lectura posterior se quedaba colgada: la app en «Un momento…» para
     * siempre y sin un error que mirar. Pasa con la app instalada y una
     * pestaña del navegador abiertas a la vez, que es de lo más normal.
     */
    peticion.onblocked = () => rechazar(
      new Error("otra pestaña tiene abierta la versión anterior de la bitácora"),
    );
  });
}

/**
 * El almacén. `fabrica` y `nombre` existen para los tests —cada uno estrena
 * una base—; la app llama sin argumentos y usa la de siempre.
 */
export function almacenIDB(fabrica = globalThis.indexedDB, nombre = NOMBRE) {
  let promesaDb = null;
  // Si la apertura falla —otra pestaña bloqueando la subida de versión— se
  // olvida, o la promesa rechazada se quedaría memorizada y no habría forma
  // de reintentar sin recargar aunque la otra pestaña ya se hubiera cerrado.
  const db = () => (promesaDb ??= abrir(fabrica, nombre).catch((error) => {
    promesaDb = null;
    throw error;
  }));

  const tablaSimple = (tabla) => ({
    async listar() {
      const d = await db();
      return pedir(d.transaction(tabla).objectStore(tabla).getAll());
    },
    async poner(fila) {
      const d = await db();
      const transaccion = d.transaction(tabla, "readwrite");
      transaccion.objectStore(tabla).add(fila); // add, no put: la id repetida choca
      await completa(transaccion);
    },
    async actualizar(id, cambios) {
      const d = await db();
      const transaccion = d.transaction(tabla, "readwrite");
      const almacen = transaccion.objectStore(tabla);
      const fila = await pedir(almacen.get(id));
      if (!fila) throw new Error(`no existe ${tabla} ${id}`);
      almacen.put({ ...fila, ...cambios });
      await completa(transaccion);
    },
  });

  return {
    cafes: tablaSimple("cafes"),
    extracciones: tablaSimple("extracciones"),
    recetas: {
      async listar() {
        const d = await db();
        return pedir(d.transaction("recetas").objectStore("recetas").getAll());
      },
      async escribir(receta, pasos, { nueva }) {
        const d = await db();
        const transaccion = d.transaction("recetas", "readwrite");
        const almacen = transaccion.objectStore("recetas");
        if (nueva) almacen.add({ ...receta, pasos });
        else almacen.put({ ...receta, pasos });
        await completa(transaccion);
      },
      async borrar(id) {
        const d = await db();
        const transaccion = d.transaction("recetas", "readwrite");
        transaccion.objectStore("recetas").delete(id);
        await completa(transaccion);
      },
    },
    /** Los ajustes: clave por llave, upsert, sin id que pueda chocar. */
    preferencias: {
      async leer() {
        const d = await db();
        return pedir(d.transaction("preferencias").objectStore("preferencias").getAll());
      },
      async escribir(nuevas) {
        const d = await db();
        const transaccion = d.transaction("preferencias", "readwrite");
        const almacen = transaccion.objectStore("preferencias");
        for (const fila of nuevas) almacen.put(fila);
        await completa(transaccion);
      },
      /**
       * Lo del servidor por encima de lo de aquí, **clave a clave y solo si
       * es más nuevo**. Fuera del contrato, como `reemplazar`, y aparte de
       * él a propósito.
       *
       * Con el `clear()+put()` de las demás tablas había una rendija por la
       * que un interruptor recién pulsado se perdía del todo: entre escribir
       * en el cajón y apuntarlo en la cola no hay cerrojo, y un refresco que
       * entrase justo ahí —al volver a la pestaña, que es cuando más se
       * dispara— veía la cola vacía, se creía al día y borraba el cambio. Un
       * ajuste que revierte solo no se echa en falta como una extracción: se
       * vuelve a pulsar pensando que fallaste tú.
       *
       * Comparar sellos lo cierra, y de paso arregla los dos dispositivos:
       * apagar el sonido en el móvil no revive el de ayer del portátil.
       */
      async fusionar(remotas) {
        const d = await db();
        const transaccion = d.transaction("preferencias", "readwrite");
        const almacen = transaccion.objectStore("preferencias");
        for (const fila of remotas) {
          const mia = await pedir(almacen.get(fila.clave));
          if (!mia || String(fila.actualizado_en ?? "") >= String(mia.actualizado_en ?? "")) {
            almacen.put(fila);
          }
        }
        await completa(transaccion);
      },
    },
    /** Los Blob de las bolsas. Fuera del contrato: es cosa del modo local. */
    fotos: {
      async listar() {
        const d = await db();
        return pedir(d.transaction("fotos").objectStore("fotos").getAll());
      },
      async poner(clave, blob, tipo) {
        const d = await db();
        const transaccion = d.transaction("fotos", "readwrite");
        transaccion.objectStore("fotos").put({ clave, blob, tipo });
        await completa(transaccion);
      },
      async quitar(clave) {
        const d = await db();
        const transaccion = d.transaction("fotos", "readwrite");
        transaccion.objectStore("fotos").delete(clave);
        await completa(transaccion);
      },
    },
    /**
     * La cola de salida: lo escrito en local que la red aún no ha visto.
     * También fuera del contrato — los otros adaptadores *son* el destino.
     * La id es un uuid v7, así que el orden de las claves es el de encolado.
     */
    cola: {
      async listar() {
        const d = await db();
        const filas = await pedir(d.transaction("cola").objectStore("cola").getAll());
        filas.sort((a, b) => (a.id < b.id ? -1 : 1));
        return filas;
      },
      async poner(entrada) {
        const d = await db();
        const transaccion = d.transaction("cola", "readwrite");
        transaccion.objectStore("cola").add(entrada);
        await completa(transaccion);
      },
      async quitar(id) {
        const d = await db();
        const transaccion = d.transaction("cola", "readwrite");
        transaccion.objectStore("cola").delete(id);
        await completa(transaccion);
      },
      async marcar(id, error) {
        const d = await db();
        const transaccion = d.transaction("cola", "readwrite");
        const almacen = transaccion.objectStore("cola");
        const fila = await pedir(almacen.get(id));
        if (fila) almacen.put({ ...fila, error });
        await completa(transaccion);
      },
      async contar() {
        const d = await db();
        return pedir(d.transaction("cola").objectStore("cola").count());
      },
    },
    /**
     * Reemplaza las tres tablas con lo que diga el servidor, en una sola
     * transacción: o el cajón entero pasa a la versión nueva, o se queda como
     * estaba. Solo lo llama el refresco, y solo con la cola vacía.
     *
     * Las preferencias **no entran aquí**: se fusionan por sello, que un
     * ajuste no es una fila del historial y borrarlo para volver a bajarlo
     * tiene consecuencias distintas. Ver `preferencias.fusionar`.
     */
    async reemplazar({ cafes, recetas, extracciones }) {
      const d = await db();
      const transaccion = d.transaction(["cafes", "recetas", "extracciones"], "readwrite");
      const tablas = { cafes, recetas, extracciones };
      try {
        for (const [tabla, filas] of Object.entries(tablas)) {
          const almacen = transaccion.objectStore(tabla);
          almacen.clear();
          for (const fila of filas) almacen.put(fila);
        }
      } catch (error) {
        // Un put puede reventar en el sitio —una fila que no se deja clonar—
        // y eso no aborta la transacción solo: sin esto, el clear de arriba
        // se confirmaría y el cajón quedaría a medias.
        transaccion.abort();
        throw error;
      }
      await completa(transaccion);
    },
  };
}
