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
import { sugerir, textoCorto } from "./sugerencias.js";
import {
  CAMPOS, CAMPOS_CAFE, extraidoImposible, validarCafe,
  validarCambiosExtraccion, validarExtraccion, validarReceta,
} from "./validacion.js";

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

export async function crearCafe(almacen, cuerpo) {
  const { valores, errores } = validarCafe(cuerpo, { nuevo: true });
  if (errores.length) return respuesta(422, { errores });

  const existentes = await almacen.cafes.listar();
  valores.id = uuidv7();
  valores.slug = slugLibre(existentes, valores.slug);
  valores.creado_en = ahoraSQL();
  valores.actualizado_en = valores.creado_en;
  valores.foto = null;

  const fila = {};
  for (const campo of ["id", "slug", ...CAMPOS_CAFE, "foto", "creado_en", "actualizado_en"]) {
    fila[campo] = valores[campo] ?? null;
  }

  try {
    await almacen.cafes.poner(fila);
  } catch (error) {
    return respuesta(422, { errores: [`la base rechazó la bolsa: ${error.message}`] });
  }
  const cafe = porRef(await almacen.cafes.listar(), fila.id);
  return respuesta(201, { cafe });
}

export async function editarCafe(almacen, ref, cuerpo) {
  const cafe = porRef(await almacen.cafes.listar(), ref);
  if (!cafe) return respuesta(404, { errores: [`no existe ningún café '${ref}'`] });

  const { valores, errores } = validarCafe(cuerpo, { nuevo: false });
  if (errores.length) return respuesta(422, { errores });

  const columnas = CAMPOS_CAFE.filter((c) => valores[c] !== undefined);
  const cambios = {};
  for (const campo of columnas) cambios[campo] = valores[campo];
  cambios.actualizado_en = ahoraSQL();

  try {
    await almacen.cafes.actualizar(cafe.id, cambios);
  } catch (error) {
    return respuesta(422, { errores: [`la base rechazó el cambio: ${error.message}`] });
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

export async function guionDe(almacen, ref, aguaCruda) {
  const receta = porRef(await almacen.recetas.listar(), ref);
  const agua = Number(aguaCruda || 300);
  const pasos = receta?.pasos ?? [];
  if (!pasos.length) return respuesta(404, { error: `la receta ${ref} no tiene pasos` });
  try {
    return respuesta(200, guion(pasos, agua));
  } catch (error) {
    return respuesta(422, { error: error.message });
  }
}

export async function guardarReceta(almacen, { ref, nuevo }, cuerpo) {
  const { receta, pasos, errores } = validarReceta(cuerpo, { nuevo });
  if (errores.length) return respuesta(422, { errores });

  const existentes = await almacen.recetas.listar();
  let fila;
  if (nuevo) {
    const sello = ahoraSQL();
    fila = {
      id: uuidv7(),
      slug: slugLibre(existentes, receta.slug),
      nombre: receta.nombre,
      ratio: receta.ratio,
      notas: receta.notas,
      creado_en: sello,
      actualizado_en: sello,
    };
  } else {
    const existe = porRef(existentes, ref);
    if (!existe) return respuesta(404, { errores: [`no existe la receta '${ref}'`] });
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
    return respuesta(422, { errores: [`la base rechazó la receta: ${error.message}`] });
  }
  const guardada = porRef(await almacen.recetas.listar(), fila.id);
  return respuesta(nuevo ? 201 : 200, { receta: guardada });
}

export async function borrarReceta(almacen, ref) {
  const existe = porRef(await almacen.recetas.listar(), ref);
  if (!existe) return respuesta(404, { errores: [`no existe la receta '${ref}'`] });

  // Retiradas incluidas: siguen apuntando, y sin la fila no habría forma de
  // saber con qué se preparó aquella taza.
  const usos = (await almacen.extracciones.listar())
    .filter((e) => e.receta_id === existe.id).length;
  if (usos) {
    const cuantas = usos === 1 ? "1 extracción" : `${usos} extracciones`;
    return respuesta(409, {
      errores: [
        `la receta '${existe.slug}' la usan ${cuantas}, retiradas incluidas: no se puede borrar, ` +
          "edítala o déjala ahí sin usarla",
      ],
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

export async function crearExtraccion(almacen, cuerpo) {
  const { valores, errores } = validarExtraccion(cuerpo);
  if (errores.length) return respuesta(422, { errores });

  // cafe_id y receta_id llegan como uuid desde la app o como slug desde curl:
  // se resuelven aquí y a la fila van siempre los uuid.
  const cafes = await almacen.cafes.listar();
  const cafe = porRef(cafes, valores.cafe_id);
  if (!cafe) return respuesta(422, { errores: [`cafe_id desconocido: ${valores.cafe_id}`] });
  valores.cafe_id = cafe.id;

  const recetas = await almacen.recetas.listar();
  const receta = porRef(recetas, valores.receta_id);
  const pasos = receta?.pasos ?? [];
  if (!pasos.length) {
    return respuesta(422, { errores: [`la receta ${valores.receta_id} no tiene pasos`] });
  }
  valores.receta_id = receta.id;

  // El reparto sale de escalar las fases de la receta al agua real, salvo que
  // ese día te desviaras y lo mandes explícito.
  if (!valores.reparto) valores.reparto = repartoDe(pasos, valores.agua_g);

  // La id nace aquí de momento; con el modo local la traerá puesta el cliente.
  valores.id = uuidv7();
  valores.creado_en = ahoraSQL();

  const fila = {};
  for (const campo of ["id", ...CAMPOS, "creado_en"]) {
    fila[campo] = valores[campo] ?? null;
  }
  fila.actualizado_en = null;
  fila.borrada_en = null;

  try {
    await almacen.extracciones.poner(fila);
  } catch (error) {
    return respuesta(422, { errores: [`la base rechazó la fila: ${error.message}`] });
  }

  const historico = (await almacen.extracciones.listar())
    .filter((e) => !e.borrada_en && e.cafe_id === cafe.id)
    .sort(cronologico)
    .map((e) => conDerivados(e, cafes, recetas));
  const mia = historico.find((e) => e.id === fila.id) ?? conDerivados(fila, cafes, recetas);
  const sugerencia = sugerir(mia, historico);
  const resumen = textoCorto(sugerencia);

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
    cafe: cafe.nombre,
    sugerencias: { ...sugerencia, resumen },
  });
}

export async function editarExtraccion(almacen, id, cuerpo) {
  const guardada = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!guardada) return respuesta(404, { errores: [`no existe la extracción ${id}`] });

  const { valores, errores } = validarCambiosExtraccion(cuerpo);
  if (errores.length) return respuesta(422, { errores });

  // Aquí hace falta la fila: el agua puede venir en este PATCH o llevar
  // guardada desde el alta, y cualquiera de las dos manda sobre lo extraído.
  const imposible = extraidoImposible(
    valores.extraido_g !== undefined ? valores.extraido_g : guardada.extraido_g,
    valores.agua_g !== undefined ? valores.agua_g : guardada.agua_g,
  );
  if (imposible) return respuesta(422, { errores: [imposible] });

  const columnas = CAMPOS.filter((c) => valores[c] !== undefined);
  const cambios = {};
  for (const campo of columnas) cambios[campo] = valores[campo];
  cambios.actualizado_en = ahoraSQL();

  try {
    await almacen.extracciones.actualizar(id, cambios);
  } catch (error) {
    return respuesta(422, { errores: [`la base rechazó el cambio: ${error.message}`] });
  }

  const [cafes, recetas, todas] = await Promise.all([
    almacen.cafes.listar(), almacen.recetas.listar(), almacen.extracciones.listar(),
  ]);
  const fila = todas.find((e) => e.id === id);
  return respuesta(200, { extraccion: conDerivados(fila, cafes, recetas), cambiado: columnas });
}

export async function retirarExtraccion(almacen, id) {
  const fila = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!fila) return respuesta(404, { errores: [`no existe la extracción ${id}`] });
  if (fila.borrada_en) return respuesta(200, { retirada: true, ya_estaba: true });

  await almacen.extracciones.actualizar(id, {
    borrada_en: ahoraSQL(),
    actualizado_en: ahoraSQL(),
  });
  return respuesta(200, { retirada: true, id });
}

export async function restaurarExtraccion(almacen, id) {
  const fila = (await almacen.extracciones.listar()).find((e) => e.id === id);
  if (!fila) return respuesta(404, { errores: [`no existe la extracción ${id}`] });

  await almacen.extracciones.actualizar(id, { borrada_en: null, actualizado_en: ahoraSQL() });
  const [cafes, recetas, todas] = await Promise.all([
    almacen.cafes.listar(), almacen.recetas.listar(), almacen.extracciones.listar(),
  ]);
  const devuelta = todas.find((e) => e.id === id);
  return respuesta(200, { extraccion: conDerivados(devuelta, cafes, recetas) });
}
