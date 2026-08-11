/**
 * Cronómetro: la línea de tiempo sonora de un guion.
 *
 * Puro y sin reloj: recibe pasos y devuelve en qué segundo suena qué. Quién
 * lo toca —Web Audio en la app— es cosa del reproductor; que la agenda se
 * pueda probar con el runner de Node es la razón de que viva aquí.
 */

import { CON_AGUA } from "./recetas.js";

/** Segundos de aviso antes de cada paso: un pip por cada uno. */
export const AVISO_S = 3;

/**
 * Respiro entre el final de la frase y el primer pip. Sin él se pisan: el
 * clip acaba y el pitido entra encima de la última sílaba.
 */
export const HUECO_VOZ = 0.35;

/**
 * Los cues de un guion, ordenados por segundo: `{t, tipo}`.
 *
 * Con `duraciones` —el manifiesto de los clips de voz— añade también los
 * avisos hablados. Sin él, la agenda sale igual que siempre: la voz es una
 * capa encima, no un requisito.
 *
 * - `voz`: la frase del paso, colocada para que acabe antes del primer pip.
 * - `pip`: cuenta atrás, en t−3, t−2 y t−1 de cada paso.
 * - `go`: arranca un paso.
 * - `go_doble`: arranca el último vertido. Después de éste se suelta el
 *   hervidor y cambia lo que haces con las manos: merece oírse distinto.
 * - `cadencia`: el paso justo después del último vertido. Su segundo es el
 *   mismo que `finDeLosVertidos` da como frontera del goteo, así que en vez
 *   de un `go` suena a cierre: se acabó el agua.
 *
 * Dos reglas de colisión, para que dos pasos pegados no suenen a caos: un
 * pip nunca pisa el arranque del paso anterior —si no cabe, se cae— y
 * tampoco suena antes del segundo 0, que la cuenta atrás de arrancar es del
 * reproductor y no del plan.
 */
export function cuesDe(pasos, duraciones = null) {
  const todos = pasos ?? [];

  /*
   * El último vertido se busca en la lista entera y no en la de los pasos
   * con hora, que es como lo hace `finDeLosVertidos`: un vertido sin hora
   * no se puede situar y por tanto no suena, pero sigue siendo el último, y
   * la cadencia no puede caer antes que él. Buscarlo sobre la lista
   * filtrada ponía el cierre en mitad de la receta con un vertido aún por
   * echar.
   */
  let ultimoVertido = -1;
  todos.forEach((paso, i) => {
    if (paso.accion === CON_AGUA) ultimoVertido = i;
  });

  // El primer paso con hora tras el último vertido: la frontera del goteo,
  // el mismo segundo que devuelve `finDeLosVertidos`.
  let cierre = -1;
  if (ultimoVertido >= 0) {
    for (let i = ultimoVertido + 1; i < todos.length; i += 1) {
      if (tieneHora(todos[i])) {
        cierre = i;
        break;
      }
    }
  }

  const cues = [];
  let previo = null;
  todos.forEach((paso, i) => {
    if (!tieneHora(paso)) return;
    const t = Number(paso.t_inicio_s);

    let tipo = "go";
    if (i === ultimoVertido) tipo = "go_doble";
    if (i === cierre) tipo = "cadencia";
    cues.push({ t, tipo });

    for (let d = 1; d <= AVISO_S; d += 1) {
      const tp = t - d;
      if (tp < 0) continue;
      if (previo !== null && tp <= previo) continue;
      cues.push({ t: tp, tipo: "pip" });
    }

    /*
     * Y la voz, si hay clips: termina justo antes del primer pip, con un
     * respiro de `HUECO_VOZ` en medio para que no se solapen.
     *
     * **El orden es lo que hace que esto funcione**: primero qué —para coger
     * el hervidor— y luego cuándo, pegado al instante. Al revés estarías
     * escuchando mientras viertes, y la cuenta atrás dejaría de significar
     * «ahora» por tener algo detrás.
     *
     * Si no cabe entera después del paso anterior, se cae: mejor sin voz que
     * hablando encima del aviso de la anterior. Los pips se quedan igual, que
     * son los que llevan el tiempo.
     */
    const frase = duraciones?.[vozDe(paso)];
    if (frase) {
      const empieza = Number((t - AVISO_S - HUECO_VOZ - frase).toFixed(2));
      if (empieza >= 0 && (previo === null || empieza > previo)) {
        cues.push({ t: empieza, tipo: "voz", clave: vozDe(paso) });
      }
    }

    previo = t;
  });

  return cues.sort((a, b) => a.t - b.t);
}

/**
 * Qué frase le toca a un paso.
 *
 * Sale de la acción y el estilo, las mismas claves que la pantalla convierte
 * en «Verter en espiral»: lo que se oye y lo que se lee salen del mismo dato.
 * `retirar` y los demás usan su acción a secas.
 */
export function vozDe(paso) {
  if (paso?.accion === CON_AGUA && paso?.estilo) return `verter_${paso.estilo}`;
  return String(paso?.accion ?? "");
}

/** Situable en el reloj: sin hora, un paso no puede sonar. */
function tieneHora(paso) {
  const t = paso?.t_inicio_s;
  return t !== null && t !== undefined && t !== "";
}
