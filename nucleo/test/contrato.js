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
  borrarAccesorio, borrarReceta, crearAccesorio, crearCafe, crearExtraccion,
  editarAccesorio, editarCafe, editarExtraccion, guardarPreferencias,
  guardarReceta, guionDe, leerPreferencias, listaAccesorios, listaCafes,
  listaExtracciones, listaRecetas, restaurarExtraccion, retirarExtraccion,
} from "../src/api.js";
import { esUuid } from "../src/ids.js";
import { CLAVES, porDefecto } from "../src/preferencias.js";

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
      // El de plástico primero: mientras nadie diga otro, es el de casa.
      await crearAccesorio(almacen, { tipo: "dripper", nombre: "V60 02" });
      await crearAccesorio(almacen, { tipo: "dripper", nombre: "Origami", masa_termica: true });
      await crearAccesorio(almacen, { tipo: "molinillo", nombre: "Comandante C40" });
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

      describe("pesar la bolsa", () => {
        const SELLO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

        it("los gramos llegan solos y el sello lo pone el servidor", async () => {
          const { estado, datos } = await editarCafe(almacen, "gary", { restante_g: 120 });
          assert.equal(estado, 200);
          assert.deepEqual(datos.cambiado, ["restante_g"]);
          assert.equal(datos.cafe.restante_g, 120);
          assert.match(datos.cafe.restante_en, SELLO);
        });

        it("pero si viene puesto se respeta: es el que ya cuenta en local", async () => {
          const { datos } = await editarCafe(almacen, "gary", {
            restante_g: 120, restante_en: "2026-09-10 09:00:00",
          });
          assert.equal(datos.cafe.restante_en, "2026-09-10 09:00:00");
        });

        it("quitar el pesaje se lleva los dos por delante", async () => {
          await editarCafe(almacen, "gary", { restante_g: 120 });
          const { datos } = await editarCafe(almacen, "gary", { restante_g: null });
          assert.equal(datos.cafe.restante_g, null);
          assert.equal(datos.cafe.restante_en, null);
        });

        it("el sello sin gramos es 422: un pesaje son las dos cosas", async () => {
          const { estado, datos } = await editarCafe(almacen, "gary", {
            restante_en: "2026-09-10 09:00:00",
          });
          assert.equal(estado, 422);
          assert.match(datos.errores[0], /restante_en no va solo/);
        });

        it("y un sello con mala pinta tampoco entra", async () => {
          const { estado } = await editarCafe(almacen, "gary", {
            restante_g: 120, restante_en: "el martes",
          });
          assert.equal(estado, 422);
        });

        it("los gramos negativos se rechazan; el cero no, que es la bolsa vacía", async () => {
          assert.equal((await editarCafe(almacen, "gary", { restante_g: -1 })).estado, 422);
          const { estado, datos } = await editarCafe(almacen, "gary", { restante_g: 0 });
          assert.equal(estado, 200);
          assert.equal(datos.cafe.restante_g, 0);
        });

        it("pesar más de lo que traía la bolsa avisa, pero se guarda", async () => {
          const { estado, datos } = await editarCafe(almacen, "gary", { restante_g: 400 });
          assert.equal(estado, 200);
          assert.equal(datos.cafe.restante_g, 400);
          assert.match(datos.avisos[0], /pasa del peso de la bolsa/);
        });

        it("y sin pasarse no avisa de nada", async () => {
          const { datos } = await editarCafe(almacen, "gary", { restante_g: 100 });
          assert.deepEqual(datos.avisos, []);
        });
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

    describe("accesorios por el puerto", () => {
      it("el alta pone uuid, slug y sellos, y los interruptores de serie", async () => {
        const { estado, datos } = await crearAccesorio(almacen, {
          tipo: "molinillo", nombre: "Timemore C3",
        });
        assert.equal(estado, 201);
        assert.ok(esUuid(datos.accesorio.id));
        assert.equal(datos.accesorio.slug, "timemore_c3");
        assert.equal(datos.accesorio.tipo, "molinillo");
        // Como los guarda la base: 0 y 1, en los tres almacenes.
        assert.equal(datos.accesorio.en_uso, 1);
        assert.equal(datos.accesorio.masa_termica, 0);
        assert.ok(datos.accesorio.creado_en);
      });

      it("el slug repetido sale con sufijo, que dos V60 iguales pasan", async () => {
        const { datos } = await crearAccesorio(almacen, { tipo: "dripper", nombre: "V60 02" });
        assert.equal(datos.accesorio.slug, "v60_02_2");
      });

      it("un tipo que no existe es 422, y no escribe nada", async () => {
        const { estado } = await crearAccesorio(almacen, { tipo: "jarra", nombre: "Hario" });
        assert.equal(estado, 422);
        assert.equal((await listaAccesorios(almacen)).datos.length, 3);
      });

      it("la masa térmica es del dripper: en un molinillo es 422", async () => {
        const alta = await crearAccesorio(almacen, {
          tipo: "molinillo", nombre: "Pesado", masa_termica: true,
        });
        assert.equal(alta.estado, 422);
        const cambio = await editarAccesorio(almacen, "comandante_c40", { masa_termica: true });
        assert.equal(cambio.estado, 422);
      });

      it("los interruptores llegan como vengan: true, 1 o el texto de un CSV", async () => {
        for (const [valor, esperado] of [[false, 0], ["1", 1], ["false", 0], [1, 1]]) {
          const { datos } = await editarAccesorio(almacen, "origami", { masa_termica: valor });
          assert.equal(datos.accesorio.masa_termica, esperado, JSON.stringify(valor));
        }
        const { estado } = await editarAccesorio(almacen, "origami", { en_uso: "a veces" });
        assert.equal(estado, 422);
      });

      it("editar acepta el slug, devuelve qué cambió y no toca el tipo", async () => {
        const { estado, datos } = await editarAccesorio(almacen, "v60_02", {
          nombre: "V60 02 blanco", notas: "el de diario",
        });
        assert.equal(estado, 200);
        assert.deepEqual(datos.cambiado, ["nombre", "notas"]);
        assert.equal(datos.accesorio.nombre, "V60 02 blanco");
        // El slug no sigue al nombre: es lo que ya apuntan URLs y textos.
        assert.equal(datos.accesorio.slug, "v60_02");
      });

      it("un accesorio no cambia de tipo; decir el mismo sí vale", async () => {
        const cambio = await editarAccesorio(almacen, "comandante_c40", { tipo: "dripper" });
        assert.equal(cambio.estado, 422);
        assert.match(cambio.datos.errores[0], /no cambia de tipo/);
        const igual = await editarAccesorio(almacen, "comandante_c40", {
          tipo: "molinillo", notas: "bien",
        });
        assert.equal(igual.estado, 200);
      });

      it("editar o borrar uno que no existe es 404", async () => {
        assert.equal((await editarAccesorio(almacen, "chemex", { notas: "x" })).estado, 404);
        assert.equal((await borrarAccesorio(almacen, "chemex")).estado, 404);
      });

      it("la lista va por tipo, con lo que sigue en uso delante", async () => {
        await editarAccesorio(almacen, "v60_02", { en_uso: false });
        const { datos } = await listaAccesorios(almacen);
        assert.deepEqual(datos.map((a) => a.slug), ["origami", "v60_02", "comandante_c40"]);
      });

      it("libre de usos, se borra de verdad", async () => {
        const { estado, datos } = await borrarAccesorio(almacen, "origami");
        assert.equal(estado, 200);
        assert.equal(datos.slug, "origami");
        assert.equal((await listaAccesorios(almacen)).datos.length, 2);
      });

      it("usado, se niega con el slug en el error, retiradas incluidas", async () => {
        const { datos: taza } = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "origami" });
        await retirarExtraccion(almacen, taza.extraccion.id);
        const { estado, datos } = await borrarAccesorio(almacen, "origami");
        assert.equal(estado, 409);
        assert.match(datos.errores[0], /'origami'/);
        assert.match(datos.errores[0], /1 extracción/);
      });

      it("la id del cliente se respeta, y repetirla es 409 repetida", async () => {
        const id = "01980000-0000-7000-8000-00000000a0a0";
        const alta = await crearAccesorio(almacen, { id, tipo: "dripper", nombre: "Kalita" });
        assert.equal(alta.datos.accesorio.id, id);
        const otra = await crearAccesorio(almacen, { id, tipo: "dripper", nombre: "Kalita" });
        assert.equal(otra.estado, 409);
        assert.equal(otra.datos.repetida, true);
      });
    });

    describe("las extracciones y sus accesorios", () => {
      it("sin decir nada y sin historia, los primeros que diste de alta", async () => {
        const { datos } = await crearExtraccion(almacen, EXTRACCION);
        assert.equal(datos.extraccion.dripper_slug, "v60_02");
        assert.equal(datos.extraccion.molinillo_slug, "comandante_c40");
        assert.ok(esUuid(datos.extraccion.dripper));
      });

      it("se nombran por slug, por nombre o por id, y a la fila va la id", async () => {
        const origami = (await listaAccesorios(almacen)).datos.find((a) => a.slug === "origami");
        for (const ref of ["origami", "ORIGAMI", origami.id]) {
          const { estado, datos } = await crearExtraccion(almacen, { ...EXTRACCION, dripper: ref });
          assert.equal(estado, 201, ref);
          assert.equal(datos.extraccion.dripper, origami.id, ref);
        }
        const { datos } = await crearExtraccion(almacen, {
          ...EXTRACCION, molinillo: "comandante c40",
        });
        assert.equal(datos.extraccion.molinillo_slug, "comandante_c40");
      });

      it("uno que no existe es 422 con los que hay, y no escribe nada", async () => {
        const { estado, datos } = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "chemex" });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /origami/);
        assert.equal((await listaExtracciones(almacen)).datos.length, 0);
      });

      it("y un molinillo en el hueco del dripper tampoco resuelve", async () => {
        const { estado } = await crearExtraccion(almacen, {
          ...EXTRACCION, dripper: "comandante_c40",
        });
        assert.equal(estado, 422);
      });

      it("la madre manda sobre el último que usaste", async () => {
        const { datos: madre } = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "origami" });
        const { cafe_id, ...suelta } = EXTRACCION;
        await crearExtraccion(almacen, { ...suelta, dripper: "v60_02" });
        const { datos } = await crearExtraccion(almacen, { ...EXTRACCION, desde_id: madre.extraccion.id });
        assert.equal(datos.extraccion.dripper_slug, "origami");
      });

      it("sin madre, el último que usaste si sigue en uso", async () => {
        const { cafe_id, ...suelta } = EXTRACCION;
        await crearExtraccion(almacen, { ...suelta, dripper: "origami" });
        const { datos } = await crearExtraccion(almacen, suelta);
        assert.equal(datos.extraccion.dripper_slug, "origami");

        await editarAccesorio(almacen, "origami", { en_uso: false });
        const { datos: despues } = await crearExtraccion(almacen, suelta);
        assert.equal(despues.extraccion.dripper_slug, "v60_02");
      });

      it("fuera de uso no se ofrece, pero se sigue resolviendo si se nombra", async () => {
        await editarAccesorio(almacen, "origami", { en_uso: false });
        const { estado, datos } = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "origami" });
        assert.equal(estado, 201);
        assert.equal(datos.extraccion.dripper_slug, "origami");
      });

      it("un catálogo sin molinillos deja el hueco, no se inventa uno", async () => {
        await borrarAccesorio(almacen, "comandante_c40");
        const { estado, datos } = await crearExtraccion(almacen, EXTRACCION);
        assert.equal(estado, 201);
        assert.equal(datos.extraccion.molinillo, null);
        assert.equal(datos.extraccion.molinillo_slug, null);
      });

      it("la masa térmica sale del accesorio y el motor avisa", async () => {
        const conMasa = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "origami" });
        assert.equal(conMasa.datos.extraccion.dripper_masa_termica, true);
        assert.ok(conMasa.datos.sugerencias.avisos.some((a) => a.includes("masa térmica")));
        const sin = await crearExtraccion(almacen, { ...EXTRACCION, dripper: "v60_02" });
        assert.ok(!sin.datos.sugerencias.avisos.some((a) => a.includes("masa térmica")));
      });

      it("cambiar de dripper se lee con slugs, no con ids", async () => {
        // Sin el texto de la fija: lo que se mira es el que compone el servidor.
        const { variable_cambiada, ...sinTexto } = EXTRACCION;
        await crearExtraccion(almacen, sinTexto);
        const { datos } = await crearExtraccion(almacen, { ...sinTexto, dripper: "origami" });
        assert.equal(datos.extraccion.variable_cambiada, "dripper v60_02 → origami");
        assert.ok(datos.sugerencias.avisos.some((a) => a.includes("(v60_02 -> origami)")));
      });

      it("corregir cambia el dripper por slug, y vaciarlo lo quita", async () => {
        const { datos: taza } = await crearExtraccion(almacen, EXTRACCION);
        const id = taza.extraccion.id;
        const cambio = await editarExtraccion(almacen, id, { dripper: "origami" });
        assert.equal(cambio.estado, 200);
        assert.equal(cambio.datos.extraccion.dripper_slug, "origami");
        assert.deepEqual(cambio.datos.cambiado, ["dripper"]);

        const malo = await editarExtraccion(almacen, id, { molinillo: "origami" });
        assert.equal(malo.estado, 422);

        const quitado = await editarExtraccion(almacen, id, { molinillo: "" });
        assert.equal(quitado.datos.extraccion.molinillo, null);
      });

      describe("los tipos de la 0015", () => {
        const { variable_cambiada, ...sinTexto } = EXTRACCION;

        beforeEach(async () => {
          await crearAccesorio(almacen, { tipo: "filtro", nombre: "Hario con pestaña" });
          await crearAccesorio(almacen, { tipo: "filtro", nombre: "Cafec Abaca" });
          await crearAccesorio(almacen, { tipo: "agua", nombre: "Grifo filtrada" });
        });

        it("se apuntan como el dripper, y sin mandarlos se heredan de la madre", async () => {
          const { datos: madre } = await crearExtraccion(almacen, { ...sinTexto, filtro: "cafec_abaca" });
          assert.equal(madre.extraccion.filtro_slug, "cafec_abaca");
          const { datos } = await crearExtraccion(almacen, sinTexto);
          assert.equal(datos.extraccion.filtro_slug, "cafec_abaca");
          // Sin mandarla y sin madre que la tenga, la primera que diste de alta.
          assert.equal(datos.extraccion.agua_slug, "grifo_filtrada");
        });

        it("cada uno en su columna: un filtro no vale de agua", async () => {
          const { estado } = await crearExtraccion(almacen, { ...sinTexto, agua: "cafec_abaca" });
          assert.equal(estado, 422);
        });

        it("cambiar de filtro es la variable de esa taza", async () => {
          await crearExtraccion(almacen, { ...sinTexto, filtro: "hario_con_pestana" });
          const { datos } = await crearExtraccion(almacen, { ...sinTexto, filtro: "cafec_abaca" });
          assert.equal(datos.extraccion.variable_cambiada, "filtro hario_con_pestana → cafec_abaca");
        });

        it("pero apuntarlo por primera vez no es cambiarlo: antes no constaba", async () => {
          // La madre, de antes de tener filtros en el catálogo: sin filtro.
          const { datos: madre } = await crearExtraccion(almacen, sinTexto);
          await almacen.extracciones.actualizar(madre.extraccion.id, { filtro: null });
          const { datos } = await crearExtraccion(almacen, {
            ...sinTexto, filtro: "cafec_abaca", temp_c: 94,
          });
          // Una sola variable movida, y el aviso de dos a la vez no sale.
          assert.equal(datos.extraccion.variable_cambiada, "temp_c 91 → 94");
          assert.ok(!datos.sugerencias.avisos.some((a) => a.includes("has movido")));
        });
      });

      it("la lista trae los slugs de los accesorios, como los de café y receta", async () => {
        await crearExtraccion(almacen, EXTRACCION);
        const [fila] = (await listaExtracciones(almacen)).datos;
        assert.equal(fila.dripper_slug, "v60_02");
        assert.equal(fila.molinillo_slug, "comandante_c40");
        assert.equal(fila.dripper_masa_termica, false);
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
        await crearExtraccion(almacen, { ...suelta, dripper: "origami", nota: 6 });
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

    describe("preferencias por el puerto", () => {
      it("sin haber tocado nada, todo está en su valor de fábrica", async () => {
        const { estado, datos } = await leerPreferencias(almacen);
        assert.equal(estado, 200);
        assert.deepEqual(datos.preferencias, porDefecto());
      });

      it("guardar devuelve el juego entero, no solo lo tocado", async () => {
        const { estado, datos } = await guardarPreferencias(almacen, { sonido: false });
        assert.equal(estado, 200);
        assert.deepEqual(datos.cambiado, ["sonido"]);
        assert.equal(datos.preferencias.sonido, false);
        // Y el resto sigue en su sitio: nunca faltan claves.
        assert.equal(datos.preferencias.latido, true);
        assert.deepEqual(Object.keys(datos.preferencias).sort(), CLAVES.slice().sort());
      });

      it("guarda de verdad: se lee lo mismo en la llamada siguiente", async () => {
        await guardarPreferencias(almacen, { sonido: false, crono_dosis_g: 18 });
        const { datos } = await leerPreferencias(almacen);
        assert.equal(datos.preferencias.sonido, false);
        assert.equal(datos.preferencias.crono_dosis_g, 18);
      });

      it("un interruptor que nace apagado se enciende y vuelve encendido", async () => {
        // La cuenta atrás de los saltos es el único que nace apagado: con los
        // demás, leer `true` no distingue lo guardado de lo de fábrica.
        const antes = await leerPreferencias(almacen);
        assert.equal(antes.datos.preferencias.cuenta_atras_saltos, false);
        await guardarPreferencias(almacen, { cuenta_atras_saltos: true });
        const { datos } = await leerPreferencias(almacen);
        assert.equal(datos.preferencias.cuenta_atras_saltos, true);
      });

      it("solo toca lo que le mandan: dos escrituras se suman, no se pisan", async () => {
        // Es la razón de que esto sea un PATCH: el móvil apaga el sonido y el
        // portátil el latido, y ninguno de los dos revive lo del otro.
        await guardarPreferencias(almacen, { sonido: false });
        await guardarPreferencias(almacen, { latido: false });
        const { datos } = await leerPreferencias(almacen);
        assert.equal(datos.preferencias.sonido, false);
        assert.equal(datos.preferencias.latido, false);
      });

      it("escribir dos veces la misma clave no choca: es upsert", async () => {
        await guardarPreferencias(almacen, { crono_agua_g: 450 });
        const { estado } = await guardarPreferencias(almacen, { crono_agua_g: 500 });
        assert.equal(estado, 200);
        assert.equal((await leerPreferencias(almacen)).datos.preferencias.crono_agua_g, 500);
      });

      it("cada clave se sella al guardarla: es lo que permite fusionar", async () => {
        await guardarPreferencias(almacen, { sonido: false });
        const filas = await almacen.preferencias.leer();
        const suya = filas.find((f) => f.clave === "sonido");
        assert.ok(suya.actualizado_en, "sin sello no se puede saber cuál es más nueva");
        assert.equal(suya.valor, "0");
      });

      it("una clave que no existe es 422, y no escribe nada", async () => {
        const { estado, datos } = await guardarPreferencias(almacen, { volumen: 3 });
        assert.equal(estado, 422);
        assert.match(datos.errores[0], /volumen/);
        assert.deepEqual(await almacen.preferencias.leer(), []);
      });

      it("un interruptor con un número dentro es 422", async () => {
        assert.equal((await guardarPreferencias(almacen, { sonido: 1 })).estado, 422);
      });

      it("y una dosis de cero también, que no se prepara café con nada", async () => {
        assert.equal((await guardarPreferencias(almacen, { crono_dosis_g: 0 })).estado, 422);
      });

      it("el texto vacío sí vale: «sin bolsa» es una elección", async () => {
        await guardarPreferencias(almacen, { crono_cafe_id: "gary" });
        const { estado } = await guardarPreferencias(almacen, { crono_cafe_id: "" });
        assert.equal(estado, 200);
        assert.equal((await leerPreferencias(almacen)).datos.preferencias.crono_cafe_id, "");
      });
    });
  });
}
