/**
 * La API de la bitácora, sin saber dónde corre.
 *
 * Cada manejador recibe un **almacén** —el puerto: once métodos sobre cafés,
 * recetas y extracciones— y devuelve `{ estado, datos }`. El Worker lo enchufa
 * a D1 y envuelve el resultado en un Response; el modo local lo enchufará a
 * IndexedDB y lo consumirá tal cual. Una sola implementación, dos cajones.
 *
 * El puerto habla en filas y agregados, no en SQL:
 *
 *   cafes.listar() / cafes.poner(fila) / cafes.actualizar(id, cambios)
 *   recetas.listar()                      → cada receta con sus pasos
 *   recetas.escribir(receta, pasos, { nueva })   → atómico
 *   recetas.borrar(id)                            → receta y pasos, atómico
 *   extracciones.listar() / poner / actualizar
 *
 * Los filtros, el orden, los derivados y la resolución por slug viven aquí,
 * en JS: la bitácora entera cabe en memoria de sobra, y así los adaptadores
 * quedan tontos — que es lo que los hace fáciles de escribir bien.
 */
import { derivar } from "./derivar.js";
import { uuidv7 } from "./ids.js";
import { guion, repartoDe } from "./recetas.js";
import { avisosDe, sugerir, textoCorto } from "./sugerencias.js";
import { textos } from "./textos.js";
import {
  CAMPOS, CAMPOS_CAFE, extraidoImposible, goteoImposible, validarCafe,
  validarCambiosExtraccion, validarExtraccion, validarReceta,
} from "./validacion.js";

/*
 * Los mensajes salen del catálogo del núcleo. Cada manejador recibe su `t` y,
 * si no le dicen otra cosa, habla castellano: la API por curl y los scripts de
 * siempre siguen leyéndose igual.
 */
const CASTELLANO = textos();

const respuesta = (estado, datos) => ({ estado, datos });

/** `datetime('now')` de SQLite, para que las dos rutas escriban lo mismo. */
export function ahoraSQL(ahora = new Date()) {
  return ahora.toISOString().slice(0, 19).replace("T", " ");
}

/** Busca por uuid o por slug: el slug es lo único que un humano teclea. */
export function porRef(filas, ref) {
  const buscado = String(ref ?? "");
  return filas.find((f) => f.id === buscado || f.slug === buscado) ?? null;
}

/** El slug derivado y, si choca, con sufijo: gary, gary_2, gary_3. */
function slugLibre(filas, base) {
  const ocupados = new Set(filas.map((f) => f.slug));
  let candidato = base;
  let n = 1;
  while (ocupados.has(candidato)) {
    n += 1;
    candidato = `${base}_${n}`;
  }
  return candidato;
}

/** El orden oficial: creado_en, con la id v7 de desempate. */
const cronologico = (a, b) => {
  if (a.creado_en !== b.creado_en) return a.creado_en < b.creado_en ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

/** Lo que en el servidor hacía la vista: derivados más los slugs de al lado. */
function conDerivados(extraccion, cafes, recetas) {
  const cafe = cafes.find((c) => c.id === extraccion.cafe_id) ?? null;
  const receta = recetas.find((x) => x.id === extraccion.receta_id) ?? null;
  return {
    ...derivar(extraccion, cafe),
    cafe_slug: cafe?.slug ?? null,
    receta_slug: receta?.slug ?? null,
  };
}

// --- cafés -------------------------------------------------------------------

export async function listaCafes(almacen) {
  const filas = await almacen.cafes.listar();
  filas.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado < b.estado ? -1 : 1;
    return a.nombre < b.nombre ? -1 : 1;
  });
  return respuesta(200, filas);
}

