/**
 * El cajón local de la app: un solo IndexedDB por pestaña, perezoso.
 *
 * Vivía dentro de useApi(); se salió cuando la cola de salida también lo
 * necesitó — useSincro() drena y reemplaza sobre el mismo cajón del que
 * leen las pantallas, y dos aperturas separadas serían dos versiones.
 */
import { almacenIDB } from "./idb.js";
import { sembrar } from "./semilla.js";

let cajon = null;
let sembrado = null;

/** El cajón pelado, sin sembrar: para la cola y el refresco. */
export function cajonLocal() {
  cajon ??= almacenIDB();
  return cajon;
}

/**
 * El cajón listo para las pantallas. Sin sesión se siembra la primera vez
 * —la casa no puede estar vacía—; con sesión no, que lo suyo es del
 * servidor y llega con el primer refresco.
 */
export async function almacenLocal(conSemilla = true) {
  const almacen = cajonLocal();
  if (conSemilla) {
    sembrado ??= sembrar(almacen);
    await sembrado;
  }
  return almacen;
}
