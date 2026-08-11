/**
 * La cola de salida: el drenador y la paridad del reenvío.
 *
 * El test que importa es el último: un almacén en memoria hace de servidor,
 * el cajón de IndexedDB (fake) hace de local, y tras drenar los dos tienen
 * que contar exactamente la misma historia — misma id, mismo sello, mismo
 * reparto y el mismo ajuste del motor. Si eso se cumple, «traer todo y
 * reemplazar» nunca puede pisar nada distinto de lo que ya había.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { almacenEnMemoria } from "@coffee/nucleo/almacen-memoria";
import {
  borrarReceta, crearCafe, crearExtraccion, editarCafe, editarExtraccion,
  guardarReceta, restaurarExtraccion, retirarExtraccion,
} from "@coffee/nucleo/api";
import { uuidv7 } from "@coffee/nucleo/ids";

import {
  cuerpoDeCafe, cuerpoDeExtraccion, cuerpoDeReceta, drenar,
} from "../app/almacen/cola.js";
import { almacenIDB } from "../app/almacen/idb.js";

const cajon = () => almacenIDB(new IDBFactory(), "cola-test");

const entrada = (extra = {}) => ({
  id: uuidv7(),
  metodo: "POST",
  camino: "/api/extracciones",
  cuerpo: { n: 1 },
  error: null,
  ...extra,
});

/** El enrutado mínimo del reenvío, lanzando como lanza $fetch. */
function servidorFalso(almacen) {
  return async ({ metodo, camino, cuerpo }) => {
    const r = await enrutar(almacen, metodo, camino, cuerpo);
    if (r.estado >= 400) {
      throw Object.assign(new Error(`HTTP ${r.estado}`), { statusCode: r.estado, data: r.datos });
    }
    return r.datos;
  };
}

function enrutar(almacen, metodo, camino, cuerpo) {
  let m;
  if (metodo === "POST" && camino === "/api/cafes") return crearCafe(almacen, cuerpo);
  if ((m = camino.match(/^\/api\/cafes\/([^/]+)$/)) && metodo === "PATCH") {
    return editarCafe(almacen, m[1], cuerpo);
  }
  if (metodo === "POST" && camino === "/api/extracciones") return crearExtraccion(almacen, cuerpo);
  if ((m = camino.match(/^\/api\/extracciones\/([^/]+)\/restaurar$/)) && metodo === "POST") {
    return restaurarExtraccion(almacen, m[1]);
  }
  if ((m = camino.match(/^\/api\/extracciones\/([^/]+)$/))) {
    if (metodo === "PATCH") return editarExtraccion(almacen, m[1], cuerpo);
    if (metodo === "DELETE") return retirarExtraccion(almacen, m[1]);
  }
  if (metodo === "POST" && camino === "/api/recetas") {
    return guardarReceta(almacen, { nuevo: true }, cuerpo);
  }
  if ((m = camino.match(/^\/api\/recetas\/([^/]+)$/))) {
    if (metodo === "PUT") return guardarReceta(almacen, { ref: m[1], nuevo: false }, cuerpo);
    if (metodo === "DELETE") return borrarReceta(almacen, m[1]);
  }
  throw new Error(`ruta sin cubrir en el test: ${metodo} ${camino}`);
}

