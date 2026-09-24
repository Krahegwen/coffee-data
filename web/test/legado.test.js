/**
 * El cajón del modo local al estrenar el catálogo de accesorios.
 *
 * Es la 0014 de quien no tiene servidor: las extracciones de este navegador
 * traen el dripper y el molinillo como texto, y tienen que acabar apuntando a
 * filas del catálogo sin que parezca que alguien las corrigió.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { crearAccesorio } from "@coffee/nucleo/api";

import { almacenIDB } from "../app/almacen/idb.js";
import { pasarAlCatalogo } from "../app/almacen/legado.js";

const cajon = () => almacenIDB(new IDBFactory(), "legado-test");

/** Una extracción tal y como la dejaba la app de antes en el cajón. */
const vieja = (id, creado_en, campos = {}) => ({
  id, fecha: creado_en.slice(0, 10), creado_en, cafe_id: null, dosis_g: 20, agua_g: 300,
  dripper: "v60-02-plastico", molinillo: "Comandante C40", actualizado_en: null,
  borrada_en: null, desde_id: null, ...campos,
});

const ID = (n) => `01980000-0000-7000-8000-00000000000${n}`;

describe("pasar lo de antes al catálogo", () => {
  it("crea lo que usaban las tazas y las apunta a su id", async () => {
    const almacen = cajon();
    await almacen.extracciones.poner(vieja(ID(1), "2026-08-01 08:00:00"));
    await almacen.extracciones.poner(vieja(ID(2), "2026-08-02 08:00:00", { dripper: "v60-02-ceramica" }));

    assert.equal(await pasarAlCatalogo(almacen), 2);

    const accesorios = await almacen.accesorios.listar();
    const porSlug = Object.fromEntries(accesorios.map((a) => [a.slug, a]));
    assert.deepEqual(Object.keys(porSlug).sort(), ["comandante_c40", "v60-02-ceramica", "v60-02-plastico"]);
    // La cerámica, con la masa térmica que antes decía la constante del motor.
    assert.equal(porSlug["v60-02-ceramica"].masa_termica, 1);
    assert.equal(porSlug["v60-02-plastico"].masa_termica, 0);
    // Cada uno nace con la primera taza que lo usó.
    assert.equal(porSlug.comandante_c40.creado_en, "2026-08-01 08:00:00");
    assert.equal(porSlug["v60-02-ceramica"].creado_en, "2026-08-02 08:00:00");

    const filas = Object.fromEntries((await almacen.extracciones.listar()).map((e) => [e.id, e]));
    assert.equal(filas[ID(1)].dripper, porSlug["v60-02-plastico"].id);
    assert.equal(filas[ID(2)].dripper, porSlug["v60-02-ceramica"].id);
    assert.equal(filas[ID(2)].molinillo, porSlug.comandante_c40.id);
    // Y nadie las ha «corregido».
    assert.equal(filas[ID(1)].actualizado_en, null);
  });

  it("la segunda vez no hace nada", async () => {
    const almacen = cajon();
    await almacen.extracciones.poner(vieja(ID(1), "2026-08-01 08:00:00"));
    await pasarAlCatalogo(almacen);
    assert.equal(await pasarAlCatalogo(almacen), 0);
    assert.equal((await almacen.accesorios.listar()).length, 2);
  });

  it("si el accesorio ya existe, lo aprovecha en vez de duplicarlo", async () => {
    const almacen = cajon();
    const suyo = await crearAccesorio(almacen, { tipo: "molinillo", nombre: "Comandante C40" });
    await almacen.extracciones.poner(vieja(ID(1), "2026-08-01 08:00:00"));
    await pasarAlCatalogo(almacen);

    const molinillos = (await almacen.accesorios.listar()).filter((a) => a.tipo === "molinillo");
    assert.equal(molinillos.length, 1);
    const [fila] = await almacen.extracciones.listar();
    assert.equal(fila.molinillo, suyo.datos.accesorio.id);
  });

  it("un cajón sin tazas no estrena catálogo", async () => {
    const almacen = cajon();
    assert.equal(await pasarAlCatalogo(almacen), 0);
    assert.deepEqual(await almacen.accesorios.listar(), []);
  });
});
