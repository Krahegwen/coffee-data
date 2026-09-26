/**
 * Tests de los tramos del reloj, y los vectores que los atan a cualquier otra
 * implementación.
 *
 * Cada caso se comprueba por propiedades —cubren desde el 0, sin huecos, el
 * último abierto— y además contra `vectores/tramos.json`, que es lo que una
 * prueba en otro lenguaje (el módulo nativo del plan) lee para derivar el
 * mismo tramo en el mismo segundo. Si `tramosDe` cambia a propósito, el
 * fichero se regenera con `VECTORES=1 pnpm --filter @coffee/nucleo run test`
 * y va en el mismo commit: así la otra implementación rompe en el commit que
 * la deja atrás, no semanas después.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";

import { tramoEn, tramosDe } from "../src/crono.js";

/** La 4:6 base de la semilla, solo lo que los tramos miran. */
const KASUYA = [
  { accion: "verter", t_inicio_s: 0 },
  { accion: "esperar", t_inicio_s: 15 },
  { accion: "verter", t_inicio_s: 45 },
  { accion: "esperar", t_inicio_s: 60 },
  { accion: "verter", t_inicio_s: 90 },
  { accion: "esperar", t_inicio_s: 115 },
  { accion: "verter", t_inicio_s: 145 },
  { accion: "esperar", t_inicio_s: 170 },
  { accion: "retirar", t_inicio_s: 200 },
];

/** Los casos, con lo que cada uno pone a prueba. */
const CASOS = [
  { nombre: "4:6 Kasuya base", pasos: KASUYA },
  {
    nombre: "empieza tarde: la espera hasta el primer paso es un tramo sin paso",
    pasos: [
      { accion: "verter", t_inicio_s: 20 },
      { accion: "retirar", t_inicio_s: 80 },
    ],
  },
  {
    nombre: "un paso sin hora no forma tramo, y el que va detrás sigue al anterior",
    pasos: [
      { accion: "verter", t_inicio_s: 0 },
      { accion: "esperar", t_inicio_s: null },
      { accion: "verter", t_inicio_s: 40 },
      { accion: "retirar", t_inicio_s: 90 },
    ],
  },
  {
    nombre: "cierra con un vertido: el último tramo es el suyo",
    pasos: [
      { accion: "esperar", t_inicio_s: 0 },
      { accion: "verter", t_inicio_s: 30 },
    ],
  },
  { nombre: "un solo paso", pasos: [{ accion: "verter", t_inicio_s: 0 }] },
  {
    nombre: "la hora como texto, que así llega de un formulario",
    pasos: [
      { accion: "verter", t_inicio_s: "0" },
      { accion: "esperar", t_inicio_s: "15" },
    ],
  },
  { nombre: "sin pasos con hora", pasos: [{ accion: "verter", t_inicio_s: null }] },
  { nombre: "sin pasos", pasos: [] },
];

/**
 * Los segundos que vale la pena mirar en cada caso: fuera del plan por los
 * dos lados y a caballo de cada frontera.
 */
function muestrasDe(tramos) {
  const segundos = new Set([-5, 0]);
  tramos.forEach((tramo) => {
    segundos.add(tramo.desde - 0.01);
    segundos.add(tramo.desde);
    segundos.add(tramo.desde + 0.5);
  });
  segundos.add(tramos[tramos.length - 1].desde + 1000);
  return [...segundos].filter((s) => s >= -5).sort((a, b) => a - b);
}

const vectoresDe = (caso) => {
  const tramos = tramosDe(caso.pasos);
  return {
    nombre: caso.nombre,
    pasos: caso.pasos,
    tramos,
    en: muestrasDe(tramos).map((segundo) => ({ segundo, tramo: tramoEn(tramos, segundo) })),
  };
};

const FICHERO = new URL("./vectores/tramos.json", import.meta.url);