describe("el drenador de la cola", () => {
  it("sube en orden de encolado y deja la cola vacía", async () => {
    const almacen = cajon();
    const puestas = [entrada({ cuerpo: { n: 1 } }), entrada({ cuerpo: { n: 2 } }), entrada({ cuerpo: { n: 3 } })];
    for (const e of puestas) await almacen.cola.poner(e);

    const enviadas = [];
    const r = await drenar(almacen, async (e) => enviadas.push(e.cuerpo.n));

    assert.deepEqual(enviadas, [1, 2, 3]);
    assert.deepEqual(r, { subidas: 3, quedan: 0, red: false });
    assert.equal(await almacen.cola.contar(), 0);
  });

  it("un ajuste que el servidor rechaza se cae y la cola sigue", async () => {
    /*
     * El caso que motiva esto: desplegar el Worker antes de migrar la base, o
     * que wrangler suba los assets y no el script. Cada visita a `/crono`
     * encola un PATCH de preferencias; si ese rechazo parase la cola, la
     * bitácora entera dejaría de subir y de bajar —el drenado se para en la
     * primera entrada mala y el refresco no baja nada con la cola no vacía—
     * sin más salida que restaurar un respaldo.
     */
    const almacen = cajon();
    await almacen.cola.poner(entrada({ metodo: "PATCH", camino: "/api/preferencias" }));
    await almacen.cola.poner(entrada({ cuerpo: { n: 2 } }));

    const enviadas = [];
    const r = await drenar(almacen, async (e) => {
      if (e.camino === "/api/preferencias") {
        throw Object.assign(new Error("HTTP 404"), { statusCode: 404, data: {} });
      }
      enviadas.push(e.cuerpo.n);
    });

    assert.deepEqual(enviadas, [2], "la extracción de detrás tiene que subir igual");
    assert.equal(r.quedan, 0);
    assert.equal(await almacen.cola.contar(), 0, "y la cola queda limpia, no atascada");
  });

  it("pero sin red el ajuste espera, que la entrada sigue siendo buena", async () => {
    const almacen = cajon();
    await almacen.cola.poner(entrada({ metodo: "PATCH", camino: "/api/preferencias" }));

    const r = await drenar(almacen, async () => { throw new Error("sin cobertura"); });

    assert.equal(r.red, true);
    assert.equal(await almacen.cola.contar(), 1);
  });

  it("una extracción rechazada sí para la cola: el orden importa", async () => {
    // El contraste del test de arriba: lo prescindible se cae, lo demás no.
    const almacen = cajon();
    await almacen.cola.poner(entrada({ cuerpo: { n: 1 } }));
    await almacen.cola.poner(entrada({ cuerpo: { n: 2 } }));

    const r = await drenar(almacen, async () => {
      throw Object.assign(new Error("HTTP 422"), { statusCode: 422, data: { errores: ["no"] } });
    });

    assert.equal(r.quedan, 2);
    assert.equal(await almacen.cola.contar(), 2);
    assert.match((await almacen.cola.listar())[0].error, /no/);
  });

  it("sin red se para donde estaba, sin marcar nada: ya caerá", async () => {
    const almacen = cajon();
    for (const n of [1, 2, 3]) await almacen.cola.poner(entrada({ cuerpo: { n } }));

    let van = 0;
    const r = await drenar(almacen, async () => {
      van += 1;
      if (van === 2) throw new TypeError("fetch failed");
    });

    assert.deepEqual(r, { subidas: 1, quedan: 2, red: true });
    const quedan = await almacen.cola.listar();
    assert.equal(quedan.length, 2);
    assert.ok(quedan.every((e) => e.error === null));
  });

  it("una entrada que el servidor rechaza queda marcada y bloquea a las siguientes", async () => {
    const almacen = cajon();
    const mala = entrada({ cuerpo: { n: 1 } });
    await almacen.cola.poner(mala);
    await almacen.cola.poner(entrada({ cuerpo: { n: 2 } }));

    const r = await drenar(almacen, async () => {
      throw Object.assign(new Error("HTTP 422"), {
        statusCode: 422,
        data: { errores: ["temp_c debe estar entre 0 y 100"] },
      });
    });

    assert.deepEqual(r, { subidas: 0, quedan: 2, red: false });
    const quedan = await almacen.cola.listar();
    assert.equal(quedan[0].error, "temp_c debe estar entre 0 y 100");
    assert.equal(quedan[1].error, null);
  });

  it("un 409 repetida y un 404 al borrar cuentan como subidas: ya estaban", async () => {
    const almacen = cajon();
    await almacen.cola.poner(entrada());
    await almacen.cola.poner(entrada({ metodo: "DELETE", camino: "/api/recetas/x", cuerpo: null }));

    const fallos = [
      Object.assign(new Error("HTTP 409"), { statusCode: 409, data: { repetida: true, errores: ["ya existe"] } }),
      Object.assign(new Error("HTTP 404"), { statusCode: 404, data: { errores: ["no existe"] } }),
    ];
    const r = await drenar(almacen, async () => { throw fallos.shift(); });

    assert.deepEqual(r, { subidas: 2, quedan: 0, red: false });
    assert.equal(await almacen.cola.contar(), 0);
  });
});

