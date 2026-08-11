/**
 * Qué cambiar en la próxima extracción. Port de sugerencias.py.
 *
 * Dos capas y ninguna es un modelo estadístico: reglas fijas, y deltas
 * emparejados aprovechando que el protocolo cambia una sola variable entre
 * extracciones consecutivas del mismo café.
 */

import { finDeLosVertidos } from "./recetas.js";
import { textos } from "./textos.js";
import { defectosDe, segundosDe, SIN_DEFECTO } from "./validacion.js";

// Como en la validación: el motor razona con claves y la frase la pone el
// catálogo. Por defecto, castellano.
const CASTELLANO = textos();

// Umbrales de partida, no verdades reveladas: están aquí para calibrarlos con
// datos propios cuando haya extracciones suficientes.
export const DRAWDOWN_LARGO_S = 75;
export const DRAWDOWN_CORTO_S = 30;
export const NOTA_BUENA = 8;
export const DIAS_TUESTE_VIEJO = 60;

/**
 * Días con la bolsa abierta a partir de los cuales el café se apaga por
 * oxidación, no por lo que hagas al prepararlo.
 *
 * Es el otro reloj de la frescura. Mientras la bolsa está precintada manda el
 * tueste; desde que la abres manda esto, y por eso dos bolsas del mismo tueste
 * —una abierta hace un mes y otra recién estrenada— no son el mismo café.
 *
 * Tres semanas es un punto de partida para bolsa con clip. En un bote de vacío
 * aguanta bastante más, así que este umbral pide calibrarse con tus datos más
 * que ninguno de los otros.
 */
export const DIAS_ABIERTA_VIEJA = 21;

// Un par emparejado es una anécdota; dos empiezan a ser una tendencia.
export const MINIMO_PARES = 2;

export const VARIABLES = [
  "temp_c", "clics", "dosis_g", "agua_g", "reparto", "receta_id", "molinillo",
  "dripper",
];

/**
 * Las que se mueven a mano, que son de las que habla una extracción cuando
 * dice qué cambió.
 *
 * `reparto` se queda fuera: sale de escalar la receta al agua real, así que
 * cambia **solo** porque cambió una de esas dos. Contándolo aparte, subir el
 * agua de 300 a 450 se leía como dos variables a la vez —y por eso ningún
 * cambio de agua llegaba a formar par—, cuando en realidad se movió una.
 * Mandar un `reparto` propio es desviarse de la receta ese día, no otra
 * palanca.
 */
export const VARIABLES_DECLARADAS = VARIABLES.filter((v) => v !== "reparto");

/**
 * Qué cambió entre dos extracciones: `[{variable, antes, despues}]`, en el
 * orden de `VARIABLES`.
 *
 * Es el único sitio donde vive el criterio de «esto es distinto», y de él
 * cuelgan tanto el emparejado del motor como el texto de `variable_cambiada`.
 * La comparación es por texto a propósito: un 91 y un "91" son la misma
 * temperatura, y de la base vuelven como les apetezca.
 */
export function diferencias(antes, despues, variables = VARIABLES_DECLARADAS) {
  if (!antes || !despues) return [];
  return variables
    .filter((v) => String(antes[v] ?? "") !== String(despues[v] ?? ""))
    .map((variable) => ({
      variable,
      antes: antes[variable] ?? null,
      despues: despues[variable] ?? null,
    }));
}

/**
 * Lo que se lee de una variable. La receta se nombra por su slug: el uuid es
 * la clave, no algo que nadie quiera leer en su bitácora.
 */
function valorLegible(fila, variable) {
  if (variable === "receta_id") return fila?.receta_slug ?? fila?.receta_id ?? null;
  return fila?.[variable] ?? null;
}

/**
 * El texto de `variable_cambiada` cuando no lo escribe el usuario: «temp_c
 * 91 → 94», o los tres casos en que no hay nada contra lo que medir.
 *
 * Sale del mismo diff que usa el motor, así que lo apuntado y lo comparado no
 * se pueden desincronizar. Lo que se guarda es el nombre de la columna, sin
 * traducir, igual que hace `textoCorto` con la sugerencia: la bitácora es de
 * quien la lleva y las columnas se llaman igual en los dos idiomas.
 */
