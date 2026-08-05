/** Tests de la lógica pura del Worker. Uso: pnpm test */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autorizado, cabeceraDeCierre, cabeceraDeSesion, tokenDe, tokenDeCookie,
} from "../src/auth.js";
import { escalarPasos, guion, repartoDe, vertidos } from "../src/recetas.js";
import { avisosDe, cambiosDe, cobertura, efectos, pares, sugerir, textoCorto } from "../src/sugerencias.js";
import {
  fechaValida, validarCafe, validarCambiosExtraccion, validarExtraccion,
  validarReceta,
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

const extraccion = (campos = {}) => ({
  id: 1, cafe_id: "gary", dias_tueste: 20, temp_c: 94, clics: 28, dosis_g: 20,
  agua_g: 300, reparto: "60-60-90-90", receta_id: "kasuya-46-base",
  molinillo: "Comandante C40", dripper: "v60-02-plastico", drawdown_s: null,
  defecto: "equilibrado", nota: 7, ...campos,
});

describe("autorización", () => {
  // Solo cabecera Authorization; la Cookie va vacía.
  const peticion = (cabecera) => ({
    headers: { get: (n) => (n.toLowerCase() === 'authorization' ? cabecera : null) },
  })

  it("acepta el token correcto", () => {
    assert.equal(autorizado(peticion("Bearer secreto"), { TOKEN_ESCRITURA: "secreto" }), true);
  });

  it("tolera el salto de línea que mete wrangler secret put por tubería", () => {
    assert.equal(autorizado(peticion("Bearer secreto"), { TOKEN_ESCRITURA: "secreto\n" }), true);
    assert.equal(autorizado(peticion("Bearer secreto"), { TOKEN_ESCRITURA: "secreto\r\n" }), true);
    assert.equal(autorizado(peticion("Bearer secreto  "), { TOKEN_ESCRITURA: "secreto" }), true);
  });

  it("rechaza un token distinto o de otra longitud", () => {
    assert.equal(autorizado(peticion("Bearer otro"), { TOKEN_ESCRITURA: "secreto" }), false);
    assert.equal(autorizado(peticion("Bearer secretoo"), { TOKEN_ESCRITURA: "secreto" }), false);
  });

  it("falla cerrado si no hay secreto configurado", () => {
    assert.equal(autorizado(peticion("Bearer loquesea"), {}), false);
    assert.equal(autorizado(peticion("Bearer "), { TOKEN_ESCRITURA: "" }), false);
  });

  it("rechaza sin cabecera", () => {
    assert.equal(autorizado(peticion(null), { TOKEN_ESCRITURA: "secreto" }), false);
  });

  it("extrae el token con y sin prefijo", () => {
    assert.equal(tokenDe("Bearer abc"), "abc");
    assert.equal(tokenDe("bearer  abc "), "abc");
    assert.equal(tokenDe("abc"), "abc");
  });
});

describe("sesión por cookie", () => {
  const conCookie = (cookie) => ({
    headers: { get: (n) => (n.toLowerCase() === "cookie" ? cookie : null) },
  });

  it("autoriza con la cookie de sesión", () => {
    assert.equal(
      autorizado(conCookie("coffee_sesion=secreto"), { TOKEN_ESCRITURA: "secreto" }),
      true,
    );
  });

  it("la encuentra entre otras cookies", () => {
    const cookie = "otra=x; coffee_sesion=secreto; tercera=y";
    assert.equal(autorizado(conCookie(cookie), { TOKEN_ESCRITURA: "secreto" }), true);
  });

  it("rechaza una cookie con otro valor", () => {
    assert.equal(
      autorizado(conCookie("coffee_sesion=otro"), { TOKEN_ESCRITURA: "secreto" }),
      false,
    );
  });

  it("no confunde una cookie de nombre parecido", () => {
    assert.equal(
      autorizado(conCookie("no_coffee_sesion=secreto"), { TOKEN_ESCRITURA: "secreto" }),
      false,
    );
  });

  it("descodifica el valor", () => {
    assert.equal(tokenDeCookie("coffee_sesion=a%20b"), "a b");
    assert.equal(tokenDeCookie("coffee_sesion=%E2%98%95"), "☕");
  });

  it("aguanta una cookie mal formada sin reventar", () => {
    assert.equal(tokenDeCookie("coffee_sesion=%E0%A4%A"), "");
    assert.equal(tokenDeCookie(""), "");
    assert.equal(tokenDeCookie(null), "");
  });

  it("la cookie no la puede leer el JavaScript ni la manda otro sitio", () => {
    const cabecera = cabeceraDeSesion("secreto", { seguro: true });
    assert.match(cabecera, /HttpOnly/);
    assert.match(cabecera, /SameSite=Strict/);
    assert.match(cabecera, /Secure/);
    assert.match(cabecera, /Path=\/api/);
  });

  it("sin HTTPS no marca Secure, o el navegador la tiraría", () => {
    assert.doesNotMatch(cabeceraDeSesion("secreto", { seguro: false }), /Secure/);
  });

  it("cerrar sesión caduca la cookie", () => {
    assert.match(cabeceraDeCierre({ seguro: true }), /Max-Age=0/);
  });
});

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

  it("avisa de la masa térmica de la cerámica", () => {
    const avisos = avisosDe(extraccion({ dripper: "v60-02-ceramica" }));
    assert.ok(avisos.some((a) => a.includes("masa térmica")));
  });

  it("avisa al cambiar de dripper", () => {
    const previa = extraccion({ id: 1 });
    const nueva = extraccion({ id: 2, dripper: "v60-02-ceramica" });
    assert.ok(avisosDe(nueva, [previa, nueva]).some((a) => a.includes("cambiado de dripper")));
  });

  it("el dripper de otro café no cuenta como cambio", () => {
    const otro = extraccion({ id: 1, cafe_id: "abbie", dripper: "v60-02-ceramica" });
    const nueva = extraccion({ id: 2 });
    assert.ok(!avisosDe(nueva, [otro, nueva]).some((a) => a.includes("cambiado de dripper")));
  });
});

