/**
 * Bitácora de café: la API y la app, servidas por el mismo Worker.
 *
 * `/api/*` lo atiende este script; todo lo demás sale de los estáticos de la
 * app (binding ASSETS). Al compartir origen no hace falta CORS en ninguna
 * parte, y el token puede acabar en una cookie httpOnly.
 *
 * Desde la fase del puerto, aquí queda solo lo que es del servidor: la
 * autorización, la sesión, las fotos en R2 y el enrutado. Los manejadores
 * viven en @coffee/nucleo/api y hablan con un almacén — este los enchufa a D1
 * y envuelve sus {estado, datos} en Response; el modo local los enchufará a
 * IndexedDB con el mismo contrato.
 */
import {
  ahoraSQL, borrarReceta, crearCafe, crearExtraccion, editarCafe,
  editarExtraccion, guardarReceta, guionDe, listaCafes, listaExtracciones,
  listaRecetas, porRef, restaurarExtraccion, retirarExtraccion,
} from "@coffee/nucleo/api";
import { esUuid } from "@coffee/nucleo/ids";
import { claveDeFoto, validarFoto } from "@coffee/nucleo/validacion";

import { almacenD1 } from "./almacen-d1.js";
import { autorizado, cabeceraDeCierre, cabeceraDeSesion, coincide } from "./auth.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos, null, 2), {
    status: estado,
    headers: { ...JSON_HEADERS, ...cabeceras },
  });
}

/** Un {estado, datos} del núcleo, envuelto en Response. */
const respuesta = ({ estado, datos }) => json(datos, estado);

/** El cuerpo JSON, o null si no lo es: el 400 lo pone quien llama. */
async function cuerpoDe(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Función y no constante: workerd no deja construir un Response en el ámbito
// global, solo dentro de un manejador.
const sinJson = () => json({ error: "el cuerpo debe ser JSON" }, 400);

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

  const cuerpo = await cuerpoDe(request);
  if (cuerpo === null) return sinJson();

  const token = String(cuerpo?.token || "").trim();
  const esperado = String(env.TOKEN_ESCRITURA || "").trim();
  if (!esperado || !coincide(token, esperado)) {
    return json({ error: "token incorrecto" }, 401);
  }

  return json({ activa: true }, 200, { "set-cookie": cabeceraDeSesion(token, { seguro }) });
}

/**
 * Sube o reemplaza la foto de la bolsa. El cuerpo es la imagen tal cual, sin
 * JSON ni multipart; el tipo va en la cabecera content-type.
 *
 * Las fotos son del Worker y no del núcleo a propósito: R2 no existe en el
 * modo local. La columna `foto` guarda la clave del objeto y la URL pública
 * es `/api/` + clave. Cada subida estrena clave, así que primero entra el
 * objeto nuevo, luego la columna, y la foto anterior se borra al final: en
 * ningún momento la ficha apunta a un objeto que no exista.
 */
async function subirFoto(request, env, almacen, ref) {
  const cafe = porRef(await almacen.cafes.listar(), ref);
  if (!cafe) return json({ errores: [`no existe ningún café '${ref}'`] }, 404);

  const cuerpo = await request.arrayBuffer();
  const foto = validarFoto(request.headers.get("content-type"), cuerpo.byteLength);
  if (foto.error) return json({ errores: [foto.error] }, foto.estado);

  // La clave lleva el slug, que se puede leer; el uuid no aporta nada ahí.
  const clave = claveDeFoto(cafe.slug, foto.extension);
  await env.FOTOS.put(clave, cuerpo, { httpMetadata: { contentType: foto.tipo } });

  try {
    await almacen.cafes.actualizar(cafe.id, { foto: clave, actualizado_en: ahoraSQL() });
  } catch (error) {
    await env.FOTOS.delete(clave); // que la base diga que no, sin dejar huérfano
    return json({ errores: [`la base rechazó la foto: ${error.message}`] }, 422);
  }
  if (cafe.foto && cafe.foto !== clave) await env.FOTOS.delete(cafe.foto);

  const actualizado = porRef(await almacen.cafes.listar(), cafe.id);
  return json({ cafe: actualizado }, 201);
}

/** Quita la foto de la bolsa: la columna a NULL y el objeto fuera. */
async function quitarFoto(env, almacen, ref) {
  const cafe = porRef(await almacen.cafes.listar(), ref);
  if (!cafe) return json({ errores: [`no existe ningún café '${ref}'`] }, 404);
  if (!cafe.foto) return json({ quitada: true, ya_estaba: true });

  await almacen.cafes.actualizar(cafe.id, { foto: null, actualizado_en: ahoraSQL() });
  await env.FOTOS.delete(cafe.foto);

  const actualizado = porRef(await almacen.cafes.listar(), cafe.id);
  return json({ cafe: actualizado, quitada: true });
}