export function variableCambiadaDe(
  extraccion, madre, t = CASTELLANO, variables = VARIABLES_DECLARADAS,
) {
  if (!madre) {
    // Con `desde_id` puesto pero sin madre a la vista, la madre está
    // retirada: el motor la trata como primera, pero decir «primera de la
    // bolsa» sería falso y las mezclaría con las que sí lo son.
    if (extraccion?.desde_id) return t("cambio_madre_retirada");
    return t(extraccion?.cafe_id ? "cambio_primera" : "cambio_suelta");
  }
  // `variables` acota la comparación a lo que quien pregunta declara.
  const difs = diferencias(madre, extraccion, variables);
  if (!difs.length) return t("cambio_ninguno");
  return textoDeVariables(difs.map((d) => d.variable), madre, extraccion);
}

/**
 * «temp_c 91 → 94 · clics 28 → 30», para una lista de variables dada.
 *
 * **El formato canónico de `variable_cambiada`**, y por eso vive aquí y no en
 * la app: lo escriben dos —el servidor cuando no se lo cuentas y el
 * formulario cuando eliges tú las filas— y dos versiones acabarían guardando
 * vocabularios distintos en la misma columna, que es lo que pasaba al
 * componerlo cada uno por su lado.
 *
 * Se nombra la columna, sin traducir, igual que hace `textoCorto` con la
 * sugerencia: la fila se lee igual desde los dos idiomas, y las etiquetas
 * bonitas son cosa de la pantalla que la enseña.
 */
export function textoDeVariables(variables, antes, despues) {
  return variables
    .map((v) => `${v} ${valorLegible(antes, v) ?? "—"} → ${valorLegible(despues, v) ?? "—"}`)
    .join(" · ");
}

// Drippers con masa térmica: sin precalentar roban calor al lecho.
export const DRIPPERS_CON_INERCIA = ["v60-02-ceramica"];

// defecto -> palancas, la primera es la principal. En un Comandante los clics
// se cuentan desde cerrado: más clics es moler más grueso.
//
// El tercer elemento es la **clave** del porqué, no el porqué: la frase vive en
// el catálogo, que es lo que permite que la misma palanca se explique en dos
// idiomas sin duplicar la tabla.
export const PALANCAS = {
  amargor: [
    ["clics", "+2", "porque_amargor_clics"],
    ["temp_c", "-3", "porque_amargor_temp"],
  ],
  astringente: [
    ["clics", "+3", "porque_astringente"],
  ],
  plano: [
    ["clics", "-2", "porque_plano_clics"],
    ["temp_c", "+3", "porque_plano_temp"],
  ],
  agrio: [
    ["temp_c", "+3", "porque_agrio_temp"],
    ["clics", "-2", "porque_agrio_clics"],
  ],
  salado: [
    ["clics", "-2", "porque_salado_clics"],
    ["dosis_g", "+1", "porque_salado_dosis"],
  ],
  carton: [["clics", "-2", "porque_carton"]],
  aguado: [
    ["clics", "-2", "porque_aguado_clics"],
    ["dosis_g", "+1", "porque_aguado_dosis"],
  ],
  equilibrado: [],
};

/**
 * Cuánto se mueve cada variable cuando no hay defecto que corregir y solo se
 * quiere seguir explorando. Son los mismos saltos que usan las palancas.
 */
export const PASOS = { temp_c: 3, clics: 2, dosis_g: 1 };

/**
 * Agua que se queda en el lecho y el filtro, en gramos por gramo de café. En
 * V60 ronda 2; fuera de esta horquilla lo raro no es la taza, es la medida.
 */
export const RETENCION_NORMAL = [1.5, 2.6];

/**
 * Cuánto puede desviarse el vertido real de lo que dice la receta antes de que
 * la fila huela mal, en segundos.
 *
 * Blando a propósito y no un `CHECK`: verter a mano varía, y quien se desvía de
 * la receta puede mandar su propio `reparto`. El umbral sale de la bitácora —
 * las filas sanas se desvían unos cinco segundos y la que estaba mal se desviaba
 * veintidós—, así que es un punto de partida como los demás.
 */
export const DESVIO_VERTIDO_S = 20;

