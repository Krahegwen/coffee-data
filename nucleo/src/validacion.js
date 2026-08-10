/**
 * Validación del cuerpo de una extracción.
 *
 * Las garantías duras viven en los CHECK del esquema: aunque esto se saltara,
 * D1 rechazaría el INSERT. Lo de aquí existe para devolver errores legibles en
 * vez de un mensaje de SQLite, y para poner los valores por defecto.
 */

import { esUuid } from "./ids.js";

export const DEFECTOS = [
  "equilibrado", "amargor", "astringente", "plano", "agrio", "salado", "carton",
  "aguado",
];

/**
 * «Equilibrado» no es un defecto: es decir que no hay ninguno. Por eso no
 * acompaña a otros — una taza no puede estar equilibrada y amarga a la vez.
 */
export const SIN_DEFECTO = "equilibrado";

export const DRIPPERS = ["v60-02-plastico", "v60-02-ceramica"];

/**
 * Los defectos de una taza, **en orden de relevancia**: el que más molesta
 * primero.
 *
 * En la base es una sola columna con la lista separada por comas, y no una
 * tabla hija: son como mucho siete claves de un vocabulario cerrado, nadie
 * hace JOIN contra ellas y nadie filtra por ellas en SQL. Guardarlas en la
 * misma fila deja el puerto de almacén donde está —once métodos, filas
 * planas— y los tres adaptadores tontos, que es lo que los hace fáciles de
 * escribir bien. El CHECK de la base sigue mordiendo: ver la migración 0010.
 *
 * Acepta lo que mande quien llame: un array, o el texto tal cual está
 * guardado. Un solo defecto —`"amargor"`, que es lo que documenta el README y
 * lo que hay en las filas viejas— es una lista de uno y no hay que migrar
 * nada.
 */
export function defectosDe(valor) {
  if (valor === null || valor === undefined) return [];
  const crudos = Array.isArray(valor) ? valor : String(valor).split(",");
  return crudos.map((d) => String(d ?? "").trim().toLowerCase()).filter(Boolean);
}

/**
 * Valida la lista y la deja en su forma canónica: `"amargor,astringente"`.
 *
 * Sin espacios y sin repetidos, porque el texto es lo que se guarda y dos
 * escrituras del mismo juicio tienen que dar la misma cadena — si no, dos
 * filas iguales no se parecerían.
 */
function validarDefectos(valor, errores) {
  const lista = defectosDe(valor);
  if (!lista.length) return null;

  const malos = lista.filter((d) => !DEFECTOS.includes(d));
  if (malos.length) {
    errores.push(
      `defecto no permitido: ${malos.map((d) => JSON.stringify(d)).join(", ")}. ` +
        `Válidos: ${DEFECTOS.join(", ")}`,
    );
  }

  const repetidos = lista.filter((d, i) => lista.indexOf(d) !== i);
  if (repetidos.length) {
    errores.push(`defecto repetido: ${[...new Set(repetidos)].join(", ")}`);
  }

  // Decir «equilibrado» es decir que no hay defecto, así que no acompaña.
  if (lista.includes(SIN_DEFECTO) && lista.length > 1) {
    errores.push(
      `'${SIN_DEFECTO}' significa que no hay defecto, así que no puede ir con otros: ` +
        lista.join(", "),
    );
  }

  return lista.join(",");
}

// Receta base del README.
export const POR_DEFECTO = {
  dosis_g: 20,
  agua_g: 300,
  molinillo: "Comandante C40",
  metodo: "V60 4:6 Kasuya",
  receta_id: "kasuya-46-base",
  dripper: "v60-02-plastico",
};