export async function crearCafe(almacen, cuerpo, { t = CASTELLANO } = {}) {
  const { valores, errores } = validarCafe(cuerpo, { nuevo: true, t });
  if (errores.length) return respuesta(422, { errores });

  // La id puede venir puesta: es lo que reenvía la cola de salida de una fila
  // nacida en local. Si ya está, no es un choque: es el mismo envío otra vez,
  // y `repetida` le dice al drenador que lo dé por hecho.
  const existentes = await almacen.cafes.listar();
  if (valores.id && existentes.some((c) => c.id === valores.id)) {
    return respuesta(409, { repetida: true, errores: [t("ya_existe_cafe", { id: valores.id })] });
  }
  valores.id = valores.id ?? uuidv7();
  valores.slug = slugLibre(existentes, valores.slug);
  valores.creado_en = valores.creado_en ?? ahoraSQL();
  valores.actualizado_en = valores.creado_en;
  valores.foto = null;

  const fila = {};
  for (const campo of ["id", "slug", ...CAMPOS_CAFE, "foto", "creado_en", "actualizado_en"]) {
    fila[campo] = valores[campo] ?? null;
  }

  try {
    await almacen.cafes.poner(fila);
  } catch (error) {
    return respuesta(422, { errores: [t("base_rechaza_bolsa", { error: error.message })] });
  }
  const cafe = porRef(await almacen.cafes.listar(), fila.id);
  return respuesta(201, { cafe });
}

export async function editarCafe(almacen, ref, cuerpo, { t = CASTELLANO } = {}) {
  const cafe = porRef(await almacen.cafes.listar(), ref);
  if (!cafe) return respuesta(404, { errores: [t("cafe_no_existe", { ref })] });

  const { valores, errores } = validarCafe(cuerpo, { nuevo: false, t });
  if (errores.length) return respuesta(422, { errores });

  const columnas = CAMPOS_CAFE.filter((c) => valores[c] !== undefined);
  const cambios = {};
  for (const campo of columnas) cambios[campo] = valores[campo];
  cambios.actualizado_en = ahoraSQL();

  try {
    await almacen.cafes.actualizar(cafe.id, cambios);
  } catch (error) {
    return respuesta(422, { errores: [t("base_rechaza_cambio", { error: error.message })] });
  }
  const actualizado = porRef(await almacen.cafes.listar(), cafe.id);
  return respuesta(200, { cafe: actualizado, cambiado: columnas });
}

// --- recetas -----------------------------------------------------------------

export async function listaRecetas(almacen) {
  const filas = await almacen.recetas.listar();
  filas.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  return respuesta(200, filas);
}

export async function guionDe(almacen, ref, aguaCruda, { t = CASTELLANO } = {}) {
  const receta = porRef(await almacen.recetas.listar(), ref);
  const agua = Number(aguaCruda || 300);
  const pasos = receta?.pasos ?? [];
  if (!pasos.length) return respuesta(404, { error: t("receta_sin_pasos_guion", { ref }) });
  try {
    return respuesta(200, guion(pasos, agua));
  } catch (error) {
    return respuesta(422, { error: error.message });
  }
}

export async function guardarReceta(almacen, { ref, nuevo }, cuerpo, { t = CASTELLANO } = {}) {
  const { receta, pasos, errores } = validarReceta(cuerpo, { nuevo, t });
  if (errores.length) return respuesta(422, { errores });

  const existentes = await almacen.recetas.listar();
  let fila;
  if (nuevo) {
    // Como en las bolsas: id y sello del cliente si vienen — el reenvío de la
    // cola —, y si la id ya está es el mismo envío repetido.
    if (receta.id && existentes.some((r) => r.id === receta.id)) {
      return respuesta(409, { repetida: true, errores: [t("ya_existe_receta", { id: receta.id })] });
    }
    const sello = receta.creado_en ?? ahoraSQL();
    fila = {
      id: receta.id ?? uuidv7(),
      slug: slugLibre(existentes, receta.slug),
      nombre: receta.nombre,
      ratio: receta.ratio,
      notas: receta.notas,
      creado_en: sello,
      actualizado_en: sello,
    };
  } else {
    const existe = porRef(existentes, ref);
    if (!existe) return respuesta(404, { errores: [t("receta_no_existe", { ref })] });
    const { pasos: fuera, ...sinPasos } = existe;
    fila = {
      ...sinPasos,
      nombre: receta.nombre,
      ratio: receta.ratio,
      notas: receta.notas,
      actualizado_en: ahoraSQL(),
    };
  }

  const atados = pasos.map((p) => ({ ...p, receta_id: fila.id }));
  try {
    await almacen.recetas.escribir(fila, atados, { nueva: Boolean(nuevo) });
  } catch (error) {
    return respuesta(422, { errores: [t("base_rechaza_receta", { error: error.message })] });
  }
  const guardada = porRef(await almacen.recetas.listar(), fila.id);
  return respuesta(nuevo ? 201 : 200, { receta: guardada });
}

