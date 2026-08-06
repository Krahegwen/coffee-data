/**
 * CSV a mano, con las mismas reglas que el módulo `csv` de Python en
 * QUOTE_MINIMAL y line terminator LF: es el formato de `datos/` en el repo,
 * y el respaldo de la app tiene que ser byte a byte el mismo dialecto para
 * que un ZIP ajeno se abra con las herramientas de siempre.
 */

/** Un valor como celda: comillas solo si hacen falta, y dobladas dentro. */
function celda(valor) {
  const texto = valor === null || valor === undefined ? "" : String(valor);
  if (/[",\n\r]/.test(texto)) return `"${texto.replaceAll('"', '""')}"`;
  return texto;
}

/**
 * Serializa filas (objetos) con las columnas dadas, en orden. `formatos`
 * permite fijar la forma de una columna — el ratio va con un decimal porque
 * JSON no distingue 15 de 15.0.
 */
export function aCsv(filas, columnas, formatos = {}) {
  const lineas = [columnas.map(celda).join(",")];
  for (const fila of filas) {
    lineas.push(columnas.map((c) => {
      const v = fila[c];
      if (v === null || v === undefined || v === "") return "";
      return celda(formatos[c] ? formatos[c](v) : v);
    }).join(","));
  }
  return `${lineas.join("\n")}\n`;
}

/**
 * Parsea un CSV con cabecera y devuelve objetos. Todo llega como texto — el
 * tipado lo ponen los validadores al restaurar, no una heurística aquí.
 */
export function deCsv(texto) {
  const filas = [];
  let fila = [];
  let campo = "";
  let entreComillas = false;

  const cerrarCampo = () => {
    fila.push(campo);
    campo = "";
  };
  const cerrarFila = () => {
    cerrarCampo();
    filas.push(fila);
    fila = [];
  };

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"' && campo === "") {
      entreComillas = true;
    } else if (c === ",") {
      cerrarCampo();
    } else if (c === "\n") {
      cerrarFila();
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo !== "" || fila.length) cerrarFila();

  const [cabecera, ...resto] = filas;
  if (!cabecera) return [];
  return resto.map((valores) =>
    Object.fromEntries(cabecera.map((columna, i) => [columna, valores[i] ?? ""])),
  );
}
