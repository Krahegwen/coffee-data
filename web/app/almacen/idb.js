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
const VERSION = 1;

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
  };
  return pedir(peticion);
}

/**
 * El almacén. `fabrica` y `nombre` existen para los tests —cada uno estrena
 * una base—; la app llama sin argumentos y usa la de siempre.
 */
export function almacenIDB(fabrica = globalThis.indexedDB, nombre = NOMBRE) {
  let promesaDb = null;
  const db = () => (promesaDb ??= abrir(fabrica, nombre));

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
  };
}
