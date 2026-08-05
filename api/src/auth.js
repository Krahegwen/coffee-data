/**
 * Único punto donde se decide quién puede escribir.
 *
 * Hoy: un token en cabecera, con Cloudflare Access delante para el navegador.
 * El día que se cambie a GitHub App se reescribe esto y nada más: la app no
 * sabe cómo se autoriza, solo llama al endpoint.
 */

/** Quita el prefijo Bearer y los espacios de alrededor. */
export function tokenDe(cabecera) {
  return String(cabecera || "").replace(/^Bearer\s+/i, "").trim();
}

/**
 * Compara en tiempo constante para no filtrar el token carácter a carácter.
 * Ambos lados se recortan: `wrangler secret put` por tubería puede guardar el
 * valor con un salto de línea al final, y eso costó un 401 en producción.
 */
export function autorizado(request, env) {
  const esperado = String(env.TOKEN_ESCRITURA || "").trim();
  if (!esperado) return false; // sin secreto configurado no se escribe, punto

  const recibido = tokenDe(request.headers.get("authorization"));
  if (recibido.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  }
  return diferencia === 0;
}