export async function borrarReceta(almacen, ref, { t = CASTELLANO } = {}) {
  const existe = porRef(await almacen.recetas.listar(), ref);
  if (!existe) return respuesta(404, { errores: [t("receta_no_existe", { ref })] });

  // Retiradas incluidas: siguen apuntando, y sin la fila no habría forma de
  // saber con qué se preparó aquella taza.
  const usos = (await almacen.extracciones.listar())
    .filter((e) => e.receta_id === existe.id).length;
  if (usos) {
    const cuantas = usos === 1 ? t("una_extraccion") : t("n_extracciones", { n: usos });
    return respuesta(409, {
      errores: [t("receta_en_uso", { slug: existe.slug, cuantas })],
    });
  }

  await almacen.recetas.borrar(existe.id);
  return respuesta(200, { borrada: true, id: existe.id, slug: existe.slug });
}

// --- extracciones ------------------------------------------------------------

export async function listaExtracciones(almacen, { cafe, retiradas } = {}) {
  const [todas, cafes, recetas] = await Promise.all([
    almacen.extracciones.listar(),
    almacen.cafes.listar(),
    almacen.recetas.listar(),
  ]);

  let filas = todas.filter((e) => (retiradas ? e.borrada_en : !e.borrada_en));
  if (cafe) {
    const elegido = porRef(cafes, cafe);
    filas = filas.filter((e) => e.cafe_id === (elegido?.id ?? ""));
  }
  filas.sort(cronologico).reverse();
  return respuesta(200, filas.map((e) => conDerivados(e, cafes, recetas)));
}

export async function crearExtraccion(almacen, cuerpo, { t = CASTELLANO } = {}) {
  const { valores, errores } = validarExtraccion(cuerpo, { t });
  if (errores.length) return respuesta(422, { errores });

  // cafe_id y receta_id llegan como uuid desde la app o como slug desde curl:
  // se resuelven aquí y a la fila van siempre los uuid. La bolsa es opcional
  // —una taza sin ficha se apunta suelta—, pero si viene tiene que existir.
  const cafes = await almacen.cafes.listar();
  let cafe = null;
  if (valores.cafe_id) {
    cafe = porRef(cafes, valores.cafe_id);
    if (!cafe) return respuesta(422, { errores: [t("cafe_desconocido", { valor: valores.cafe_id })] });
    valores.cafe_id = cafe.id;
  }

  /*
   * De qué extracción es variación. Sin bolsa no hay serie, así que va a nulo
   * pase lo que pase; con bolsa, por defecto la última de esa bolsa — el caso
   * normal no cambia de comportamiento ni pide nada al usuario—. Lo que venga
   * mandado manda, incluido el vacío explícito de «ésta no continúa a ninguna»,
   * que es indistinguible de no mandar nada y por eso se resuelve aquí.
   */
  const deLaBolsa = (await almacen.extracciones.listar())
    .filter((e) => valores.cafe_id && e.cafe_id === valores.cafe_id)
    .sort(cronologico);
  if (!valores.cafe_id) {
    valores.desde_id = null;
  } else if (valores.desde_id) {
    // Apuntar a una retirada es legal —pudo retirarse después de elegirla, y
    // un desplegable no debe perder el valor que ya tiene—; lo que no forma es
    // par, que eso lo decide el motor al no verla en el histórico.
    if (!deLaBolsa.some((e) => e.id === valores.desde_id)) {
      return respuesta(422, {
        errores: [t("desde_id_otra_bolsa", { valor: valores.desde_id })],
      });
    }
  } else {
    // La última en pie: de una retirada no se parte, que fue un error.
    const vivas = deLaBolsa.filter((e) => !e.borrada_en);
    valores.desde_id = vivas[vivas.length - 1]?.id ?? null;
  }

  const recetas = await almacen.recetas.listar();
  const receta = porRef(recetas, valores.receta_id);
  const pasos = receta?.pasos ?? [];
  if (!pasos.length) {
    return respuesta(422, { errores: [t("receta_sin_pasos_guion", { ref: valores.receta_id })] });
  }
  valores.receta_id = receta.id;

  // El reparto sale de escalar las fases de la receta al agua real, salvo que
  // ese día te desviaras y lo mandes explícito.
  if (!valores.reparto) valores.reparto = repartoDe(pasos, valores.agua_g);

  // La id viene puesta cuando la fila nació en local y la reenvía la cola;
  // repetirla no duplica, choca — y el 409 con `repetida` lo dice.
  if (valores.id) {
    const filas = await almacen.extracciones.listar();
    if (filas.some((e) => e.id === valores.id)) {
      return respuesta(409, { repetida: true, errores: [t("ya_existe_extraccion", { id: valores.id })] });
    }
  }
  valores.id = valores.id ?? uuidv7();
  valores.creado_en = valores.creado_en ?? ahoraSQL();

  const fila = {};
  for (const campo of ["id", ...CAMPOS, "creado_en"]) {
    fila[campo] = valores[campo] ?? null;
  }
  fila.actualizado_en = null;
  fila.borrada_en = null;

  try {
    await almacen.extracciones.poner(fila);
  } catch (error) {
    return respuesta(422, { errores: [t("base_rechaza_fila", { error: error.message })] });
  }

  // Sin bolsa no hay serie: el motor solo ve la taza recién escrita. Dos
  // extracciones sueltas son cafés distintos y emparejarlas mentiría.
  const historico = (await almacen.extracciones.listar())
    .filter((e) => !e.borrada_en && (cafe ? e.cafe_id === cafe.id : e.id === fila.id))
    .sort(cronologico)
    .map((e) => conDerivados(e, cafes, recetas));
  const mia = historico.find((e) => e.id === fila.id) ?? conDerivados(fila, cafes, recetas);
  const sugerencia = sugerir(mia, historico, receta, t);
  const resumen = textoCorto(sugerencia, t);

  /*
   * Si no dijiste qué tocar en la siguiente, se guarda lo que propone el
   * motor. Solo cuando el campo viene vacío: lo que tú escribes manda.
   */
  if (!mia.siguiente_ajuste && resumen) {
    await almacen.extracciones.actualizar(fila.id, { siguiente_ajuste: resumen });
    mia.siguiente_ajuste = resumen;
  }

  return respuesta(201, {
    extraccion: mia,
    cafe: cafe?.nombre ?? null,
    sugerencias: { ...sugerencia, resumen },
  });
}

