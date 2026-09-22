/**
 * Tests del contador de la bolsa. Lo que se fija aquí no es la resta —esa es
 * fácil— sino qué tazas entran en ella: las de esta bolsa, las que siguen en
 * pie, y con pesaje solo las registradas después de pesar.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { restanteDe } from "../src/restante.js";

const GARY = { id: "gary", peso_g: 250 };

/** Una taza de 20 g registrada a esa hora. */
const taza = (creado_en, extra = {}) => ({
  cafe_id: "gary", dosis_g: 20, creado_en, ...extra,
});

describe("los gramos que quedan", () => {
  it("resta las dosis registradas al peso de la bolsa", () => {
    const historial = [taza("2026-09-01 08:00:00"), taza("2026-09-02 08:00:00")];
    assert.equal(restanteDe(GARY, historial), 210);
  });

  it("no cuenta las tazas de otra bolsa", () => {
    const historial = [taza("2026-09-01 08:00:00", { cafe_id: "spike" })];
    assert.equal(restanteDe(GARY, historial), 250);
  });

  it("no cuenta las retiradas: se retiran porque no fueron como se apuntó", () => {
    const historial = [taza("2026-09-01 08:00:00", { borrada_en: "2026-09-03 10:00:00" })];
    assert.equal(restanteDe(GARY, historial), 250);
  });

  it("sin peso ni pesaje no hay contador, y eso no es cero", () => {
    assert.equal(restanteDe({ id: "gary", peso_g: null }, []), null);
    assert.equal(restanteDe(null, []), null);
  });

  it("no baja de cero por muchas tazas que se apunten", () => {
    const historial = Array.from({ length: 20 }, (_, i) => taza(`2026-09-0${(i % 9) + 1} 08:00:00`));
    assert.equal(restanteDe(GARY, historial), 0);
  });
});

describe("con la bolsa pesada", () => {
  const PESADA = { ...GARY, restante_g: 120, restante_en: "2026-09-10 09:00:00" };

  it("arranca de la báscula y olvida lo de antes", () => {
    const historial = [taza("2026-09-01 08:00:00"), taza("2026-09-05 08:00:00")];
    assert.equal(restanteDe(PESADA, historial), 120);
  });

  it("descuenta lo registrado después de pesar", () => {
    const historial = [taza("2026-09-05 08:00:00"), taza("2026-09-11 08:00:00")];
    assert.equal(restanteDe(PESADA, historial), 100);
  });

  it("la taza del mismo instante ya estaba en la báscula", () => {
    assert.equal(restanteDe(PESADA, [taza("2026-09-10 09:00:00")]), 120);
  });

  it("una fila sin sello no se resta: no se sabe si estaba pesada", () => {
    assert.equal(restanteDe(PESADA, [taza(null)]), 120);
  });

  it("el pesaje manda sobre el peso de la bolsa, aunque sea mayor", () => {
    const rarito = { ...PESADA, restante_g: 300 };
    assert.equal(restanteDe(rarito, []), 300);
  });

  it("una bolsa pesada a cero queda a cero, que no es lo mismo que no saberlo", () => {
    const vacia = { ...PESADA, restante_g: 0 };
    assert.equal(restanteDe(vacia, []), 0);
  });

  it("sin peso declarado el pesaje basta para tener contador", () => {
    const sinPeso = { ...PESADA, peso_g: null };
    assert.equal(restanteDe(sinPeso, [taza("2026-09-11 08:00:00")]), 100);
  });
});
