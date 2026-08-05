/**
 * Validación del cuerpo de una extracción.
 *
 * Las garantías duras viven en los CHECK del esquema: aunque esto se saltara,
 * D1 rechazaría el INSERT. Lo de aquí existe para devolver errores legibles en
 * vez de un mensaje de SQLite, y para poner los valores por defecto.
 */

export const DEFECTOS = [
  "equilibrado", "amargor", "astringente", "plano", "agrio", "salado", "carton",
];
export const DRIPPERS = ["v60-02-plastico", "v60-02-ceramica"];

// Receta base del README.
export const POR_DEFECTO = {
  dosis_g: 20,
  agua_g: 300,
  molinillo: "Comandante C40",
  metodo: "V60 4:6 Kasuya",
  receta_id: "kasuya-46-base",
  dripper: "v60-02-plastico",
};

export const OBLIGATORIOS = [
  "cafe_id", "temp_c", "clics", "tiempo_total", "variable_cambiada", "defecto", "nota",
];

// Columnas que acepta el endpoint. reparto entra pero se calcula si falta;
// ratio y dias_tueste no están: los deriva la vista.
export const CAMPOS = [
  "fecha", "cafe_id", "dosis_g", "agua_g", "temp_c", "molinillo", "clics",
  "metodo", "reparto", "tiempo_total", "variable_cambiada", "defecto",
  "notas_cata", "nota", "siguiente_ajuste", "receta_id", "drawdown_s", "dripper",
];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha real en AAAA-MM-DD, con el calendario comprobado. */
export function fechaValida(valor) {
  if (!FECHA.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function hoyISO(ahora = new Date()) {
  return ahora.toISOString().slice(0, 10);
}

function numero(valor) {
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function vacio(valor) {
  return valor === null || valor === undefined || String(valor).trim() === "";
}

/**
 * Devuelve { valores, errores }. Si errores tiene algo, no se inserta nada:
 * la fila entra entera o no entra.
 */
export function validarExtraccion(cuerpo, { ahora } = {}) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};

  const desconocidos = Object.keys(entrada).filter((c) => !CAMPOS.includes(c));
  if (desconocidos.length) {
    errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);
  }

  const faltan = OBLIGATORIOS.filter((c) => vacio(entrada[c]));
  if (faltan.length) errores.push(`faltan campos obligatorios: ${faltan.join(", ")}`);

  const valores = {};

  valores.fecha = vacio(entrada.fecha) ? hoyISO(ahora) : String(entrada.fecha).trim();
  if (!fechaValida(valores.fecha)) {
    errores.push(`fecha inválida, se espera AAAA-MM-DD: ${JSON.stringify(entrada.fecha)}`);
  }

  valores.cafe_id = vacio(entrada.cafe_id) ? null : String(entrada.cafe_id).trim();

  for (const campo of ["dosis_g", "agua_g"]) {
    const valor = vacio(entrada[campo]) ? POR_DEFECTO[campo] : entrada[campo];
    const n = numero(valor);
    if (n === null || n <= 0) {
      errores.push(`${campo} debe ser un número mayor que 0`);
    }
    valores[campo] = n;
  }

  for (const campo of ["temp_c", "clics"]) {
    if (vacio(entrada[campo])) {
      valores[campo] = null;
      continue;
    }
    const n = numero(entrada[campo]);
    if (n === null) errores.push(`${campo} debe ser un número`);
    valores[campo] = n;
  }
  if (valores.temp_c !== null && (valores.temp_c < 0 || valores.temp_c > 100)) {
    errores.push("temp_c debe estar entre 0 y 100");
  }

  if (vacio(entrada.nota)) {
    valores.nota = null;
  } else {
    const n = numero(entrada.nota);
    if (n === null || !Number.isInteger(n) || n < 1 || n > 10) {
      errores.push(`la nota debe ser un entero de 1 a 10: ${JSON.stringify(entrada.nota)}`);
    }
    valores.nota = n;
  }

  if (vacio(entrada.drawdown_s)) {
    valores.drawdown_s = null;
  } else {
    const n = numero(entrada.drawdown_s);
    if (n === null || !Number.isInteger(n) || n < 0) {
      errores.push("drawdown_s debe ser un entero de segundos, cero o más");
    }
    valores.drawdown_s = n;
  }

  const defecto = vacio(entrada.defecto) ? null : String(entrada.defecto).trim().toLowerCase();
  if (defecto !== null && !DEFECTOS.includes(defecto)) {
    errores.push(`defecto no permitido: ${JSON.stringify(entrada.defecto)}. Válidos: ${DEFECTOS.join(", ")}`);
  }
  valores.defecto = defecto;

  const dripper = vacio(entrada.dripper)
    ? POR_DEFECTO.dripper
    : String(entrada.dripper).trim().toLowerCase();
  if (!DRIPPERS.includes(dripper)) {
    errores.push(`dripper no permitido: ${JSON.stringify(entrada.dripper)}. Válidos: ${DRIPPERS.join(", ")}`);
  }
  valores.dripper = dripper;

  for (const campo of ["molinillo", "metodo", "receta_id"]) {
    valores[campo] = vacio(entrada[campo]) ? POR_DEFECTO[campo] : String(entrada[campo]).trim();
  }
  for (const campo of ["reparto", "tiempo_total", "variable_cambiada", "notas_cata", "siguiente_ajuste"]) {
    valores[campo] = vacio(entrada[campo]) ? null : String(entrada[campo]).trim();
  }

  return { valores, errores };
}
