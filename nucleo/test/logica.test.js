/** Tests de la lógica pura de la bitácora. Uso: pnpm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  escalarPasos, finDeLosVertidos, guion, repartoDe, vertidos,
} from "../src/recetas.js";
import {
  avisosDe, cambiosDe, cobertura, defectoPrincipal, efectos, extrapolar, pares,
  madreDe, retencion, sugerir, textoCorto, vertidoDesviado,
} from "../src/sugerencias.js";
import {
  claveDeFoto, defectosDe, extraidoImposible, fechaValida, goteoImposible,
  goteoTrasMoverTotal, MAX_FOTO_BYTES, relojDe, segundosDe, slugDe,
  totalTrasMoverGoteo, validarCafe, validarCambiosExtraccion,
  validarExtraccion, validarFoto, validarReceta,
} from "../src/validacion.js";

const paso = (orden, accion, agua_g, t_inicio_s = "") => ({
  receta_id: "kasuya-46-base", orden, t_inicio_s, accion, agua_g, notas: "",
});

const BASE = [
  paso(1, "verter", 60, 0), paso(2, "verter", 60, 45),
  paso(3, "verter", 90, 90), paso(4, "verter", 90, 135),
  paso(5, "esperar", 0, 180), paso(6, "retirar", 0),
];

const CON_AGITACION = [
  paso(1, "verter", 60, 0), paso(2, "agitar", 0, 30),
  paso(3, "verter", 60, 45), paso(4, "remover", 0, 60),
  paso(5, "verter", 180, 90),
];

/*
 * La receta que siembra el modo local: cada vertido con su espera detrás, así
 * que el último acaba en el 170. Es la que hay que usar para todo lo que mire
 * cuándo se deja de verter — BASE no lleva las esperas y da el 180.
 */
const CON_ESPERAS = [
  paso(1, "verter", 60, 0), paso(2, "esperar", 0, 15),
  paso(3, "verter", 60, 45), paso(4, "esperar", 0, 60),
  paso(5, "verter", 90, 90), paso(6, "esperar", 0, 115),
  paso(7, "verter", 90, 145), paso(8, "esperar", 0, 170),
  paso(9, "retirar", 0, 200),
];

const extraccion = (campos = {}) => ({
  id: 1, cafe_id: "gary", dias_tueste: 20, temp_c: 94, clics: 28, dosis_g: 20,
  agua_g: 300, reparto: "60-60-90-90", receta_id: "kasuya-46-base",
  molinillo: "Comandante C40", dripper: "v60-02-plastico", drawdown_s: null,
  defecto: "equilibrado", nota: 7, desde_id: null, ...campos,
});

/**
 * Un histórico en línea: cada una cuelga de la anterior, que es lo que pone el
 * alta cuando no le dices otra cosa. Las ids son 1, 2, 3… porque lo único que
 * se compara es la igualdad, y unos uuid de verdad harían el test ilegible.
 */
const serie = (...filas) =>
  filas.map((campos, i) => extraccion({ id: i + 1, desde_id: i || null, ...campos }));

describe("escalado de recetas", () => {
  it("no cambia nada con el agua de referencia", () => {
    assert.equal(repartoDe(BASE, 300), "60-60-90-90");
  });

  it("reparte proporcionalmente", () => {
    assert.equal(repartoDe(BASE, 270), "54-54-81-81");
  });

  it("los vertidos siempre suman el agua", () => {
    for (const agua of [150, 175, 225, 260, 270, 300, 305, 333, 450, 500]) {
      const suma = vertidos(escalarPasos(BASE, agua)).reduce((t, p) => t + p.agua_g, 0);
      assert.equal(suma, agua, `con ${agua} g`);
    }
  });

  it("los pasos sin agua no se tocan", () => {
    const escalados = escalarPasos(BASE, 270);
    assert.equal(escalados[4].agua_g, 0);
    assert.equal(escalados[5].accion, "retirar");
  });

  it("los tiempos no se escalan", () => {
    assert.deepEqual(
      escalarPasos(BASE, 500).map((p) => p.t_inicio_s),
      BASE.map((p) => p.t_inicio_s),
    );
  });

  it("no muta los pasos originales", () => {
    escalarPasos(BASE, 270);
    assert.equal(BASE[0].agua_g, 60);
  });

  it("con agitación solo escala los vertidos", () => {
    const escalados = escalarPasos(CON_AGITACION, 150);
    assert.equal(vertidos(escalados).reduce((t, p) => t + p.agua_g, 0), 150);
    assert.equal(escalados[1].agua_g, 0);
  });

  it("rechaza una receta sin vertidos", () => {
    assert.throws(() => escalarPasos([paso(1, "esperar", 0)], 300), /ningún vertido/);
  });

  it("rechaza agua no positiva", () => {
    assert.throws(() => escalarPasos(BASE, 0), /mayor que 0/);
  });
});

describe("cuándo se deja de verter", () => {
  it("lo dice el paso que va detrás del último vertido, no el vertido", () => {
    assert.equal(finDeLosVertidos(CON_ESPERAS), 170);
    assert.equal(finDeLosVertidos(BASE), 180);
  });

  it("una receta que acaba vertiendo no lo sabe, y lo dice", () => {
    assert.equal(finDeLosVertidos(CON_AGITACION), null);
  });

  it("se salta los pasos sin hora hasta encontrar uno que la tenga", () => {
    const sinHora = [paso(1, "verter", 300, 0), paso(2, "retirar", 0), paso(3, "esperar", 0, 90)];
    assert.equal(finDeLosVertidos(sinHora), 90);
  });

  it("sin vertidos no hay nada que terminar", () => {
    assert.equal(finDeLosVertidos([paso(1, "esperar", 0, 10)]), null);
    assert.equal(finDeLosVertidos([]), null);
    assert.equal(finDeLosVertidos(null), null);
  });
});

