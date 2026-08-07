/**
 * Qué cambiar en la próxima extracción. Port de sugerencias.py.
 *
 * Dos capas y ninguna es un modelo estadístico: reglas fijas, y deltas
 * emparejados aprovechando que el protocolo cambia una sola variable entre
 * extracciones consecutivas del mismo café.
 */

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

// Drippers con masa térmica: sin precalentar roban calor al lecho.
export const DRIPPERS_CON_INERCIA = ["v60-02-ceramica"];

// defecto -> palancas, la primera es la principal. En un Comandante los clics
// se cuentan desde cerrado: más clics es moler más grueso.
export const PALANCAS = {
  amargor: [
    ["clics", "+2", "sobreextracción: moler más grueso"],
    ["temp_c", "-3", "o bajar la temperatura"],
  ],
  astringente: [
    ["clics", "+3", "la astringencia casi siempre es molienda demasiado fina"],
  ],
  plano: [
    ["clics", "-2", "subextracción: moler más fino"],
    ["temp_c", "+3", "o subir la temperatura"],
  ],
  agrio: [
    ["temp_c", "+3", "subextracción: subir la temperatura"],
    ["clics", "-2", "o moler más fino"],
  ],
  salado: [
    ["clics", "-2", "subextracción: moler más fino"],
    ["dosis_g", "+1", "o subir la dosis"],
  ],
  carton: [["clics", "-2", "si el café está fresco, moler más fino"]],
  aguado: [
    ["clics", "-2", "sin cuerpo: moler más fino para extraer más"],
    ["dosis_g", "+1", "o subir la dosis y dejar el agua donde está"],
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

/** Número o null. */
function num(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// --- capa 1: reglas --------------------------------------------------------

export function avisosDe(extraccion, historico = []) {
  const avisos = [];

  if (DRIPPERS_CON_INERCIA.includes(extraccion.dripper)) {
    avisos.push(
      "dripper con masa térmica: si no lo precalentaste, la temperatura real " +
        "del lecho fue menor que los grados del hervidor",
    );
  }

  // Sin bolsa no hay «previa»: dos extracciones sueltas son cafés distintos,
  // y el aviso del dripper compararía tazas que no tienen nada que ver.
  const anteriores = extraccion.cafe_id
    ? historico.filter(
        (e) => e.cafe_id === extraccion.cafe_id && String(e.id) !== String(extraccion.id),
      )
    : [];
  const previa = anteriores[anteriores.length - 1];
  if (previa && previa.dripper !== extraccion.dripper) {
    avisos.push(
      `has cambiado de dripper (${previa.dripper} -> ${extraccion.dripper}): ` +
        "esa es la variable de esta extracción, no compares el resto",
    );
  }

  const dias = num(extraccion.dias_tueste);
  if (dias !== null && dias > DIAS_TUESTE_VIEJO) {
    avisos.push(
      `el café lleva ${Math.round(dias)} días de tueste: por encima de ` +
        `${DIAS_TUESTE_VIEJO} la taza se apaga sola y la receta no tiene la culpa`,
    );
  }
  if (extraccion.defecto === "carton" && (dias === null || dias > DIAS_TUESTE_VIEJO)) {
    avisos.push("a cartón casi siempre es café pasado, no extracción");
  }

  const abierta = num(extraccion.dias_abierta);
  if (abierta !== null && abierta > DIAS_ABIERTA_VIEJA) {
    avisos.push(
      `la bolsa lleva ${Math.round(abierta)} días abierta (más de ` +
        `${DIAS_ABIERTA_VIEJA}): a partir de ahí el café se apaga por oxidación ` +
        "y no por lo que hagas al prepararlo, salvo que la guardes al vacío",
    );
  }

  const retenido = retencion(extraccion);
  if (retenido !== null) {
    const [minimo, maximo] = RETENCION_NORMAL;
    if (retenido < minimo || retenido > maximo) {
      avisos.push(
        `retención de ${retenido.toFixed(1)} g por gramo de café (lo normal es ` +
          `${minimo}-${maximo}): repasa el agua, la dosis o lo que pesaste en la ` +
          "jarra, porque con una medida torcida esta extracción no compara con las demás",
      );
    }
  }

  return avisos;
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

export function cambiosDe(extraccion) {
  const cambios = [];

  const goteo = num(extraccion.drawdown_s);
  if (goteo !== null) {
    if (goteo > DRAWDOWN_LARGO_S) {
      cambios.push({
        variable: "clics",
        cambio: "+2",
        porque: `el goteo tardó ${Math.round(goteo)} s (más de ${DRAWDOWN_LARGO_S}): la molienda está atascando el filtro`,
      });
    } else if (goteo < DRAWDOWN_CORTO_S) {
      cambios.push({
        variable: "clics",
        cambio: "-2",
        porque: `el goteo tardó ${Math.round(goteo)} s (menos de ${DRAWDOWN_CORTO_S}): el agua pasa de largo`,
      });
    }
  }

  for (const [variable, cambio, porque] of PALANCAS[extraccion.defecto] ?? []) {
    if (cambios.some((c) => c.variable === variable)) continue;
    cambios.push({ variable, cambio, porque });
  }

  return cambios;
}

// --- capa 2: deltas emparejados --------------------------------------------

export function pares(historico) {
  const porCafe = new Map();
  for (const extraccion of historico) {
    // Las sueltas no emparejan: compartir «sin bolsa» no las hace el mismo café.
    if (!extraccion.cafe_id) continue;
    const lista = porCafe.get(extraccion.cafe_id) ?? [];
    lista.push(extraccion);
    porCafe.set(extraccion.cafe_id, lista);
  }

  const emparejados = [];
  for (const extracciones of porCafe.values()) {
    for (let i = 1; i < extracciones.length; i += 1) {
      const antes = extracciones[i - 1];
      const despues = extracciones[i];
      const distintas = VARIABLES.filter(
        (v) => String(antes[v] ?? "") !== String(despues[v] ?? ""),
      );
      if (distintas.length !== 1) continue;

      const notaAntes = num(antes.nota);
      const notaDespues = num(despues.nota);
      if (notaAntes === null || notaDespues === null) continue;

      const variable = distintas[0];
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
export function extrapolar(extraccion, historico = []) {
  if (extraccion.defecto !== "equilibrado") return null;
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
  return {
    variable: ultimo.variable,
    cambio: `${hacia === "bajar" ? "-" : "+"}${paso}`,
    porque: sigue
      ? `sin defecto pero sin nota: ${ultimo.variable} ${ultimo.direccion} salió ${delta}, ` +
        "así que otro paso por ahí para ver dónde está el techo"
      : `sin defecto pero sin nota: ${ultimo.variable} ${ultimo.direccion} salió ${delta}, ` +
        "así que media vuelta",
  };
}

export function sugerir(extraccion, historico = []) {
  const cambios = cambiosDe(extraccion);
  // La extrapolación es el último recurso: solo habla si las reglas callan.
  if (!cambios.length) {
    const siguiente = extrapolar(extraccion, historico);
    if (siguiente) cambios.push(siguiente);
  }

  return {
    avisos: avisosDe(extraccion, historico),
    cambios,
    efectos: efectos(historico),
    cobertura: cobertura(extraccion.cafe_id, historico),
    conforme:
      extraccion.defecto === "equilibrado" && (num(extraccion.nota) ?? 0) >= NOTA_BUENA,
  };
}

/** La sugerencia principal, para meterla en siguiente_ajuste. */
export function textoCorto(sugerencia) {
  if (sugerencia.conforme && !sugerencia.cambios.length) {
    return "Repetir igual para confirmar";
  }
  if (!sugerencia.cambios.length) return "";
  const principal = sugerencia.cambios[0];
  return `${principal.variable} ${principal.cambio}`;
}