// cafe_id no está: una taza sin ficha —el café de un amigo, una muestra— se
// apunta sin bolsa. Sin ella no hay serie que comparar, pero la taza queda.
export const OBLIGATORIOS = [
  "temp_c", "clics", "tiempo_total", "variable_cambiada", "defecto", "nota",
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
// que es quien mantiene la columna y el objeto de R2 a la par. Ni id ni slug:
// la id la pone quien crea la fila y el slug sale del nombre.
export const CAMPOS_CAFE = [
  "nombre", "tostador", "origen", "region", "variedad", "proceso",
  "altitud_m", "sca", "fecha_tueste", "consumir_antes", "fecha_apertura",
  "peso_g", "precio_eur", "notas_tostador", "estado", "url", "conservacion",
];

const FECHAS_CAFE = ["fecha_tueste", "consumir_antes", "fecha_apertura"];
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

// El slug viaja en la URL: sin espacios, sin mayúsculas y sin acentos. Mismo
// criterio que el CHECK de la base. Desde la migración de identidad es una
// etiqueta, no la clave: las claves son UUID y las pone quien crea la fila.
export const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Convierte un nombre en slug. Se hace aquí y no en la app para que salga
 * igual venga de donde venga: del formulario, de curl o de un script.
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

/** El sello de la base: `datetime('now')` de SQLite, en UTC. */
const SELLO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Lo que un alta puede traer puesto además de sus campos. */
export const IDENTIDAD = ["id", "creado_en"];

/**
 * id y creado_en opcionales en los altas. No los teclea nadie: los manda la
 * cola de salida al reenviar una fila que nació en local, para que el
 * servidor escriba exactamente la misma y reintentar no duplique — la misma
 * id choca. Deja lo validado en `valores` y los fallos en `errores`.
 */
function validarIdentidad(entrada, valores, errores) {
  if (!vacio(entrada.id)) {
    const id = String(entrada.id).trim().toLowerCase();
    if (!esUuid(id)) {
      errores.push(`id inválida, se espera un uuid: ${JSON.stringify(entrada.id)}`);
    }
    valores.id = id;
  }
  if (!vacio(entrada.creado_en)) {
    const sello = String(entrada.creado_en).trim();
    if (!SELLO.test(sello)) {
      errores.push(
        `creado_en inválido, se espera AAAA-MM-DD HH:MM:SS: ${JSON.stringify(entrada.creado_en)}`,
      );
    }
    valores.creado_en = sello;
  }
}

/**
 * Devuelve { valores, errores }. Si errores tiene algo, no se inserta nada:
 * la fila entra entera o no entra.
 */
export function validarExtraccion(cuerpo, { ahora } = {}) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};

  const desconocidos = Object.keys(entrada)
    .filter((c) => !CAMPOS.includes(c) && !IDENTIDAD.includes(c));
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

  valores.defecto = validarDefectos(entrada.defecto, errores);

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

  // Aquí y no en el bloque del goteo: hace falta el tiempo total ya leído.
  const goteoMalo = goteoImposible(valores.drawdown_s, valores.tiempo_total);
  if (goteoMalo) errores.push(goteoMalo);

  validarIdentidad(entrada, valores, errores);

  return { valores, errores };
}

/**
 * Valida una bolsa. Con `nuevo`, exige nombre y devuelve la fila entera; el
 * slug sale del nombre y la id la pone quien crea. Sin él es una corrección:
 * solo entran los campos que vengan. Ni id ni slug se aceptan del cuerpo —
 * la primera es opaca y el segundo, derivado.
 */
