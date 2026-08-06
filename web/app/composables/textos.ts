/**
 * Los textos que ve el usuario, en un solo sitio.
 *
 * La base guarda claves —`verter`, `espiral`—, no frases: la clave es el dato
 * y una frase guardada sería intraducible sin migración. Aquí es donde una
 * clave se convierte en castellano.
 *
 * De momento solo hay castellano, pero está montado como un catálogo por eso:
 * el día del i18n se duplica este fichero por idioma y no cambia nada más.
 */

export const ACCIONES = {
  verter: 'Verter',
  agitar: 'Agitar',
  remover: 'Remover',
  esperar: 'Esperar',
  retirar: 'Retirar',
} as const

/** Cómo se vierte. Solo acompaña a un vertido. */
export const ESTILOS = {
  espiral: 'en espiral',
  centro: 'al centro',
} as const

export type Accion = keyof typeof ACCIONES
export type Estilo = keyof typeof ESTILOS

/**
 * Lo que se lee del paso: «Verter en espiral».
 *
 * Nada de `text-transform: capitalize`, que pone en mayúscula cada palabra y
 * dejaría «Verter En Espiral».
 */
export function etiquetaPaso(accion: string, estilo?: string | null): string {
  const que = ACCIONES[accion as Accion] ?? capitalizar(accion)
  if (!estilo) return que
  return `${que} ${ESTILOS[estilo as Estilo] ?? estilo}`
}

/**
 * Red de seguridad: si algún día hay una acción en la base que este catálogo
 * no conoce, que salga legible en vez de en crudo y sin esperar a un despliegue.
 */
function capitalizar(texto: string): string {
  const limpio = texto.replace(/_/g, ' ')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}
