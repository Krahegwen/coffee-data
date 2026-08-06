/**
 * Bitácora de café: la API y la app, servidas por el mismo Worker.
 *
 * `/api/*` lo atiende este script; todo lo demás sale de los estáticos de la
 * app (binding ASSETS). Al compartir origen no hace falta CORS en ninguna
 * parte, y el token puede acabar en una cookie httpOnly.
 *
 * La app nunca habla con la base directamente ni sabe de SQL: manda una
 * extracción en JSON y aquí se valida, se compone y se inserta. Ese contrato
 * es lo que permite cambiar de método de autenticación sin tocar la app.
 */
import { autorizado, cabeceraDeCierre, cabeceraDeSesion, coincide } from "./auth.js";
import { guion, repartoDe } from "./recetas.js";
import { sugerir, textoCorto } from "./sugerencias.js";
import {
  CAMPOS, CAMPOS_CAFE, claveDeFoto, validarCafe, validarCambiosExtraccion,
  validarExtraccion, validarFoto, validarReceta,
} from "./validacion.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos, null, 2), {
    status: estado,
    headers: { ...JSON_HEADERS, ...cabeceras },
  });
}

async function pasosDe(env, recetaId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM pasos WHERE receta_id = ? ORDER BY orden",
  )
    .bind(recetaId)
    .all();
  return results;
}

async function historicoDe(env, cafeId) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM v_extracciones WHERE cafe_id = ? ORDER BY id",
  )
    .bind(cafeId)
    .all();
  return results;
}

async function crearExtraccion(request, env) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const { valores, errores } = validarExtraccion(cuerpo);
  if (errores.length) return json({ errores }, 422);

  const cafe = await env.DB.prepare("SELECT id, nombre FROM cafes WHERE id = ?")
    .bind(valores.cafe_id)
    .first();
  if (!cafe) return json({ errores: [`cafe_id desconocido: ${valores.cafe_id}`] }, 422);

  const pasos = await pasosDe(env, valores.receta_id);
  if (!pasos.length) {
    return json({ errores: [`la receta ${valores.receta_id} no tiene pasos`] }, 422);
  }

  // El reparto sale de escalar las fases de la receta al agua real, salvo que
  // ese día te desviaras y lo mandes explícito.
  if (!valores.reparto) valores.reparto = repartoDe(pasos, valores.agua_g);

  const columnas = CAMPOS.filter((c) => valores[c] !== undefined);
  const marcadores = columnas.map(() => "?").join(", ");
  let creada;
  try {
    creada = await env.DB.prepare(
      `INSERT INTO extracciones (${columnas.join(", ")}) VALUES (${marcadores}) RETURNING id`,
    )
      .bind(...columnas.map((c) => valores[c]))
      .first();
  } catch (error) {
    return json({ errores: [`la base rechazó la fila: ${error.message}`] }, 422);
  }

  const historico = await historicoDe(env, valores.cafe_id);
  const fila = historico.find((e) => e.id === creada.id) ?? { ...valores, id: creada.id };
  const sugerencia = sugerir(fila, historico);

  return json(
    {
      extraccion: fila,
      cafe: cafe.nombre,
      sugerencias: { ...sugerencia, resumen: textoCorto(sugerencia) },
    },
    201,
  );
}

/**
 * Abre o cierra la sesión. El token viaja una sola vez, en el cuerpo, y a
 * partir de ahí lo lleva una cookie HttpOnly que el JavaScript no puede leer.
 */
async function sesion(request, env, url) {
  const seguro = url.protocol === "https:";

  if (request.method === "GET") {
    return json({ activa: autorizado(request, env) });
  }

  if (request.method === "DELETE") {
    return json({ activa: false }, 200, { "set-cookie": cabeceraDeCierre({ seguro }) });
  }

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const token = String(cuerpo?.token || "").trim();
  const esperado = String(env.TOKEN_ESCRITURA || "").trim();
  if (!esperado || !coincide(token, esperado)) {
    return json({ error: "token incorrecto" }, 401);
  }

  return json({ activa: true }, 200, { "set-cookie": cabeceraDeSesion(token, { seguro }) });
}

