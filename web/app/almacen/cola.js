/**
 * La cola de salida: lo escrito en local que la red aún no ha visto.
 *
 * Cada entrada es una petición lista para repetir contra el Worker —método,
 * camino y cuerpo; las fotos llevan su Blob—. El drenado va **en orden y se
 * para en el primer fallo**: una extracción puede apuntar a una bolsa que
 * también está en la cola, y saltarse una entrada rompería esa cadena.
 *
 * Reintentar es seguro porque los altas viajan con su id: el servidor
 * responde 409 con `repetida` a lo que ya escribió, y eso aquí cuenta como
 * subido. Un 404 al borrar, igual: el estado que se pedía ya está.
 *
 * En JS pelado y con el envío inyectado: el runner de Node lo prueba con un
 * almacén en memoria haciendo de servidor, sin red de por medio.
 */
import { CAMPOS, CAMPOS_CAFE } from "@coffee/nucleo/validacion";

/**
 * El cuerpo con el que la red repite un alta que ya pasó en local: los campos
 * del endpoint más la identidad, para que el servidor escriba la misma fila.
 * Se proyecta desde la fila creada —no desde lo que tecleó el usuario— y así
 * viajan también el reparto y el ajuste que puso el motor: paridad exacta.
 */
export function cuerpoDeAlta(fila, campos) {
  const cuerpo = { id: fila.id, creado_en: fila.creado_en };
  for (const campo of campos) {
    if (fila[campo] !== null && fila[campo] !== undefined) cuerpo[campo] = fila[campo];
  }
  return cuerpo;
}

export const cuerpoDeCafe = (cafe) => cuerpoDeAlta(cafe, CAMPOS_CAFE);
export const cuerpoDeExtraccion = (extraccion) => cuerpoDeAlta(extraccion, CAMPOS);

/** Una receta como la espera el endpoint; sin identidad si es un PUT. */
export function cuerpoDeReceta(receta, { conIdentidad = true } = {}) {
  const cuerpo = {
    nombre: receta.nombre,
    ratio: receta.ratio,
    notas: receta.notas,
    pasos: receta.pasos.map(({ accion, estilo, agua_g, t_inicio_s, notas }) => ({
      accion, estilo, agua_g, t_inicio_s, notas,
    })),
  };
  if (conIdentidad) {
    cuerpo.id = receta.id;
    cuerpo.creado_en = receta.creado_en;
  }
  return cuerpo;
}

/** Si el fallo dice que la entrada ya estaba aplicada en el servidor. */
function yaAplicada(entrada, fallo) {
  const estado = fallo?.statusCode;
  if (estado === 409 && fallo?.data?.repetida) return true;
  if (estado === 404 && entrada.metodo === "DELETE") return true;
  return false;
}

/** El mensaje legible de un rechazo, para apuntarlo en la entrada. */
function mensajeDe(fallo) {
  const datos = fallo?.data;
  if (datos?.errores?.length) return datos.errores.join(" · ");
  if (datos?.error) return datos.error;
  return fallo?.message || "el servidor lo rechazó";
}

/**
 * Sube la cola entrada a entrada. `enviar(entrada)` repite la petición y
 * lanza como $fetch: con `statusCode` y `data` si el servidor dijo que no,
 * sin ellos si no hubo red.
 *
 * Devuelve { subidas, quedan, red }: `red` distingue «sin cobertura, ya
 * caerá» de «esta entrada no pasa» — la segunda queda marcada con su error
 * y a la vista, que una cola en silencio es una pérdida de datos esperando.
 */
export async function drenar(almacen, enviar) {
  const entradas = await almacen.cola.listar();
  let subidas = 0;
  for (const entrada of entradas) {
    try {
      await enviar(entrada);
    } catch (fallo) {
      if (!yaAplicada(entrada, fallo)) {
        const red = !fallo?.statusCode;
        if (!red) await almacen.cola.marcar(entrada.id, mensajeDe(fallo));
        return { subidas, quedan: entradas.length - subidas, red };
      }
    }
    await almacen.cola.quitar(entrada.id);
    subidas += 1;
  }
  return { subidas, quedan: 0, red: false };
}