describe("guion para el cronómetro", () => {
  it("lleva el acumulado", () => {
    assert.deepEqual(guion(BASE, 300).map((p) => p.acumulado_g), [60, 120, 210, 300, 300, 300]);
  });

  it("marca dónde no fiarse de la báscula", () => {
    const porAccion = Object.fromEntries(
      guion(CON_AGITACION, 300).map((p) => [p.accion, p.lectura_fiable]),
    );
    assert.equal(porAccion.verter, true);
    assert.equal(porAccion.agitar, false);
    assert.equal(porAccion.remover, false);
  });

  it("deja el tiempo a null cuando no lo hay", () => {
    const pasos = guion(BASE, 300);
    assert.equal(pasos[0].t_inicio_s, 0);
    assert.equal(pasos[5].t_inicio_s, null);
  });

  it("lleva el estilo del vertido hasta el cronómetro", () => {
    const conEstilo = [{ ...paso(1, "verter", 300, 0), estilo: "espiral" }];
    assert.equal(guion(conEstilo, 300)[0].estilo, "espiral");
    assert.equal(guion(BASE, 300)[0].estilo, null);
  });
});

describe("palancas por defecto", () => {
  it("amargor propone moler más grueso primero", () => {
    const [principal] = cambiosDe(extraccion({ defecto: "amargor" }));
    assert.deepEqual([principal.variable, principal.cambio], ["clics", "+2"]);
  });

  it("plano propone moler más fino", () => {
    const [principal] = cambiosDe(extraccion({ defecto: "plano" }));
    assert.deepEqual([principal.variable, principal.cambio], ["clics", "-2"]);
  });

  it("agrio ataca primero la temperatura", () => {
    const [principal] = cambiosDe(extraccion({ defecto: "agrio" }));
    assert.deepEqual([principal.variable, principal.cambio], ["temp_c", "+3"]);
  });

  it("equilibrado no propone nada", () => {
    assert.deepEqual(cambiosDe(extraccion()), []);
  });

  it("el goteo largo manda sobre el defecto", () => {
    const [principal] = cambiosDe(extraccion({ defecto: "plano", drawdown_s: 95 }));
    assert.equal(principal.cambio, "+2");
    assert.match(principal.porque, /95/);
  });

  it("el goteo corto propone moler más fino", () => {
    assert.equal(cambiosDe(extraccion({ drawdown_s: 15 }))[0].cambio, "-2");
  });

  it("el goteo normal no dice nada", () => {
    assert.deepEqual(cambiosDe(extraccion({ drawdown_s: 50 })), []);
  });

  it("no repite la misma variable dos veces", () => {
    const variables = cambiosDe(extraccion({ defecto: "amargor", drawdown_s: 95 })).map((c) => c.variable);
    assert.equal(variables.length, new Set(variables).size);
  });
});

describe("varios defectos, en orden de relevancia", () => {
  it("la lista se lee igual venga como texto o como array", () => {
    assert.deepEqual(defectosDe("amargor,astringente"), ["amargor", "astringente"]);
    assert.deepEqual(defectosDe(["Amargor", " astringente "]), ["amargor", "astringente"]);
    assert.deepEqual(defectosDe(null), []);
  });

  it("un solo defecto es una lista de uno: las filas viejas no migran", () => {
    assert.deepEqual(defectosDe("amargor"), ["amargor"]);
    assert.equal(defectoPrincipal({ defecto: "amargor" }), "amargor");
  });

  /*
   * El corazón de la decisión: se registran todos, pero la palanca sale solo
   * del primero. Amargor pide moler más grueso y plano más fino — si mandaran
   * los dos, el molinillo tendría que ir a la vez en dos direcciones.
   */
  it("la palanca sale solo del primero, no de los dos", () => {
    const cambios = cambiosDe(extraccion({ defecto: "amargor,plano" }));
    assert.deepEqual(cambios.map((c) => `${c.variable} ${c.cambio}`), ["clics +2", "temp_c -3"]);
  });

  it("cambiar el orden cambia la sugerencia, que para eso se ordena", () => {
    const alReves = cambiosDe(extraccion({ defecto: "plano,amargor" }));
    assert.deepEqual(alReves.map((c) => `${c.variable} ${c.cambio}`), ["clics -2", "temp_c +3"]);
  });

  it("el resumen que se guarda es el del primero", () => {
    assert.equal(textoCorto(sugerir(extraccion({ defecto: "astringente,amargor" }))), "clics +3");
  });

  /*
   * Los avisos sí miran la lista entera: no compiten entre ellos y ninguno
   * mueve el molinillo, así que caben todos a la vez.
   */
  it("un aviso salta aunque su defecto no sea el primero", () => {
    const avisos = avisosDe(extraccion({ defecto: "amargor,carton", dias_tueste: 90 }));
    assert.ok(avisos.some((a) => /cartón/.test(a)));
  });

  it("con un defecto delante no está conforme aunque el segundo sea inocuo", () => {
    assert.equal(sugerir(extraccion({ defecto: "amargor", nota: 9 })).conforme, false);
    assert.equal(sugerir(extraccion({ defecto: "equilibrado", nota: 9 })).conforme, true);
  });
});

describe("cuerpo aguado", () => {
  it("propone moler más fino y, si no, subir la dosis", () => {
    const cambios = cambiosDe(extraccion({ defecto: "aguado" }));
    assert.deepEqual(cambios.map((c) => `${c.variable} ${c.cambio}`), ["clics -2", "dosis_g +1"]);
  });
});

describe("lo extraído contra el agua", () => {
  it("pasarse del agua es imposible, no una taza rara", () => {
    assert.ok(extraidoImposible(400, 300).includes("no puede pasar"));
  });

  it("justo el agua entero cuela: el lecho podría no quedarse nada", () => {
    assert.equal(extraidoImposible(300, 300), null);
  });

  it("sin uno de los dos no hay nada que comparar", () => {
    assert.equal(extraidoImposible(null, 300), null);
    assert.equal(extraidoImposible(260, null), null);
    assert.equal(extraidoImposible(undefined, undefined), null);
  });

  it("el alta lo rechaza con su mensaje", () => {
    const { errores } = validarExtraccion({
      cafe_id: "gary", temp_c: 91, clics: 28, tiempo_total: "3:30",
      variable_cambiada: "prueba", defecto: "equilibrado", nota: 7,
      agua_g: 300, extraido_g: 400,
    });
    assert.ok(errores.some((e) => e.includes("no puede pasar del agua")));
  });
});

