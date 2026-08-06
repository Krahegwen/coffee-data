/**
 * Tests de la API entera contra el almacén en memoria.
 *
 * Es el contrato que tiene que cumplir cualquier adaptador que se enchufe:
 * si el de D1 y el de IndexedDB pasan por aquí, los dos caminos de la app se
 * comportan igual. Los códigos y los mensajes son los mismos que servía el
 * Worker cuando esto vivía dentro de él.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  borrarReceta, crearCafe, crearExtraccion, editarCafe, editarExtraccion,
  guardarReceta, guionDe, listaCafes, listaExtracciones, listaRecetas,
  restaurarExtraccion, retirarExtraccion,
} from "../src/api.js";
import { almacenEnMemoria } from "../src/almacen-memoria.js";
import { esUuid } from "../src/ids.js";

const RECETA = {
  nombre: "4:6 Kasuya base",
  ratio: 15,
  pasos: [
    { accion: "verter", agua_g: 60, t_inicio_s: 0 },
    { accion: "verter", agua_g: 60, t_inicio_s: 45 },
    { accion: "verter", agua_g: 90, t_inicio_s: 90 },
    { accion: "verter", agua_g: 90, t_inicio_s: 135 },
  ],
};

const EXTRACCION = {
  cafe_id: "gary", temp_c: 91, clics: 28, tiempo_total: "3:30",
  variable_cambiada: "prueba", defecto: "equilibrado", nota: 7,
  receta_id: "4_6_kasuya_base",
};

let almacen;

beforeEach(async () => {
  almacen = almacenEnMemoria();
  await crearCafe(almacen, { nombre: "Gary", peso_g: 340, fecha_tueste: "2026-05-20" });
  await guardarReceta(almacen, { nuevo: true }, RECETA);
});

describe("cafés por el puerto", () => {
  it("el alta pone uuid, slug y sellos, y devuelve la ficha entera", async () => {
    const { estado, datos } = await crearCafe(almacen, { nombre: "Abbie" });
    assert.equal(estado, 201);
    assert.ok(esUuid(datos.cafe.id));
    assert.equal(datos.cafe.slug, "abbie");
    assert.equal(datos.cafe.estado, "abierto");
    assert.equal(datos.cafe.tostador, null);
    assert.ok(datos.cafe.creado_en);
  });

  it("el slug repetido sale con sufijo", async () => {
    const otra = await crearCafe(almacen, { nombre: "Gary" });
    assert.equal(otra.datos.cafe.slug, "gary_2");
    const tercera = await crearCafe(almacen, { nombre: "Gary" });
    assert.equal(tercera.datos.cafe.slug, "gary_3");
  });

  it("editar acepta el slug y devuelve qué cambió", async () => {
    const { estado, datos } = await editarCafe(almacen, "gary", { estado: "terminado" });
    assert.equal(estado, 200);
    assert.deepEqual(datos.cambiado, ["estado"]);
    assert.equal(datos.cafe.estado, "terminado");
  });

  it("editar una bolsa que no existe es 404 con su mensaje", async () => {
    const { estado, datos } = await editarCafe(almacen, "chemex", { estado: "terminado" });
    assert.equal(estado, 404);
    assert.match(datos.errores[0], /no existe ningún café 'chemex'/);
  });

  it("la lista ordena por estado y nombre", async () => {
    await crearCafe(almacen, { nombre: "Abbie" });
    await editarCafe(almacen, "abbie", { estado: "terminado" });
    const { datos } = await listaCafes(almacen);
    assert.deepEqual(datos.map((c) => c.slug), ["gary", "abbie"]);
  });
});

describe("recetas por el puerto", () => {
  it("el alta deriva el slug y ata los pasos", async () => {
    const { datos } = await listaRecetas(almacen);
    assert.equal(datos.length, 1);
    assert.equal(datos[0].slug, "4_6_kasuya_base");
    assert.equal(datos[0].pasos.length, 4);
    assert.ok(esUuid(datos[0].pasos[0].receta_id));
  });

  it("guardar reemplaza los pasos enteros", async () => {
    const { estado, datos } = await guardarReceta(almacen, { ref: "4_6_kasuya_base", nuevo: false }, {
      nombre: "4:6 Kasuya base",
      ratio: 15,
      pasos: [{ accion: "verter", agua_g: 300, t_inicio_s: 0 }],
    });
    assert.equal(estado, 200);
    assert.equal(datos.receta.pasos.length, 1);
  });

  it("editar una receta inexistente es 404", async () => {
    const { estado } = await guardarReceta(almacen, { ref: "chemex", nuevo: false }, RECETA);
    assert.equal(estado, 404);
  });

  it("el guion resuelve por slug y escala", async () => {
    const { estado, datos } = await guionDe(almacen, "4_6_kasuya_base", "150");
    assert.equal(estado, 200);
    assert.equal(datos[datos.length - 1].acumulado_g, 150);
  });

  it("borrar se niega mientras una extracción la use, con el slug en el error", async () => {
    await crearExtraccion(almacen, EXTRACCION);
    const negada = await borrarReceta(almacen, "4_6_kasuya_base");
    assert.equal(negada.estado, 409);
    assert.match(negada.datos.errores[0], /'4_6_kasuya_base' la usan 1 extracción/);
  });

  it("y con la extracción retirada sigue negándose: retiradas incluidas", async () => {
    const creada = await crearExtraccion(almacen, EXTRACCION);
    await retirarExtraccion(almacen, creada.datos.extraccion.id);
    const negada = await borrarReceta(almacen, "4_6_kasuya_base");
    assert.equal(negada.estado, 409);
  });

  it("libre de usos, se borra con sus pasos", async () => {
    const { estado, datos } = await borrarReceta(almacen, "4_6_kasuya_base");
    assert.equal(estado, 200);
    assert.equal(datos.slug, "4_6_kasuya_base");
    assert.equal((await listaRecetas(almacen)).datos.length, 0);
  });
});

describe("extracciones por el puerto", () => {
  it("el alta resuelve slugs, calcula el reparto y guarda el ajuste del motor", async () => {
    const { estado, datos } = await crearExtraccion(almacen, EXTRACCION);
    assert.equal(estado, 201);
    assert.ok(esUuid(datos.extraccion.id));
    assert.ok(esUuid(datos.extraccion.cafe_id));
    assert.equal(datos.extraccion.reparto, "60-60-90-90");
    assert.equal(datos.extraccion.cafe_slug, "gary");
    assert.equal(datos.cafe, "Gary");
    assert.ok(Array.isArray(datos.sugerencias.avisos));
    // el aviso del tueste viejo llega desde los derivados
    assert.ok(datos.sugerencias.avisos.some((a) => a.includes("días de tueste")));
  });

  it("una receta sin resolver es 422 y no escribe nada", async () => {
    const { estado } = await crearExtraccion(almacen, { ...EXTRACCION, receta_id: "chemex" });
    assert.equal(estado, 422);
    assert.equal((await listaExtracciones(almacen)).datos.length, 0);
  });

  it("la lista sale nueva primero y con los derivados puestos", async () => {
    await crearExtraccion(almacen, EXTRACCION);
    await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88, variable_cambiada: "88" });
    const { datos } = await listaExtracciones(almacen);
    assert.equal(datos.length, 2);
    assert.equal(datos[0].temp_c, 88);
    assert.equal(datos[0].ratio, 15);
    assert.equal(typeof datos[0].dias_tueste, "number");
  });

  it("?cafe= filtra por slug", async () => {
    await crearExtraccion(almacen, EXTRACCION);
    await crearCafe(almacen, { nombre: "Abbie" });
    const deAbbie = await listaExtracciones(almacen, { cafe: "abbie" });
    assert.equal(deAbbie.datos.length, 0);
    const deGary = await listaExtracciones(almacen, { cafe: "gary" });
    assert.equal(deGary.datos.length, 1);
  });

  it("corregir toca solo lo que viene y devuelve la fila derivada", async () => {
    const creada = await crearExtraccion(almacen, EXTRACCION);
    const { estado, datos } = await editarExtraccion(almacen, creada.datos.extraccion.id, { nota: 9 });
    assert.equal(estado, 200);
    assert.deepEqual(datos.cambiado, ["nota"]);
    assert.equal(datos.extraccion.nota, 9);
    assert.equal(datos.extraccion.cafe_nombre, "Gary");
  });

  it("lo extraído no puede pasar del agua guardada, tampoco al corregir", async () => {
    const creada = await crearExtraccion(almacen, { ...EXTRACCION, agua_g: 300 });
    const { estado, datos } = await editarExtraccion(almacen, creada.datos.extraccion.id, { extraido_g: 400 });
    assert.equal(estado, 422);
    assert.match(datos.errores[0], /no puede pasar del agua/);
  });

  it("retirar es lógico, avisa si ya estaba, y restaurar la devuelve", async () => {
    const creada = await crearExtraccion(almacen, EXTRACCION);
    const id = creada.datos.extraccion.id;

    const retirada = await retirarExtraccion(almacen, id);
    assert.deepEqual(retirada.datos, { retirada: true, id });
    assert.equal((await listaExtracciones(almacen)).datos.length, 0);
    assert.equal((await listaExtracciones(almacen, { retiradas: true })).datos.length, 1);

    const repetida = await retirarExtraccion(almacen, id);
    assert.equal(repetida.datos.ya_estaba, true);

    const vuelta = await restaurarExtraccion(almacen, id);
    assert.equal(vuelta.datos.extraccion.id, id);
    assert.equal((await listaExtracciones(almacen)).datos.length, 1);
  });

  it("editar o retirar lo que no existe es 404", async () => {
    const nadie = "019fd647-0000-7000-8000-000000000000";
    assert.equal((await editarExtraccion(almacen, nadie, { nota: 5 })).estado, 404);
    assert.equal((await retirarExtraccion(almacen, nadie)).estado, 404);
    assert.equal((await restaurarExtraccion(almacen, nadie)).estado, 404);
  });
});
