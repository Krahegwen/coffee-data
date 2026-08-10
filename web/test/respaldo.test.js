/**
 * El respaldo, de ida y de vuelta.
 *
 * El test que importa: se crea una bitácora por los manejadores, se hace el
 * respaldo, se lee y se prepara la restauración — y las filas que salen
 * tienen que ser las mismas que entraron, identidad, retiradas y ajustes del
 * motor incluidos. Un respaldo que no restaura idéntico no es un respaldo.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IDBFactory } from "fake-indexeddb";

import {
  crearCafe, crearExtraccion, editarCafe, guardarReceta, retirarExtraccion,
} from "@coffee/nucleo/api";

import { aCsv, deCsv } from "../app/almacen/csv.js";
import { almacenIDB } from "../app/almacen/idb.js";
import {
  aplicarRestauracion, avisoRespaldo, crearRespaldo, leerRespaldo, prepararRestauracion,
} from "../app/almacen/respaldo.js";
import { crc32, escribirZip, leerZip } from "../app/almacen/zip.js";

const cajon = () => almacenIDB(new IDBFactory(), "respaldo-test");
const utf8 = new TextEncoder();

describe("el zip en modo stored", () => {
  it("lo que se escribe se lee igual, nombres UTF-8 incluidos", async () => {
    const entradas = [
      { nombre: "manifiesto.json", datos: utf8.encode('{"a":1}') },
      { nombre: "fotos/etiopía-123.webp", datos: new Uint8Array([1, 2, 3, 255]) },
    ];
    const bytes = escribirZip(entradas, new Date(2026, 7, 7, 12, 30));
    const leidas = await leerZip(bytes);
    assert.deepEqual(
      leidas.map((e) => e.nombre),
      ["manifiesto.json", "fotos/etiopía-123.webp"],
    );
    assert.deepEqual([...leidas[1].datos], [1, 2, 3, 255]);
  });

  it("un byte corrupto no pasa en silencio: el CRC lo caza", async () => {
    const bytes = escribirZip([{ nombre: "a.txt", datos: utf8.encode("hola") }]);
    bytes[36] ^= 0xff; // un byte del contenido: cabecera (30) + "a.txt" (5) + 1
    await assert.rejects(() => leerZip(bytes), /CRC no cuadra/);
  });

  it("lo que no es un zip lo dice claro", async () => {
    await assert.rejects(() => leerZip(utf8.encode("esto es un csv")), /no parece un ZIP/);
  });

  it("el crc32 da los valores de siempre", () => {
    assert.equal(crc32(utf8.encode("123456789")), 0xcbf43926);
  });
});

describe("el csv del respaldo", () => {
  it("va y vuelve con comas, comillas, saltos y acentos", () => {
    const filas = [
      { a: "Bourbon, Catimor y Typica", b: 'dice "ya"', c: "línea\npartida" },
      { a: "", b: null, c: 15 },
    ];
    const texto = aCsv(filas, ["a", "b", "c"]);
    const vuelta = deCsv(texto);
    assert.equal(vuelta[0].a, "Bourbon, Catimor y Typica");
    assert.equal(vuelta[0].b, 'dice "ya"');
    assert.equal(vuelta[0].c, "línea\npartida");
    assert.equal(vuelta[1].a, "");
    assert.equal(vuelta[1].c, "15");
  });

  it("cita como el csv de Python: mínimo y con LF", () => {
    const texto = aCsv([{ x: "con,coma", y: "normal" }], ["x", "y"]);
    assert.equal(texto, 'x,y\n"con,coma",normal\n');
  });

  it("el ratio sale con un decimal, como en el repo", () => {
    const texto = aCsv([{ ratio: 15 }], ["ratio"], { ratio: (v) => Number(v).toFixed(1) });
    assert.equal(texto, "ratio\n15.0\n");
  });
});

/** Una bitácora pequeña pero con esquinas: retirada, renombre y acentos. */
async function bitacoraDePrueba(almacen) {
  await crearCafe(almacen, {
    nombre: "Etiopía Guji",
    tostador: "Manea Coffee",
    variedad: "Bourbon, Catimor y Typica",
    peso_g: 250,
    fecha_tueste: "2026-05-20",
  });
  const gary = await crearCafe(almacen, { nombre: "Gary", peso_g: 340 });
  // Renombrada tras crearla: el slug guardado ya no sale del nombre.
  await editarCafe(almacen, gary.datos.cafe.id, { nombre: "Gary reserva" });

  const receta = await guardarReceta(almacen, { nuevo: true }, {
    nombre: "4:6 base",
    ratio: 15,
    notas: 'la de siempre, "sin tocar"',
    pasos: [
      { accion: "verter", agua_g: 150, t_inicio_s: 0, estilo: "espiral" },
      { accion: "verter", agua_g: 150, t_inicio_s: 90 },
      { accion: "retirar", t_inicio_s: 180 },
    ],
  });

  const primera = await crearExtraccion(almacen, {
    cafe_id: "etiopia_guji", receta_id: receta.datos.receta.id,
    temp_c: 91, clics: 28, tiempo_total: "3:30", drawdown_s: 45,
    variable_cambiada: "basal", defecto: "equilibrado", nota: 7,
    notas_cata: "cítrico, algo corto",
  });
  // Con dos defectos: desde que son una lista, `defecto` lleva dentro la
  // propia coma del CSV y tiene que salir entrecomillado y volver entero. Es
  // el único campo cerrado que puede contener el delimitador.
  const segunda = await crearExtraccion(almacen, {
    cafe_id: "etiopia_guji", receta_id: receta.datos.receta.id,
    temp_c: 88, clics: 28, tiempo_total: "3:25",
    variable_cambiada: "Temperatura 91 → 88", defecto: "plano,salado", nota: 5,
  });
  await retirarExtraccion(almacen, segunda.datos.extraccion.id);
  // Y una suelta: sin bolsa, el cafe_id viaja vacío en el CSV y tiene que
  // volver vacío, no convertido en error ni en bolsa inventada.
  await crearExtraccion(almacen, {
    receta_id: receta.datos.receta.id,
    temp_c: 92, clics: 26, tiempo_total: "3:10",
    variable_cambiada: "Primera extracción", defecto: "agrio", nota: 6,
  });
  return { primera };
}

