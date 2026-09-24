/**
 * El puerto de almacén sobre Maps. Dos trabajos:
 *
 * - probar la API entera sin base de datos, que es como se prueba desde la
 *   fase del puerto;
 * - ser la forma de referencia del adaptador de IndexedDB, que es este mismo
 *   con transacciones y disco.
 *
 * Copia al entrar y al salir: si el que llama muta lo que le devolvimos, el
 * almacén ni se entera — como pasaría con una base de verdad.
 */

const copia = (x) => structuredClone(x);

/**
 * Listar, poner y actualizar. Con `borrable`, también borrar: solo el catálogo
 * de accesorios lo tiene, que las bolsas se terminan y las extracciones se
 * retiran, pero ninguna de las dos desaparece.
 */
function tablaSimple(nombre, { borrable = false } = {}) {
  const filas = new Map();
  const tabla = {
    async listar() {
      return [...filas.values()].map(copia);
    },
    async poner(fila) {
      if (filas.has(fila.id)) {
        throw new Error(`UNIQUE constraint failed: ${nombre}.id`);
      }
      filas.set(fila.id, copia(fila));
    },
    async actualizar(id, cambios) {
      const fila = filas.get(id);
      if (!fila) throw new Error(`no existe ${nombre} ${id}`);
      Object.assign(fila, copia(cambios));
    },
  };
  if (borrable) {
    tabla.borrar = async (id) => {
      filas.delete(id);
    };
  }
  return tabla;
}

/**
 * Las preferencias son un singleton de clave y valor, no una colección de
 * filas con id: no hay «alta» que pueda chocar y el primer día no existe
 * ninguna, así que se escribe con upsert y no con `poner`/`actualizar`.
 */
function tablaClaveValor() {
  const filas = new Map();
  return {
    async leer() {
      return [...filas.values()].map(copia);
    },
    async escribir(nuevas) {
      for (const fila of nuevas) filas.set(fila.clave, copia(fila));
    },
  };
}

export function almacenEnMemoria() {
  const recetas = new Map();
  const pasosPor = new Map();

  return {
    cafes: tablaSimple("cafes"),
    accesorios: tablaSimple("accesorios", { borrable: true }),
    extracciones: tablaSimple("extracciones"),
    preferencias: tablaClaveValor(),
    recetas: {
      async listar() {
        return [...recetas.values()].map((r) => ({
          ...copia(r),
          pasos: (pasosPor.get(r.id) ?? []).map(copia),
        }));
      },
      async escribir(receta, pasos, { nueva }) {
        if (nueva && recetas.has(receta.id)) {
          throw new Error("UNIQUE constraint failed: recetas.id");
        }
        recetas.set(receta.id, copia(receta));
        pasosPor.set(receta.id, pasos.map(copia));
      },
      async borrar(id) {
        recetas.delete(id);
        pasosPor.delete(id);
      },
    },
  };
}
