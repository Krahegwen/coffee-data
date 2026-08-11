/**
 * Las preferencias: lo que el usuario decide una vez y la app respeta después.
 *
 * Clave y valor, no una fila con una columna por ajuste. La diferencia importa:
 * los ajustes son de la **interfaz**, no del dominio, y el esquema no puede
 * saber qué interruptores tendrá la app dentro de tres versiones. Una columna
 * por switch obligaría a una migración cada vez que se añade uno, que es
 * ceremonia sin garantía. La garantía vive aquí: este catálogo dice qué claves
 * existen y de qué tipo es cada una, y `validarPreferencias` las hace cumplir.
 *
 * A cambio hay que decirlo en voz alta: **una clave desconocida la rechaza el
 * núcleo, no la base**. Si algún día un cliente viejo manda una que ya no
 * existe, el 422 sale del validador.
 *
 * Los valores viajan y se guardan como texto —es lo que hay en una tabla de
 * clave y valor—, y salen tipados por `leerPreferencias`. Que la conversión
 * viva en un solo sitio es justo el motivo de que esto sea un catálogo y no
 * un puñado de ifs repartidos.
 */

import { textos } from "./textos.js";

const CASTELLANO = textos();

/**
 * Qué se puede ajustar. `tipo` decide cómo se valida y cómo vuelve; `defecto`
 * es lo que rige mientras nadie diga otra cosa.
 *
 * Los `crono_*` no son switches sino la selección de preparar —café, receta,
 * dosis y agua—. Vivían en memoria de la pestaña y un F5 se los llevaba: son
 * una preferencia con todas las letras, así que aquí es donde les toca.
 */
export const CATALOGO = {
  sonido: { tipo: "booleano", defecto: true },
  voz: { tipo: "booleano", defecto: true },
  latido: { tipo: "booleano", defecto: true },
  cuenta_atras: { tipo: "booleano", defecto: true },
  /*
   * El tema son tres claves y no una, porque son tres decisiones distintas:
   * si seguir al teléfono o mandar tú, y qué juego usar en cada modo. Quien
   * pone el móvil en oscuro por la noche quiere que la app le siga, pero eso
   * no dice nada de qué tema le gusta de día.
   */
  tema_modo: { tipo: "opcion", defecto: "auto", opciones: ["auto", "claro", "oscuro"] },
  tema_claro: { tipo: "opcion", defecto: "papel", opciones: ["papel", "pizarra"] },
  tema_oscuro: { tipo: "opcion", defecto: "tostado", opciones: ["tostado", "carbon"] },
  crono_cafe_id: { tipo: "texto", defecto: "" },
  crono_receta_id: { tipo: "texto", defecto: "" },
  crono_dosis_g: { tipo: "numero", defecto: 20, minimo: 1 },
  crono_agua_g: { tipo: "numero", defecto: 300, minimo: 1 },
};

export const CLAVES = Object.keys(CATALOGO);

/** Todo en su valor de fábrica: lo que rige antes de tocar nada. */
export function porDefecto() {
  return Object.fromEntries(CLAVES.map((c) => [c, CATALOGO[c].defecto]));
}

/** De texto al tipo que toque. Lo que no se entiende cae al valor de fábrica. */
function tipar(clave, crudo) {
  const { tipo, defecto, opciones } = CATALOGO[clave];
  if (crudo === null || crudo === undefined) return defecto;
  if (tipo === "booleano") return String(crudo) === "1" || String(crudo) === "true";
  if (tipo === "numero") {
    const n = Number(crudo);
    return Number.isFinite(n) ? n : defecto;
  }
  // Un tema que ya no existe —guardado por una versión anterior— no puede
  // dejar la app sin colores: cae al de casa.
  if (tipo === "opcion") return opciones.includes(String(crudo)) ? String(crudo) : defecto;
  return String(crudo);
}

/** Y del tipo a texto, que es como se guarda. */
export function comoTexto(clave, valor) {
  if (CATALOGO[clave].tipo === "booleano") return valor ? "1" : "0";
  return String(valor);
}

/**
 * Las filas del almacén como objeto tipado y completo: lo guardado por encima
 * de los valores de fábrica. Nunca faltan claves, así que quien lo consuma no
 * tiene que preguntarse si esta app es más vieja que aquella.
 */
export function desdeFilas(filas = []) {
  const salida = porDefecto();
  for (const fila of filas) {
    if (!CLAVES.includes(fila?.clave)) continue;
    salida[fila.clave] = tipar(fila.clave, fila.valor);
  }
  return salida;
}

/**
 * Valida un puñado de cambios. **Parcial a propósito**: solo se tocan las
 * claves que llegan, y por eso el endpoint es un PATCH y no un PUT. Con un
 * reemplazo entero, dos dispositivos que cambian interruptores distintos se
 * borrarían el uno al otro — el último en sincronizar ganaría también en lo
 * que no tocó.
 */
export function validarPreferencias(cuerpo, { t = CASTELLANO } = {}) {
  const errores = [];
  const valores = {};

  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return { valores, errores: [t("preferencias_objeto")] };
  }

  for (const [clave, crudo] of Object.entries(cuerpo)) {
    if (!CLAVES.includes(clave)) {
      errores.push(t("preferencia_desconocida", {
        clave: JSON.stringify(clave), validas: CLAVES.join(", "),
      }));
      continue;
    }
    const { tipo, minimo } = CATALOGO[clave];

    if (tipo === "booleano") {
      if (typeof crudo !== "boolean") {
        errores.push(t("preferencia_booleana", { clave }));
        continue;
      }
      valores[clave] = crudo;
    } else if (tipo === "numero") {
      const n = Number(crudo);
      if (!Number.isFinite(n) || (minimo !== undefined && n < minimo)) {
        errores.push(t("preferencia_numero", { clave, minimo }));
        continue;
      }
      valores[clave] = n;
    } else if (tipo === "opcion") {
      const elegida = String(crudo ?? "").trim();
      if (!CATALOGO[clave].opciones.includes(elegida)) {
        errores.push(t("preferencia_opcion", {
          clave, validas: CATALOGO[clave].opciones.join(", "),
        }));
        continue;
      }
      valores[clave] = elegida;
    } else {
      // El texto vacío es una elección: «sin bolsa» es sin bolsa.
      valores[clave] = crudo === null || crudo === undefined ? "" : String(crudo).trim();
    }
  }

  return { valores, errores };
}
