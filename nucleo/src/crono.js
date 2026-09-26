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
 * tampoco suena antes del segundo 0, que la cuenta atrás de arrancar va
 * aparte: es `cuentaAtrasDe`.
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
 * La cuenta atrás que pone el reloj en marcha, en segundos desde el toque:
 * tres pips y el arranque, con la misma forma que los cues de `cuesDe`.
 *
 * Va aparte del plan porque se ancla al gesto —arrancar, reanudar— y no a un
 * segundo de la receta: mientras suena, el reloj está quieto.
 *
 * Si arranca justo donde empieza un paso, lo dice primero, con la regla de
 * siempre: la frase acaba `HUECO_VOZ` antes del primer pip. Aquí son los pips
 * los que esperan a la frase, y no la frase la que se cae si no cabe: la
 * cuenta se alarga lo que dura. Es la voz que le faltaba al primer paso, que
 * en el plan no cabe nunca —antes del segundo 0 no hay nada— y arrancaba
 * mudo. Reanudar a mitad de un paso no dice nada: no empieza ninguno.
 *
 * Y el arranque suena como el paso al que llega. La cuenta ocupa el lugar
 * de ese cue —el bucle solo ancla lo estrictamente futuro—, así que si el
 * paso es el último vertido tiene que sonar doble y no un `go` a secas.
 */
export function cuentaAtrasDe(pasos, desde, duraciones = null) {
  const todos = pasos ?? [];
  const inicio = Number(desde);

  const paso = todos.find((p) => tieneHora(p) && Number(p.t_inicio_s) === inicio);
  const llegada = cuesDe(todos).find((c) => c.t === inicio && c.tipo !== "pip");
  const frase = paso ? duraciones?.[vozDe(paso)] : undefined;

  const cues = [];
  let t = 0;
  if (frase) {
    cues.push({ t: 0, tipo: "voz", clave: vozDe(paso) });
    t = Number((frase + HUECO_VOZ).toFixed(2));
  }
  for (let d = 0; d < AVISO_S; d += 1) {
    cues.push({ t: Number((t + d).toFixed(2)), tipo: "pip" });
  }
  cues.push({ t: Number((t + AVISO_S).toFixed(2)), tipo: llegada?.tipo ?? "go" });
  return cues;
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

/**
 * Los tramos del reloj: en qué segundo empieza cada paso y en cuál acaba.
 *
 * Es la derivación del paso vigente, escrita una sola vez: el reloj, la
 * tarjeta de la pantalla de bloqueo y —cuando exista— la notificación nativa
 * la leen de aquí, y `tramos.test.js` exporta sus casos como JSON para que
 * una implementación en otro lenguaje se pruebe contra los mismos vectores.
 *
 * Cubren desde el segundo 0 sin huecos: si la receta arranca más tarde, el
 * primer tramo es la espera hasta ese paso y va sin paso (`paso: null`). El
 * último queda abierto (`hasta: null`), que ya no hay siguiente contra el que
 * contar. Los pasos sin hora no forman tramo —no se pueden situar—, igual que
 * no suenan. `paso` es el índice en la lista que se recibió.
 */
export function tramosDe(pasos) {
  const conHora = [];
  (pasos ?? []).forEach((paso, i) => {
    if (tieneHora(paso)) conHora.push({ paso: i, t: Number(paso.t_inicio_s) });
  });

  const tramos = [];
  const primero = conHora[0]?.t ?? 0;
  if (primero > 0) tramos.push({ desde: 0, hasta: primero, paso: null });
  conHora.forEach(({ paso, t }, n) => {
    tramos.push({ desde: t, hasta: conHora[n + 1]?.t ?? null, paso });
  });
  // Sin nada que situar, un solo tramo abierto: el reloj cuenta y ya.
  if (tramos.length === 0) tramos.push({ desde: 0, hasta: null, paso: null });
  return tramos;
}

/**
 * El índice del tramo que va en ese segundo: el último que ya ha empezado.
 * Antes del 0 —no debería pasar— es el primero, y pasado el final, el último.
 */
export function tramoEn(tramos, segundo) {
  let vigente = 0;
  tramos.forEach((tramo, n) => {
    if (tramo.desde <= segundo) vigente = n;
  });
  return vigente;
}

/**
 * El vocabulario sonoro: frecuencia (Hz), inicio relativo (s), duración (s)
 * y ganancia de cada tono, por tipo de cue.
 *
 * Pips agudos y GO una octava justa por encima, que es la distancia que se
 * distingue con el molinillo puesto. La cadencia desciende —se lee como «ya
 * está» sin explicarla— y la confirmación es un toque corto y grave. La
 * ganancia baja al subir la frecuencia, que el oído ya la sube solo.
 *
 * Es un dato y no código para que quien lo sintetice —Web Audio en la app,
 * un servicio nativo algún día— suene igual desde la misma tabla.
 */
export const TONOS = {
  pip: [[880, 0, 0.08, 0.22]],
  go: [[1760, 0, 0.3, 0.15]],
  go_doble: [[1760, 0, 0.16, 0.15], [1760, 0.28, 0.16, 0.15]],
  cadencia: [[587, 0, 0.18, 0.22], [392, 0.19, 0.18, 0.22]],
  confirmacion: [[523, 0, 0.06, 0.2]],
};

/** Situable en el reloj: sin hora, un paso no puede sonar. */
function tieneHora(paso) {
  const t = paso?.t_inicio_s;
  return t !== null && t !== undefined && t !== "";
}
