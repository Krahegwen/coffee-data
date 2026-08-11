/**
 * Qué cambió entre dos extracciones: el diff del que cuelgan `variable_cambiada`,
 * el emparejado del motor y el aviso de haber movido dos cosas.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  crearCafe, crearExtraccion, editarExtraccion, guardarReceta, retirarExtraccion,
} from "../src/api.js";
import { almacenEnMemoria } from "../src/almacen-memoria.js";
import {
  VARIABLES_DECLARADAS, avisosDe, diferencias, pares, textoDeVariables,
  variableCambiadaDe,
} from "../src/sugerencias.js";
import { textos } from "../src/textos.js";

/** Una fila con todo puesto, como la escribe el servidor. */
const FILA = (campos = {}) => ({
  id: "1", cafe_id: "gary", desde_id: null, temp_c: 91, clics: 28, dosis_g: 20,
  agua_g: 300, reparto: "60-60-90-90", receta_id: "r1", receta_slug: "kasuya",
  molinillo: "Comandante C40", dripper: "v60-02-plastico", nota: 7,
  defecto: "equilibrado", ...campos,
});

describe("el diff entre dos extracciones", () => {
  it("no ve nada cuando no se movió nada", () => {
    assert.deepEqual(diferencias(FILA(), FILA()), []);
  });

  it("dice la variable y los dos valores", () => {
    assert.deepEqual(diferencias(FILA(), FILA({ temp_c: 94 })), [
      { variable: "temp_c", antes: 91, despues: 94 },
    ]);
  });

  it("compara por texto: 91 y «91» son la misma temperatura", () => {
    assert.deepEqual(diferencias(FILA(), FILA({ temp_c: "91" })), []);
  });

  it("sin madre no hay diff, que no es lo mismo que no haber cambiado", () => {
    assert.deepEqual(diferencias(null, FILA()), []);
  });

  it("el reparto no cuenta: sale del agua y de la receta", () => {
    // Subir el agua recalcula el reparto. Contando los dos, un cambio se leía
    // como dos y el par se descartaba: ningún cambio de agua llegaba a medirse.
    const difs = diferencias(FILA(), FILA({ agua_g: 450, reparto: "90-90-135-135" }));
    assert.deepEqual(difs.map((d) => d.variable), ["agua_g"]);
    assert.ok(!VARIABLES_DECLARADAS.includes("reparto"));
  });
});

describe("el texto de variable_cambiada", () => {
  const t = textos("es");

  it("nombra la columna y los dos valores", () => {
    assert.equal(
      variableCambiadaDe(FILA({ temp_c: 94 }), FILA(), t),
      "temp_c 91 → 94",
    );
  });

  it("la receta se nombra por su slug, no por su uuid", () => {
    assert.equal(
      variableCambiadaDe(
        FILA({ receta_id: "r2", receta_slug: "kasuya_claridad" }), FILA(), t,
      ),
      "receta_id kasuya → kasuya_claridad",
    );
  });

  it("dos cambios salen los dos, que ocultar uno sería mentir", () => {
    assert.equal(
      variableCambiadaDe(FILA({ temp_c: 94, clics: 30 }), FILA(), t),
      "temp_c 91 → 94 · clics 28 → 30",
    );
  });

  it("repetir a propósito es «sin cambios», no un hueco", () => {
    assert.equal(variableCambiadaDe(FILA(), FILA(), t), "Sin cambios");
  });

  it("sin madre, la primera de la bolsa", () => {
    assert.equal(variableCambiadaDe(FILA(), null, t), "Primera extracción");
  });

  it("y sin bolsa, una taza suelta", () => {
    assert.equal(variableCambiadaDe(FILA({ cafe_id: null }), null, t), "Taza suelta");
  });

  it("habla los dos idiomas", () => {
    assert.equal(variableCambiadaDe(FILA(), null, textos("en")), "First brew");
    assert.equal(variableCambiadaDe(FILA(), FILA(), textos("en")), "No changes");
  });
});

