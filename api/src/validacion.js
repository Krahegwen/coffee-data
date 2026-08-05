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

export const ESTADOS = ["abierto", "terminado", "pendiente"];

// Las columnas de cafes que se pueden mandar. creado_en y actualizado_en no
// están: los pone la base.
export const CAMPOS_CAFE = [
  "id", "nombre", "tostador", "origen", "region", "variedad", "proceso",
  "altitud_m", "sca", "fecha_tueste", "consumir_antes", "peso_g", "precio_eur",
  "notas_tostador", "estado", "fecha_compra", "fecha_recepcion", "foto", "url",
  "conservacion",
];

const FECHAS_CAFE = ["fecha_tueste", "consumir_antes", "fecha_compra", "fecha_recepcion"];
const TEXTOS_CAFE = [
  "tostador", "origen", "region", "variedad", "proceso", "notas_tostador",
  "foto", "url", "conservacion",
];
const NUMEROS_CAFE = {
  altitud_m: { min: 0, incluido: false, que: "mayor que 0" },
  sca: { min: 0, max: 100, incluido: true, que: "entre 0 y 100" },
  peso_g: { min: 0, incluido: false, que: "mayor que 0" },
  precio_eur: { min: 0, incluido: true, que: "cero o más" },
};

// El id viaja en cada extracción y en la URL: sin espacios, sin mayúsculas y
// sin acentos. Mismo criterio que el CHECK de la base.
const ID = /^[a-z0-9][a-z0-9_-]*$/;

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

/**
 * Valida una bolsa. Con `nuevo`, exige id y nombre y devuelve la fila entera.
 * Sin él es una corrección: solo entran los campos que vengan, y el id no,
 * porque es la clave a la que apuntan las extracciones.
 */
export function validarCafe(cuerpo, { nuevo }) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const valores = {};

  const desconocidos = Object.keys(entrada).filter((c) => !CAMPOS_CAFE.includes(c));
  if (desconocidos.length) {
    errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);
  }

  if (nuevo) {
    const id = String(entrada.id ?? "").trim();
    if (!ID.test(id)) {
      errores.push(
        `id inválido: ${JSON.stringify(entrada.id)}. Minúsculas, números, guion y guion bajo, empezando por letra o número`,
      );
    }
    valores.id = id;
  } else if (entrada.id !== undefined) {
    errores.push("el id no se puede cambiar: es la clave a la que apuntan las extracciones");
  }

  if (nuevo || entrada.nombre !== undefined) {
    const nombre = String(entrada.nombre ?? "").trim();
    if (!nombre) errores.push("el nombre no puede estar vacío");
    valores.nombre = nombre;
  }

  if (nuevo || entrada.estado !== undefined) {
    const estado = vacio(entrada.estado) ? "abierto" : String(entrada.estado).trim().toLowerCase();
    if (!ESTADOS.includes(estado)) {
      errores.push(`estado no permitido: ${JSON.stringify(entrada.estado)}. Válidos: ${ESTADOS.join(", ")}`);
    }
    valores.estado = estado;
  }

  for (const campo of FECHAS_CAFE) {
    if (!nuevo && entrada[campo] === undefined) continue;
    if (vacio(entrada[campo])) {
      valores[campo] = null;
      continue;
    }
    const fecha = String(entrada[campo]).trim();
    if (!fechaValida(fecha)) {
      errores.push(`${campo} inválida, se espera AAAA-MM-DD: ${JSON.stringify(entrada[campo])}`);
    }
    valores[campo] = fecha;
  }

  for (const [campo, regla] of Object.entries(NUMEROS_CAFE)) {
    if (!nuevo && entrada[campo] === undefined) continue;
    if (vacio(entrada[campo])) {
      valores[campo] = null;
      continue;
    }
    const n = numero(entrada[campo]);
    const fuera =
      n === null ||
      (regla.incluido ? n < regla.min : n <= regla.min) ||
      (regla.max !== undefined && n > regla.max);
    if (fuera) errores.push(`${campo} debe ser un número ${regla.que}`);
    valores[campo] = n;
  }

  for (const campo of TEXTOS_CAFE) {
    if (!nuevo && entrada[campo] === undefined) continue;
    valores[campo] = vacio(entrada[campo]) ? null : String(entrada[campo]).trim();
  }

  if (!nuevo && !Object.keys(valores).length) {
    errores.push("no hay ningún campo que corregir");
  }

  return { valores, errores };
}