/** Da de alta una bolsa. */
async function crearCafe(request, env) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const { valores, errores } = validarCafe(cuerpo, { nuevo: true });
  if (errores.length) return json({ errores }, 422);

  const derivado = cuerpo?.id === undefined || String(cuerpo.id).trim() === "";
  const existe = await env.DB.prepare("SELECT id FROM cafes WHERE id = ?")
    .bind(valores.id)
    .first();
  if (existe) {
    // Si el id lo mandaron a propósito, el choque es un error suyo. Si lo
    // derivamos del nombre, la segunda bolsa del mismo café es normal:
    // gary, gary_2, gary_3.
    if (!derivado) {
      return json({ errores: [`ya existe un café con id '${valores.id}'`] }, 409);
    }
    const base = valores.id;
    let n = 2;
    let libre = `${base}_${n}`;
    // eslint-disable-next-line no-await-in-loop
    while (await env.DB.prepare("SELECT id FROM cafes WHERE id = ?").bind(libre).first()) {
      n += 1;
      libre = `${base}_${n}`;
    }
    valores.id = libre;
  }

  const columnas = CAMPOS_CAFE.filter((c) => valores[c] !== undefined);
  const marcadores = columnas.map(() => "?").join(", ");
  try {
    await env.DB.prepare(
      `INSERT INTO cafes (${columnas.join(", ")}) VALUES (${marcadores})`,
    )
      .bind(...columnas.map((c) => valores[c]))
      .run();
  } catch (error) {
    return json({ errores: [`la base rechazó la bolsa: ${error.message}`] }, 422);
  }

  const cafe = await env.DB.prepare("SELECT * FROM cafes WHERE id = ?").bind(valores.id).first();
  return json({ cafe }, 201);
}

/** Corrige una ficha ya existente. Solo toca los campos que vengan. */
async function editarCafe(request, env, id) {
  const cafe = await env.DB.prepare("SELECT id FROM cafes WHERE id = ?").bind(id).first();
  if (!cafe) return json({ errores: [`no existe ningún café con id '${id}'`] }, 404);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const { valores, errores } = validarCafe(cuerpo, { nuevo: false });
  if (errores.length) return json({ errores }, 422);

  // Los nombres de columna salen de una lista blanca; los valores van atados.
  const columnas = CAMPOS_CAFE.filter((c) => valores[c] !== undefined);
  const asignaciones = columnas.map((c) => `${c} = ?`).join(", ");
  try {
    await env.DB.prepare(`UPDATE cafes SET ${asignaciones} WHERE id = ?`)
      .bind(...columnas.map((c) => valores[c]), id)
      .run();
  } catch (error) {
    return json({ errores: [`la base rechazó el cambio: ${error.message}`] }, 422);
  }

  const actualizado = await env.DB.prepare("SELECT * FROM cafes WHERE id = ?").bind(id).first();
  return json({ cafe: actualizado, cambiado: columnas });
}

/**
 * Sube o reemplaza la foto de la bolsa. El cuerpo es la imagen tal cual, sin
 * JSON ni multipart; el tipo va en la cabecera content-type.
 *
 * La columna `foto` guarda la clave del objeto y la URL pública es
 * `/api/` + clave. Cada subida estrena clave, así que primero entra el objeto
 * nuevo, luego la columna, y la foto anterior se borra al final: en ningún
 * momento la ficha apunta a un objeto que no exista.
 */
async function subirFoto(request, env, id) {
  const cafe = await env.DB.prepare("SELECT id, foto FROM cafes WHERE id = ?").bind(id).first();
  if (!cafe) return json({ errores: [`no existe ningún café con id '${id}'`] }, 404);

  const cuerpo = await request.arrayBuffer();
  const foto = validarFoto(request.headers.get("content-type"), cuerpo.byteLength);
  if (foto.error) return json({ errores: [foto.error] }, foto.estado);

  const clave = claveDeFoto(id, foto.extension);
  await env.FOTOS.put(clave, cuerpo, { httpMetadata: { contentType: foto.tipo } });

  try {
    await env.DB.prepare("UPDATE cafes SET foto = ? WHERE id = ?").bind(clave, id).run();
  } catch (error) {
    await env.FOTOS.delete(clave); // que la base diga que no, sin dejar huérfano
    return json({ errores: [`la base rechazó la foto: ${error.message}`] }, 422);
  }
  if (cafe.foto && cafe.foto !== clave) await env.FOTOS.delete(cafe.foto);

  const actualizado = await env.DB.prepare("SELECT * FROM cafes WHERE id = ?").bind(id).first();
  return json({ cafe: actualizado }, 201);
}