describe("el aviso de mover dos cosas", () => {
  const t = textos("es");
  const madre = FILA({ id: "m" });
  const conMadre = (campos) => [madre, FILA({ id: "h", desde_id: "m", ...campos })];

  it("salta cuando se movieron dos", () => {
    const [, hija] = conMadre({ temp_c: 94, clics: 30 });
    const avisos = avisosDe(hija, conMadre({ temp_c: 94, clics: 30 }), null, t);
    assert.ok(avisos.some((a) => a.includes("temp_c, clics")));
  });

  it("calla con una sola", () => {
    const historico = conMadre({ temp_c: 94 });
    const avisos = avisosDe(historico[1], historico, null, t);
    assert.ok(!avisos.some((a) => a.includes("misma extracción")));
  });

  it("calla en una primera, que no hay contra qué comparar", () => {
    const avisos = avisosDe(FILA(), [FILA()], null, t);
    assert.ok(!avisos.some((a) => a.includes("misma extracción")));
  });
});

describe("el emparejado usa el mismo diff", () => {
  const par = (campos) => [
    FILA({ id: "m", nota: 6 }),
    FILA({ id: "h", desde_id: "m", nota: 8, ...campos }),
  ];

  it("empareja un cambio de temperatura", () => {
    assert.deepEqual(pares(par({ temp_c: 94 })), [
      { cafe_id: "gary", variable: "temp_c", direccion: "subir", delta_nota: 2 },
    ]);
  });

  it("y ahora también uno de agua, que el reparto ya no estorba", () => {
    const emparejados = pares(par({ agua_g: 450, reparto: "90-90-135-135" }));
    assert.deepEqual(emparejados.map((p) => p.variable), ["agua_g"]);
  });

  it("dos variables siguen sin formar par", () => {
    assert.deepEqual(pares(par({ temp_c: 94, clics: 30 })), []);
  });
});

