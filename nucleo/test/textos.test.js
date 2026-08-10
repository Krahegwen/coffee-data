/**
 * El núcleo hablando dos idiomas.
 *
 * Lo que se comprueba aquí no es la traducción —esa la juzga quien la lee—
 * sino que el mecanismo no pueda dejar a nadie a medias: que el castellano
 * salga exactamente igual que antes, que el inglés no se cuele en una llamada
 * que no lo pidió, y que una clave sin traducir enseñe una frase y no la clave.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { almacenEnMemoria } from "../src/almacen-memoria.js";
import { crearCafe, crearExtraccion, guardarReceta } from "../src/api.js";
import { avisosDe, sugerir, textoCorto } from "../src/sugerencias.js";
import { idiomaDe, IDIOMA_POR_DEFECTO, IDIOMAS, textos } from "../src/textos.js";
import { validarExtraccion } from "../src/validacion.js";

describe("el catálogo", () => {
  it("cambia la clave por la frase del idioma que se pida", () => {
    assert.equal(textos("es")("nombre_vacio"), "el nombre no puede estar vacío");
    assert.equal(textos("en")("nombre_vacio"), "the name cannot be empty");
  });

  it("mete los datos en su hueco", () => {
    assert.equal(
      textos("en")("numero_mayor_que_cero", { campo: "dosis_g" }),
      "dosis_g must be a number greater than 0",
    );
  });

  it("un hueco sin dato se queda como está, y no como 'undefined'", () => {
    assert.match(textos("es")("numero_mayor_que_cero"), /\{campo\}/);
  });

  it("un idioma que no existe es castellano, no un hueco en blanco", () => {
    assert.equal(textos("fr")("nombre_vacio"), textos("es")("nombre_vacio"));
    assert.equal(textos()("nombre_vacio"), textos("es")("nombre_vacio"));
  });

  it("y una clave que no existe se devuelve tal cual: se ve el fallo, no se traga", () => {
    assert.equal(textos("en")("clave_que_no_existe"), "clave_que_no_existe");
  });

  /*
   * El castellano es el catálogo completo por definición —es donde se escribe
   * primero—, así que una clave que le falte al inglés cae a él. Un usuario
   * prefiere leer una frase en otro idioma antes que `goteo_largo`.
   */
  it("el inglés tiene todas las claves del castellano", () => {
    const es = textos("es");
    const en = textos("en");
    const claves = ["nombre_vacio", "aviso_retencion", "porque_amargor_clics", "repetir_igual"];
    for (const clave of claves) {
      assert.notEqual(en(clave), clave, `sin traducir: ${clave}`);
      assert.notEqual(en(clave), es(clave), `sin traducir de verdad: ${clave}`);
    }
  });
});

describe("qué idioma se pide", () => {
  it("lee el Accept-Language sin pelearse con él", () => {
    assert.equal(idiomaDe("en"), "en");
    assert.equal(idiomaDe("en-GB"), "en");
    assert.equal(idiomaDe("en-US,en;q=0.9,es;q=0.8"), "en");
    assert.equal(idiomaDe("es-ES,es;q=0.9"), "es");
  });

  it("y lo que no reconoce es castellano", () => {
    assert.equal(idiomaDe("fr-FR"), IDIOMA_POR_DEFECTO);
    assert.equal(idiomaDe(""), IDIOMA_POR_DEFECTO);
    assert.equal(idiomaDe(null), IDIOMA_POR_DEFECTO);
    assert.equal(idiomaDe(undefined), IDIOMA_POR_DEFECTO);
  });

  it("son dos, y el de casa es el castellano", () => {
    assert.deepEqual(IDIOMAS, ["es", "en"]);
    assert.equal(IDIOMA_POR_DEFECTO, "es");
  });
});

describe("la validación en inglés", () => {
  const en = textos("en");

  it("devuelve los errores en el idioma que se le pase", () => {
    const { errores } = validarExtraccion({ temp_c: 200, defecto: "quemado" }, { t: en });
    assert.ok(errores.some((e) => e.includes("must be between 0 and 100")));
    assert.ok(errores.some((e) => e.includes("flaw not allowed")));
  });

  it("y sin pedir idioma sigue saliendo castellano, como toda la vida", () => {
    const { errores } = validarExtraccion({ temp_c: 200 });
    assert.ok(errores.some((e) => e.includes("debe estar entre 0 y 100")));
  });
});

describe("el motor en inglés", () => {
  const en = textos("en");
  const extraccion = (campos = {}) => ({
    id: 1, cafe_id: "gary", temp_c: 94, clics: 28, dosis_g: 20, agua_g: 300,
    dripper: "v60-02-plastico", defecto: "equilibrado", nota: 7, desde_id: null,
    drawdown_s: null, ...campos,
  });

  it("traduce el porqué de la palanca", () => {
    const [principal] = sugerir(extraccion({ defecto: "amargor" }), [], null, en).cambios;
    assert.equal(principal.porque, "overextraction: grind coarser");
    // La variable y el salto son datos, no texto: no se traducen.
    assert.deepEqual([principal.variable, principal.cambio], ["clics", "+2"]);
  });

  it("y los avisos, con sus números dentro", () => {
    const avisos = avisosDe(extraccion({ dias_tueste: 90 }), [], null, en);
    assert.ok(avisos.some((a) => a.includes("90 days past roast")));
  });

  it("el resumen que va a siguiente_ajuste también", () => {
    const conforme = sugerir(extraccion({ nota: 9 }), [], null, en);
    assert.equal(textoCorto(conforme, en), "Repeat as is to confirm");
  });
});

describe("los manejadores en inglés", () => {
  const en = textos("en");

  it("el 422 del alta llega traducido", async () => {
    const almacen = almacenEnMemoria();
    const { estado, datos } = await crearCafe(almacen, { nombre: "" }, { t: en });
    assert.equal(estado, 422);
    assert.ok(datos.errores.some((e) => e === "the name cannot be empty"));
  });

  it("y las sugerencias del registro, con ellas la que se guarda", async () => {
    const almacen = almacenEnMemoria();
    await crearCafe(almacen, { nombre: "Gary" });
    await guardarReceta(almacen, { nuevo: true }, {
      nombre: "4:6", ratio: 15, pasos: [{ accion: "verter", agua_g: 300, t_inicio_s: 0 }],
    });
    const { datos } = await crearExtraccion(almacen, {
      cafe_id: "gary", receta_id: "4_6", temp_c: 91, clics: 28, tiempo_total: "3:30",
      variable_cambiada: "first", defecto: "amargor", nota: 6,
    }, { t: en });

    assert.equal(datos.sugerencias.cambios[0].porque, "overextraction: grind coarser");
    // El resumen es la palanca pelada: mismas claves, así que no cambia de idioma.
    assert.equal(datos.extraccion.siguiente_ajuste, "clics +2");
  });
});