/** Quita la foto de la bolsa: la columna a NULL y el objeto fuera. */
async function quitarFoto(env, id) {
  const cafe = await env.DB.prepare("SELECT id, foto FROM cafes WHERE id = ?").bind(id).first();
  if (!cafe) return json({ errores: [`no existe ningún café con id '${id}'`] }, 404);
  if (!cafe.foto) return json({ quitada: true, ya_estaba: true });

  await env.DB.prepare("UPDATE cafes SET foto = NULL WHERE id = ?").bind(id).run();
  await env.FOTOS.delete(cafe.foto);

  const actualizado = await env.DB.prepare("SELECT * FROM cafes WHERE id = ?").bind(id).first();
  return json({ cafe: actualizado, quitada: true });
}

// Claves tal y como las genera claveDeFoto: ni escapes ni subcarpetas.
const CLAVE_FOTO = /^fotos\/[a-z0-9_-]+-\d+\.(jpg|png|webp)$/;

/** Sirve la foto desde R2. Lectura abierta, como el resto de los GET. */
async function servirFoto(env, clave) {
  if (!CLAVE_FOTO.test(clave)) return json({ error: "ruta no encontrada" }, 404);

  const objeto = await env.FOTOS.get(clave);
  if (!objeto) return json({ error: "no hay foto con esa clave" }, 404);

  return new Response(objeto.body, {
    headers: {
      "content-type": objeto.httpMetadata?.contentType || "application/octet-stream",
      etag: objeto.httpEtag,
      // La clave cambia con cada subida, así que este contenido no caduca.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

/** Corrige una extracción. Solo toca los campos que lleguen. */
async function editarExtraccion(request, env, id) {
  const existe = await env.DB.prepare("SELECT id FROM extracciones WHERE id = ?").bind(id).first();
  if (!existe) return json({ errores: [`no existe la extracción #${id}`] }, 404);

  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const { valores, errores } = validarCambiosExtraccion(cuerpo);
  if (errores.length) return json({ errores }, 422);

  const columnas = CAMPOS.filter((c) => valores[c] !== undefined);
  const asignaciones = columnas.map((c) => `${c} = ?`).join(", ");
  try {
    await env.DB.prepare(`UPDATE extracciones SET ${asignaciones} WHERE id = ?`)
      .bind(...columnas.map((c) => valores[c]), id)
      .run();
  } catch (error) {
    return json({ errores: [`la base rechazó el cambio: ${error.message}`] }, 422);
  }

  const fila = await env.DB.prepare("SELECT * FROM v_extracciones WHERE id = ?").bind(id).first();
  return json({ extraccion: fila, cambiado: columnas });
}

/**
 * Retira una extracción. Borrado lógico: la fila se queda, marcada con la
 * fecha, y deja de contar para las sugerencias. Se puede restaurar.
 */
async function retirarExtraccion(env, id) {
  const fila = await env.DB.prepare("SELECT id, borrada_en FROM extracciones WHERE id = ?")
    .bind(id)
    .first();
  if (!fila) return json({ errores: [`no existe la extracción #${id}`] }, 404);
  if (fila.borrada_en) return json({ retirada: true, ya_estaba: true });

  await env.DB.prepare("UPDATE extracciones SET borrada_en = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
  return json({ retirada: true, id });
}

async function restaurarExtraccion(env, id) {
  const fila = await env.DB.prepare("SELECT id, borrada_en FROM extracciones WHERE id = ?")
    .bind(id)
    .first();
  if (!fila) return json({ errores: [`no existe la extracción #${id}`] }, 404);

  await env.DB.prepare("UPDATE extracciones SET borrada_en = NULL WHERE id = ?").bind(id).run();
  const devuelta = await env.DB.prepare("SELECT * FROM v_extracciones WHERE id = ?")
    .bind(id)
    .first();
  return json({ extraccion: devuelta });
}

/**
 * Guarda una receta con sus pasos. Los pasos se reemplazan enteros, no se
 * parchean uno a uno: es como se editan en la app, viendo la lista completa.
 *
 * Todo en un batch: si un paso falla, no queda una receta a medias.
 */
async function guardarReceta(request, env, { id, nuevo }) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: "el cuerpo debe ser JSON" }, 400);
  }

  const { receta, pasos, errores } = validarReceta(cuerpo, { nuevo });
  if (errores.length) return json({ errores }, 422);

  const recetaId = nuevo ? receta.id : id;
  const existe = await env.DB.prepare("SELECT id FROM recetas WHERE id = ?").bind(recetaId).first();
  if (nuevo && existe) return json({ errores: [`ya existe una receta con id '${recetaId}'`] }, 409);
  if (!nuevo && !existe) return json({ errores: [`no existe la receta '${recetaId}'`] }, 404);

  const sentencias = [
    nuevo
      ? env.DB.prepare("INSERT INTO recetas (id, nombre, ratio, notas) VALUES (?, ?, ?, ?)")
          .bind(recetaId, receta.nombre, receta.ratio, receta.notas)
      : env.DB.prepare("UPDATE recetas SET nombre = ?, ratio = ?, notas = ? WHERE id = ?")
          .bind(receta.nombre, receta.ratio, receta.notas, recetaId),
    env.DB.prepare("DELETE FROM pasos WHERE receta_id = ?").bind(recetaId),
    ...pasos.map((p) =>
      env.DB.prepare(
        "INSERT INTO pasos (receta_id, orden, t_inicio_s, accion, agua_g, notas, estilo) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).bind(recetaId, p.orden, p.t_inicio_s, p.accion, p.agua_g, p.notas, p.estilo),
    ),
  ];

  try {
    await env.DB.batch(sentencias);
  } catch (error) {
    return json({ errores: [`la base rechazó la receta: ${error.message}`] }, 422);
  }

  const guardada = await env.DB.prepare("SELECT * FROM recetas WHERE id = ?").bind(recetaId).first();
  return json({ receta: { ...guardada, pasos: await pasosDe(env, recetaId) } }, nuevo ? 201 : 200);
}

/**
 * Borra una receta y sus pasos. Este borrado sí es de verdad, no lógico como
 * el de las extracciones: una receta no es un dato observado sino una
 * plantilla, y una plantilla retirada solo ensuciaría la lista.
 *
 * Se niega si alguna extracción la usa, retiradas incluidas: siguen
 * apuntando, y sin la fila no habría forma de saber con qué se preparó
 * aquella taza. Para eso está editarla, o dejarla ahí sin usarla.
 */
async function borrarReceta(env, id) {
  const existe = await env.DB.prepare("SELECT id FROM recetas WHERE id = ?").bind(id).first();
  if (!existe) return json({ errores: [`no existe la receta '${id}'`] }, 404);

  const usos = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM extracciones WHERE receta_id = ?",
  )
    .bind(id)
    .first();

  if (usos.total) {
    const cuantas = usos.total === 1 ? "1 extracción" : `${usos.total} extracciones`;
    return json(
      {
        errores: [
          `la receta '${id}' la usan ${cuantas}, retiradas incluidas: no se puede borrar, ` +
            "edítala o déjala ahí sin usarla",
        ],
      },
      409,
    );
  }

  await env.DB.batch([
    env.DB.prepare("DELETE FROM pasos WHERE receta_id = ?").bind(id),
    env.DB.prepare("DELETE FROM recetas WHERE id = ?").bind(id),
  ]);
  return json({ borrada: true, id });
}

async function enrutar(request, env, url, ruta) {
  if (ruta === "/api/sesion") return await sesion(request, env, url);

  if (ruta === "/api/recetas" && request.method === "POST") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    return await guardarReceta(request, env, { nuevo: true });
  }

  if (ruta.startsWith("/api/recetas/") && request.method === "PUT") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    const id = decodeURIComponent(ruta.slice("/api/recetas/".length));
    return await guardarReceta(request, env, { id, nuevo: false });
  }

  if (ruta.startsWith("/api/recetas/") && request.method === "DELETE") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    return await borrarReceta(env, decodeURIComponent(ruta.slice("/api/recetas/".length)));
  }

  if (ruta.startsWith("/api/extracciones/")) {
    const resto = ruta.slice("/api/extracciones/".length);
    const [crudo, accion] = resto.split("/");
    const id = Number(crudo);
    if (!Number.isInteger(id) || id <= 0) {
      return json({ error: "id de extracción inválido" }, 400);
    }
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);

    if (accion === "restaurar" && request.method === "POST") {
      return await restaurarExtraccion(env, id);
    }
    if (!accion && request.method === "PATCH") return await editarExtraccion(request, env, id);
    if (!accion && request.method === "DELETE") return await retirarExtraccion(env, id);
  }

  if (ruta === "/api/cafes" && request.method === "POST") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    return await crearCafe(request, env);
  }

  if (ruta.startsWith("/api/cafes/") && ruta.endsWith("/foto")) {
    const id = decodeURIComponent(ruta.slice("/api/cafes/".length, -"/foto".length));
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    if (request.method === "PUT") return await subirFoto(request, env, id);
    if (request.method === "DELETE") return await quitarFoto(env, id);
  }

  if (ruta.startsWith("/api/cafes/") && request.method === "PATCH") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    return await editarCafe(request, env, decodeURIComponent(ruta.slice("/api/cafes/".length)));
  }

  if (request.method === "GET") {
    if (ruta.startsWith("/api/fotos/")) {
      return await servirFoto(env, ruta.slice("/api/".length));
    }
    if (ruta === "/api/guion") {
      const recetaId = url.searchParams.get("receta");
      const agua = Number(url.searchParams.get("agua") || 300);
      const pasos = await pasosDe(env, recetaId ?? "");
      if (!pasos.length) {
        return json({ error: `la receta ${recetaId} no tiene pasos` }, 404);
      }
      try {
        return json(guion(pasos, agua));
      } catch (error) {
        return json({ error: error.message }, 422);
      }
    }
    if (ruta === "/api/cafes") {
      const { results } = await env.DB.prepare(
        "SELECT * FROM cafes ORDER BY estado, nombre",
      ).all();
      return json(results);
    }
    if (ruta === "/api/recetas") {
      const { results } = await env.DB.prepare("SELECT * FROM recetas ORDER BY id").all();
      const conPasos = await Promise.all(
        results.map(async (receta) => ({ ...receta, pasos: await pasosDe(env, receta.id) })),
      );
      return json(conPasos);
    }
    if (ruta === "/api/extracciones") {
      // ?retiradas=1 para mirar la papelera y poder restaurar.
      const vista = url.searchParams.get("retiradas")
        ? "v_extracciones_retiradas"
        : "v_extracciones";
      const cafeId = url.searchParams.get("cafe");
      const consulta = cafeId
        ? env.DB.prepare(`SELECT * FROM ${vista} WHERE cafe_id = ? ORDER BY id DESC`).bind(cafeId)
        : env.DB.prepare(`SELECT * FROM ${vista} ORDER BY id DESC`);
      const { results } = await consulta.all();
      return json(results);
    }
  }

  if (request.method === "POST" && ruta === "/api/extracciones") {
    if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
    return await crearExtraccion(request, env);
  }

  return json({ error: "ruta no encontrada" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";

    // Lo que no sea API lo sirven los estáticos de la app. En la práctica solo
    // llega aquí si un asset no existe, porque run_worker_first solo desvía
    // /api/*; se delega igualmente para que la app enrute en el cliente.
    if (!ruta.startsWith("/api")) return env.ASSETS.fetch(request);

    try {
      return await enrutar(request, env, url, ruta);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};
