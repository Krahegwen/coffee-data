/**
 * Los campos derivados de una extracción: lo que en el servidor calcula la
 * vista `v_extracciones` en SQL, aquí en JS para el almacén local.
 *
 * Son dos implementaciones de lo mismo y esa es la deuda: si esto y la vista
 * discrepan, el mismo café cuenta dos historias según dónde se mire. Por eso
 * cada regla lleva al lado su línea SQL, y los tests fijan los mismos números
 * que comprueba `test_esquema.py` contra la vista de verdad.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

/** Número o null, como `num` en sugerencias: aquí vacío también es nada. */
function num(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** `julianday(a) - julianday(b)` con fechas AAAA-MM-DD: días enteros. */
function diasEntre(a, b) {
  if (!a || !b) return null;
  const fin = Date.parse(`${a}T00:00:00Z`);
  const inicio = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(fin) || Number.isNaN(inicio)) return null;
  // CAST AS INTEGER trunca hacia cero, no redondea: un día a medias no cuenta.
  return Math.trunc((fin - inicio) / DIA_MS);
}

/** `ROUND(agua_g / dosis_g, 1)`. */
export function ratioDe(aguaG, dosisG) {
  const agua = num(aguaG);
  const dosis = num(dosisG);
  if (agua === null || dosis === null || dosis === 0) return null;
  return Math.round((agua / dosis) * 10) / 10;
}

/**
 * Una extracción con sus derivados puestos, como la devuelve la vista.
 *
 * `cafe` es la fila de la bolsa a la que apunta; sin ella los derivados que
 * dependen del café quedan a null, que es lo que haría un JOIN fallido en vez
 * de inventarse un cero.
 */
export function derivar(extraccion, cafe) {
  return {
    ...extraccion,
    cafe_nombre: cafe?.nombre ?? null,
    ratio: ratioDe(extraccion.agua_g, extraccion.dosis_g),
    dias_tueste: diasEntre(extraccion.fecha, cafe?.fecha_tueste),
    dias_abierta: diasEntre(extraccion.fecha, cafe?.fecha_apertura),
  };
}
