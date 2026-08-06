/**
 * Un ZIP en modo *stored*, escrito y leído a mano.
 *
 * Las fotos ya son webp comprimido y los CSV son unos KB: comprimir otra vez
 * no gana nada, y el modo stored —cabecera, bytes crudos y directorio
 * central— evita meterle una dependencia a la app por un formato de 1989.
 *
 * El lector acepta también entradas deflate por si alguien re-empaqueta el
 * respaldo con otra herramienta: DecompressionStream lo trae el navegador.
 * El CRC se comprueba al leer — para un respaldo, un byte corrupto en
 * silencio es peor que un error a la cara.
 */

/* La tabla del CRC-32 de toda la vida (polinomio 0xEDB88320), perezosa. */
let TABLA = null;

function tablaCrc() {
  if (TABLA) return TABLA;
  TABLA = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLA[n] = c >>> 0;
  }
  return TABLA;
}

export function crc32(datos) {
  const tabla = tablaCrc();
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i += 1) {
    c = tabla[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato de DOS que pide el ZIP. */
function fechaDos(fecha) {
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  return { hora, dia };
}

/**
 * Escribe un ZIP con las entradas dadas: [{ nombre, datos: Uint8Array }].
 * Nombres en UTF-8 (bit 11), método 0. Devuelve un Uint8Array.
 */
export function escribirZip(entradas, ahora = new Date()) {
  const utf8 = new TextEncoder();
  const { hora, dia } = fechaDos(ahora);
  const locales = [];
  const centrales = [];
  let desplazamiento = 0;

  for (const { nombre, datos } of entradas) {
    const nombreBytes = utf8.encode(nombre);
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); //          versión necesaria
    local.setUint16(6, 0x0800, true); //      bit 11: el nombre va en UTF-8
    local.setUint16(8, 0, true); //           método 0: stored
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombreBytes.length, true);
    local.setUint16(28, 0, true);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); //        hecha por
    central.setUint16(6, 20, true); //        versión necesaria
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, dia, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, datos.length, true);
    central.setUint32(24, datos.length, true);
    central.setUint16(28, nombreBytes.length, true);
    central.setUint32(42, desplazamiento, true);

    locales.push(new Uint8Array(local.buffer), nombreBytes, datos);
    centrales.push(new Uint8Array(central.buffer), nombreBytes);
    desplazamiento += 30 + nombreBytes.length + datos.length;
  }

  const tamanoCentral = centrales.reduce((n, b) => n + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, entradas.length, true);
  fin.setUint16(10, entradas.length, true);
  fin.setUint32(12, tamanoCentral, true);
  fin.setUint32(16, desplazamiento, true);

  const trozos = [...locales, ...centrales, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(trozos.reduce((n, b) => n + b.length, 0));
  let puesto = 0;
  for (const trozo of trozos) {
    salida.set(trozo, puesto);
    puesto += trozo.length;
  }
  return salida;
}

/** Infla una entrada deflate con lo que trae el navegador. */
async function inflar(datos) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("el ZIP viene comprimido y este navegador no sabe abrirlo");
  }
  const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

/**
 * Lee un ZIP y devuelve [{ nombre, datos }]. Se apoya en el directorio
 * central, que es el que tiene la última palabra sobre qué hay dentro.
 */
export async function leerZip(bytes) {
  const vista = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // El fin de directorio está al final, quizá con un comentario detrás.
  let fin = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i -= 1) {
    if (vista.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("esto no parece un ZIP: no tiene fin de directorio");

  const cuantas = vista.getUint16(fin + 10, true);
  let puntero = vista.getUint32(fin + 16, true);
  const utf8 = new TextDecoder();
  const entradas = [];

  for (let n = 0; n < cuantas; n += 1) {
    if (vista.getUint32(puntero, true) !== 0x02014b50) {
      throw new Error("el directorio del ZIP está roto");
    }
    const metodo = vista.getUint16(puntero + 10, true);
    const crc = vista.getUint32(puntero + 16, true);
    const comprimido = vista.getUint32(puntero + 20, true);
    const nombreLen = vista.getUint16(puntero + 28, true);
    const extraLen = vista.getUint16(puntero + 30, true);
    const comentarioLen = vista.getUint16(puntero + 32, true);
    const dondeLocal = vista.getUint32(puntero + 42, true);
    const nombre = utf8.decode(bytes.subarray(puntero + 46, puntero + 46 + nombreLen));

    // El tamaño del extra puede diferir entre la cabecera local y la central.
    const localNombre = vista.getUint16(dondeLocal + 26, true);
    const localExtra = vista.getUint16(dondeLocal + 28, true);
    const desde = dondeLocal + 30 + localNombre + localExtra;
    const crudos = bytes.subarray(desde, desde + comprimido);

    let datos;
    if (metodo === 0) datos = crudos;
    else if (metodo === 8) datos = await inflar(crudos);
    else throw new Error(`la entrada ${nombre} usa un método de compresión que no se admite`);

    if (crc32(datos) !== crc) {
      throw new Error(`la entrada ${nombre} está corrupta: el CRC no cuadra`);
    }
    entradas.push({ nombre, datos });
    puntero += 46 + nombreLen + extraLen + comentarioLen;
  }
  return entradas;
}
