/**
 * El respaldo: la bitácora entera en un ZIP, y el camino de vuelta.
 *
 * Dentro van los mismos CSV que `datos/` en el repo —mismas columnas, mismo
 * dialecto—, las fotos tal cual y un `manifiesto.json` con la versión del
 * formato: así un respaldo de un usuario se abre con las herramientas de
 * siempre, y los ZIP viejos podrán importarse en versiones nuevas.
 *
 * **Restaurar reemplaza, no fusiona.** Y antes de tocar el cajón, todo el
 * contenido pasa por los manejadores del núcleo contra un almacén en
 * memoria: la misma validación que un alta, el mismo tipado — un CSV solo
 * sabe de textos—. Si una sola fila no pasa, no se restaura nada.
 */
import { almacenEnMemoria } from "@coffee/nucleo/almacen-memoria";
import { crearCafe, crearExtraccion, guardarReceta, porRef } from "@coffee/nucleo/api";
import { derivar } from "@coffee/nucleo/derivar";
import { CAMPOS, SLUG, TIPOS_FOTO } from "@coffee/nucleo/validacion";

import { aCsv, deCsv } from "./csv.js";
import { escribirZip, leerZip } from "./zip.js";

export const FORMATO = 1;

/** A partir de cuántos días sin respaldo se avisa en la portada. */
export const DIAS_RESPALDO_VIEJO = 14;

/**
 * Un sello del cajón («2026-08-07 09:00:00», UTC sin decirlo) o un ISO, a
 * Date. El del cajón no se puede dar a `new Date` tal cual: Safari lo lee
 * NaN y el resto lo leería en hora local.
 */
const aFecha = (sello) => {
  if (sello.includes("T")) return new Date(sello);
  const iso = sello.includes(" ") ? sello.replace(" ", "T") : `${sello}T00:00:00`;
  return new Date(`${iso}Z`);
};

/**
 * Si toca recordar el respaldo, y cuánto hace del último: `{ dias, nunca }`,
 * o null mientras no toque.
 *
 * En local no hay servidor que guarde nada y el navegador puede decidir
 * limpiar el almacén — iOS lo hace a la semana de no visitar el sitio—, así
 * que una bitácora con historial y sin respaldo es una pérdida esperando
 * fecha. Se avisa desde que hay extracciones; si nunca hubo respaldo, los
 * días se cuentan desde la más antigua, que es lo que se perdería.
 */
export function avisoRespaldo({ ultimo, extracciones, ahora = new Date() }) {
  if (!extracciones.length) return null;
  const referencia =
    ultimo ?? extracciones.map((e) => e.creado_en).filter(Boolean).sort()[0];
  if (!referencia) return null;
  const dias = Math.floor((ahora - aFecha(referencia)) / 86_400_000);
  if (dias < DIAS_RESPALDO_VIEJO) return null;
  return { dias, nunca: !ultimo };
}

/* Las mismas columnas que escribe herramientas/exportar_csv.py. */
const COLUMNAS_CAFES = [
  "id", "slug", "nombre", "tostador", "origen", "region", "variedad",
  "proceso", "altitud_m", "sca", "fecha_tueste", "consumir_antes",
  "fecha_apertura", "peso_g", "precio_eur", "notas_tostador", "estado",
  "foto", "url", "conservacion", "creado_en",
];

const COLUMNAS_EXTRACCIONES = [
  "id", "fecha", "creado_en", "cafe_id", "cafe_slug", "dias_tueste",
  "dias_abierta", "dosis_g", "agua_g", "ratio", "temp_c", "molinillo",
  "clics", "metodo", "reparto", "tiempo_total", "extraido_g",
  "variable_cambiada", "defecto", "notas_cata", "nota", "siguiente_ajuste",
  "receta_id", "receta_slug", "drawdown_s", "dripper", "borrada_en",
  "desde_id",
];

const COLUMNAS_RECETAS = ["id", "slug", "nombre", "ratio", "notas", "creado_en"];
const COLUMNAS_PASOS = ["receta_id", "orden", "t_inicio_s", "accion", "estilo", "agua_g", "notas"];

/* JSON no distingue 15 de 15.0: el ratio va con un decimal, como en el repo. */
const FORMATOS = { ratio: (v) => Number(v).toFixed(1) };

const cronologico = (a, b) => {
  const ka = `${a.creado_en ?? ""}|${a.id}`;
  const kb = `${b.creado_en ?? ""}|${b.id}`;
  return ka < kb ? -1 : 1;
};

/**
 * La bitácora del cajón como ZIP. Devuelve { nombre, bytes, filas }.
 * `version` es la de la app, para el manifiesto.
 */
