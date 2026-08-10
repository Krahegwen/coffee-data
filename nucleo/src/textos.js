/**
 * Lo que el núcleo le dice al usuario, por idioma.
 *
 * Hasta aquí las frases vivían incrustadas en `validacion.js`, `sugerencias.js`
 * y `api.js`, y eso valía mientras la bitácora fuese solo mía. Abierta a
 * cualquiera deja de valer: los avisos y las palancas son **la mitad del valor
 * de registrar**, así que una app en inglés con las sugerencias en castellano
 * no está traducida, está a medias.
 *
 * La regla que ya valía para la base vale igual aquí: **el dato es la clave**
 * —`goteo_largo`, `dripper_inercia`— y la frase es una traducción suya. La
 * diferencia es que estas claves no se guardan en ninguna parte: nacen y se
 * resuelven dentro de la misma llamada.
 *
 * `textos(idioma)` devuelve la función que hace ese cambio. Cae al castellano
 * cuando no conoce el idioma **y también clave a clave**, para que una
 * traducción a medias enseñe la frase en castellano en vez de la clave pelada:
 * un usuario prefiere leer un idioma que no es el suyo antes que `goteo_largo`.
 */

export const IDIOMAS = ["es", "en"];
export const IDIOMA_POR_DEFECTO = "es";