/**
 * Corrección de una extracción: solo entran los campos que vengan, con las
 * mismas reglas que el alta. El `id` no, que es la identidad de la fila.
 */
export function validarCambiosExtraccion(cuerpo) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const valores = {};

  const desconocidos = Object.keys(entrada).filter((c) => !CAMPOS.includes(c));
  if (desconocidos.length) {
    errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);
  }

  const dado = (campo) => entrada[campo] !== undefined;

  if (dado("fecha")) {
    const fecha = String(entrada.fecha).trim();
    if (!fechaValida(fecha)) {
      errores.push(`fecha inválida, se espera AAAA-MM-DD: ${JSON.stringify(entrada.fecha)}`);
    }
    valores.fecha = fecha;
  }

  if (dado("cafe_id")) {
    const cafeId = String(entrada.cafe_id ?? "").trim();
    if (!cafeId) errores.push("cafe_id no puede quedar vacío");
    valores.cafe_id = cafeId;
  }

  for (const campo of ["dosis_g", "agua_g"]) {
    if (!dado(campo)) continue;
    const n = numero(entrada[campo]);
    if (n === null || n <= 0) errores.push(`${campo} debe ser un número mayor que 0`);
    valores[campo] = n;
  }

  for (const campo of ["temp_c", "clics"]) {
    if (!dado(campo)) continue;
    if (vacio(entrada[campo])) {
      valores[campo] = null;
      continue;
    }
    const n = numero(entrada[campo]);
    if (n === null) errores.push(`${campo} debe ser un número`);
    if (campo === "temp_c" && n !== null && (n < 0 || n > 100)) {
      errores.push("temp_c debe estar entre 0 y 100");
    }
    valores[campo] = n;
  }

  if (dado("nota")) {
    if (vacio(entrada.nota)) {
      valores.nota = null;
    } else {
      const n = numero(entrada.nota);
      if (n === null || !Number.isInteger(n) || n < 1 || n > 10) {
        errores.push(`la nota debe ser un entero de 1 a 10: ${JSON.stringify(entrada.nota)}`);
      }
      valores.nota = n;
    }
  }

  if (dado("drawdown_s")) {
    if (vacio(entrada.drawdown_s)) {
      valores.drawdown_s = null;
    } else {
      const n = numero(entrada.drawdown_s);
      if (n === null || !Number.isInteger(n) || n < 0) {
        errores.push("drawdown_s debe ser un entero de segundos, cero o más");
      }
      valores.drawdown_s = n;
    }
  }

  if (dado("defecto")) {
    const defecto = vacio(entrada.defecto) ? null : String(entrada.defecto).trim().toLowerCase();
    if (defecto !== null && !DEFECTOS.includes(defecto)) {
      errores.push(`defecto no permitido: ${JSON.stringify(entrada.defecto)}. Válidos: ${DEFECTOS.join(", ")}`);
    }
    valores.defecto = defecto;
  }

  if (dado("dripper")) {
    const dripper = String(entrada.dripper ?? "").trim().toLowerCase();
    if (!DRIPPERS.includes(dripper)) {
      errores.push(`dripper no permitido: ${JSON.stringify(entrada.dripper)}. Válidos: ${DRIPPERS.join(", ")}`);
    }
    valores.dripper = dripper;
  }

  for (const campo of ["molinillo", "metodo", "receta_id", "reparto", "tiempo_total",
                       "variable_cambiada", "notas_cata", "siguiente_ajuste"]) {
    if (!dado(campo)) continue;
    valores[campo] = vacio(entrada[campo]) ? null : String(entrada[campo]).trim();
  }

  if (!Object.keys(valores).length) errores.push("no hay ningún campo que corregir");

  return { valores, errores };
}