export async function crearRespaldo(almacen, { version = "", ahora = new Date() } = {}) {
  const utf8 = new TextEncoder();
  const [cafes, recetas, extracciones] = await Promise.all([
    almacen.cafes.listar(),
    almacen.recetas.listar(),
    almacen.extracciones.listar(),
  ]);

  cafes.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  recetas.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  extracciones.sort(cronologico);
  const pasos = recetas.flatMap((r) => [...r.pasos].sort((a, b) => a.orden - b.orden));

  // En el CSV van también los derivados y los slugs de al lado: lo lee un
  // humano, y un humano no resuelve uuids de cabeza. Al restaurar se ignoran.
  const filasExtracciones = extracciones.map((e) => {
    const cafe = cafes.find((c) => c.id === e.cafe_id) ?? null;
    return {
      ...derivar(e, cafe),
      cafe_slug: cafe?.slug ?? null,
      receta_slug: recetas.find((r) => r.id === e.receta_id)?.slug ?? null,
    };
  });

  const guardadas = almacen.fotos ? await almacen.fotos.listar() : [];
  const referidas = new Set(cafes.map((c) => c.foto).filter(Boolean));
  const fotos = guardadas.filter((f) => referidas.has(f.clave));

  const manifiesto = {
    formato: FORMATO,
    app: "coffee-data",
    version,
    creado: ahora.toISOString(),
    filas: {
      cafes: cafes.length,
      recetas: recetas.length,
      pasos: pasos.length,
      extracciones: extracciones.length,
      fotos: fotos.length,
    },
  };

  const entradas = [
    { nombre: "manifiesto.json", datos: utf8.encode(`${JSON.stringify(manifiesto, null, 2)}\n`) },
    { nombre: "cafes.csv", datos: utf8.encode(aCsv(cafes, COLUMNAS_CAFES, FORMATOS)) },
    { nombre: "recetas.csv", datos: utf8.encode(aCsv(recetas, COLUMNAS_RECETAS, FORMATOS)) },
    { nombre: "pasos.csv", datos: utf8.encode(aCsv(pasos, COLUMNAS_PASOS, FORMATOS)) },
    {
      nombre: "extracciones.csv",
      datos: utf8.encode(aCsv(filasExtracciones, COLUMNAS_EXTRACCIONES, FORMATOS)),
    },
  ];
  for (const foto of fotos) {
    entradas.push({
      nombre: foto.clave,
      datos: new Uint8Array(await foto.blob.arrayBuffer()),
    });
  }

  const dia = ahora.toISOString().slice(0, 10);
  return {
    nombre: `bitacora-cafe-${dia}.zip`,
    bytes: escribirZip(entradas, ahora),
    manifiesto,
  };
}

/** Abre un ZIP de respaldo y devuelve su contenido, todavía como textos. */
export async function leerRespaldo(bytes) {
  const entradas = await leerZip(bytes);
  const porNombre = new Map(entradas.map((e) => [e.nombre, e.datos]));
  const utf8 = new TextDecoder();

  const cruda = porNombre.get("manifiesto.json");
  if (!cruda) throw new Error("el ZIP no trae manifiesto.json: no es un respaldo de la bitácora");
  const manifiesto = JSON.parse(utf8.decode(cruda));
  if (manifiesto.formato !== FORMATO) {
    throw new Error(
      `el respaldo es del formato ${manifiesto.formato} y esta versión entiende el ${FORMATO}`,
    );
  }

  const csv = (nombre) => {
    const datos = porNombre.get(nombre);
    if (!datos) throw new Error(`al respaldo le falta ${nombre}`);
    return deCsv(utf8.decode(datos));
  };

  return {
    manifiesto,
    cafes: csv("cafes.csv"),
    recetas: csv("recetas.csv"),
    pasos: csv("pasos.csv"),
    extracciones: csv("extracciones.csv"),
    fotos: entradas.filter((e) => e.nombre.startsWith("fotos/")),
  };
}

/** Los valores no vacíos de una fila de CSV, con las columnas pedidas. */
function conValores(fila, columnas) {
  const salida = {};
  for (const columna of columnas) {
    const v = fila[columna];
    if (v !== undefined && v !== "") salida[columna] = v;
  }
  return salida;
}

const fallo = (donde, fila, r) =>
  `${donde} ${fila}: ${(r.datos.errores ?? [r.datos.error]).join(" · ")}`;

/**
 * Reconstruye el respaldo contra un almacén en memoria, pasando cada fila
 * por su manejador: la misma validación y el mismo tipado que un alta. El
 * slug guardado pisa al regenerado — una bolsa renombrada conserva el suyo.
 *
 * Devuelve { cafes, recetas, extracciones, avisos } con las filas ya listas
 * para el cajón, o lanza con la lista de errores si algo no pasa.
 */