describe("el goteo va por dentro del tiempo total", () => {
  it("lee el reloj de la fila, que es texto", () => {
    assert.equal(segundosDe("3:30"), 210);
    assert.equal(segundosDe("3:5"), 185);
    assert.equal(segundosDe("12:05"), 725);
  });

  it("y calla con lo que no sepa leer, que la columna es libre", () => {
    assert.equal(segundosDe("tres y medio"), null);
    assert.equal(segundosDe("3:75"), null);
    assert.equal(segundosDe(null), null);
  });

  it("y lo escribe de vuelta como lo guarda la base", () => {
    assert.equal(relojDe(210), "3:30");
    assert.equal(relojDe(725), "12:05");
    assert.equal(relojDe(5), "0:05");
  });

  it("al escribir, los segundos rotos se truncan y no hay tiempos negativos", () => {
    assert.equal(relojDe(207.8), "3:27");
    assert.equal(relojDe(-30), "0:00");
  });

  it("ida y vuelta no cambia nada, que es lo que ata los dos campos", () => {
    for (const texto of ["0:00", "3:30", "12:05"]) {
      assert.equal(relojDe(segundosDe(texto)), texto);
    }
  });

  it("un goteo más largo que el total es imposible, no una taza rara", () => {
    assert.ok(goteoImposible(220, "3:32").includes("no puede llegar"));
  });

  it("y llegar justo tampoco: el total arranca en el primer vertido", () => {
    assert.ok(goteoImposible(212, "3:32"));
  });

  /*
   * La fila del 2026-08-07, que es la que motivó todo esto: el reloj siguió
   * corriendo al tirar el filtro, se corrigió el total a mano y el goteo se
   * quedó en 64. Los dos valores son posibles por separado — por eso la
   * comprobación dura no basta y hace falta el aviso.
   */
  it("64 s de goteo en 3:32 no es imposible, solo está mal medido", () => {
    assert.equal(goteoImposible(64, "3:32"), null);
  });

  it("sin uno de los dos no hay nada que comparar", () => {
    assert.equal(goteoImposible(null, "3:30"), null);
    assert.equal(goteoImposible(45, null), null);
    assert.equal(goteoImposible(45, "un rato"), null);
  });

  it("el alta lo rechaza con su mensaje", () => {
    const { errores } = validarExtraccion({
      cafe_id: "gary", temp_c: 91, clics: 28, tiempo_total: "3:30",
      variable_cambiada: "prueba", defecto: "equilibrado", nota: 7, drawdown_s: 240,
    });
    assert.ok(errores.some((e) => e.includes("no puede llegar al tiempo total")));
  });
});

describe("mover uno mueve el otro", () => {
  it("alargar el tiempo total alarga el goteo lo mismo", () => {
    assert.equal(goteoTrasMoverTotal("3:10", "3:32", 42), 64);
  });

  it("y acortarlo lo acorta", () => {
    assert.equal(goteoTrasMoverTotal("3:32", "3:10", 64), 42);
  });

  it("nunca hasta un goteo negativo: ahí lo que hay es otra cosa", () => {
    assert.equal(goteoTrasMoverTotal("3:32", "0:30", 64), null);
  });

  it("sin goteo no hay nada que arrastrar, que es opcional", () => {
    assert.equal(goteoTrasMoverTotal("3:10", "3:32", null), null);
  });

  it("ni con un tiempo que no se deja leer", () => {
    assert.equal(goteoTrasMoverTotal("un rato", "3:32", 42), null);
    assert.equal(goteoTrasMoverTotal("3:10", "", 42), null);
  });

  it("y quieto es quieto: sin cambio no devuelve nada que escribir", () => {
    assert.equal(goteoTrasMoverTotal("3:32", "3:32", 42), null);
  });

  it("por el otro lado igual: mover el goteo mueve el total", () => {
    assert.equal(totalTrasMoverGoteo(42, 64, "3:10"), "3:32");
    assert.equal(totalTrasMoverGoteo(64, 42, "3:32"), "3:10");
  });

  it("sin dejar el total en cero o por debajo", () => {
    assert.equal(totalTrasMoverGoteo(64, 0, "1:00"), null);
    assert.equal(totalTrasMoverGoteo(42, 42, "3:10"), null);
  });
});

describe("el vertido de la fila contra el de la receta", () => {
  const receta = { pasos: CON_ESPERAS };
  const medida = (tiempo_total, drawdown_s) => extraccion({ tiempo_total, drawdown_s });

  it("delata la fila mal medida del 2026-08-07", () => {
    const aviso = vertidoDesviado(medida("3:32", 64), receta);
    assert.ok(aviso.includes("148"));
    assert.ok(aviso.includes("170"));
    assert.ok(aviso.includes("22 s de diferencia"));
  });

  it("y calla con la corrección buena, que cuadra al segundo", () => {
    assert.equal(vertidoDesviado(medida("3:32", 42), receta), null);
  });

  it("cinco segundos de desvío son verter a mano, no un error", () => {
    assert.equal(vertidoDesviado(medida("3:25", 30), receta), null);
  });

  it("sin goteo, sin reloj o sin receta no hay nada que cruzar", () => {
    assert.equal(vertidoDesviado(medida("3:32", null), receta), null);
    assert.equal(vertidoDesviado(medida(null, 64), receta), null);
    assert.equal(vertidoDesviado(medida("3:32", 64), null), null);
  });

  it("ni con una receta que no sabe cuándo se deja de verter", () => {
    assert.equal(vertidoDesviado(medida("3:32", 64), { pasos: CON_AGITACION }), null);
  });

  it("sale por los avisos, que es donde se lee", () => {
    const avisos = avisosDe(medida("3:32", 64), [], receta);
    assert.ok(avisos.some((a) => a.includes("de diferencia")));
    assert.deepEqual(avisosDe(medida("3:32", 42), [], receta), []);
  });
});