const es = {
  // --- validación: identidad y forma de la fila
  campos_desconocidos: "campos desconocidos: {lista}",
  faltan_obligatorios: "faltan campos obligatorios: {lista}",
  nada_que_corregir: "no hay ningún campo que corregir",
  id_invalida: "id inválida, se espera un uuid: {valor}",
  creado_en_invalido: "creado_en inválido, se espera AAAA-MM-DD HH:MM:SS: {valor}",
  desde_id_invalida: "desde_id inválida, se espera un uuid: {valor}",
  fecha_invalida: "fecha inválida, se espera AAAA-MM-DD: {valor}",
  fecha_campo_invalida: "{campo} inválida, se espera AAAA-MM-DD: {valor}",
  slug_imposible:
    "del nombre {valor} no sale un slug utilizable: necesita alguna letra o número",

  // --- validación: números y listas cerradas
  numero_mayor_que_cero: "{campo} debe ser un número mayor que 0",
  debe_ser_numero: "{campo} debe ser un número",
  numero_con_regla: "{campo} debe ser un número {regla}",
  regla_mayor_que_0: "mayor que 0",
  regla_entre_0_y_100: "entre 0 y 100",
  regla_cero_o_mas: "cero o más",
  temp_fuera_de_rango: "temp_c debe estar entre 0 y 100",
  nota_fuera_de_rango: "la nota debe ser un entero de 1 a 10: {valor}",
  drawdown_entero: "drawdown_s debe ser un entero de segundos, cero o más",
  extraido_mayor_que_cero: "extraido_g debe ser un número mayor que 0",
  dripper_no_permitido: "dripper no permitido: {valor}. Válidos: {validos}",
  estado_no_permitido: "estado no permitido: {valor}. Válidos: {validos}",
  nombre_vacio: "el nombre no puede estar vacío",
  ratio_mayor_que_cero: "ratio debe ser un número mayor que 0",

  // --- validación: defectos
  defecto_no_permitido: "defecto no permitido: {malos}. Válidos: {validos}",
  defecto_repetido: "defecto repetido: {repetidos}",
  defecto_sin_compania:
    "'{sin_defecto}' significa que no hay defecto, así que no puede ir con otros: {lista}",

  // --- validación: coherencia de la taza
  extraido_imposible: "extraido_g ({extraido}) no puede pasar del agua ({agua})",
  goteo_imposible:
    "drawdown_s ({goteo} s) no puede llegar al tiempo total ({total}): " +
    "el goteo se cuenta desde el final del último vertido, así que va por dentro",

  // --- validación: recetas y pasos
  receta_sin_pasos: "una receta necesita al menos un paso",
  receta_sin_vertidos:
    "la receta no tiene ningún vertido: el cronómetro no sabría qué guiar",
  tiempos_en_aumento: "los tiempos deben ir en aumento: {antes}s va antes que {despues}s",
  paso_accion_no_permitida: "paso {n}: acción no permitida {valor}. Válidas: {validas}",
  paso_agua_numero: "paso {n}: agua_g debe ser un número",
  paso_vertido_sin_gramos: "paso {n}: un vertido necesita gramos",
  paso_solo_verter_lleva_gramos: "paso {n}: solo 'verter' lleva gramos",
  paso_estilo_no_permitido: "paso {n}: estilo no permitido {valor}. Válidos: {validos}",
  paso_estilo_solo_vertidos: "paso {n}: el estilo es de los vertidos, y '{accion}' no lo es",
  paso_t_inicio_entero: "paso {n}: t_inicio_s debe ser un entero de segundos, cero o más",

  // --- validación: fotos
  foto_tipo_no_admitido: "tipo no admitido: {tipo}. Válidos: {validos}",
  foto_vacia: "la foto llega vacía",
  foto_demasiado_grande: "la foto pesa {mb} MB y el máximo son {tope} MB",

  // --- manejadores: lo que no existe o no cuela
  cafe_no_existe: "no existe ningún café '{ref}'",
  cafe_desconocido: "cafe_id desconocido: {valor}",
  receta_no_existe: "no existe la receta '{ref}'",
  receta_sin_pasos_guion: "la receta {ref} no tiene pasos",
  extraccion_no_existe: "no existe la extracción {id}",
  desde_id_otra_bolsa:
    "desde_id desconocida en esta bolsa: {valor}. Una extracción solo puede ser " +
    "variación de otra del mismo café",
  desde_id_no_vale:
    "desde_id no vale: {valor}. La madre tiene que ser otra extracción de la misma " +
    "bolsa y anterior a ésta",
  receta_en_uso:
    "la receta '{slug}' la usan {cuantas}, retiradas incluidas: no se puede borrar, " +
    "edítala o déjala ahí sin usarla",
  una_extraccion: "1 extracción",
  n_extracciones: "{n} extracciones",

  // --- manejadores: la base dice que no
  base_rechaza_bolsa: "la base rechazó la bolsa: {error}",
  base_rechaza_cambio: "la base rechazó el cambio: {error}",
  base_rechaza_receta: "la base rechazó la receta: {error}",
  base_rechaza_fila: "la base rechazó la fila: {error}",
  base_rechaza_foto: "la base rechazó la foto: {error}",
  ya_existe_cafe: "ya existe un café con la id {id}",
  ya_existe_receta: "ya existe una receta con la id {id}",
  ya_existe_extraccion: "ya existe una extracción con la id {id}",

  // --- motor: avisos
  aviso_dripper_inercia:
    "dripper con masa térmica: si no lo precalentaste, la temperatura real del lecho " +
    "fue menor que los grados del hervidor",
  aviso_cambio_de_dripper:
    "has cambiado de dripper ({antes} -> {ahora}): esa es la variable de esta " +
    "extracción, no compares el resto",
  aviso_cafe_pasado:
    "el café lleva {dias} días de tueste: por encima de {umbral} la taza se apaga sola " +
    "y la receta no tiene la culpa",
  aviso_carton_pasado: "a cartón casi siempre es café pasado, no extracción",
  aviso_bolsa_vieja:
    "la bolsa lleva {dias} días abierta (más de {umbral}): a partir de ahí el café se " +
    "apaga por oxidación y no por lo que hagas al prepararlo, salvo que la guardes al vacío",
  aviso_retencion:
    "retención de {retenido} g por gramo de café (lo normal es {minimo}-{maximo}): " +
    "repasa el agua, la dosis o lo que pesaste en la jarra, porque con una medida " +
    "torcida esta extracción no compara con las demás",
  aviso_vertido_desviado:
    "según esta fila dejaste de verter en el segundo {medido} ({total} s de total menos " +
    "{goteo} s de goteo) y la receta da los vertidos por acabados en el {plan}: " +
    "{desvio} s de diferencia. Si no vertiste a otro ritmo a propósito, repasa el tiempo " +
    "total y el goteo antes de fiarte de esta taza",

  // --- motor: por qué se propone cada cosa
  porque_goteo_largo:
    "el goteo tardó {goteo} s (más de {umbral}): la molienda está atascando el filtro",
  porque_goteo_corto: "el goteo tardó {goteo} s (menos de {umbral}): el agua pasa de largo",
  porque_amargor_clics: "sobreextracción: moler más grueso",
  porque_amargor_temp: "o bajar la temperatura",
  porque_astringente: "la astringencia casi siempre es molienda demasiado fina",
  porque_plano_clics: "subextracción: moler más fino",
  porque_plano_temp: "o subir la temperatura",
  porque_agrio_temp: "subextracción: subir la temperatura",
  porque_agrio_clics: "o moler más fino",
  porque_salado_clics: "subextracción: moler más fino",
  porque_salado_dosis: "o subir la dosis",
  porque_carton: "si el café está fresco, moler más fino",
  porque_aguado_clics: "sin cuerpo: moler más fino para extraer más",
  porque_aguado_dosis: "o subir la dosis y dejar el agua donde está",
  porque_extrapolar_sigue:
    "sin defecto pero sin nota: {variable} {direccion} salió {delta}, así que otro paso " +
    "por ahí para ver dónde está el techo",
  porque_extrapolar_vuelve:
    "sin defecto pero sin nota: {variable} {direccion} salió {delta}, así que media vuelta",
  direccion_subir: "subir",
  direccion_bajar: "bajar",
  direccion_cambiar: "cambiar",
  repetir_igual: "Repetir igual para confirmar",
};

