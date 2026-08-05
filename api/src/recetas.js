/**
 * Recetas: escalado de vertidos y guion para el cronómetro.
 *
 * Port de recetas.py. Solo los pasos `verter` llevan gramos y solo ellos
 * escalan con el agua: la suma de los vertidos es el agua de referencia.
 */

export const ACCIONES = ["verter", "agitar", "remover", "esperar", "retirar"];

/** La única acción que lleva agua y, por tanto, la única que escala. */
export const CON_AGUA = "verter";

/** Acciones durante las que la lectura de la báscula no es de fiar. */
export const SIN_LECTURA_FIABLE = ["agitar", "remover"];

export function vertidos(pasos) {
  return pasos.filter((paso) => paso.accion === CON_AGUA);
}

/** Escala una lista de gramos para que sume exactamente el agua. */
export function escalar(gramos, aguaG) {
  if (!gramos.length) throw new Error("No hay ningún vertido que escalar");

  const referencia = gramos.reduce((total, g) => total + g, 0);
  if (!(referencia > 0)) throw new Error("Los vertidos deben sumar más que 0");

  const agua = Number(String(aguaG).replace(",", "."));
  if (!Number.isFinite(agua) || agua <= 0) {
    throw new Error(`El agua debe ser mayor que 0: ${JSON.stringify(aguaG)}`);
  }

  const escalados = gramos.map((g) => Math.round((g * agua) / referencia));
  // El redondeo puede desviar algún gramo: se ajusta en el último vertido.
  const suma = escalados.reduce((total, g) => total + g, 0);
  escalados[escalados.length - 1] += Math.round(agua) - suma;
  return escalados;
}

/** Los pasos con los vertidos escalados al agua real. */
export function escalarPasos(pasos, aguaG) {
  const salida = pasos.map((paso) => ({ ...paso }));
  const indices = salida
    .map((paso, i) => (paso.accion === CON_AGUA ? i : -1))
    .filter((i) => i >= 0);
  if (!indices.length) throw new Error("La receta no tiene ningún vertido");

  const gramos = indices.map((i) => {
    const g = Number(salida[i].agua_g);
    if (!Number.isFinite(g)) throw new Error("Hay un vertido sin gramos válidos");
    return g;
  });

  const escalados = escalar(gramos, aguaG);
  indices.forEach((indice, n) => {
    salida[indice].agua_g = escalados[n];
  });
  return salida;
}

/** Reparto listo para guardar: '60-60-90-90'. */
export function repartoDe(pasos, aguaG) {
  return vertidos(escalarPasos(pasos, aguaG))
    .map((paso) => paso.agua_g)
    .join("-");
}

/** Los pasos con agua escalada, acumulado y si fiarse de la báscula. */
export function guion(pasos, aguaG) {
  let total = 0;
  return escalarPasos(pasos, aguaG).map((paso) => {
    total += Number(paso.agua_g) || 0;
    const t = paso.t_inicio_s;
    return {
      orden: Number(paso.orden),
      t_inicio_s: t === null || t === undefined || t === "" ? null : Number(t),
      accion: paso.accion,
      agua_g: paso.agua_g,
      acumulado_g: Math.round(total),
      lectura_fiable: !SIN_LECTURA_FIABLE.includes(paso.accion),
      notas: paso.notas ?? "",
    };
  });
}