describe("retención", () => {
  const conTaza = (extraido) => extraccion({ agua_g: 300, dosis_g: 20, extraido_g: extraido });

  it("son los gramos de agua que se queda el lecho por gramo de café", () => {
    assert.equal(retencion(conTaza(260)), 2);
  });

  it("no se calcula sin la cantidad extraída", () => {
    assert.equal(retencion(extraccion()), null);
  });

  it("una retención normal no dice nada", () => {
    assert.deepEqual(avisosDe(conTaza(260)), []);
  });

  it("una retención imposible delata la medida, no la taza", () => {
    const avisos = avisosDe(conTaza(295));
    assert.ok(avisos.some((a) => a.includes("retención")));
  });
});

describe("extrapolar cuando no hay defecto", () => {
  const equilibrada = (campos) => ({ defecto: "equilibrado", nota: 7, ...campos });
  const serieEquilibrada = (...filas) => serie(...filas.map(equilibrada));

  it("sigue por el eje que se movió si no empeoró", () => {
    const historico = serieEquilibrada({ temp_c: 94 }, { temp_c: 91 });
    const siguiente = extrapolar(historico[1], historico);
    assert.equal(siguiente.variable, "temp_c");
    assert.equal(siguiente.cambio, "-3");
  });

  it("da media vuelta si el último cambio empeoró la nota", () => {
    const historico = serieEquilibrada({ temp_c: 94, nota: 8 }, { temp_c: 91, nota: 6 });
    assert.equal(extrapolar(historico[1], historico).cambio, "+3");
  });

  it("no se mete si hay defecto: para eso están las palancas", () => {
    const historico = serieEquilibrada({ temp_c: 94 }, { temp_c: 91, defecto: "amargor" });
    assert.equal(extrapolar(historico[1], historico), null);
  });

  it("no se mete si la taza ya está buena", () => {
    const historico = serieEquilibrada({ temp_c: 94 }, { temp_c: 91, nota: 9 });
    assert.equal(extrapolar(historico[1], historico), null);
  });

  it("calla si no hay ningún par del que tirar", () => {
    const [sola] = serieEquilibrada({});
    assert.equal(extrapolar(sola, [sola]), null);
  });

  it("no extrapola sobre lo que no tiene salto conocido", () => {
    const historico = serieEquilibrada(
      { receta_id: "kasuya-46-base" }, { receta_id: "kasuya-46-claridad" },
    );
    assert.equal(extrapolar(historico[1], historico), null);
  });

  it("solo habla cuando las reglas callan", () => {
    // Con goteo corto hay palanca, así que la extrapolación no pinta nada.
    const historico = serieEquilibrada({ temp_c: 94 }, { temp_c: 91, drawdown_s: 15 });
    const { cambios } = sugerir(historico[1], historico);
    assert.equal(cambios.length, 1);
    assert.equal(cambios[0].variable, "clics");
    assert.ok(cambios[0].porque.includes("de largo"));
  });

  it("y la principal acaba en siguiente_ajuste", () => {
    const historico = serieEquilibrada({ temp_c: 94 }, { temp_c: 91 });
    assert.equal(textoCorto(sugerir(historico[1], historico)), "temp_c -3");
  });
});

describe("avisos", () => {
  it("avisa de café pasado", () => {
    assert.ok(avisosDe(extraccion({ dias_tueste: 77 })).some((a) => a.includes("77")));
  });

  it("no avisa con café fresco", () => {
    assert.deepEqual(avisosDe(extraccion({ dias_tueste: 15 })), []);
  });

  it("dias_tueste nulo no revienta", () => {
    assert.deepEqual(avisosDe(extraccion({ dias_tueste: null })), []);
  });

  it("avisa de una bolsa que lleva mucho abierta", () => {
    const avisos = avisosDe(extraccion({ dias_abierta: 40 }));
    assert.ok(avisos.some((a) => a.includes("40 días abierta")));
  });

  it("una bolsa recién abierta no dice nada", () => {
    assert.deepEqual(avisosDe(extraccion({ dias_abierta: 3 })), []);
  });

  it("sin fecha de apertura no se inventa el aviso", () => {
    assert.deepEqual(avisosDe(extraccion({ dias_abierta: null })), []);
  });

  it("avisa de la masa térmica de la cerámica", () => {
    const avisos = avisosDe(extraccion({ dripper: "v60-02-ceramica" }));
    assert.ok(avisos.some((a) => a.includes("masa térmica")));
  });

  const cambioDeDripper = (historico) =>
    avisosDe(historico.at(-1), historico).some((a) => a.includes("cambiado de dripper"));

  it("avisa al cambiar de dripper", () => {
    assert.ok(cambioDeDripper(serie({}, { dripper: "v60-02-ceramica" })));
  });

  it("el dripper de otro café no cuenta como cambio", () => {
    assert.ok(!cambioDeDripper(serie({ cafe_id: "abbie", dripper: "v60-02-ceramica" }, {})));
  });

  it("dos sueltas no se comparan: sin bolsa no hay madre", () => {
    assert.ok(!cambioDeDripper(serie(
      { cafe_id: null, dripper: "v60-02-ceramica" }, { cafe_id: null },
    )));
  });

  // La cara nueva del mismo aviso: al volver a una rama anterior, el dripper
  // que cuenta es el de la madre y no el de la taza de ayer.
  it("compara con la madre, no con la última", () => {
    const historico = serie({}, { dripper: "v60-02-ceramica" }, {});
    historico[2].desde_id = 1;
    assert.ok(!cambioDeDripper(historico));
    historico[2].desde_id = 2;
    assert.ok(cambioDeDripper(historico));
  });
});

