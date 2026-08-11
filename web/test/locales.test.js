/**
 * Los dos idiomas de la app, clave a clave.
 *
 * La regla está escrita —«si añades una frase, va a los dos ficheros»— pero
 * no había forma de que saltara: una clave que falta en inglés cae al
 * castellano, así que la app se ve bien y nadie se entera. Se coló un bloque
 * entero de mensajes sin traducir antes de que existiera esto.
 *
 * El catálogo del núcleo tiene su propio test igual (`nucleo/test/textos.test.js`);
 * éste cubre lo que ve el usuario en pantalla.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const cargar = (idioma) => JSON.parse(
  readFileSync(new URL(`../i18n/locales/${idioma}.json`, import.meta.url), "utf8"),
);

/** Todas las claves como rutas con punto: `alta.guardar`, `reloj.titulo`. */
function rutas(objeto, prefijo = "") {
  return Object.entries(objeto).flatMap(([clave, valor]) => {
    const camino = prefijo ? `${prefijo}.${clave}` : clave;
    return valor && typeof valor === "object" ? rutas(valor, camino) : [camino];
  });
}

const es = cargar("es");
const en = cargar("en");

describe("los dos locales de la app van a la par", () => {
  it("dicen exactamente las mismas claves", () => {
    const enEs = new Set(rutas(es));
    const enEn = new Set(rutas(en));
    assert.deepEqual(
      [...enEs].filter((c) => !enEn.has(c)).sort(), [],
      "faltan por traducir al inglés",
    );
    assert.deepEqual(
      [...enEn].filter((c) => !enEs.has(c)).sort(), [],
      "sobran en inglés: o falta la castellana o es una clave muerta",
    );
  });

  it("y ninguna se queda en blanco", () => {
    for (const [idioma, catalogo] of [["es", es], ["en", en]]) {
      for (const ruta of rutas(catalogo)) {
        const valor = ruta.split(".").reduce((o, k) => o[k], catalogo);
        assert.ok(String(valor).trim(), `${idioma}.${ruta} está vacía`);
      }
    }
  });

  it("las dos versiones de una frase esperan los mismos datos", () => {
    // `{n}`, `{nombre}`… Una interpolación que solo existe en un idioma sale
    // en pantalla con las llaves puestas, y eso no lo caza ningún tipo.
    const huecos = (frase) => [...String(frase).matchAll(/\{(\w+)\}/g)]
      .map((m) => m[1]).sort();
    for (const ruta of rutas(es)) {
      const trozo = (c) => ruta.split(".").reduce((o, k) => o?.[k], c);
      const suyo = trozo(en);
      if (suyo === undefined) continue; // ya lo dice el primer test
      assert.deepEqual(huecos(suyo), huecos(trozo(es)), `${ruta} no cuadra`);
    }
  });
});