describe("el respaldo entero, de ida y vuelta", () => {
  it("restaurar devuelve exactamente lo que había", async () => {
    const origen = cajon();
    await bitacoraDePrueba(origen);

    const { bytes, manifiesto } = await crearRespaldo(origen, { version: "0.0.0-test" });
    assert.equal(manifiesto.filas.cafes, 2);
    assert.equal(manifiesto.filas.extracciones, 3);

    const contenido = await leerRespaldo(bytes);
    const preparado = await prepararRestauracion(contenido);
    assert.deepEqual(preparado.avisos, []);

    const destino = cajon();
    await aplicarRestauracion(destino, preparado, contenido.fotos);

    // Lo que cada lado sella por su cuenta se tolera; el resto, idéntico.
    const sinSellos = ({ actualizado_en, ...resto }) => resto;
    const porId = (filas) => [...filas].sort((a, b) => (a.id < b.id ? -1 : 1));

    const cafesAntes = porId(await origen.cafes.listar()).map(sinSellos);
    const cafesDespues = porId(await destino.cafes.listar()).map(sinSellos);
    assert.deepEqual(cafesDespues, cafesAntes);
    // El renombre conservó su slug de nacimiento.
    assert.ok(cafesDespues.some((c) => c.nombre === "Gary reserva" && c.slug === "gary"));

    const recetasAntes = porId(await origen.recetas.listar()).map(sinSellos);
    const recetasDespues = porId(await destino.recetas.listar()).map(sinSellos);
    assert.deepEqual(recetasDespues, recetasAntes);

    const antes = porId(await origen.extracciones.listar());
    const despues = porId(await destino.extracciones.listar());
    assert.deepEqual(despues.map(sinSellos), antes.map(sinSellos));
    // La retirada sigue retirada, con su fecha, y el ajuste del motor intacto.
    assert.equal(despues.filter((e) => e.borrada_en).length, 1);
    // La suelta volvió suelta: sin bolsa, no con una inventada.
    assert.equal(despues.filter((e) => e.cafe_id === null).length, 1);
    // Y el linaje aguanta el viaje: la segunda sigue colgando de la primera
    // aunque esté retirada, porque se restauran en orden y la madre ya está.
    const madres = Object.fromEntries(despues.map((e) => [e.id, e.desde_id]));
    const hija = despues.find((e) => e.borrada_en);
    assert.equal(madres[hija.id], despues.find((e) => e.variable_cambiada === "basal").id);
    assert.deepEqual(
      despues.map((e) => e.siguiente_ajuste),
      antes.map((e) => e.siguiente_ajuste),
    );
  });

  it("reemplazar es entero o nada: una fila que no se deja clonar lo aborta todo", async () => {
    const almacen = cajon();
    await bitacoraDePrueba(almacen);
    const antes = (await almacen.cafes.listar()).length;

    // Una función no pasa el clonado estructurado, como los proxies de Vue.
    await assert.rejects(() =>
      almacen.reemplazar({
        cafes: [{ id: "x", rota: () => {} }],
        recetas: [],
        extracciones: [],
      }),
    );
    // Y el clear de cafes no se confirmó por su cuenta.
    assert.equal((await almacen.cafes.listar()).length, antes);
  });

  it("una fila rota no restaura nada", async () => {
    const origen = cajon();
    await bitacoraDePrueba(origen);
    const { bytes } = await crearRespaldo(origen);
    const contenido = await leerRespaldo(bytes);

    contenido.extracciones[0].temp_c = "500";
    await assert.rejects(
      () => prepararRestauracion(contenido),
      (fallo) => {
        assert.match(fallo.data.errores[0], /temp_c/);
        return true;
      },
    );
  });

  it("un zip sin manifiesto o de otro formato se rechaza con su motivo", async () => {
    const suelto = escribirZip([{ nombre: "cafes.csv", datos: utf8.encode("id\n") }]);
    await assert.rejects(() => leerRespaldo(suelto), /no trae manifiesto/);

    const futuro = escribirZip([
      { nombre: "manifiesto.json", datos: utf8.encode('{"formato": 99}') },
    ]);
    await assert.rejects(() => leerRespaldo(futuro), /formato 99/);
  });

  it("la foto de la bolsa viaja y vuelve a su clave", async () => {
    const origen = cajon();
    await bitacoraDePrueba(origen);
    const clave = "fotos/gary-1786000000000.webp";
    const pixel = new Uint8Array([82, 73, 70, 70, 0, 0]);
    await origen.fotos.poner(clave, new Blob([pixel], { type: "image/webp" }), "image/webp");
    const gary = (await origen.cafes.listar()).find((c) => c.slug === "gary");
    await origen.cafes.actualizar(gary.id, { foto: clave });

    const { bytes, manifiesto } = await crearRespaldo(origen);
    assert.equal(manifiesto.filas.fotos, 1);

    const contenido = await leerRespaldo(bytes);
    const preparado = await prepararRestauracion(contenido);
    const destino = cajon();
    await aplicarRestauracion(destino, preparado, contenido.fotos);

    const vueltas = await destino.fotos.listar();
    assert.equal(vueltas.length, 1);
    assert.equal(vueltas[0].clave, clave);
    assert.equal(vueltas[0].tipo, "image/webp");
    assert.deepEqual([...new Uint8Array(await vueltas[0].blob.arrayBuffer())], [...pixel]);
    const garyVuelto = (await destino.cafes.listar()).find((c) => c.slug === "gary");
    assert.equal(garyVuelto.foto, clave);
  });
});