describe("deltas emparejados", () => {
  it("empareja cuando cambia una sola variable", () => {
    const [par] = pares(serie({ temp_c: 94, nota: 7 }, { temp_c: 91, nota: 8 }));
    assert.deepEqual(
      [par.variable, par.direccion, par.delta_nota],
      ["temp_c", "bajar", 1],
    );
  });

  it("no empareja si cambian dos variables", () => {
    const historico = serie({ temp_c: 94, clics: 28 }, { temp_c: 91, clics: 26 });
    assert.deepEqual(pares(historico), []);
  });

  it("no empareja extracciones de cafés distintos", () => {
    const historico = serie({ cafe_id: "gary" }, { cafe_id: "abbie", temp_c: 91 });
    assert.deepEqual(pares(historico), []);
  });

  it("las sueltas tampoco emparejan entre sí: compartir «sin bolsa» no las hace el mismo café", () => {
    const historico = serie(
      { cafe_id: null, temp_c: 94, nota: 7 },
      { cafe_id: null, temp_c: 91, nota: 8 },
    );
    assert.deepEqual(pares(historico), []);
  });

  it("una sin madre no empareja, aunque haya otra delante", () => {
    const historico = serie({ temp_c: 94, nota: 7 }, { temp_c: 91, nota: 8 });
    historico[1].desde_id = null;
    assert.deepEqual(pares(historico), []);
  });

  it("un solo par no llega a tendencia", () => {
    assert.deepEqual(efectos(serie({ temp_c: 94, nota: 7 }, { temp_c: 91, nota: 8 })), {});
  });

  it("dos pares ya promedian", () => {
    const historico = serie(
      { temp_c: 94, nota: 6 }, { temp_c: 91, nota: 8 }, { temp_c: 88, nota: 9 },
    );
    const efecto = efectos(historico)["temp_c|bajar"];
    assert.equal(efecto.casos, 2);
    assert.equal(efecto.media, 1.5);
  });

  it("cambiar de dripper cuenta como la variable del par", () => {
    const historico = serie({ nota: 7 }, { dripper: "v60-02-ceramica", nota: 8 });
    assert.equal(pares(historico)[0].variable, "dripper");
  });
});

/*
 * El corazón del cambio: el motor deja de mirar un paso hacia atrás y mira a
 * la madre. Con la escalera de temperatura de Gary —94 amargo, 91 equilibrado,
 * 88 astringente— lo razonable es volver al 91 y mover la molienda. Contra la
 * de ayer eso son dos cambios y el par se descarta; contra la madre es uno.
 */
describe("volver a una rama anterior", () => {
  const escalera = () => serie(
    { temp_c: 94, nota: 7 }, { temp_c: 91, nota: 7 }, { temp_c: 88, nota: 5 },
  );

  it("la vuelta empareja contra su madre y no contra la de ayer", () => {
    const historico = escalera();
    historico.push(extraccion({ id: 4, desde_id: 2, temp_c: 91, clics: 30, nota: 8 }));

    const ultimo = pares(historico).at(-1);
    assert.deepEqual(
      [ultimo.variable, ultimo.direccion, ultimo.delta_nota],
      ["clics", "subir", 1],
    );
  });

  it("y por vecindad se habría descartado: contra el 88 son dos cambios", () => {
    const historico = escalera();
    historico.push(extraccion({ id: 4, desde_id: 3, temp_c: 91, clics: 30, nota: 8 }));
    assert.equal(pares(historico).length, 2);
  });

  it("la madre retirada no está en el histórico, así que la hija es una primera", () => {
    // Retirar es decir «esto fue un error de registro»: un delta medido contra
    // un error no vale nada, y por eso la hija pasa a no comparar con nadie.
    const historico = escalera().filter((e) => e.id !== 2);
    assert.deepEqual(pares(historico).map((p) => p.variable), []);
  });

  it("y restaurarla devuelve el par sola, sin arreglar nada", () => {
    assert.equal(pares(escalera()).length, 2);
  });

  it("madreDe la encuentra, y calla cuando no hay de qué tirar", () => {
    const historico = escalera();
    assert.equal(madreDe(historico[2], historico).id, 2);
    assert.equal(madreDe(historico[0], historico), null);
    assert.equal(madreDe(extraccion({ id: 9, desde_id: 1, cafe_id: null }), historico), null);
  });
});

describe("cobertura", () => {
  it("lista lo ya probado", () => {
    const historico = [extraccion({ id: 1, temp_c: 94 }), extraccion({ id: 2, temp_c: 91 })];
    const probado = cobertura("gary", historico);
    assert.deepEqual(probado.temp_c, ["91", "94"]);
    assert.deepEqual(probado.clics, ["28"]);
  });

  it("ignora los otros cafés", () => {
    assert.deepEqual(cobertura("gary", [extraccion({ cafe_id: "abbie" })]).temp_c, []);
  });

  it("sin bolsa no hay serie que cubrir", () => {
    const probado = cobertura(null, [extraccion({ id: 1, cafe_id: null, temp_c: 94 })]);
    assert.deepEqual(probado, { temp_c: [], clics: [], receta_id: [] });
  });
});

describe("resumen", () => {
  it("es la palanca principal", () => {
    assert.equal(textoCorto(sugerir(extraccion({ defecto: "amargor" }))), "clics +2");
  });

  it("cuando ya está bien, repetir", () => {
    assert.equal(
      textoCorto(sugerir(extraccion({ defecto: "equilibrado", nota: 9 }))),
      "Repetir igual para confirmar",
    );
  });
});

describe("validación de fechas", () => {
  it("acepta fechas reales", () => {
    for (const f of ["2026-08-06", "2024-02-29"]) assert.ok(fechaValida(f), f);
  });

  it("rechaza formatos y días que no existen", () => {
    for (const f of ["06-08-2026", "2026/08/06", "2026-8-6", "2026-13-01",
                     "2026-02-30", "2026-02-29", "2026-04-31", "ayer", ""]) {
      assert.ok(!fechaValida(f), f);
    }
  });
});

