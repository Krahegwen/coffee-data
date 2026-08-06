/**
 * Tests de los derivados. Los números son los mismos que `test_esquema.py`
 * fija contra la vista SQL de verdad: si alguien cambia una implementación y
 * no la otra, uno de los dos lados se pone rojo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { derivar, ratioDe } from "../src/derivar.js";

const GARY = {
  nombre: "Gary",
  fecha_tueste: "2026-05-20",
  fecha_apertura: "2026-08-01",
};

describe("derivados de una extracción", () => {
  it("calcula lo mismo que la vista con la extracción de la semilla", () => {
    const fila = derivar(
      { fecha: "2026-08-05", dosis_g: 20, agua_g: 300 },
      { ...GARY, fecha_apertura: null },
    );
    assert.equal(fila.ratio, 15);
    assert.equal(fila.dias_tueste, 77);
    assert.equal(fila.dias_abierta, null);
    assert.equal(fila.cafe_nombre, "Gary");
  });

  it("los días se cuentan desde la fecha de la extracción, no desde hoy", () => {
    assert.equal(derivar({ fecha: "2026-05-25" }, GARY).dias_tueste, 5);
  });

  it("los días abierta salen de la fecha de apertura", () => {
    assert.equal(derivar({ fecha: "2026-08-05" }, GARY).dias_abierta, 4);
  });

  it("sin fecha de tueste los días quedan a null, no a cero", () => {
    const fila = derivar({ fecha: "2026-08-05" }, { nombre: "X" });
    assert.equal(fila.dias_tueste, null);
    assert.equal(fila.dias_abierta, null);
  });

  it("sin café no se inventa nada, como un JOIN fallido", () => {
    const fila = derivar({ fecha: "2026-08-05", dosis_g: 20, agua_g: 300 }, null);
    assert.equal(fila.cafe_nombre, null);
    assert.equal(fila.dias_tueste, null);
    assert.equal(fila.ratio, 15);
  });

  it("el ratio redondea a un decimal, como ROUND(x, 1)", () => {
    assert.equal(ratioDe(250, 15), 16.7);
    assert.equal(ratioDe(300, 18), 16.7);
    assert.equal(ratioDe("", 20), null);
    assert.equal(ratioDe(300, 0), null);
  });

  it("no pisa los campos de la extracción", () => {
    const fila = derivar({ fecha: "2026-08-05", nota: 7 }, GARY);
    assert.equal(fila.nota, 7);
    assert.equal(fila.fecha, "2026-08-05");
  });
});
