/**
 * Tests de la autorización del Worker. Uso: pnpm test
 *
 * Viven en api/ y no en nucleo/ a propósito: el token, la cookie y sus
 * cabeceras son cosa del servidor. La lógica de la bitácora ni sabe que
 * existen.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  autorizado, cabeceraDeCierre, cabeceraDeSesion, tokenDe, tokenDeCookie,
} from "../src/auth.js";

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