describe("validación de extracciones", () => {
  const cuerpo = (campos = {}) => ({
    cafe_id: "gary", temp_c: 91, clics: 28, tiempo_total: "3:30",
    variable_cambiada: "91 °C", defecto: "equilibrado", nota: 8, ...campos,
  });

  it("aplica la receta base", () => {
    const { valores, errores } = validarExtraccion(cuerpo());
    assert.deepEqual(errores, []);
    assert.equal(valores.dosis_g, 20);
    assert.equal(valores.agua_g, 300);
    assert.equal(valores.molinillo, "Comandante C40");
    assert.equal(valores.receta_id, "kasuya-46-base");
    assert.equal(valores.dripper, "v60-02-plastico");
  });

  it("pone la fecha de hoy si falta", () => {
    const { valores } = validarExtraccion(cuerpo(), { ahora: new Date("2026-08-06T10:00:00Z") });
    assert.equal(valores.fecha, "2026-08-06");
  });

  it("exige los obligatorios", () => {
    const { errores } = validarExtraccion({ cafe_id: "gary" });
    assert.ok(errores.some((e) => e.includes("obligatorios")));
  });

  it("la bolsa no es obligatoria: una taza sin ficha se apunta suelta", () => {
    const { valores, errores } = validarExtraccion(cuerpo({ cafe_id: "" }));
    assert.deepEqual(errores, []);
    assert.equal(valores.cafe_id, null);
  });

  it("rechaza notas fuera de rango", () => {
    for (const nota of [0, 11, -3, 7.5, "ocho"]) {
      assert.ok(validarExtraccion(cuerpo({ nota })).errores.length, `nota ${nota}`);
    }
  });

  it("rechaza defecto y dripper inventados", () => {
    assert.ok(validarExtraccion(cuerpo({ defecto: "quemado" })).errores.length);
    assert.ok(validarExtraccion(cuerpo({ dripper: "chemex" })).errores.length);
  });

  it("normaliza mayúsculas", () => {
    const { valores, errores } = validarExtraccion(cuerpo({ defecto: "AMARGOR", dripper: "V60-02-CERAMICA" }));
    assert.deepEqual(errores, []);
    assert.equal(valores.defecto, "amargor");
    assert.equal(valores.dripper, "v60-02-ceramica");
  });

  it("guarda varios defectos en su forma canónica, venga array o texto", () => {
    for (const defecto of [["Amargor", "astringente"], "amargor, astringente"]) {
      const { valores, errores } = validarExtraccion(cuerpo({ defecto }));
      assert.deepEqual(errores, [], JSON.stringify(defecto));
      assert.equal(valores.defecto, "amargor,astringente");
    }
  });

  it("una clave inventada entre varias buenas tumba la fila entera", () => {
    assert.ok(validarExtraccion(cuerpo({ defecto: "amargor,quemado" })).errores.length);
  });

  it("rechaza el mismo defecto dos veces", () => {
    assert.ok(validarExtraccion(cuerpo({ defecto: "amargor,plano,amargor" })).errores.length);
  });

  // Decir «equilibrado» es decir que no hay ninguno, así que no acompaña.
  it("equilibrado no puede ir con otro defecto", () => {
    const { errores } = validarExtraccion(cuerpo({ defecto: "equilibrado,amargor" }));
    assert.ok(errores.some((e) => /equilibrado/.test(e)));
  });

  it("sin ningún defecto la fila no pasa: es obligatorio", () => {
    assert.ok(validarExtraccion(cuerpo({ defecto: [] })).errores.length);
  });

  it("rechaza campos que no existen", () => {
    const { errores } = validarExtraccion(cuerpo({ inventado: "x" }));
    assert.ok(errores.some((e) => e.includes("desconocidos")));
  });

  it("rechaza dosis cero y drawdown negativo", () => {
    assert.ok(validarExtraccion(cuerpo({ dosis_g: 0 })).errores.length);
    assert.ok(validarExtraccion(cuerpo({ drawdown_s: -5 })).errores.length);
  });

  it("admite coma decimal", () => {
    const { valores, errores } = validarExtraccion(cuerpo({ dosis_g: "18,5" }));
    assert.deepEqual(errores, []);
    assert.equal(valores.dosis_g, 18.5);
  });
});

describe("alta de bolsas", () => {
  const nueva = (campos = {}) => ({ nombre: "Etiopía Guji", ...campos });

  it("con lo mínimo, el resto queda vacío y abierta", () => {
    const { valores, errores } = validarCafe(nueva(), { nuevo: true });
    assert.deepEqual(errores, []);
    assert.equal(valores.slug, "etiopia_guji");
    assert.equal(valores.estado, "abierto");
    assert.equal(valores.tostador, null);
    assert.equal(valores.fecha_tueste, null);
  });

  it("acepta la ficha completa", () => {
    const { valores, errores } = validarCafe(
      nueva({
        tostador: "Manea Coffee", origen: "Etiopía", altitud_m: 2000, sca: 87,
        fecha_tueste: "2026-08-01", peso_g: 250, precio_eur: "14,5",
        estado: "PENDIENTE", conservacion: "Fellow Atmos 1.2 L",
      }),
      { nuevo: true },
    );
    assert.deepEqual(errores, []);
    assert.equal(valores.precio_eur, 14.5);
    assert.equal(valores.estado, "pendiente");
    assert.equal(valores.sca, 87);
  });

  it("el slug no entra por el cuerpo, y la id solo si es un uuid: es lo que reenvía la cola", () => {
    assert.ok(validarCafe(nueva({ slug: "etiopia" }), { nuevo: true })
      .errores.some((e) => e.includes("desconocidos")));
    assert.ok(validarCafe(nueva({ id: "etiopia" }), { nuevo: true })
      .errores.some((e) => e.includes("id inválida")));
    const { valores, errores } = validarCafe(
      nueva({ id: "019fd647-1234-7abc-8def-000000000001" }), { nuevo: true },
    );
    assert.deepEqual(errores, []);
    assert.equal(valores.id, "019fd647-1234-7abc-8def-000000000001");
  });

  it("exige nombre, y que de él salga un slug", () => {
    assert.ok(validarCafe({ nombre: "  " }, { nuevo: true }).errores.length);
    assert.ok(validarCafe({ nombre: "¡¡¡" }, { nuevo: true })
      .errores.some((e) => e.includes("slug utilizable")));
  });

  it("rechaza fechas que no existen", () => {
    for (const f of ["2026-02-30", "01-08-2026", "2026-13-01"]) {
      assert.ok(validarCafe(nueva({ fecha_tueste: f }), { nuevo: true }).errores.length, f);
    }
  });

  it("rechaza números fuera de rango", () => {
    assert.ok(validarCafe(nueva({ sca: 120 }), { nuevo: true }).errores.length);
    assert.ok(validarCafe(nueva({ peso_g: 0 }), { nuevo: true }).errores.length);
    assert.ok(validarCafe(nueva({ altitud_m: -5 }), { nuevo: true }).errores.length);
    assert.deepEqual(validarCafe(nueva({ precio_eur: 0 }), { nuevo: true }).errores, []);
  });

  it("rechaza campos inventados", () => {
    assert.ok(validarCafe(nueva({ tueste: "2026-08-01" }), { nuevo: true }).errores.length);
  });
});