describe("el servidor rellena variable_cambiada por el puerto", () => {
  const RECETA = {
    nombre: "4:6 Kasuya base",
    ratio: 15,
    pasos: [
      { accion: "verter", agua_g: 60, t_inicio_s: 0 },
      { accion: "verter", agua_g: 240, t_inicio_s: 45 },
    ],
  };
  const BASE = {
    cafe_id: "gary", temp_c: 91, clics: 28, tiempo_total: "3:30",
    defecto: "equilibrado", nota: 7, receta_id: "4_6_kasuya_base",
  };

  const monta = async () => {
    const almacen = almacenEnMemoria();
    await crearCafe(almacen, { nombre: "Gary", peso_g: 340 });
    await guardarReceta(almacen, { nuevo: true }, RECETA);
    return almacen;
  };

  it("sin mandarla, la primera de la bolsa se apunta como tal", async () => {
    const almacen = await monta();
    const { estado, datos } = await crearExtraccion(almacen, BASE);
    assert.equal(estado, 201);
    assert.equal(datos.extraccion.variable_cambiada, "Primera extracción");
  });

  it("la segunda cuenta lo que se movió de verdad", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const { datos } = await crearExtraccion(almacen, { ...BASE, temp_c: 94 });
    assert.equal(datos.extraccion.variable_cambiada, "temp_c 91 → 94");
  });

  it("lo que escribe quien registra manda siempre", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const { datos } = await crearExtraccion(almacen, {
      ...BASE, temp_c: 94, variable_cambiada: "subí el hervidor a ojo",
    });
    assert.equal(datos.extraccion.variable_cambiada, "subí el hervidor a ojo");
  });

  it("repetir la misma taza queda apuntado como sin cambios", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const { datos } = await crearExtraccion(almacen, BASE);
    assert.equal(datos.extraccion.variable_cambiada, "Sin cambios");
  });

  it("una taza sin bolsa no se compara con ninguna otra", async () => {
    const almacen = await monta();
    const { datos } = await crearExtraccion(almacen, { ...BASE, cafe_id: "" });
    assert.equal(datos.extraccion.variable_cambiada, "Taza suelta");
  });

  it("y queda escrito en la base, no solo en la respuesta", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const guardada = (await almacen.extracciones.listar())[0];
    assert.equal(guardada.variable_cambiada, "Primera extracción");
  });

  it("el molinillo se hereda de la madre, que no está en el formulario", async () => {
    // Sin heredar, el valor por defecto volvía a poner el Comandante y cada
    // taza «cambiaba de molinillo» ella sola: un cambio que nadie hizo.
    const almacen = await monta();
    await crearExtraccion(almacen, { ...BASE, molinillo: "1Zpresso J-Ultra" });
    const { datos } = await crearExtraccion(almacen, { ...BASE, temp_c: 94 });
    assert.equal(datos.extraccion.molinillo, "1Zpresso J-Ultra");
    assert.equal(datos.extraccion.variable_cambiada, "temp_c 91 → 94");
  });

  it("cambiar de molinillo a propósito sí se apunta", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const { datos } = await crearExtraccion(almacen, {
      ...BASE, molinillo: "1Zpresso J-Ultra",
    });
    assert.equal(
      datos.extraccion.variable_cambiada,
      "molinillo Comandante C40 → 1Zpresso J-Ultra",
    );
  });

  it("colgar de una retirada no es ser la primera de la bolsa", async () => {
    const almacen = await monta();
    const { datos: una } = await crearExtraccion(almacen, BASE);
    await retirarExtraccion(almacen, una.extraccion.id);
    const { datos } = await crearExtraccion(almacen, {
      ...BASE, temp_c: 94, desde_id: una.extraccion.id,
    });
    assert.equal(
      datos.extraccion.variable_cambiada,
      "La anterior está retirada: sin comparación",
    );
  });

  it("vaciarla por PATCH no deja un hueco: se recompone", async () => {
    const almacen = await monta();
    await crearExtraccion(almacen, BASE);
    const { datos } = await crearExtraccion(almacen, { ...BASE, temp_c: 94 });
    const { estado } = await editarExtraccion(
      almacen, datos.extraccion.id, { variable_cambiada: "" },
    );
    assert.equal(estado, 200);
    const fila = (await almacen.extracciones.listar())
      .find((e) => e.id === datos.extraccion.id);
    assert.equal(fila.variable_cambiada, "temp_c 91 → 94");
  });

  it("el PATCH respeta lo que se escriba, como el alta", async () => {
    const almacen = await monta();
    const { datos } = await crearExtraccion(almacen, BASE);
    await editarExtraccion(almacen, datos.extraccion.id, { variable_cambiada: "a ojo" });
    const fila = (await almacen.extracciones.listar())[0];
    assert.equal(fila.variable_cambiada, "a ojo");
  });
});

describe("un solo formato para la columna", () => {
  it("lo compone la misma función que usa el servidor", () => {
    // La app elige las filas de su tabla y el servidor las saca del diff,
    // pero el texto sale de aquí en los dos casos: sin esto, la misma
    // bitácora guardaba «Temperatura 91 → 94» y «temp_c 91 → 94».
    const antes = FILA();
    const despues = FILA({ temp_c: 94 });
    assert.equal(
      textoDeVariables(["temp_c"], antes, despues),
      variableCambiadaDe(despues, antes, textos("es")),
    );
  });

  it("nombra la columna, no su etiqueta, y en los dos idiomas igual", () => {
    const texto = textoDeVariables(["temp_c"], FILA(), FILA({ temp_c: 94 }));
    assert.equal(texto, "temp_c 91 → 94");
  });

  it("respeta las variables que le pidan, en su orden", () => {
    assert.equal(
      textoDeVariables(["clics", "temp_c"], FILA(), FILA({ temp_c: 94, clics: 30 })),
      "clics 28 → 30 · temp_c 91 → 94",
    );
  });
});