export async function prepararRestauracion({ cafes, recetas, pasos, extracciones, fotos }) {
  const staging = almacenEnMemoria();
  const errores = [];
  const avisos = [];
  const clavesFotos = new Set(fotos.map((f) => f.nombre));

  const CUERPO_CAFE = COLUMNAS_CAFES.filter((c) => !["slug", "foto"].includes(c));
  for (const fila of [...cafes].sort(cronologico)) {
    const r = await crearCafe(staging, conValores(fila, CUERPO_CAFE));
    if (r.estado >= 400) {
      errores.push(fallo("bolsa", fila.slug || fila.nombre, r));
      continue;
    }
    const cambios = {};
    if (fila.slug && fila.slug !== r.datos.cafe.slug && SLUG.test(fila.slug)) {
      cambios.slug = fila.slug;
    }
    if (fila.foto) {
      cambios.foto = fila.foto;
      if (!clavesFotos.has(fila.foto)) {
        avisos.push(`la foto de ${fila.slug} no viene en el ZIP`);
      }
    }
    if (Object.keys(cambios).length) await staging.cafes.actualizar(r.datos.cafe.id, cambios);
  }

  const pasosDe = new Map();
  for (const paso of pasos) {
    if (!pasosDe.has(paso.receta_id)) pasosDe.set(paso.receta_id, []);
    pasosDe.get(paso.receta_id).push(paso);
  }
  for (const fila of [...recetas].sort(cronologico)) {
    const suyos = (pasosDe.get(fila.id) ?? []).sort((a, b) => Number(a.orden) - Number(b.orden));
    const cuerpo = {
      ...conValores(fila, ["id", "nombre", "ratio", "notas", "creado_en"]),
      pasos: suyos.map((p) => conValores(p, ["accion", "estilo", "agua_g", "t_inicio_s", "notas"])),
    };
    const r = await guardarReceta(staging, { nuevo: true }, cuerpo);
    if (r.estado >= 400) {
      errores.push(fallo("receta", fila.slug || fila.nombre, r));
      continue;
    }
    if (fila.slug && fila.slug !== r.datos.receta.slug && SLUG.test(fila.slug)) {
      await staging.recetas.escribir(
        { ...(await porRefStaging(staging, r.datos.receta.id)), slug: fila.slug },
        r.datos.receta.pasos,
        { nueva: false },
      );
    }
  }

  const CUERPO_EXTRACCION = ["id", "creado_en", ...CAMPOS];
  for (const fila of [...extracciones].sort(cronologico)) {
    const r = await crearExtraccion(staging, conValores(fila, CUERPO_EXTRACCION));
    if (r.estado >= 400) {
      errores.push(fallo("extracción", `${fila.cafe_slug} ${fila.fecha}`, r));
      continue;
    }
    // Lo que el alta recalcula o sella por su cuenta vuelve a lo que diga el
    // respaldo: restaurar es restaurar, no reinterpretar.
    await staging.extracciones.actualizar(fila.id, {
      siguiente_ajuste: fila.siguiente_ajuste || null,
      variable_cambiada: fila.variable_cambiada || null,
      borrada_en: fila.borrada_en || null,
    });
  }

  if (errores.length) {
    throw Object.assign(new Error("el respaldo no pasa la validación"), {
      data: { errores },
    });
  }

  return {
    cafes: await staging.cafes.listar(),
    recetas: await staging.recetas.listar(),
    extracciones: await staging.extracciones.listar(),
    avisos,
  };
}

async function porRefStaging(staging, id) {
  const { pasos, ...receta } = porRef(await staging.recetas.listar(), id);
  return receta;
}

const TIPO_POR_EXTENSION = Object.fromEntries(
  Object.entries(TIPOS_FOTO).map(([tipo, extension]) => [extension, tipo]),
);

/**
 * El reemplazo de verdad: las tres tablas en una transacción, y después las
 * fotos y la cola. Solo se llama con una restauración ya preparada.
 */
export async function aplicarRestauracion(cajon, preparado, fotos) {
  await cajon.reemplazar({
    cafes: preparado.cafes,
    recetas: preparado.recetas,
    extracciones: preparado.extracciones,
  });

  for (const vieja of await cajon.fotos.listar()) {
    await cajon.fotos.quitar(vieja.clave);
  }
  for (const foto of fotos) {
    const extension = foto.nombre.split(".").pop();
    const tipo = TIPO_POR_EXTENSION[extension] ?? "application/octet-stream";
    await cajon.fotos.poner(foto.nombre, new Blob([foto.datos], { type: tipo }), tipo);
  }

  // La cola apuntaba a los datos de antes: con el cajón reemplazado ya no
  // cuenta nada verdadero. Sin sesión estará vacía; por si acaso.
  for (const pendiente of await cajon.cola.listar()) {
    await cajon.cola.quitar(pendiente.id);
  }
}