describe("corrección de bolsas", () => {
  it("solo toca lo que viene", () => {
    const { valores, errores } = validarCafe({ estado: "terminado" }, { nuevo: false });
    assert.deepEqual(errores, []);
    assert.deepEqual(Object.keys(valores), ["estado"]);
    assert.equal(valores.estado, "terminado");
  });

  it("admite vaciar un campo", () => {
    const { valores } = validarCafe({ url: "" }, { nuevo: false });
    assert.equal(valores.url, null);
  });

  it("no deja tocar la identidad", () => {
    assert.ok(validarCafe({ id: "otro" }, { nuevo: false })
      .errores.some((e) => e.includes("desconocidos")));
    assert.ok(validarCafe({ slug: "otro" }, { nuevo: false })
      .errores.some((e) => e.includes("desconocidos")));
  });

  it("exige algún campo", () => {
    assert.ok(validarCafe({}, { nuevo: false }).errores.some((e) => e.includes("ningún campo")));
  });

  it("valida igual que el alta", () => {
    assert.ok(validarCafe({ estado: "a medias" }, { nuevo: false }).errores.length);
    assert.ok(validarCafe({ fecha_tueste: "2026-02-30" }, { nuevo: false }).errores.length);
    assert.ok(validarCafe({ nombre: "" }, { nuevo: false }).errores.length);
  });

  it("la foto no entra por JSON: la gestiona su endpoint", () => {
    assert.ok(validarCafe({ foto: "fotos/gary-1.jpg" }, { nuevo: false })
      .errores.some((e) => e.includes("desconocidos")));
    assert.ok(validarCafe({ nombre: "Gary", foto: "x" }, { nuevo: true })
      .errores.some((e) => e.includes("desconocidos")));
  });
});

describe("fotos", () => {
  it("acepta los formatos que pinta cualquier navegador", () => {
    assert.deepEqual(validarFoto("image/jpeg", 100), { tipo: "image/jpeg", extension: "jpg" });
    assert.deepEqual(validarFoto("image/png", 100), { tipo: "image/png", extension: "png" });
    assert.deepEqual(validarFoto("image/webp", 100), { tipo: "image/webp", extension: "webp" });
  });

  it("normaliza mayúsculas y parámetros del content-type", () => {
    assert.deepEqual(validarFoto("image/JPEG; charset=binary", 100),
      { tipo: "image/jpeg", extension: "jpg" });
  });

  it("rechaza lo que un navegador no pintaría", () => {
    assert.equal(validarFoto("image/heic", 100).estado, 415);
    assert.equal(validarFoto("application/octet-stream", 100).estado, 415);
    assert.equal(validarFoto("", 100).estado, 415);
    assert.equal(validarFoto(null, 100).estado, 415);
  });

  it("rechaza la foto vacía y la que pasa del tope", () => {
    assert.equal(validarFoto("image/jpeg", 0).estado, 422);
    assert.equal(validarFoto("image/jpeg", MAX_FOTO_BYTES + 1).estado, 413);
    assert.equal(validarFoto("image/jpeg", MAX_FOTO_BYTES).extension, "jpg");
  });

  it("la clave lleva id, momento y extensión: cada subida estrena URL", () => {
    assert.equal(claveDeFoto("gary", "jpg", 1722877200000), "fotos/gary-1722877200000.jpg");
    assert.notEqual(claveDeFoto("gary", "jpg", 1), claveDeFoto("gary", "jpg", 2));
  });
});

describe("corrección de extracciones", () => {
  it("solo toca lo que viene", () => {
    const { valores, errores } = validarCambiosExtraccion({ nota: 9 });
    assert.deepEqual(errores, []);
    assert.deepEqual(Object.keys(valores), ["nota"]);
  });

  it("permite corregir el café, que es el error típico del cronómetro", () => {
    const { valores, errores } = validarCambiosExtraccion({ cafe_id: "gary" });
    assert.deepEqual(errores, []);
    assert.equal(valores.cafe_id, "gary");
  });

  it("corrige la lista de defectos con las reglas del alta", () => {
    const { valores, errores } = validarCambiosExtraccion({ defecto: ["plano", "Salado"] });
    assert.deepEqual(errores, []);
    assert.equal(valores.defecto, "plano,salado");
    assert.ok(validarCambiosExtraccion({ defecto: "equilibrado,plano" }).errores.length);
  });

  it("valida igual que el alta", () => {
    assert.ok(validarCambiosExtraccion({ nota: 12 }).errores.length);
    assert.ok(validarCambiosExtraccion({ defecto: "quemado" }).errores.length);
    assert.ok(validarCambiosExtraccion({ dripper: "chemex" }).errores.length);
    assert.ok(validarCambiosExtraccion({ fecha: "2026-02-30" }).errores.length);
    assert.ok(validarCambiosExtraccion({ dosis_g: 0 }).errores.length);
    assert.ok(validarCambiosExtraccion({ temp_c: 150 }).errores.length);
  });

  it("admite vaciar lo que es opcional", () => {
    assert.equal(validarCambiosExtraccion({ drawdown_s: "" }).valores.drawdown_s, null);
    assert.equal(validarCambiosExtraccion({ notas_cata: "" }).valores.notas_cata, null);
  });

  it("vaciar el café es quitarle la bolsa: la extracción queda suelta", () => {
    const { valores, errores } = validarCambiosExtraccion({ cafe_id: "" });
    assert.deepEqual(errores, []);
    assert.equal(valores.cafe_id, null);
  });

  it("exige algún campo", () => {
    assert.ok(validarCambiosExtraccion({}).errores.some((e) => e.includes("ningún campo")));
  });

  it("rechaza campos inventados", () => {
    assert.ok(validarCambiosExtraccion({ inventado: 1 }).errores.some((e) => e.includes("desconocidos")));
  });
});

