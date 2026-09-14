/**
 * Tests de la agenda sonora del cronómetro. Los tiempos son los de la
 * receta semilla «4:6 Kasuya base»: si la agenda y el reloj discrepan,
 * es aquí donde se ve.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AVISO_S, cuentaAtrasDe, cuesDe, HUECO_VOZ, vozDe } from "../src/crono.js";
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

// Las duraciones reales de los clips en castellano, redondeadas.
const DURACIONES = {
  verter: 1.06,
  verter_espiral: 1.3,
  verter_centro: 1.38,
  agitar: 1.06,
  esperar: 1.01,
  retirar: 1.25,
};

describe("la voz, cuando hay clips", () => {
  it("sin manifiesto la agenda sale igual que siempre", () => {
    assert.deepEqual(cuesDe(KASUYA), cuesDe(KASUYA, null));
    assert.ok(!cuesDe(KASUYA).some((c) => c.tipo === "voz"));
  });

  it("la frase acaba justo antes del primer pip", () => {
    const cues = cuesDe(KASUYA, DURACIONES);
    // El vertido del 45 —sin estilo en esta receta, así que dice «verter»—
    // lleva sus pips en 42, 43 y 44.
    const voz = cues.find((c) => c.tipo === "voz" && c.t > 40 && c.t < 45);
    assert.equal(voz.clave, "verter");
    // 45 − 3 de pips − 0.35 de respiro − 1.06 de frase = 40.59
    assert.equal(voz.t, 40.59);
    assert.ok(voz.t + DURACIONES.verter < 42, "tiene que caber antes del pip");
  });

  it("con estilo dice la frase del estilo", () => {
    const cues = cuesDe(
      [{ accion: "verter", estilo: "espiral", t_inicio_s: 30 }], DURACIONES,
    );
    const voz = cues.find((c) => c.tipo === "voz");
    assert.equal(voz.clave, "verter_espiral");
    // 30 − 3 − 0.35 − 1.3
    assert.equal(voz.t, 25.35);
  });

  it("dice la frase de cada paso, con su estilo", () => {
    assert.equal(vozDe({ accion: "verter", estilo: "espiral" }), "verter_espiral");
    assert.equal(vozDe({ accion: "verter", estilo: "centro" }), "verter_centro");
    assert.equal(vozDe({ accion: "verter", estilo: null }), "verter");
    assert.equal(vozDe({ accion: "retirar" }), "retirar");
  });

  it("un paso sin clip no habla, pero sigue pitando", () => {
    // `remover` no está en el manifiesto de este test.
    const cues = cuesDe([
      { accion: "verter", t_inicio_s: 0 },
      { accion: "remover", t_inicio_s: 40 },
    ], DURACIONES);
    assert.ok(!cues.some((c) => c.tipo === "voz"));
    assert.equal(cues.filter((c) => c.tipo === "pip").length, 3);
  });

  it("si no cabe entera tras el paso anterior, se calla", () => {
    // Dos pasos a 4 s: la frase tendría que empezar antes del paso previo.
    const cues = cuesDe([
      { accion: "verter", t_inicio_s: 0 },
      { accion: "verter", estilo: "centro", t_inicio_s: 4 },
    ], DURACIONES);
    // 4 − 3 − 0.35 − 1.38 sale negativo respecto al paso de las 0: nada.
    assert.ok(!cues.some((c) => c.tipo === "voz" && c.clave === "verter_centro"));
    // Y los pips que sí caben siguen ahí: son los que llevan el tiempo.
    assert.ok(cues.some((c) => c.tipo === "pip"));
  });

  it("el primer paso tampoco habla: antes del segundo 0 no hay plan", () => {
    const cues = cuesDe(KASUYA, DURACIONES);
    assert.ok(!cues.some((c) => c.tipo === "voz" && c.t < 0));
    // El del segundo 0 no cabe, así que su frase no está: la dice la cuenta
    // atrás de arrancar, que va aparte.
    const primeras = cues.filter((c) => c.t < 10 && c.tipo === "voz");
    assert.deepEqual(primeras, []);
  });

  it("sale ordenada aunque la voz se cuele entre medias", () => {
    const tiempos = cuesDe(KASUYA, DURACIONES).map((c) => c.t);
    assert.deepEqual(tiempos, [...tiempos].sort((a, b) => a - b));
  });
});

describe("la cuenta atrás de arrancar", () => {
  it("sin voz son tres pips y el go, un segundo cada uno", () => {
    assert.deepEqual(cuentaAtrasDe(KASUYA, 0), [
      { t: 0, tipo: "pip" },
      { t: 1, tipo: "pip" },
      { t: 2, tipo: "pip" },
      { t: 3, tipo: "go" },
    ]);
    assert.deepEqual(cuentaAtrasDe(KASUYA, 0, null), cuentaAtrasDe(KASUYA, 0));
  });

  it("dice el primer paso antes de los pips, que en el plan no cabe", () => {
    const cuenta = cuentaAtrasDe(KASUYA, 0, DURACIONES);
    assert.deepEqual(cuenta[0], { t: 0, tipo: "voz", clave: "verter" });
    // 1.06 de frase + 0.35 de respiro: los pips esperan a que acabe.
    assert.deepEqual(cuenta.slice(1), [
      { t: 1.41, tipo: "pip" },
      { t: 2.41, tipo: "pip" },
      { t: 3.41, tipo: "pip" },
      { t: 4.41, tipo: "go" },
    ]);
  });

  it("con estilo, la frase del estilo", () => {
    const cuenta = cuentaAtrasDe(
      [{ accion: "verter", estilo: "espiral", t_inicio_s: 0 }], 0, DURACIONES,
    );
    assert.equal(cuenta[0].clave, "verter_espiral");
    const primerPip = cuenta.find((c) => c.tipo === "pip");
    assert.equal(primerPip.t, Number((DURACIONES.verter_espiral + HUECO_VOZ).toFixed(2)));
    assert.equal(cuenta.filter((c) => c.tipo === "pip").length, AVISO_S);
  });

  it("reanudar a mitad de un paso no dice nada: no empieza ninguno", () => {
    assert.deepEqual(
      cuentaAtrasDe(KASUYA, 30.4, DURACIONES).map((c) => c.tipo),
      ["pip", "pip", "pip", "go"],
    );
    // Tampoco al arrancar una receta cuyo primer paso no está en el 0: lo
    // que empieza ahí es la espera, y la frase del paso la pone el plan.
    const tarde = [{ accion: "verter", t_inicio_s: 20 }];
    assert.ok(!cuentaAtrasDe(tarde, 0, DURACIONES).some((c) => c.tipo === "voz"));
  });

  it("un paso sin clip cuenta como siempre", () => {
    // `remover` no está en el manifiesto de este test.
    const cuenta = cuentaAtrasDe([{ accion: "remover", t_inicio_s: 0 }], 0, DURACIONES);
    assert.deepEqual(cuenta, cuentaAtrasDe([{ accion: "remover", t_inicio_s: 0 }], 0));
  });

  it("el arranque suena como el paso al que llega", () => {
    assert.equal(cuentaAtrasDe(KASUYA, 45).at(-1).tipo, "go");
    assert.equal(cuentaAtrasDe(KASUYA, 145).at(-1).tipo, "go_doble");
    assert.equal(cuentaAtrasDe(KASUYA, 170).at(-1).tipo, "cadencia");
    // Y es el mismo cue que el plan pone en ese segundo, no uno parecido.
    for (const t of [0, 15, 45, 145, 170, 200]) {
      const delPlan = cuesDe(KASUYA).find((c) => c.t === t && c.tipo !== "pip");
      assert.equal(cuentaAtrasDe(KASUYA, t).at(-1).tipo, delPlan.tipo, `en el ${t}`);
    }
  });

  it("sin pasos sigue contando: el reloj arranca igual", () => {
    assert.deepEqual(cuentaAtrasDe([], 0).map((c) => c.tipo), ["pip", "pip", "pip", "go"]);
    assert.deepEqual(cuentaAtrasDe(null, 0), cuentaAtrasDe([], 0));
  });
});