const en = {
  campos_desconocidos: "unknown fields: {lista}",
  faltan_obligatorios: "missing required fields: {lista}",
  nada_que_corregir: "there is nothing to change",
  id_invalida: "invalid id, a uuid was expected: {valor}",
  creado_en_invalido: "invalid creado_en, expected YYYY-MM-DD HH:MM:SS: {valor}",
  desde_id_invalida: "invalid desde_id, a uuid was expected: {valor}",
  fecha_invalida: "invalid date, expected YYYY-MM-DD: {valor}",
  fecha_campo_invalida: "invalid {campo}, expected YYYY-MM-DD: {valor}",
  slug_imposible:
    "the name {valor} does not yield a usable slug: it needs at least one letter or digit",

  numero_mayor_que_cero: "{campo} must be a number greater than 0",
  debe_ser_numero: "{campo} must be a number",
  numero_con_regla: "{campo} must be a number {regla}",
  regla_mayor_que_0: "greater than 0",
  regla_entre_0_y_100: "between 0 and 100",
  regla_cero_o_mas: "zero or more",
  temp_fuera_de_rango: "temp_c must be between 0 and 100",
  nota_fuera_de_rango: "the score must be a whole number from 1 to 10: {valor}",
  drawdown_entero: "drawdown_s must be a whole number of seconds, zero or more",
  extraido_mayor_que_cero: "extraido_g must be a number greater than 0",
  dripper_no_permitido: "dripper not allowed: {valor}. Valid ones: {validos}",
  estado_no_permitido: "state not allowed: {valor}. Valid ones: {validos}",
  nombre_vacio: "the name cannot be empty",
  ratio_mayor_que_cero: "ratio must be a number greater than 0",

  defecto_no_permitido: "flaw not allowed: {malos}. Valid ones: {validos}",
  defecto_repetido: "repeated flaw: {repetidos}",
  defecto_sin_compania:
    "'{sin_defecto}' means there is no flaw, so it cannot come with others: {lista}",

  extraido_imposible: "extraido_g ({extraido}) cannot exceed the water ({agua})",
  goteo_imposible:
    "drawdown_s ({goteo} s) cannot reach the total time ({total}): drawdown is counted " +
    "from the end of the last pour, so it runs inside it",

  receta_sin_pasos: "a recipe needs at least one step",
  receta_sin_vertidos: "the recipe has no pour: the timer would have nothing to guide",
  tiempos_en_aumento: "times must increase: {antes}s comes before {despues}s",
  paso_accion_no_permitida: "step {n}: action not allowed {valor}. Valid ones: {validas}",
  paso_agua_numero: "step {n}: agua_g must be a number",
  paso_vertido_sin_gramos: "step {n}: a pour needs grams",
  paso_solo_verter_lleva_gramos: "step {n}: only 'verter' carries grams",
  paso_estilo_no_permitido: "step {n}: style not allowed {valor}. Valid ones: {validos}",
  paso_estilo_solo_vertidos: "step {n}: style belongs to pours, and '{accion}' is not one",
  paso_t_inicio_entero: "step {n}: t_inicio_s must be a whole number of seconds, zero or more",

  foto_tipo_no_admitido: "type not supported: {tipo}. Valid ones: {validos}",
  foto_vacia: "the photo arrived empty",
  foto_demasiado_grande: "the photo weighs {mb} MB and the limit is {tope} MB",

  cafe_no_existe: "there is no coffee '{ref}'",
  cafe_desconocido: "unknown cafe_id: {valor}",
  receta_no_existe: "there is no recipe '{ref}'",
  receta_sin_pasos_guion: "recipe {ref} has no steps",
  extraccion_no_existe: "there is no brew {id}",
  desde_id_otra_bolsa:
    "desde_id unknown in this bag: {valor}. A brew can only be a variation of another " +
    "of the same coffee",
  desde_id_no_vale:
    "desde_id is not valid: {valor}. The parent must be another brew of the same bag, " +
    "and an earlier one",
  receta_en_uso:
    "recipe '{slug}' is used by {cuantas}, withdrawn ones included: it cannot be " +
    "deleted, edit it or leave it there unused",
  una_extraccion: "1 brew",
  n_extracciones: "{n} brews",

  base_rechaza_bolsa: "the database rejected the bag: {error}",
  base_rechaza_cambio: "the database rejected the change: {error}",
  base_rechaza_receta: "the database rejected the recipe: {error}",
  base_rechaza_fila: "the database rejected the row: {error}",
  base_rechaza_foto: "the database rejected the photo: {error}",
  ya_existe_cafe: "a coffee with id {id} already exists",
  ya_existe_receta: "a recipe with id {id} already exists",
  ya_existe_extraccion: "a brew with id {id} already exists",

  aviso_dripper_inercia:
    "dripper with thermal mass: if you did not preheat it, the real bed temperature was " +
    "lower than the kettle reading",
  aviso_cambio_de_dripper:
    "you changed dripper ({antes} -> {ahora}): that is this brew's variable, do not " +
    "compare anything else",
  aviso_cafe_pasado:
    "the coffee is {dias} days past roast: beyond {umbral} the cup fades on its own and " +
    "the recipe is not to blame",
  aviso_carton_pasado: "cardboard is almost always stale coffee, not extraction",
  aviso_bolsa_vieja:
    "the bag has been open for {dias} days (more than {umbral}): from there on the " +
    "coffee fades through oxidation and not through anything you do while brewing, " +
    "unless you keep it under vacuum",
  aviso_retencion:
    "retention of {retenido} g per gram of coffee (normal is {minimo}-{maximo}): check " +
    "the water, the dose or what you weighed in the carafe, because with a crooked " +
    "measurement this brew does not compare with the rest",
  aviso_vertido_desviado:
    "by this row you stopped pouring at second {medido} ({total} s total minus {goteo} s " +
    "of drawdown) and the recipe has the pours finishing at {plan}: {desvio} s apart. " +
    "Unless you poured at a different pace on purpose, check the total time and the " +
    "drawdown before trusting this cup",

  porque_goteo_largo:
    "drawdown took {goteo} s (more than {umbral}): the grind is clogging the filter",
  porque_goteo_corto: "drawdown took {goteo} s (less than {umbral}): the water runs straight through",
  porque_amargor_clics: "overextraction: grind coarser",
  porque_amargor_temp: "or lower the temperature",
  porque_astringente: "astringency is almost always too fine a grind",
  porque_plano_clics: "underextraction: grind finer",
  porque_plano_temp: "or raise the temperature",
  porque_agrio_temp: "underextraction: raise the temperature",
  porque_agrio_clics: "or grind finer",
  porque_salado_clics: "underextraction: grind finer",
  porque_salado_dosis: "or raise the dose",
  porque_carton: "if the coffee is fresh, grind finer",
  porque_aguado_clics: "no body: grind finer to extract more",
  porque_aguado_dosis: "or raise the dose and leave the water where it is",
  porque_extrapolar_sigue:
    "no flaw but no score either: {variable} {direccion} came out {delta}, so another " +
    "step that way to find the ceiling",
  porque_extrapolar_vuelve:
    "no flaw but no score either: {variable} {direccion} came out {delta}, so turn back",
  direccion_subir: "up",
  direccion_bajar: "down",
  direccion_cambiar: "change",
  repetir_igual: "Repeat as is to confirm",
};