export async function editarExtraccion(almacen, id, cuerpo, { t = CASTELLANO } = {}) {
  const guardada = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!guardada) return respuesta(404, { errores: [t("extraccion_no_existe", { id })] });

  const { valores, errores } = validarCambiosExtraccion(cuerpo, { t });
  if (errores.length) return respuesta(422, { errores });

  // Atar la extracción a otra bolsa acepta uuid o slug, como el alta; vacío
  // ya llegó como null de la validación y significa quitársela.
  if (valores.cafe_id) {
    const cafe = porRef(await almacen.cafes.listar(), valores.cafe_id);
    if (!cafe) return respuesta(422, { errores: [t("cafe_desconocido", { valor: valores.cafe_id })] });
    valores.cafe_id = cafe.id;
  }

  /*
   * Con quién compara esta taza, que depende de en qué bolsa acabe.
   *
   * Sin bolsa no hay serie, y mudarla de bolsa se lleva su linaje por delante:
   * la madre era de la bolsa vieja y el tueste es lo que hace la taza. Las dos
   * cosas en silencio serían un efecto secundario; van escritas y salen en
   * `cambiado`.
   */
  const bolsaFinal = valores.cafe_id !== undefined ? valores.cafe_id : guardada.cafe_id;
  const mudaDeBolsa = valores.cafe_id !== undefined && valores.cafe_id !== guardada.cafe_id;
  if (!bolsaFinal && (guardada.desde_id || valores.desde_id)) {
    valores.desde_id = null;
  } else if (mudaDeBolsa && valores.desde_id === undefined && guardada.desde_id) {
    valores.desde_id = null;
  }

  if (valores.desde_id) {
    const madre = (await almacen.extracciones.listar())
      .find((e) => e.id === valores.desde_id);
    // Anterior a ésta, además de suya: no se puede ser variación de algo que
    // se hizo después, y así dos filas no pueden apuntarse la una a la otra.
    if (!madre || madre.cafe_id !== bolsaFinal || cronologico(madre, guardada) >= 0) {
      return respuesta(422, {
        errores: [t("desde_id_no_vale", { valor: valores.desde_id })],
      });
    }
  }

  // Aquí hace falta la fila: el agua puede venir en este PATCH o llevar
  // guardada desde el alta, y cualquiera de las dos manda sobre lo extraído.
  const imposible = extraidoImposible(
    valores.extraido_g !== undefined ? valores.extraido_g : guardada.extraido_g,
    valores.agua_g !== undefined ? valores.agua_g : guardada.agua_g,
    t,
  );
  if (imposible) return respuesta(422, { errores: [imposible] });

  // Y lo mismo con el goteo, por el mismo motivo: corregir el tiempo total a
  // mano dejando el goteo quieto —o al revés— es exactamente cómo se rompe la
  // fila, porque no son dos medidas independientes.
  const goteoMalo = goteoImposible(
    valores.drawdown_s !== undefined ? valores.drawdown_s : guardada.drawdown_s,
    valores.tiempo_total !== undefined ? valores.tiempo_total : guardada.tiempo_total,
    t,
  );
  if (goteoMalo) return respuesta(422, { errores: [goteoMalo] });

  const columnas = CAMPOS.filter((c) => valores[c] !== undefined);
  const cambios = {};
  for (const campo of columnas) cambios[campo] = valores[campo];
  cambios.actualizado_en = ahoraSQL();

  try {
    await almacen.extracciones.actualizar(id, cambios);
  } catch (error) {
    return respuesta(422, { errores: [t("base_rechaza_cambio", { error: error.message })] });
  }

  const [cafes, recetas, todas] = await Promise.all([
    almacen.cafes.listar(), almacen.recetas.listar(), almacen.extracciones.listar(),
  ]);
  const fila = todas.find((e) => e.id === id);
  const extraccion = conDerivados(fila, cafes, recetas);

  /*
   * Los avisos también al corregir, y no solo al dar de alta: la fila que
   * motivó todo esto se rompió justo aquí, arreglando el tiempo total a mano y
   * dejando el goteo como estaba. Uno que solo mirase los altas no habría visto
   * nada. Las palancas no vienen: cambian el molinillo de la próxima taza y
   * corregir una fila vieja no es motivo para replantearla.
   */
  const historico = todas
    .filter((e) => !e.borrada_en && (fila.cafe_id ? e.cafe_id === fila.cafe_id : e.id === fila.id))
    .sort(cronologico)
    .map((e) => conDerivados(e, cafes, recetas));
  const receta = recetas.find((r) => r.id === fila.receta_id) ?? null;

  return respuesta(200, {
    extraccion,
    cambiado: columnas,
    avisos: avisosDe(extraccion, historico, receta, t),
  });
}