describe("deltas emparejados", () => {
  it("empareja cuando cambia una sola variable", () => {
    const historico = [extraccion({ id: 1, temp_c: 94, nota: 7 }), extraccion({ id: 2, temp_c: 91, nota: 8 })];
    const [par] = pares(historico);
    assert.deepEqual(
      [par.variable, par.direccion, par.delta_nota],
      ["temp_c", "bajar", 1],
    );
  });

  it("no empareja si cambian dos variables", () => {
    const historico = [extraccion({ id: 1, temp_c: 94, clics: 28 }), extraccion({ id: 2, temp_c: 91, clics: 26 })];
    assert.deepEqual(pares(historico), []);
  });

  it("no empareja extracciones de cafés distintos", () => {
    const historico = [extraccion({ id: 1, cafe_id: "gary" }), extraccion({ id: 2, cafe_id: "abbie", temp_c: 91 })];
    assert.deepEqual(pares(historico), []);
  });

  it("un solo par no llega a tendencia", () => {
    const historico = [extraccion({ id: 1, temp_c: 94, nota: 7 }), extraccion({ id: 2, temp_c: 91, nota: 8 })];
    assert.deepEqual(efectos(historico), {});
  });

  it("dos pares ya promedian", () => {
    const historico = [
      extraccion({ id: 1, temp_c: 94, nota: 6 }),
      extraccion({ id: 2, temp_c: 91, nota: 8 }),
      extraccion({ id: 3, temp_c: 88, nota: 9 }),
    ];
    const efecto = efectos(historico)["temp_c|bajar"];
    assert.equal(efecto.casos, 2);
    assert.equal(efecto.media, 1.5);
  });

  it("cambiar de dripper cuenta como la variable del par", () => {
    const historico = [
      extraccion({ id: 1, nota: 7 }),
      extraccion({ id: 2, dripper: "v60-02-ceramica", nota: 8 }),
    ];
    assert.equal(pares(historico)[0].variable, "dripper");
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
  const nueva = (campos = {}) => ({ id: "etiopia", nombre: "Etiopía Guji", ...campos });

  it("con lo mínimo, el resto queda vacío y abierta", () => {
    const { valores, errores } = validarCafe(nueva(), { nuevo: true });
    assert.deepEqual(errores, []);
    assert.equal(valores.id, "etiopia");
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

  it("exige un id con formato de slug", () => {
    for (const id of ["Etiopia", "con espacio", "etiopía", "-guion", ""]) {
      assert.ok(validarCafe(nueva({ id }), { nuevo: true }).errores.length, `id ${id}`);
    }
  });

  it("exige nombre", () => {
    assert.ok(validarCafe({ id: "x", nombre: "  " }, { nuevo: true }).errores.length);
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

  it("no deja cambiar el id", () => {
    const { errores } = validarCafe({ id: "otro" }, { nuevo: false });
    assert.ok(errores.some((e) => e.includes("no se puede cambiar")));
  });

  it("exige algún campo", () => {
    assert.ok(validarCafe({}, { nuevo: false }).errores.some((e) => e.includes("ningún campo")));
  });

  it("valida igual que el alta", () => {
    assert.ok(validarCafe({ estado: "a medias" }, { nuevo: false }).errores.length);
    assert.ok(validarCafe({ fecha_tueste: "2026-02-30" }, { nuevo: false }).errores.length);
    assert.ok(validarCafe({ nombre: "" }, { nuevo: false }).errores.length);
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

  it("no deja vaciar el café", () => {
    assert.ok(validarCambiosExtraccion({ cafe_id: "" }).errores.length);
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
    id: "kasuya-46-fuerte",
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

  it("exige id con formato y nombre", () => {
    assert.ok(validarReceta(receta({ id: "Con Mayúsculas" }), { nuevo: true }).errores.length);
    assert.ok(validarReceta(receta({ nombre: " " }), { nuevo: true }).errores.length);
  });

  it("al editar, el id no se toca", () => {
    const { errores } = validarReceta(receta(), { nuevo: false });
    assert.ok(errores.some((e) => e.includes("no se puede cambiar")));
  });
});
