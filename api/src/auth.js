/**
 * Único punto donde se decide quién puede escribir.
 *
 * Dos vías, el mismo secreto:
 *
 *   Authorization: Bearer <token>   para curl y scripts
 *   cookie de sesión                para la app
 *
 * La cookie es `HttpOnly`, así que un XSS no puede leerla, y `SameSite=Strict`,
 * así que otro sitio no puede provocar una escritura desde tu navegador. Es
 * mejor que guardar el token en localStorage, y solo es posible porque la app
 * y la API comparten origen.
 *
 * El día que se cambie a Cloudflare Access o a GitHub App se reescribe este
 * fichero y nada más: la app no sabe cómo se autoriza.
 */

export const COOKIE = "coffee_sesion";

// Larga a propósito: volver a escribir el token en el móvil cada semana es el
// tipo de fricción que acaba con la gente apuntando en papel.
const DURACION_S = 180 * 24 * 60 * 60;

/** Quita el prefijo Bearer y los espacios de alrededor. */
export function tokenDe(cabecera) {
  return String(cabecera || "").replace(/^Bearer\s+/i, "").trim();
}

/** Saca el token de la cabecera Cookie, si está. */
export function tokenDeCookie(cabecera) {
  for (const trozo of String(cabecera || "").split(";")) {
    const [nombre, ...resto] = trozo.trim().split("=");
    if (nombre === COOKIE) {
      try {
        return decodeURIComponent(resto.join("=")).trim();
      } catch {
        return "";
      }
    }
  }
  return "";
}

/** Comparación en tiempo constante: no filtrar el token carácter a carácter. */
export function coincide(recibido, esperado) {
  if (!recibido || !esperado || recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}

/**
 * Ambos lados se recortan: `wrangler secret put` por tubería puede guardar el
 * valor con un salto de línea al final, y eso costó un 401 en producción.
 */
export function autorizado(request, env) {
  const esperado = String(env.TOKEN_ESCRITURA || "").trim();
  if (!esperado) return false; // sin secreto configurado no se escribe, punto

  return (
    coincide(tokenDe(request.headers.get("authorization")), esperado) ||
    coincide(tokenDeCookie(request.headers.get("cookie")), esperado)
  );
}

/**
 * Cookie de sesión. `Secure` solo cuando la petición va por HTTPS: en
 * desarrollo sobre http el navegador la descartaría sin avisar.
 * `Path=/api` para que no viaje en cada descarga de un icono.
 */
export function cabeceraDeSesion(token, { seguro }) {
  const partes = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/api",
    `Max-Age=${DURACION_S}`,
  ];
  if (seguro) partes.push("Secure");
  return partes.join("; ");
}

export function cabeceraDeCierre({ seguro }) {
  const partes = [`${COOKIE}=`, "HttpOnly", "SameSite=Strict", "Path=/api", "Max-Age=0"];
  if (seguro) partes.push("Secure");
  return partes.join("; ");
}