describe("la paridad del reenvío", () => {
  /** Compara filas quitando lo que sella cada lado por su cuenta. */
  const sinSellos = ({ actualizado_en, borrada_en, ...resto }) => resto;

  it("tras drenar, el servidor cuenta la misma historia que el local", async () => {
    const local = cajon();
    const servidor = almacenEnMemoria();
    const cola = [];

    // La app en modo con sesión: cada escritura pasa en local y se encola.
    const bolsa = await crearCafe(local, { nombre: "Gary", peso_g: 340, fecha_tueste: "2026-05-20" });
    cola.push({ metodo: "POST", camino: "/api/cafes", cuerpo: cuerpoDeCafe(bolsa.datos.cafe) });

    const receta = await guardarReceta(local, { nuevo: true }, {
      nombre: "4:6 base",
      ratio: 15,
      pasos: [
        { accion: "verter", agua_g: 150, t_inicio_s: 0 },
        { accion: "verter", agua_g: 150, t_inicio_s: 90 },
      ],
    });
    cola.push({ metodo: "POST", camino: "/api/recetas", cuerpo: cuerpoDeReceta(receta.datos.receta) });

    const creada = await crearExtraccion(local, {
      cafe_id: bolsa.datos.cafe.id, receta_id: receta.datos.receta.id,
      temp_c: 91, clics: 28, tiempo_total: "3:30",
      variable_cambiada: "basal", defecto: "equilibrado", nota: 7,
    });
    cola.push({
      metodo: "POST", camino: "/api/extracciones",
      cuerpo: cuerpoDeExtraccion(creada.datos.extraccion),
    });

    await editarCafe(local, bolsa.datos.cafe.id, { estado: "terminado" });
    cola.push({
      metodo: "PATCH", camino: `/api/cafes/${bolsa.datos.cafe.id}`,
      cuerpo: { estado: "terminado" },
    });

    for (const e of cola) await local.cola.poner({ id: uuidv7(), error: null, ...e });
    const r = await drenar(local, servidorFalso(servidor));
    assert.deepEqual(r, { subidas: 4, quedan: 0, red: false });

    // Misma bolsa, con su id, su sello y su slug.
    const [cafeLocal] = await local.cafes.listar();
    const [cafeServidor] = await servidor.cafes.listar();
    assert.deepEqual(sinSellos(cafeServidor), sinSellos(cafeLocal));
    assert.equal(cafeServidor.estado, "terminado");

    // Misma receta, pasos incluidos.
    const [recetaLocal] = await local.recetas.listar();
    const [recetaServidor] = await servidor.recetas.listar();
    assert.deepEqual(sinSellos(recetaServidor), sinSellos(recetaLocal));

    // Y la extracción exacta: reparto y ajuste del motor viajaron en la fila.
    const [extLocal] = await local.extracciones.listar();
    const [extServidor] = await servidor.extracciones.listar();
    assert.deepEqual(sinSellos(extServidor), sinSellos(extLocal));
    assert.equal(extServidor.reparto, "150-150");
    assert.equal(extServidor.siguiente_ajuste, extLocal.siguiente_ajuste);
  });

  it("reenviar un alta ya aplicado no duplica: el 409 se da por hecho", async () => {
    const local = cajon();
    const servidor = almacenEnMemoria();

    const bolsa = await crearCafe(local, { nombre: "Gary" });
    const alta = { metodo: "POST", camino: "/api/cafes", cuerpo: cuerpoDeCafe(bolsa.datos.cafe) };

    await local.cola.poner({ id: uuidv7(), error: null, ...alta });
    await drenar(local, servidorFalso(servidor));

    // El mismo envío otra vez: la red se cortó antes de borrar la entrada.
    await local.cola.poner({ id: uuidv7(), error: null, ...alta });
    const r = await drenar(local, servidorFalso(servidor));

    assert.deepEqual(r, { subidas: 1, quedan: 0, red: false });
    assert.equal((await servidor.cafes.listar()).length, 1);
  });
});