describe("recetas", () => {
  const receta = (campos = {}) => ({
    nombre: "4:6 con más cuerpo",
    ratio: 15,
    pasos: [
      { accion: "verter", agua_g: 60, t_inicio_s: 0 },
      { accion: "verter", agua_g: 60, t_inicio_s: 45 },
      { accion: "verter", agua_g: 180, t_inicio_s: 90 },
      { accion: "esperar", t_inicio_s: 180 },
      { accion: "retirar" },
    ],
    ...campos,
  });

  it("numera los pasos por su posición", () => {
    const { pasos, errores } = validarReceta(receta(), { nuevo: true });
    assert.deepEqual(errores, []);
    assert.deepEqual(pasos.map((p) => p.orden), [1, 2, 3, 4, 5]);
  });

  it("los pasos sin agua quedan a cero", () => {
    const { pasos } = validarReceta(receta(), { nuevo: true });
    assert.equal(pasos[3].agua_g, 0);
    assert.equal(pasos[4].t_inicio_s, null);
  });

  it("solo verter lleva gramos", () => {
    const { errores } = validarReceta(
      receta({ pasos: [{ accion: "verter", agua_g: 300, t_inicio_s: 0 }, { accion: "agitar", agua_g: 30, t_inicio_s: 30 }] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("solo 'verter'")));
  });

  it("un vertido sin gramos no cuela", () => {
    const { errores } = validarReceta(
      receta({ pasos: [{ accion: "verter", agua_g: 0, t_inicio_s: 0 }] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("necesita gramos")));
  });

  it("una receta sin vertidos no sirve para guiar nada", () => {
    const { errores } = validarReceta(
      receta({ pasos: [{ accion: "esperar", t_inicio_s: 0 }] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("ningún vertido")));
  });

  it("exige al menos un paso", () => {
    assert.ok(validarReceta(receta({ pasos: [] }), { nuevo: true }).errores.length);
  });

  it("los tiempos tienen que ir hacia delante", () => {
    const { errores } = validarReceta(
      receta({ pasos: [
        { accion: "verter", agua_g: 60, t_inicio_s: 45 },
        { accion: "verter", agua_g: 60, t_inicio_s: 30 },
      ] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("en aumento")));
  });

  it("rechaza acciones inventadas", () => {
    const { errores } = validarReceta(
      receta({ pasos: [{ accion: "bailar", t_inicio_s: 0 }] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("acción no permitida")));
  });

  it("el vertido admite estilo, y sin estilo queda a null", () => {
    const { pasos, errores } = validarReceta(
      receta({ pasos: [
        { accion: "verter", agua_g: 60, t_inicio_s: 0, estilo: "espiral" },
        { accion: "verter", agua_g: 240, t_inicio_s: 45 },
      ] }),
      { nuevo: true },
    );
    assert.deepEqual(errores, []);
    assert.equal(pasos[0].estilo, "espiral");
    assert.equal(pasos[1].estilo, null);
  });

  it("rechaza estilos inventados", () => {
    const { errores } = validarReceta(
      receta({ pasos: [{ accion: "verter", agua_g: 300, t_inicio_s: 0, estilo: "zigzag" }] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("estilo no permitido")));
  });

  it("solo los vertidos llevan estilo", () => {
    const { errores } = validarReceta(
      receta({ pasos: [
        { accion: "verter", agua_g: 300, t_inicio_s: 0 },
        { accion: "esperar", t_inicio_s: 45, estilo: "espiral" },
      ] }),
      { nuevo: true },
    );
    assert.ok(errores.some((e) => e.includes("el estilo es de los vertidos")));
  });

  it("exige nombre, y de él sale el slug", () => {
    assert.ok(validarReceta(receta({ nombre: " " }), { nuevo: true }).errores.length);
    const { receta: valores } = validarReceta(receta(), { nuevo: true });
    assert.equal(valores.slug, "4_6_con_mas_cuerpo");
  });

  it("el slug no entra por el cuerpo, y la id solo si es uuid — y solo en el alta", () => {
    assert.ok(validarReceta(receta({ id: "kasuya-46-fuerte" }), { nuevo: true })
      .errores.some((e) => e.includes("id inválida")));
    assert.ok(validarReceta(receta({ slug: "otro" }), { nuevo: false })
      .errores.some((e) => e.includes("desconocidos")));
    assert.ok(validarReceta(receta({ id: "019fd647-1234-7abc-8def-000000000001" }), { nuevo: false })
      .errores.some((e) => e.includes("desconocidos")));
    const valida = validarReceta(
      receta({ id: "019fd647-1234-7abc-8def-000000000001" }), { nuevo: true },
    );
    assert.deepEqual(valida.errores, []);
    assert.equal(valida.receta.id, "019fd647-1234-7abc-8def-000000000001");
  });
});

describe("id derivado del nombre", () => {
  it("minúsculas, sin acentos y espacios a guion bajo", () => {
    assert.equal(slugDe("Etiopía Guji"), "etiopia_guji");
    assert.equal(slugDe("ABBIE"), "abbie");
  });

  it("los caracteres raros caen", () => {
    assert.equal(slugDe("Café  del Día (2)"), "cafe_del_dia_2");
    assert.equal(slugDe("Ñu 100% arábica"), "nu_100_arabica");
    assert.equal(slugDe("Gary — nº 3"), "gary_n_3");
  });

  it("sin guiones bajos sueltos en los extremos ni repetidos", () => {
    assert.equal(slugDe("  ...Gary...  "), "gary");
    assert.equal(slugDe("a---b"), "a_b");
  });

  it("un nombre sin letras ni números no da id", () => {
    assert.equal(slugDe("  ---  "), "");
    assert.equal(slugDe(""), "");
  });

  it("el alta lo usa siempre: ya no hay id explícito que mande", () => {
    const { valores, errores } = validarCafe({ nombre: "Etiopía Guji" }, { nuevo: true });
    assert.deepEqual(errores, []);
    assert.equal(valores.slug, "etiopia_guji");
  });

  it("si del nombre no sale slug, lo dice claro", () => {
    const { errores } = validarCafe({ nombre: "···" }, { nuevo: true });
    assert.ok(errores.some((e) => e.includes("no sale un slug utilizable")));
  });
});
