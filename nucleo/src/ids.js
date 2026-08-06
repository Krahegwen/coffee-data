/**
 * Las ids de la bitácora: UUID versión 7, generadas por quien crea el dato.
 *
 * Que las ponga el cliente y no la base es la pieza que deja abierta la
 * puerta a escribir sin cobertura: una fila nace con su id definitiva, y
 * reintentar un envío encolado no puede duplicarla — la misma id choca.
 *
 * La v7 y no la v4 de `crypto.randomUUID()` porque lleva el tiempo delante:
 * ordenar por id sigue siendo ordenar por cuándo. Aun así el orden oficial lo
 * manda `creado_en`, que significa algo; la id solo no desordena.
 */

/** Bloque de aleatoriedad, inyectable para poder probar el formato. */
function alAzar(bytes) {
  crypto.getRandomValues(bytes);
  return bytes;
}

/*
 * Secuencia para el mismo milisegundo. Sin ella, dos ids del mismo ms quedan
 * en orden arbitrario —el resto es azar— y el desempate del orden cronológico
 * deja de desempatar. Se arranca con margen (el bit alto a cero) para que
 * dentro de un ms siempre quepa incrementar.
 */
let ultimoMs = -1;
let secuencia = 0;

export function uuidv7(ahoraMs = Date.now(), aleatorio = alAzar) {
  const bytes = aleatorio(new Uint8Array(16));

  if (ahoraMs === ultimoMs) {
    secuencia = (secuencia + 1) & 0x0fff;
  } else {
    ultimoMs = ahoraMs;
    secuencia = ((bytes[6] << 8) | bytes[7]) & 0x07ff;
  }

  // Los 48 bits altos son los milisegundos desde época, en big-endian.
  let ms = BigInt(ahoraMs);
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(ms & 0xffn);
    ms >>= 8n;
  }

  bytes[6] = 0x70 | (secuencia >> 8); // versión 7 + secuencia alta
  bytes[7] = secuencia & 0xff; //                    secuencia baja
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}` +
    `-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Si un texto tiene pinta de id nuestra. En minúsculas: así se generan. */
export function esUuid(texto) {
  return UUID.test(String(texto ?? ""));
}
