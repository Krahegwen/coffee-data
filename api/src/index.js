/**
 * API de la bitácora sobre D1.
 *
 * La app nunca habla con la base directamente ni sabe de SQL: manda una
 * extracción en JSON y aquí se valida, se compone y se inserta. Ese contrato
 * es lo que permite cambiar de método de autenticación sin tocar la app.
 */
import { autorizado } from "./auth.js";
import { repartoDe } from "./recetas.js";
import { sugerir, textoCorto } from "./sugerencias.js";
import { CAMPOS, validarExtraccion } from "./validacion.js";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(datos, estado = 200, cabeceras = {}) {
  return new Response(JSON.stringify(datos, null, 2), {
    status: estado,
    headers: { ...JSON_HEADERS, ...cabeceras },
  });
}

function cors(env) {
  const origen = env.ORIGEN_PERMITIDO || "*";
  return {
    "access-control-allow-origin": origen,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
  };
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
    cors(env),
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    try {
      if (request.method === "GET") {
        if (ruta === "/api/cafes") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM cafes ORDER BY estado, nombre",
          ).all();
          return json(results, 200, cors(env));
        }
        if (ruta === "/api/recetas") {
          const { results } = await env.DB.prepare(
            "SELECT * FROM recetas ORDER BY id",
          ).all();
          const conPasos = await Promise.all(
            results.map(async (receta) => ({ ...receta, pasos: await pasosDe(env, receta.id) })),
          );
          return json(conPasos, 200, cors(env));
        }
        if (ruta === "/api/extracciones") {
          const cafeId = url.searchParams.get("cafe");
          const consulta = cafeId
            ? env.DB.prepare("SELECT * FROM v_extracciones WHERE cafe_id = ? ORDER BY id DESC").bind(cafeId)
            : env.DB.prepare("SELECT * FROM v_extracciones ORDER BY id DESC");
          const { results } = await consulta.all();
          return json(results, 200, cors(env));
        }
      }

      if (request.method === "POST" && ruta === "/api/extracciones") {
        if (!autorizado(request, env)) return json({ error: "no autorizado" }, 401);
        return await crearExtraccion(request, env);
      }

      return json({ error: "ruta no encontrada" }, 404, cors(env));
    } catch (error) {
      return json({ error: error.message }, 500, cors(env));
    }
  },
};