export function validarCafe(cuerpo, { nuevo }) {
  const errores = [];
  const entrada = cuerpo && typeof cuerpo === "object" ? cuerpo : {};
  const valores = {};

  // id y creado_en solo en el alta: en una corrección son la identidad de la
  // fila y no se tocan.
  const desconocidos = Object.keys(entrada)
    .filter((c) => !CAMPOS_CAFE.includes(c) && !(nuevo && IDENTIDAD.includes(c)));
  if (desconocidos.length) {
    errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);
  }

  if (nuevo) {
    const slug = slugDe(entrada.nombre);
    if (!SLUG.test(slug)) {
      errores.push(
        `del nombre ${JSON.stringify(entrada.nombre)} no sale un slug utilizable: necesita alguna letra o número`,
      );
    }
    valores.slug = slug;
    validarIdentidad(entrada, valores, errores);
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

  // Vaciarlo es legal y significa quitarle la bolsa: la extracción pasa a
  // ser suelta, como una que se hubiera apuntado sin ficha.
  if (dado("cafe_id")) {
    const cafeId = String(entrada.cafe_id ?? "").trim();
    valores.cafe_id = cafeId || null;
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
    valores.defecto = validarDefectos(entrada.defecto, errores);
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

/**
 * El tiempo de una extracción en segundos: `"3:30"` -> 210.
 *
 * `tiempo_total` es texto libre y lo seguirá siendo —hay filas escritas a mano
 * y la columna nunca ha tenido formato—, así que esto devuelve `null` en vez de
 * quejarse cuando no reconoce lo que lee. Quien pregunte se calla, que es mejor
 * que rechazar una fila por cómo está escrita la hora.
 */
export function segundosDe(texto) {
  const partido = /^(\d+):(\d{1,2})$/.exec(String(texto ?? "").trim());
  if (!partido) return null;
  const segundos = Number(partido[2]);
  if (segundos > 59) return null;
  return Number(partido[1]) * 60 + segundos;
}

/**
 * Y de vuelta: 210 -> `"3:30"`. Es cómo se escribe `tiempo_total` en la base,
 * así que vive aquí al lado de quien lo lee y no en cada pantalla que lo pinta.
 */
export function relojDe(segundos) {
  const t = Math.max(0, Math.floor(Number(segundos) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * El goteo y el tiempo total **acaban en el mismo instante**: el fin del goteo.
 * Lo que cambia es desde dónde se miden —el total desde el primer vertido, el
 * goteo desde el final del último—, así que el goteo es un tramo *dentro* del
 * total y no puede llegar a él. Si llega, no hay taza que lo explique: es que
 * se corrigió uno a mano y el otro se quedó quieto.
 *
 * Vive suelta por lo mismo que `extraidoImposible`: al dar de alta los dos
 * vienen en el cuerpo, y al corregir uno puede venir en el PATCH mientras el
 * otro está ya guardado, y eso solo lo sabe quien tiene la fila delante.
 */
export function goteoImposible(drawdown, tiempoTotal) {
  if (drawdown === null || drawdown === undefined) return null;
  const total = segundosDe(tiempoTotal);
  if (total === null) return null;
  if (drawdown < total) return null;
  return (
    `drawdown_s (${drawdown} s) no puede llegar al tiempo total (${tiempoTotal}): ` +
    "el goteo se cuenta desde el final del último vertido, así que va por dentro"
  );
}

/**
 * El goteo puesto al día tras mover el tiempo total: el mismo delta, porque el
 * fin del último vertido no se ha movido de donde lo puso la receta.
 *
 * Es la otra cara de `goteoImposible`. Aquélla es la red de seguridad del
 * servidor; ésta es para que los formularios no dejen la fila incoherente de
 * entrada, que corregir un campo y dejar el otro quieto no es una decisión
 * sino un descuido.
 *
 * `null` cuando no hay nada que mover: falta alguno de los tres, el tiempo no
 * se deja leer, o el resultado sería un goteo negativo.
 */
export function goteoTrasMoverTotal(antes, ahora, goteo) {
  const desde = segundosDe(antes);
  const hasta = segundosDe(ahora);
  if (desde === null || hasta === null || goteo === null || goteo === undefined) return null;

  const nuevo = goteo + (hasta - desde);
  return nuevo === goteo || nuevo < 0 ? null : nuevo;
}

/** Y al revés: mover el goteo alarga o acorta el total lo mismo. */
export function totalTrasMoverGoteo(antes, ahora, total) {
  if (antes === null || antes === undefined) return null;
  if (ahora === null || ahora === undefined) return null;
  const desde = segundosDe(total);
  if (desde === null) return null;

  const nuevo = desde + (ahora - antes);
  return nuevo === desde || nuevo <= 0 ? null : relojDe(nuevo);
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
  const permitidos = ["nombre", "ratio", "notas", "pasos"];
  const receta = {};

  const desconocidos = Object.keys(entrada)
    .filter((c) => !permitidos.includes(c) && !(nuevo && IDENTIDAD.includes(c)));
  if (desconocidos.length) errores.push(`campos desconocidos: ${desconocidos.join(", ")}`);

  // Como en las bolsas: el slug sale del nombre y la id la pone quien crea.
  if (nuevo) {
    const slug = slugDe(entrada.nombre);
    if (!SLUG.test(slug)) {
      errores.push(
        `del nombre ${JSON.stringify(entrada.nombre)} no sale un slug utilizable: necesita alguna letra o número`,
      );
    }
    receta.slug = slug;
    validarIdentidad(entrada, receta, errores);
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