const CATALOGO = { es, en };

/** `{campo}` -> lo que traiga `datos`. Lo que falte se queda como estaba. */
function interpolar(plantilla, datos) {
  return plantilla.replace(/\{(\w+)\}/g, (crudo, clave) =>
    (clave in datos ? String(datos[clave]) : crudo));
}

/**
 * La función que convierte clave y datos en frase.
 *
 * Idioma desconocido o clave sin traducir caen al castellano, que es el
 * catálogo completo por definición: es donde se escribe primero.
 */
export function textos(idioma = IDIOMA_POR_DEFECTO) {
  const dic = CATALOGO[idioma] ?? CATALOGO[IDIOMA_POR_DEFECTO];
  return (clave, datos = {}) =>
    interpolar(dic[clave] ?? CATALOGO[IDIOMA_POR_DEFECTO][clave] ?? clave, datos);
}

/**
 * El idioma que se va a usar de verdad, a partir de lo que pidan.
 *
 * Acepta lo que llega por `Accept-Language` sin pelear con él: `en-GB` es
 * inglés, y lo que no se reconozca es castellano. No negocia calidades ni
 * ordena por `q=`: son dos idiomas, no un servidor de contenidos.
 */
export function idiomaDe(pedido) {
  const corto = String(pedido ?? "").trim().toLowerCase().split(",")[0].split("-")[0];
  return IDIOMAS.includes(corto) ? corto : IDIOMA_POR_DEFECTO;
}