// Claves tal y como las genera claveDeFoto: ni escapes ni subcarpetas.
const CLAVE_FOTO = /^fotos\/[a-z0-9_-]+-\d+\.(jpg|png|webp)$/;

async function servirFoto(env, clave) {
  if (!CLAVE_FOTO.test(clave)) return json({ error: "ruta no encontrada" }, 404);

  const objeto = await env.FOTOS.get(clave);
  if (!objeto) return json({ error: "no hay foto con esa clave" }, 404);

  return new Response(objeto.body, {
    headers: {
      "content-type": objeto.httpMetadata?.contentType || "application/octet-stream",
      etag: objeto.httpEtag,
      // La clave cambia con cada subida, así que este contenido no caduca.
      // `private` desde que las fotos van tras el portero: que las guarde el
      // navegador de quien tiene sesión, no una caché compartida.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

async function enrutar(request, env, url, ruta) {
  if (ruta === "/api/sesion") return await sesion(request, env, url);

  /*
   * Un solo portero para todo lo demás, lecturas incluidas. Los GET fueron
   * públicos mientras esto era una bitácora que enseñar; camino de abrir la
   * app a más gente es al revés: la app será de cualquiera y los datos de
   * este servidor son míos. Solo /api/sesion queda fuera, que es la puerta.
   */
  if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);

  const almacen = almacenD1(env.DB);

  if (ruta === "/api/recetas" && request.method === "POST") {
    const cuerpo = await cuerpoDe(request);
    if (cuerpo === null) return sinJson();
    return respuesta(await guardarReceta(almacen, { nuevo: true }, cuerpo));
  }

  if (ruta.startsWith("/api/recetas/") && request.method === "PUT") {
    const ref = decodeURIComponent(ruta.slice("/api/recetas/".length));
    const cuerpo = await cuerpoDe(request);
    if (cuerpo === null) return sinJson();
    return respuesta(await guardarReceta(almacen, { ref, nuevo: false }, cuerpo));
  }

  if (ruta.startsWith("/api/recetas/") && request.method === "DELETE") {
    return respuesta(await borrarReceta(almacen, decodeURIComponent(ruta.slice("/api/recetas/".length))));
  }

  if (ruta.startsWith("/api/extracciones/")) {
    const resto = ruta.slice("/api/extracciones/".length);
    const [crudo, accion] = resto.split("/");
    const id = decodeURIComponent(crudo).toLowerCase();
    if (!esUuid(id)) {
      return json({ error: "id de extracción inválido: se espera el uuid" }, 400);
    }

    if (accion === "restaurar" && request.method === "POST") {
      return respuesta(await restaurarExtraccion(almacen, id));
    }
    if (!accion && request.method === "PATCH") {
      const cuerpo = await cuerpoDe(request);
      if (cuerpo === null) return sinJson();
      return respuesta(await editarExtraccion(almacen, id, cuerpo));
    }
    if (!accion && request.method === "DELETE") {
      return respuesta(await retirarExtraccion(almacen, id));
    }
  }

  if (ruta === "/api/cafes" && request.method === "POST") {
    const cuerpo = await cuerpoDe(request);
    if (cuerpo === null) return sinJson();
    return respuesta(await crearCafe(almacen, cuerpo));
  }

  if (ruta.startsWith("/api/cafes/") && ruta.endsWith("/foto")) {
    const ref = decodeURIComponent(ruta.slice("/api/cafes/".length, -"/foto".length));
    if (request.method === "PUT") return await subirFoto(request, env, almacen, ref);
    if (request.method === "DELETE") return await quitarFoto(env, almacen, ref);
  }

  if (ruta.startsWith("/api/cafes/") && request.method === "PATCH") {
    const ref = decodeURIComponent(ruta.slice("/api/cafes/".length));
    const cuerpo = await cuerpoDe(request);
    if (cuerpo === null) return sinJson();
    return respuesta(await editarCafe(almacen, ref, cuerpo));
  }

  if (request.method === "GET") {
    if (ruta.startsWith("/api/fotos/")) {
      return await servirFoto(env, ruta.slice("/api/".length));
    }
    if (ruta === "/api/guion") {
      return respuesta(
        await guionDe(almacen, url.searchParams.get("receta"), url.searchParams.get("agua")),
      );
    }
    if (ruta === "/api/cafes") return respuesta(await listaCafes(almacen));
    if (ruta === "/api/recetas") return respuesta(await listaRecetas(almacen));
    if (ruta === "/api/extracciones") {
      return respuesta(await listaExtracciones(almacen, {
        cafe: url.searchParams.get("cafe"),
        retiradas: Boolean(url.searchParams.get("retiradas")),
      }));
    }
  }

  if (request.method === "POST" && ruta === "/api/extracciones") {
    const cuerpo = await cuerpoDe(request);
    if (cuerpo === null) return sinJson();
    return respuesta(await crearExtraccion(almacen, cuerpo));
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
