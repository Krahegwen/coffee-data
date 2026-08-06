/**
 * Validación del cuerpo de una extracción.
 *
 * Las garantías duras viven en los CHECK del esquema: aunque esto se saltara,
 * D1 rechazaría el INSERT. Lo de aquí existe para devolver errores legibles en
 * vez de un mensaje de SQLite, y para poner los valores por defecto.
 */

export const DEFECTOS = [
  "equilibrado", "amargor", "astringente", "plano", "agrio", "salado", "carton",
  "aguado",
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
  "extraido_g",
];

export const ESTADOS = ["abierto", "terminado", "pendiente"];

// Las columnas de cafes que se pueden mandar. creado_en y actualizado_en no
// están: los pone la base. foto tampoco: la gestiona el endpoint de subida,
// que es quien mantiene la columna y el objeto de R2 a la par.
export const CAMPOS_CAFE = [
  "id", "nombre", "tostador", "origen", "region", "variedad", "proceso",
  "altitud_m", "sca", "fecha_tueste", "consumir_antes", "peso_g", "precio_eur",
  "notas_tostador", "estado", "fecha_compra", "fecha_recepcion",
  "fecha_apertura", "url", "conservacion",
];

const FECHAS_CAFE = [
  "fecha_tueste", "consumir_antes", "fecha_compra", "fecha_recepcion",
  "fecha_apertura",
];
const TEXTOS_CAFE = [
  "tostador", "origen", "region", "variedad", "proceso", "notas_tostador",
  "url", "conservacion",
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

/**
 * Convierte un nombre en id. Se hace aquí y no en la app para que salga igual
 * venga de donde venga: del formulario, de curl o de un script.
 *
 *   "Etiopía Guji"        -> etiopia_guji
 *   "Café  del Día (2)"   -> cafe_del_dia_2
 */
export function slugDe(nombre) {
  return String(nombre ?? "")
    .normalize("NFD")                  // separa la tilde de la letra
    .replace(/[̀-ͯ]/g, "")  // y la tira
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")       // todo lo demás pasa a guion bajo
    .replace(/_+/g, "_")               // sin repetidos
    .replace(/^_+|_+$/g, "");          // ni en los extremos
}

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

  // Lo que acabó en la taza.
  if (vacio(entrada.extraido_g)) {
    valores.extraido_g = null;
  } else {
    const n = numero(entrada.extraido_g);
    if (n === null || n <= 0) {
      errores.push("extraido_g debe ser un número mayor que 0");
    } else {
      const imposible = extraidoImposible(n, valores.agua_g);
      if (imposible) errores.push(imposible);
    }
    valores.extraido_g = n;
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
    // Si no lo mandan, sale del nombre: el id es ruido para quien registra.
    const id = vacio(entrada.id) ? slugDe(entrada.nombre) : String(entrada.id).trim();
    if (!ID.test(id)) {
      errores.push(
        vacio(entrada.id)
          ? `del nombre ${JSON.stringify(entrada.nombre)} no sale un id utilizable: necesita alguna letra o número`
          : `id inválido: ${JSON.stringify(entrada.id)}. Minúsculas, números, guion y guion bajo, empezando por letra o número`,
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

  if (dado("extraido_g")) {
    if (vacio(entrada.extraido_g)) {
      valores.extraido_g = null;
    } else {
      const n = numero(entrada.extraido_g);
      if (n === null || n <= 0) errores.push("extraido_g debe ser un número mayor que 0");
      valores.extraido_g = n;
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

// La foto de la bolsa. Solo formatos que cualquier navegador pinta: si el
// móvil manda HEIC, mejor un 415 claro que una ficha con un hueco roto.
export const TIPOS_FOTO = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const MAX_FOTO_BYTES = 10 * 1024 * 1024;

/** El content-type pelado: "image/JPEG; charset=x" -> "image/jpeg". */
export function tipoDeFoto(cabecera) {
  return String(cabecera || "").split(";")[0].trim().toLowerCase();
}

/**
 * La foto viaja en binario, no en JSON: aquí solo se decide si el tipo y el
 * tamaño valen. Devuelve el tipo normalizado y la extensión para la clave,
 * o el error con su código HTTP.
 */
export function validarFoto(cabecera, bytes) {
  const tipo = tipoDeFoto(cabecera);
  const extension = TIPOS_FOTO[tipo];
  if (!extension) {
    const validos = Object.keys(TIPOS_FOTO).join(", ");
    return { error: `tipo no admitido: ${JSON.stringify(tipo)}. Válidos: ${validos}`, estado: 415 };
  }
  if (!bytes) return { error: "la foto llega vacía", estado: 422 };
  if (bytes > MAX_FOTO_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    const tope = MAX_FOTO_BYTES / (1024 * 1024);
    return { error: `la foto pesa ${mb} MB y el máximo son ${tope} MB`, estado: 413 };
  }
  return { tipo, extension };
}

/**
 * Cada subida estrena clave: con el momento dentro, la URL cambia al
 * reemplazar la foto y la anterior puede cachearse para siempre.
 */
export function claveDeFoto(cafeId, extension, ahoraMs = Date.now()) {
  return `fotos/${cafeId}-${ahoraMs}.${extension}`;
}

/**
 * Lo que cae en la taza nunca puede pasar del agua que echaste: lo que sube de
 * ahí es que se pesó la jarra, o el agua, o las dos cosas mal.
 *
 * Vive suelta porque hacen falta las dos puertas. Al dar de alta, el agua
 * viene en el mismo cuerpo; al corregir puede venir en el PATCH o estar ya
 * guardada, y eso solo lo sabe quien tiene la fila delante.
 */
export function extraidoImposible(extraido, agua) {
  if (extraido === null || extraido === undefined) return null;
  if (agua === null || agua === undefined) return null;
  if (extraido <= agua) return null;
  return `extraido_g (${extraido}) no puede pasar del agua (${agua})`;
}

export const ACCIONES = ["verter", "agitar", "remover", "esperar", "retirar"];

/** Cómo se vierte. Es un atributo del vertido, no una acción aparte. */
export const ESTILOS = ["espiral", "centro"];

/**
 * Valida una receta con sus pasos.
 *
 * Los pasos se mandan enteros y reemplazan a los que hubiera: es más simple
 * que parchear paso a paso, y es como se edita en la app, viendo la lista.
 *
 * Las reglas duras las repite la base con sus CHECK; esto está para dar
 * errores que se entiendan.
 */
export function validarReceta(cuerpo, { nuevo }) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const permitidos = ["id", "nombre", "ratio", "notas", "pasos"];
  const receta = {};

  const desconocidos = Object.keys(entrada).filter((c) => !permitidos.includes(c));
  if (desconocidos.length) errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);

  if (nuevo) {
    const id = String(entrada.id ?? "").trim();
    if (!ID.test(id)) {
      errores.push(`id inválido: ${JSON.stringify(entrada.id)}. Minúsculas, números, guion y guion bajo`);
    }
    receta.id = id;
  } else if (entrada.id !== undefined) {
    errores.push("el id no se puede cambiar: es la clave a la que apuntan las extracciones");
  }

  const nombre = String(entrada.nombre ?? "").trim();
  if (!nombre) errores.push("el nombre no puede estar vacío");
  receta.nombre = nombre;

  if (vacio(entrada.ratio)) {
    receta.ratio = null;
  } else {
    const n = numero(entrada.ratio);
    if (n === null || n <= 0) errores.push("ratio debe ser un número mayor que 0");
    receta.ratio = n;
  }

  receta.notas = vacio(entrada.notas) ? null : String(entrada.notas).trim();

  const pasos = [];
  const entrantes = Array.isArray(entrada.pasos) ? entrada.pasos : [];
  if (!entrantes.length) {
    errores.push("una receta necesita al menos un paso");
  }

  entrantes.forEach((crudo, i) => {
    const n = i + 1;
    const paso = { orden: n };
    const accion = String(crudo?.accion ?? "").trim().toLowerCase();
    if (!ACCIONES.includes(accion)) {
      errores.push(`paso ${n}: acción no permitida ${JSON.stringify(crudo?.accion)}. Válidas: ${ACCIONES.join(", ")}`);
    }
    paso.accion = accion;

    const agua = vacio(crudo?.agua_g) ? 0 : numero(crudo.agua_g);
    if (agua === null) {
      errores.push(`paso ${n}: agua_g debe ser un número`);
    } else if (accion === "verter" && agua <= 0) {
      errores.push(`paso ${n}: un vertido necesita gramos`);
    } else if (accion !== "verter" && agua !== 0) {
      errores.push(`paso ${n}: solo 'verter' lleva gramos`);
    }
    paso.agua_g = agua ?? 0;

    const estilo = vacio(crudo?.estilo) ? null : String(crudo.estilo).trim().toLowerCase();
    if (estilo && !ESTILOS.includes(estilo)) {
      errores.push(`paso ${n}: estilo no permitido ${JSON.stringify(crudo?.estilo)}. Válidos: ${ESTILOS.join(", ")}`);
    } else if (estilo && accion !== "verter") {
      errores.push(`paso ${n}: el estilo es de los vertidos, y '${accion}' no lo es`);
    }
    paso.estilo = estilo;

    if (vacio(crudo?.t_inicio_s)) {
      paso.t_inicio_s = null;
    } else {
      const t = numero(crudo.t_inicio_s);
      if (t === null || !Number.isInteger(t) || t < 0) {
        errores.push(`paso ${n}: t_inicio_s debe ser un entero de segundos, cero o más`);
      }
      paso.t_inicio_s = t;
    }

    paso.notas = vacio(crudo?.notas) ? null : String(crudo.notas).trim();
    pasos.push(paso);
  });

  if (entrantes.length && !pasos.some((p) => p.accion === "verter")) {
    errores.push("la receta no tiene ningún vertido: el cronómetro no sabría qué guiar");
  }

  // Los tiempos deben ir hacia delante, o el cronómetro saltaría hacia atrás.
  const tiempos = pasos.map((p) => p.t_inicio_s).filter((t) => t !== null);
  for (let i = 1; i < tiempos.length; i += 1) {
    if (tiempos[i] <= tiempos[i - 1]) {
      errores.push(`los tiempos deben ir en aumento: ${tiempos[i - 1]}s va antes que ${tiempos[i]}s`);
      break;
    }
  }

  return { receta, pasos, errores };
}