export async function retirarExtraccion(almacen, id, { t = CASTELLANO } = {}) {
  const fila = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!fila) return respuesta(404, { errores: [t("extraccion_no_existe", { id })] });
  if (fila.borrada_en) return respuesta(200, { retirada: true, ya_estaba: true });

  await almacen.extracciones.actualizar(id, {
    borrada_en: ahoraSQL(),
    actualizado_en: ahoraSQL(),
  });

  /*
   * Las que colgaban de ella se quedan sin base de comparación. No se rompe
   * nada —`desde_id` sigue apuntando y la fila sigue ahí—, pero dejan de
   * formar par, y eso es correcto: retirar significa «esto fue un error de
   * registro» y un delta medido contra un error no vale nada.
   *
   * Se dice, no se impide. A diferencia del 409 que protege a las recetas en
   * uso, esto se deshace: restaurarla devuelve los pares sola.
   */
  const huerfanas = (await almacen.extracciones.listar())
    .filter((e) => !e.borrada_en && e.desde_id === id).length;
  return respuesta(200, { retirada: true, id, huerfanas });
}

export async function restaurarExtraccion(almacen, id, { t = CASTELLANO } = {}) {
  const fila = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!fila) return respuesta(404, { errores: [t("extraccion_no_existe", { id })] });

  await almacen.extracciones.actualizar(id, { borrada_en: null, actualizado_en: ahoraSQL() });
  const [cafes, recetas, todas] = await Promise.all([
    almacen.cafes.listar(), almacen.recetas.listar(), almacen.extracciones.listar(),
  ]);
  const devuelta = todas.find((e) => e.id === id);
  return respuesta(200, { extraccion: conDerivados(devuelta, cafes, recetas) });
}