/** Número o null. */
function num(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * El defecto que manda: el primero de la lista, que es el que más molesta.
 *
 * Una taza puede estar amarga y astringente a la vez, y las dos cosas quedan
 * apuntadas. Pero las palancas de dos defectos tiran de los clics en
 * direcciones distintas, y el protocolo entero se sostiene sobre mover **una
 * sola cosa** por extracción. Así que la lista se registra entera y la
 * sugerencia sale solo de la cabeza: corrige lo que más molesta, vuelve a
 * medir, y si el segundo sigue ahí ya será el primero de la próxima.
 */
export function defectoPrincipal(extraccion) {
  return defectosDe(extraccion?.defecto)[0] ?? null;
}

/**
 * De qué extracción es variación ésta: su madre, la que dice contra qué se
 * compara. La exploración es un árbol —cada taza sale de otra, casi siempre la
 * última y a veces de una anterior a la que se vuelve tras un callejón sin
 * salida—, y sin esto el motor solo sabía mirar un paso hacia atrás.
 *
 * Devuelve `null` en tres casos que valen lo mismo —esta taza no compara con
 * nada— pero que conviene no confundir:
 *
 * - **No tiene madre**: la primera de una bolsa, o una que se declaró suelta
 *   de la serie a propósito.
 * - **No tiene bolsa**: dos tazas sueltas no son el mismo café por compartir
 *   el hueco vacío.
 * - **La madre está retirada**, y por eso no viene en el histórico. Es una
 *   decisión, no un descuido del filtro: retirar significa «esto fue un error
 *   de registro», y un delta medido contra un error no vale nada. La hija pasa
 *   a contar como primera, y restaurar a la madre devuelve el par sola.
 */
export function madreDe(extraccion, historico = []) {
  const desde = extraccion?.desde_id;
  if (!desde || !extraccion?.cafe_id) return null;
  // La madre nunca sale de la bolsa: el tueste es lo que hace la taza.
  return historico.find(
    (e) => String(e.id) === String(desde) && e.cafe_id === extraccion.cafe_id,
  ) ?? null;
}

// --- capa 1: reglas --------------------------------------------------------

export function avisosDe(extraccion, historico = [], receta = null, t = CASTELLANO) {
  const avisos = [];

  const desviado = vertidoDesviado(extraccion, receta, t);
  if (desviado) avisos.push(desviado);

  if (DRIPPERS_CON_INERCIA.includes(extraccion.dripper)) {
    avisos.push(t("aviso_dripper_inercia"));
  }

  // Contra la madre y no contra «la de ayer»: el aviso habla de la variable de
  // esta extracción, y cuál es depende de contra qué se compara.
  const previa = madreDe(extraccion, historico);
  if (previa && previa.dripper !== extraccion.dripper) {
    avisos.push(t("aviso_cambio_de_dripper", {
      antes: previa.dripper, ahora: extraccion.dripper,
    }));
  }

  /*
   * Dos palancas movidas a la vez. El protocolo entero se sostiene sobre
   * cambiar una sola cosa, y hasta ahora eso solo lo decía la documentación:
   * la fila entraba igual y el par se descartaba en silencio, así que te
   * enterabas semanas después de que ese dato no comparaba con nada.
   */
  const movidas = diferencias(previa, extraccion);
  if (movidas.length > 1) {
    avisos.push(t("aviso_dos_variables", {
      lista: movidas.map((d) => d.variable).join(", "),
    }));
  }

  const dias = num(extraccion.dias_tueste);
  if (dias !== null && dias > DIAS_TUESTE_VIEJO) {
    avisos.push(t("aviso_cafe_pasado", {
      dias: Math.round(dias), umbral: DIAS_TUESTE_VIEJO,
    }));
  }
  /*
   * Los avisos miran la lista **entera**, no solo la cabeza. Un aviso no
   * compite con nada —caben todos a la vez y ninguno mueve el molinillo—,
   * mientras que las palancas sí: por eso la sugerencia se queda con el
   * primero y esto no.
   */
  const defectos = defectosDe(extraccion.defecto);
  if (defectos.includes("carton") && (dias === null || dias > DIAS_TUESTE_VIEJO)) {
    avisos.push(t("aviso_carton_pasado"));
  }

  const abierta = num(extraccion.dias_abierta);
  if (abierta !== null && abierta > DIAS_ABIERTA_VIEJA) {
    avisos.push(t("aviso_bolsa_vieja", {
      dias: Math.round(abierta), umbral: DIAS_ABIERTA_VIEJA,
    }));
  }

  const retenido = retencion(extraccion);
  if (retenido !== null) {
    const [minimo, maximo] = RETENCION_NORMAL;
    if (retenido < minimo || retenido > maximo) {
      avisos.push(t("aviso_retencion", {
        retenido: retenido.toFixed(1), minimo, maximo,
      }));
    }
  }

  return avisos;
}

/**
 * Lo que la fila dice que duraron los vertidos, contra lo que dice la receta.
 *
 * `tiempo_total - drawdown_s` es el instante en que se dejó de verter, medido
 * desde el primer vertido — y ese instante la receta lo sabe: es cuándo empieza
 * el paso que va detrás del último vertido. Cuando no cuadran, lo que suele
 * fallar es la medida y no el café: un reloj que siguió corriendo mientras se
 * tiraba el filtro, o un campo corregido a mano sin mover el otro.
 *
 * Avisa, no bloquea: puede que ese día se vertiera más despacio a propósito.
 * Devuelve `null` en cuanto falte cualquiera de las tres piezas, que es lo
 * normal —el goteo es opcional y hay recetas que acaban en un vertido—.
 */
export function vertidoDesviado(extraccion, receta, t = CASTELLANO) {
  const total = segundosDe(extraccion?.tiempo_total);
  const goteo = num(extraccion?.drawdown_s);
  const plan = finDeLosVertidos(receta?.pasos);
  if (total === null || goteo === null || plan === null) return null;

  const medido = total - goteo;
  const desvio = medido - plan;
  if (Math.abs(desvio) <= DESVIO_VERTIDO_S) return null;

  return t("aviso_vertido_desviado", {
    medido, total, goteo, plan, desvio: Math.abs(desvio),
  });
}

/**
 * Agua que no llegó a la taza, por gramo de café. Es la única lectura que
 * cruza lo que echaste con lo que sacaste, y sirve de comprobación: no dice si
 * la taza está buena, dice si las medidas se sostienen.
 */
export function retencion(extraccion) {
  const agua = num(extraccion.agua_g);
  const extraido = num(extraccion.extraido_g);
  const dosis = num(extraccion.dosis_g);
  if (agua === null || extraido === null || dosis === null || dosis <= 0) return null;
  return (agua - extraido) / dosis;
}

export function cambiosDe(extraccion, t = CASTELLANO) {
  const cambios = [];

  const goteo = num(extraccion.drawdown_s);
  if (goteo !== null) {
    if (goteo > DRAWDOWN_LARGO_S) {
      cambios.push({
        variable: "clics",
        cambio: "+2",
        porque: t("porque_goteo_largo", {
          goteo: Math.round(goteo), umbral: DRAWDOWN_LARGO_S,
        }),
      });
    } else if (goteo < DRAWDOWN_CORTO_S) {
      cambios.push({
        variable: "clics",
        cambio: "-2",
        porque: t("porque_goteo_corto", {
          goteo: Math.round(goteo), umbral: DRAWDOWN_CORTO_S,
        }),
      });
    }
  }

  // Solo la cabeza de la lista mueve una palanca: ver `defectoPrincipal`.
  for (const [variable, cambio, clave] of PALANCAS[defectoPrincipal(extraccion)] ?? []) {
    if (cambios.some((c) => c.variable === variable)) continue;
    cambios.push({ variable, cambio, porque: t(clave) });
  }

  return cambios;
}

// --- capa 2: deltas emparejados --------------------------------------------

export function pares(historico) {
  const emparejados = [];
  for (const despues of historico) {
    const antes = madreDe(despues, historico);
    if (!antes) continue;

    // El mismo diff que compone `variable_cambiada`: un solo criterio de
    // «esto cambió» para lo que se apunta y para lo que se compara.
    const distintas = diferencias(antes, despues);
    if (distintas.length !== 1) continue;

    const notaAntes = num(antes.nota);
    const notaDespues = num(despues.nota);
    if (notaAntes === null || notaDespues === null) continue;

    const { variable } = distintas[0];
    const valorAntes = num(antes[variable]);
    const valorDespues = num(despues[variable]);
    let direccion = "cambiar";
    if (valorAntes !== null && valorDespues !== null) {
      direccion = valorDespues > valorAntes ? "subir" : "bajar";
    }

    emparejados.push({
      cafe_id: despues.cafe_id,
      variable,
      direccion,
      delta_nota: notaDespues - notaAntes,
    });
  }
  return emparejados;
}

export function efectos(historico, minimo = MINIMO_PARES) {
  const grupos = new Map();
  for (const par of pares(historico)) {
    const clave = `${par.variable}|${par.direccion}`;
    const deltas = grupos.get(clave) ?? [];
    deltas.push(par.delta_nota);
    grupos.set(clave, deltas);
  }

  const salida = {};
  for (const [clave, deltas] of grupos) {
    if (deltas.length < minimo) continue;
    const [variable, direccion] = clave.split("|");
    salida[clave] = {
      variable,
      direccion,
      media: deltas.reduce((t, d) => t + d, 0) / deltas.length,
      casos: deltas.length,
    };
  }
  return salida;
}

// --- cobertura -------------------------------------------------------------

export function cobertura(cafeId, historico) {
  // Sin bolsa no hay serie que cubrir: cada taza suelta es de un café que no
  // consta, así que sumar sus valores dibujaría la cobertura de nadie.
  const propios = cafeId ? historico.filter((e) => e.cafe_id === cafeId) : [];
  const probado = {};
  for (const variable of ["temp_c", "clics", "receta_id"]) {
    const valores = new Set();
    for (const e of propios) {
      const valor = String(e[variable] ?? "").trim();
      if (valor) valores.add(valor);
    }
    probado[variable] = [...valores].sort();
  }
  return probado;
}

// --- salida ----------------------------------------------------------------

/**
 * Qué probar cuando no hay defecto que corregir pero tampoco es para repetir.
 *
 * Es el hueco que dejaban las palancas: `equilibrado` no tiene ninguna, así
 * que una taza correcta y sosa no recibía ninguna propuesta y la bitácora se
 * quedaba sin siguiente paso. Aquí se mira el último par limpio de ese café y
 * se sigue por el eje que ya se movió: si no empeoró, otro paso en la misma
 * dirección para ver dónde está el techo; si empeoró, media vuelta.
 *
 * Solo se extrapola sobre variables con salto conocido. De un cambio de
 * receta o de molinillo no se sabe cuál sería «el siguiente».
 */
export function extrapolar(extraccion, historico = [], t = CASTELLANO) {
  if (defectoPrincipal(extraccion) !== SIN_DEFECTO) return null;
  if ((num(extraccion.nota) ?? 0) >= NOTA_BUENA) return null;

  const propios = pares(historico).filter((p) => p.cafe_id === extraccion.cafe_id);
  const ultimo = propios[propios.length - 1];
  if (!ultimo) return null;

  const paso = PASOS[ultimo.variable];
  if (!paso || ultimo.direccion === "cambiar") return null;

  const sigue = ultimo.delta_nota >= 0;
  const hacia = sigue
    ? ultimo.direccion
    : ultimo.direccion === "bajar" ? "subir" : "bajar";

  const delta = ultimo.delta_nota > 0 ? `+${ultimo.delta_nota}` : String(ultimo.delta_nota);
  // La dirección es una clave —`subir`, `bajar`— porque agrupa los efectos; en
  // la frase entra ya traducida. La variable no: es el nombre de la columna.
  const datos = {
    variable: ultimo.variable,
    direccion: t(`direccion_${ultimo.direccion}`),
    delta,
  };
  return {
    variable: ultimo.variable,
    cambio: `${hacia === "bajar" ? "-" : "+"}${paso}`,
    porque: t(sigue ? "porque_extrapolar_sigue" : "porque_extrapolar_vuelve", datos),
  };
}

export function sugerir(extraccion, historico = [], receta = null, t = CASTELLANO) {
  const cambios = cambiosDe(extraccion, t);
  // La extrapolación es el último recurso: solo habla si las reglas callan.
  if (!cambios.length) {
    const siguiente = extrapolar(extraccion, historico, t);
    if (siguiente) cambios.push(siguiente);
  }

  return {
    avisos: avisosDe(extraccion, historico, receta, t),
    cambios,
    efectos: efectos(historico),
    cobertura: cobertura(extraccion.cafe_id, historico),
    // «Equilibrado» no acompaña a nadie, así que ser la cabeza es ser la lista
    // entera: conforme solo cuando de verdad no hay ningún defecto apuntado.
    conforme:
      defectoPrincipal(extraccion) === SIN_DEFECTO && (num(extraccion.nota) ?? 0) >= NOTA_BUENA,
  };
}

/** La sugerencia principal, para meterla en siguiente_ajuste. */
export function textoCorto(sugerencia, t = CASTELLANO) {
  if (sugerencia.conforme && !sugerencia.cambios.length) {
    return t("repetir_igual");
  }
  if (!sugerencia.cambios.length) return "";
  const principal = sugerencia.cambios[0];
  return `${principal.variable} ${principal.cambio}`;
}
