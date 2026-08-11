/**
 * Tests de la agenda sonora del cronómetro. Los tiempos son los de la
 * receta semilla «4:6 Kasuya base»: si la agenda y el reloj discrepan,
 * es aquí donde se ve.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cuesDe } from "../src/crono.js";
import { finDeLosVertidos } from "../src/recetas.js";

/** La 4:6 base de la semilla, solo lo que la agenda mira. */
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

const enSegundo = (cues, t) => cues.filter((c) => c.t === t);

describe("la agenda de la 4:6 base", () => {
  const cues = cuesDe(KASUYA);

  it("cada paso arranca con su go y avisa con tres pips", () => {
    assert.deepEqual(enSegundo(cues, 45), [{ t: 45, tipo: "go" }]);
    assert.deepEqual(
      cues.filter((c) => c.t >= 42 && c.t < 45),
      [{ t: 42, tipo: "pip" }, { t: 43, tipo: "pip" }, { t: 44, tipo: "pip" }],
    );
  });

  it("el primer paso no lleva pips: antes del 0 no hay plan", () => {
    assert.equal(cues[0].t, 0);
    assert.deepEqual(enSegundo(cues, 0), [{ t: 0, tipo: "go" }]);
  });

  it("el último vertido suena doble", () => {
    assert.deepEqual(enSegundo(cues, 145), [{ t: 145, tipo: "go_doble" }]);
  });

  it("la cadencia cae donde el núcleo pone el fin de los vertidos", () => {
    const fin = finDeLosVertidos(KASUYA);
    assert.equal(fin, 170);
    assert.deepEqual(enSegundo(cues, fin), [{ t: fin, tipo: "cadencia" }]);
  });

  it("retirar es un paso más: go con sus pips", () => {
    assert.deepEqual(enSegundo(cues, 200), [{ t: 200, tipo: "go" }]);
    assert.equal(cues.filter((c) => c.t >= 197 && c.t < 200).length, 3);
  });

  it("sale ordenada por segundo", () => {
    const tiempos = cues.map((c) => c.t);
    assert.deepEqual(tiempos, [...tiempos].sort((a, b) => a - b));
  });
});

describe("colisiones y bordes", () => {
  it("un pip nunca pisa el arranque del paso anterior", () => {
    const cues = cuesDe([
      { accion: "verter", t_inicio_s: 0 },
      { accion: "agitar", t_inicio_s: 2 },
    ]);
    // Del agitar solo cabe el pip del segundo 1: el del 0 pisaría el go
    // del vertido y el del −1 va antes del plan.
    assert.deepEqual(cues.filter((c) => c.tipo === "pip"), [{ t: 1, tipo: "pip" }]);
  });

  it("los pasos sin hora no suenan ni cuentan como vecinos", () => {
    const cues = cuesDe([
      { accion: "verter", t_inicio_s: 0 },
      { accion: "esperar", t_inicio_s: null },
      { accion: "retirar", t_inicio_s: 40 },
    ]);
    // El vertido cierra lo cronometrable hasta el 40: retirar avisa entero.
    assert.equal(cues.filter((c) => c.tipo === "pip").length, 3);
    // Y con el esperar sin hora, la cadencia cae en retirar: es el primer
    // paso con hora tras el último vertido, igual que en finDeLosVertidos.
    assert.deepEqual(enSegundo(cues, 40), [{ t: 40, tipo: "cadencia" }]);
  });

  it("si el vertido cierra la receta no hay cadencia, pero sí doble", () => {
    const cues = cuesDe([
      { accion: "esperar", t_inicio_s: 0 },
      { accion: "verter", t_inicio_s: 30 },
    ]);
    assert.deepEqual(enSegundo(cues, 30), [{ t: 30, tipo: "go_doble" }]);
    assert.ok(!cues.some((c) => c.tipo === "cadencia"));
  });

  it("sin vertidos, todos los arranques son go a secas", () => {
    const cues = cuesDe([
      { accion: "esperar", t_inicio_s: 0 },
      { accion: "retirar", t_inicio_s: 60 },
    ]);
    // Fijado por contenido y no con un `every`: sobre una lista vacía
    // aquello era cierto por vacuidad y una regresión que dejara la agenda
    // a cero habría pasado en verde.
    assert.deepEqual(cues.filter((c) => c.tipo !== "pip"), [
      { t: 0, tipo: "go" },
      { t: 60, tipo: "go" },
    ]);
    assert.equal(cues.filter((c) => c.tipo === "pip").length, 3);
  });

  it("un vertido sin hora no suena, pero sigue siendo el último", () => {
    // La cadencia se mide contra el último vertido de la receta, lo lleve
    // o no puesto en el reloj: buscándolo solo entre los pasos con hora,
    // el cierre caía en el 20 con un vertido todavía por echar.
    const pasos = [
      { accion: "verter", t_inicio_s: 0 },
      { accion: "esperar", t_inicio_s: 20 },
      { accion: "verter", t_inicio_s: null },
      { accion: "retirar", t_inicio_s: 60 },
    ];
    const cues = cuesDe(pasos);
    assert.equal(finDeLosVertidos(pasos), 60);
    assert.deepEqual(enSegundo(cues, 60), [{ t: 60, tipo: "cadencia" }]);
    assert.deepEqual(enSegundo(cues, 20), [{ t: 20, tipo: "go" }]);
    // El vertido sin hora no se puede situar: no hay doble en ninguna parte.
    assert.ok(!cues.some((c) => c.tipo === "go_doble"));
  });

  it("sin pasos no hay agenda", () => {
    assert.deepEqual(cuesDe([]), []);
    assert.deepEqual(cuesDe(null), []);
  });
});