describe("tramosDe", () => {
  it("la 4:6 base: un tramo por paso, del 0 al retirar abierto", () => {
    const tramos = tramosDe(KASUYA);
    assert.equal(tramos.length, KASUYA.length);
    assert.deepEqual(tramos[0], { desde: 0, hasta: 15, paso: 0 });
    assert.deepEqual(tramos[6], { desde: 145, hasta: 170, paso: 6 });
    assert.deepEqual(tramos[8], { desde: 200, hasta: null, paso: 8 });
  });

  it("si la receta empieza tarde, la espera es el primer tramo y no tiene paso", () => {
    const tramos = tramosDe(CASOS[1].pasos);
    assert.deepEqual(tramos, [
      { desde: 0, hasta: 20, paso: null },
      { desde: 20, hasta: 80, paso: 0 },
      { desde: 80, hasta: null, paso: 1 },
    ]);
  });

  it("los pasos sin hora no forman tramo, pero el índice sigue siendo el de la lista", () => {
    const tramos = tramosDe(CASOS[2].pasos);
    assert.deepEqual(tramos.map((t) => t.paso), [0, 2, 3]);
    assert.deepEqual(tramos[0], { desde: 0, hasta: 40, paso: 0 });
  });

  it("sin nada que situar, un solo tramo abierto", () => {
    assert.deepEqual(tramosDe([]), [{ desde: 0, hasta: null, paso: null }]);
    assert.deepEqual(tramosDe(null), [{ desde: 0, hasta: null, paso: null }]);
    assert.deepEqual(tramosDe([{ accion: "verter", t_inicio_s: null }]), [
      { desde: 0, hasta: null, paso: null },
    ]);
  });

  it("la hora como texto vale igual: sale como número", () => {
    assert.deepEqual(tramosDe(CASOS[5].pasos), [
      { desde: 0, hasta: 15, paso: 0 },
      { desde: 15, hasta: null, paso: 1 },
    ]);
  });

  for (const caso of CASOS) {
    it(`cubre desde el 0 sin huecos y acaba abierto: ${caso.nombre}`, () => {
      const tramos = tramosDe(caso.pasos);
      assert.ok(tramos.length >= 1);
      assert.equal(tramos[0].desde, 0);
      assert.equal(tramos[tramos.length - 1].hasta, null);
      for (let i = 1; i < tramos.length; i += 1) {
        assert.equal(tramos[i - 1].hasta, tramos[i].desde, `frontera ${i}`);
      }
    });
  }
});

describe("tramoEn", () => {
  const tramos = tramosDe(KASUYA);

  it("es el último tramo que ya ha empezado", () => {
    assert.equal(tramoEn(tramos, 0), 0);
    assert.equal(tramoEn(tramos, 14.99), 0);
    assert.equal(tramoEn(tramos, 15), 1);
    assert.equal(tramoEn(tramos, 199.5), 7);
    assert.equal(tramoEn(tramos, 200), 8);
  });

  it("fuera del plan, el de la punta que toque", () => {
    assert.equal(tramoEn(tramos, -3), 0);
    assert.equal(tramoEn(tramos, 5000), 8);
  });

  it("en la espera de una receta que empieza tarde, el tramo sin paso", () => {
    const tarde = tramosDe(CASOS[1].pasos);
    assert.equal(tarde[tramoEn(tarde, 5)].paso, null);
    assert.equal(tarde[tramoEn(tarde, 20)].paso, 0);
  });
});

describe("los vectores", () => {
  const actuales = { casos: CASOS.map(vectoresDe) };

  if (process.env.VECTORES) {
    it("se regeneran (VECTORES puesto)", () => {
      writeFileSync(FICHERO, `${JSON.stringify(actuales, null, 2)}\n`);
    });
    return;
  }

  it("coinciden con vectores/tramos.json; si el cambio es a propósito, regenéralos con VECTORES=1", () => {
    const guardados = JSON.parse(readFileSync(FICHERO, "utf8"));
    assert.deepEqual(actuales, guardados);
  });

  it("muestran cada frontera por los dos lados", () => {
    for (const caso of actuales.casos) {
      for (const tramo of caso.tramos) {
        assert.ok(caso.en.some((m) => m.segundo === tramo.desde), `${caso.nombre}: ${tramo.desde}`);
      }
    }
  });
});
