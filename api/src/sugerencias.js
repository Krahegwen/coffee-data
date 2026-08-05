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
  equilibrado: [],
};

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

  const anteriores = historico.filter(
    (e) => e.cafe_id === extraccion.cafe_id && String(e.id) !== String(extraccion.id),
  );
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

  return avisos;
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
  const probado = {};
  for (const variable of ["temp_c", "clics", "receta_id"]) {
    const valores = new Set();
    for (const e of historico) {
      if (e.cafe_id !== cafeId) continue;
      const valor = String(e[variable] ?? "").trim();
      if (valor) valores.add(valor);
    }
    probado[variable] = [...valores].sort();
  }
  return probado;
}

// --- salida ----------------------------------------------------------------

export function sugerir(extraccion, historico = []) {
  return {
    avisos: avisosDe(extraccion, historico),
    cambios: cambiosDe(extraccion),
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
