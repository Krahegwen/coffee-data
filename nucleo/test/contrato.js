/**
 * El contrato del puerto de almacén, como suite reutilizable.
 *
 * Se ejecuta la API entera contra el adaptador que le pases: memoria en el
 * núcleo, IndexedDB en la app, y el que venga después. Si dos adaptadores
 * pasan por aquí, los dos caminos de la app se comportan igual — eso es el
 * contrato, no la interfaz.
 *
 * `fabrica` devuelve un almacén virgen por test (puede ser async): cada test
 * arranca con una bolsa y una receta recién creadas por los manejadores.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  borrarReceta, crearCafe, crearExtraccion, editarCafe, editarExtraccion,
  guardarReceta, guionDe, listaCafes, listaExtracciones, listaRecetas,
  restaurarExtraccion, retirarExtraccion,
} from "../src/api.js";
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

export function contratoDelAlmacen(titulo, fabrica) {
  describe(titulo, () => {
    let almacen;

    beforeEach(async () => {
      almacen = await fabrica();
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

    describe("identidad del cliente: lo que reenvía la cola de salida", () => {
      const ID = "019fd647-1234-7abc-8def-000000000001";
      const SELLO = "2026-08-07 08:30:00";

      it("un alta de bolsa respeta id y creado_en si vienen", async () => {
        const { estado, datos } = await crearCafe(almacen, {
          nombre: "Abbie", id: ID, creado_en: SELLO,
        });
        assert.equal(estado, 201);
        assert.equal(datos.cafe.id, ID);
        assert.equal(datos.cafe.creado_en, SELLO);
      });

      it("repetir el alta con la misma id es 409 repetida, y no duplica", async () => {
        await crearCafe(almacen, { nombre: "Abbie", id: ID });
        const { estado, datos } = await crearCafe(almacen, { nombre: "Abbie", id: ID });
        assert.equal(estado, 409);
        assert.equal(datos.repetida, true);
        const bolsas = (await listaCafes(almacen)).datos;
        assert.equal(bolsas.filter((c) => c.id === ID).length, 1);
      });

      it("una id que no es uuid se rechaza sin escribir", async () => {
        const { estado, datos } = await crearCafe(almacen, { nombre: "Abbie", id: "abbie" });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /id inválida/);
        assert.equal((await listaCafes(almacen)).datos.length, 1);
      });

      it("un sello con mala pinta también", async () => {
        const { estado, datos } = await crearCafe(almacen, {
          nombre: "Abbie", creado_en: "ayer por la tarde",
        });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /creado_en inválido/);
      });

      it("las recetas y las extracciones van igual: id propia, y repetirla choca", async () => {
        const receta = await guardarReceta(almacen, { nuevo: true }, {
          ...RECETA, nombre: "Copia", id: ID, creado_en: SELLO,
        });
        assert.equal(receta.datos.receta.id, ID);
        assert.equal(receta.datos.receta.creado_en, SELLO);
        const otraVez = await guardarReceta(almacen, { nuevo: true }, { ...RECETA, nombre: "Copia", id: ID });
        assert.equal(otraVez.estado, 409);
        assert.equal(otraVez.datos.repetida, true);

        const creada = await crearExtraccion(almacen, { ...EXTRACCION, id: ID, creado_en: SELLO });
        assert.equal(creada.datos.extraccion.id, ID);
        assert.equal(creada.datos.extraccion.creado_en, SELLO);
        const repetida = await crearExtraccion(almacen, { ...EXTRACCION, id: ID });
        assert.equal(repetida.estado, 409);
        assert.equal(repetida.datos.repetida, true);
        assert.equal((await listaExtracciones(almacen)).datos.length, 1);
      });

      it("en una corrección la id sigue sin aceptarse", async () => {
        const { estado, datos } = await editarCafe(almacen, "gary", { id: ID });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /campos desconocidos: id/);
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

      it("sin bolsa también se guarda: la taza suelta queda apuntada", async () => {
        const { cafe_id, ...suelta } = EXTRACCION;
        const { estado, datos } = await crearExtraccion(almacen, suelta);
        assert.equal(estado, 201);
        assert.equal(datos.extraccion.cafe_id, null);
        assert.equal(datos.extraccion.cafe_nombre, null);
        assert.equal(datos.extraccion.cafe_slug, null);
        assert.equal(datos.cafe, null);
        // Las reglas de la propia taza siguen hablando aunque no haya serie.
        assert.ok(Array.isArray(datos.sugerencias.cambios));
      });

      it("dos sueltas no se comparan entre sí: no son el mismo café", async () => {
        const { cafe_id, ...suelta } = EXTRACCION;
        await crearExtraccion(almacen, { ...suelta, dripper: "v60-02-ceramica", nota: 6 });
        const { datos } = await crearExtraccion(almacen, suelta);
        assert.ok(!datos.sugerencias.avisos.some((a) => a.includes("cambiado de dripper")));
        assert.deepEqual(datos.sugerencias.efectos, {});
      });

      it("pero una bolsa que viene y no existe sigue siendo 422", async () => {
        const { estado } = await crearExtraccion(almacen, { ...EXTRACCION, cafe_id: "chemex" });
        assert.equal(estado, 422);
        assert.equal((await listaExtracciones(almacen)).datos.length, 0);
      });

      it("corregir puede quitar la bolsa, o ponerla por su slug", async () => {
        const creada = await crearExtraccion(almacen, EXTRACCION);
        const id = creada.datos.extraccion.id;

        const suelta = await editarExtraccion(almacen, id, { cafe_id: "" });
        assert.equal(suelta.estado, 200);
        assert.equal(suelta.datos.extraccion.cafe_id, null);
        assert.equal(suelta.datos.extraccion.cafe_nombre, null);

        const atada = await editarExtraccion(almacen, id, { cafe_id: "gary" });
        assert.equal(atada.estado, 200);
        assert.ok(esUuid(atada.datos.extraccion.cafe_id));
        assert.equal(atada.datos.extraccion.cafe_nombre, "Gary");

        const aNadie = await editarExtraccion(almacen, id, { cafe_id: "chemex" });
        assert.equal(aNadie.estado, 422);
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

      describe("el árbol de exploración", () => {
        it("la primera de una bolsa no cuelga de nadie", async () => {
          const { datos } = await crearExtraccion(almacen, EXTRACCION);
          assert.equal(datos.extraccion.desde_id, null);
        });

        it("y la siguiente cuelga de ella sin que nadie lo pida", async () => {
          const primera = await crearExtraccion(almacen, EXTRACCION);
          const segunda = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          assert.equal(segunda.datos.extraccion.desde_id, primera.datos.extraccion.id);
        });

        it("volver a una rama anterior es mandarla a mano", async () => {
          const primera = await crearExtraccion(almacen, EXTRACCION);
          await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          const vuelta = await crearExtraccion(almacen, {
            ...EXTRACCION, clics: 30, desde_id: primera.datos.extraccion.id,
          });
          assert.equal(vuelta.datos.extraccion.desde_id, primera.datos.extraccion.id);
        });

        it("la madre nunca sale de la bolsa", async () => {
          const otra = await crearCafe(almacen, { nombre: "Abbie" });
          const suya = await crearExtraccion(almacen, {
            ...EXTRACCION, cafe_id: otra.datos.cafe.id,
          });
          const { estado, datos } = await crearExtraccion(almacen, {
            ...EXTRACCION, desde_id: suya.datos.extraccion.id,
          });
          assert.equal(estado, 422);
          assert.match(datos.errores[0], /solo puede ser variación de otra del mismo café/);
        });

        it("una suelta no cuelga de nadie, aunque se empeñe quien la manda", async () => {
          const previa = await crearExtraccion(almacen, EXTRACCION);
          const { cafe_id: fuera, ...sinBolsa } = EXTRACCION;
          const { datos } = await crearExtraccion(almacen, {
            ...sinBolsa, desde_id: previa.datos.extraccion.id,
          });
          assert.equal(datos.extraccion.desde_id, null);
        });

        it("de una retirada no se parte, pero apuntar a ella sigue valiendo", async () => {
          const primera = await crearExtraccion(almacen, EXTRACCION);
          const segunda = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          await retirarExtraccion(almacen, segunda.datos.extraccion.id);

          // La automática se salta la retirada y vuelve a la que sigue en pie.
          const tercera = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 90 });
          assert.equal(tercera.datos.extraccion.desde_id, primera.datos.extraccion.id);

          // Y pedirla explícitamente no es un error: un desplegable no puede
          // perder el valor que ya tiene por que la madre se retire después.
          const atada = await crearExtraccion(almacen, {
            ...EXTRACCION, temp_c: 89, desde_id: segunda.datos.extraccion.id,
          });
          assert.equal(atada.estado, 201);
        });

        it("mudar la taza de bolsa se lleva su linaje por delante", async () => {
          await crearExtraccion(almacen, EXTRACCION);
          const segunda = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          const otra = await crearCafe(almacen, { nombre: "Abbie" });

          const { datos } = await editarExtraccion(almacen, segunda.datos.extraccion.id, {
            cafe_id: otra.datos.cafe.id,
          });
          assert.equal(datos.extraccion.desde_id, null);
          assert.ok(datos.cambiado.includes("desde_id"));
        });

        it("y quitarle la bolsa también: sin ficha no hay serie", async () => {
          await crearExtraccion(almacen, EXTRACCION);
          const segunda = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          const { datos } = await editarExtraccion(almacen, segunda.datos.extraccion.id, {
            cafe_id: "",
          });
          assert.equal(datos.extraccion.desde_id, null);
        });

        it("nadie es variación de algo que se hizo después", async () => {
          const primera = await crearExtraccion(almacen, EXTRACCION);
          const segunda = await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          const { estado, datos } = await editarExtraccion(almacen, primera.datos.extraccion.id, {
            desde_id: segunda.datos.extraccion.id,
          });
          assert.equal(estado, 422);
          assert.match(datos.errores[0], /anterior a ésta/);
        });

        it("retirar una madre lo dice, pero no lo impide", async () => {
          const primera = await crearExtraccion(almacen, EXTRACCION);
          await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 88 });
          await crearExtraccion(almacen, { ...EXTRACCION, temp_c: 90 });

          const { datos } = await retirarExtraccion(almacen, primera.datos.extraccion.id);
          assert.equal(datos.retirada, true);
          // Solo la que colgaba de ella: la tercera cuelga de la segunda.
          assert.equal(datos.huerfanas, 1);
        });

        it("ni de sí misma", async () => {
          const { datos: creada } = await crearExtraccion(almacen, EXTRACCION);
          const { estado } = await editarExtraccion(almacen, creada.extraccion.id, {
            desde_id: creada.extraccion.id,
          });
          assert.equal(estado, 422);
        });
      });

      it("el goteo tampoco puede llegar al tiempo total guardado", async () => {
        const creada = await crearExtraccion(almacen, { ...EXTRACCION, drawdown_s: 45 });
        const { estado, datos } = await editarExtraccion(almacen, creada.datos.extraccion.id, {
          tiempo_total: "0:30",
        });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /no puede llegar al tiempo total/);
      });

      it("y corregir devuelve avisos, que es donde se rompió la fila de verdad", async () => {
        // Con una espera detrás del último vertido, la receta sabe cuándo se
        // deja de verter; sin ella no hay nada contra lo que comparar.
        await guardarReceta(almacen, { nuevo: true }, {
          nombre: "4:6 con esperas",
          ratio: 15,
          pasos: [
            { accion: "verter", agua_g: 120, t_inicio_s: 0 },
            { accion: "verter", agua_g: 180, t_inicio_s: 145 },
            { accion: "esperar", t_inicio_s: 170 },
          ],
        });
        const creada = await crearExtraccion(almacen, {
          ...EXTRACCION, receta_id: "4_6_con_esperas", tiempo_total: "3:32", drawdown_s: 42,
        });
        const desviado = (avisos) => avisos.some((a) => a.includes("de diferencia"));
        assert.equal(desviado(creada.datos.sugerencias.avisos), false);

        // 3:10 menos 42 s deja los vertidos acabando en el 148, y la receta
        // los da por acabados en el 170: uno de los dos campos está mal.
        const { datos } = await editarExtraccion(almacen, creada.datos.extraccion.id, {
          tiempo_total: "3:10",
        });
        assert.equal(desviado(datos.avisos), true);
      });

      it("retirar es lógico, avisa si ya estaba, y restaurar la devuelve", async () => {
        const creada = await crearExtraccion(almacen, EXTRACCION);
        const id = creada.datos.extraccion.id;

        const retirada = await retirarExtraccion(almacen, id);
        assert.deepEqual(retirada.datos, { retirada: true, id, huerfanas: 0 });
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
  });
}