describe("el aviso de respaldo viejo", () => {
  const ahora = new Date("2026-08-07T10:00:00Z");
  const hace = (dias) => new Date(ahora - dias * 86_400_000).toISOString();
  // El sello del cajón: espacio y sin zona, como lo escribe SQLite.
  const sello = (dias) => hace(dias).slice(0, 19).replace("T", " ");

  it("sin extracciones no hay nada que perder ni que avisar", () => {
    assert.equal(avisoRespaldo({ ultimo: null, extracciones: [], ahora }), null);
  });

  it("con el respaldo reciente, silencio", () => {
    const r = avisoRespaldo({
      ultimo: hace(3),
      extracciones: [{ creado_en: sello(40) }],
      ahora,
    });
    assert.equal(r, null);
  });

  it("un respaldo de hace quince días ya avisa, con los días contados", () => {
    const r = avisoRespaldo({
      ultimo: hace(15),
      extracciones: [{ creado_en: sello(40) }],
      ahora,
    });
    assert.deepEqual(r, { dias: 15, nunca: false });
  });

  it("sin respaldo nunca, los días se cuentan desde la extracción más antigua", () => {
    const r = avisoRespaldo({
      ultimo: null,
      extracciones: [{ creado_en: sello(5) }, { creado_en: sello(20) }],
      ahora,
    });
    assert.deepEqual(r, { dias: 20, nunca: true });
  });

  it("quien acaba de empezar tiene dos semanas de gracia", () => {
    const r = avisoRespaldo({
      ultimo: null,
      extracciones: [{ creado_en: sello(13) }],
      ahora,
    });
    assert.equal(r, null);
  });

  it("a los catorce justos se cumple el plazo", () => {
    const r = avisoRespaldo({
      ultimo: hace(14),
      extracciones: [{ creado_en: sello(30) }],
      ahora,
    });
    assert.deepEqual(r, { dias: 14, nunca: false });
  });

  it("el sello con espacio del cajón no rompe la cuenta", () => {
    // Si aFecha lo leyera en hora local o NaN, los días saldrían mal o null.
    const r = avisoRespaldo({
      ultimo: null,
      extracciones: [{ creado_en: "2026-07-01 08:00:00" }],
      ahora,
    });
    assert.deepEqual(r, { dias: 37, nunca: true });
  });
});
