/**
 * Pedirle al navegador que no limpie el cajón.
 *
 * Sin esto, IndexedDB es «best effort»: el navegador puede vaciarlo para
 * hacer sitio, y Safari en iOS lo hace a la semana de no visitar el sitio.
 * `persist()` lo convierte en un compromiso — cada navegador lo concede a su
 * manera: Chrome en silencio si la app está instalada o se usa de verdad,
 * Firefox preguntando, Safari según engagement—. Por eso se pide solo cuando
 * hay datos que perder: pedirlo con la casa vacía gasta la pregunta de
 * Firefox en alguien que aún no se juega nada.
 *
 * Denegado no es un error ni hay que contárselo al usuario como alarma: la
 * red de verdad son el respaldo y la app instalada, y ahí es donde se cuenta.
 */
export async function pedirPersistencia(): Promise<boolean> {
  const almacen = navigator.storage
  if (!almacen?.persist) return false
  try {
    if (await almacen.persisted()) return true
    return await almacen.persist()
  } catch {
    return false
  }
}

/** Si el navegador sabe contestar siquiera: en Safari viejo no existe. */
export function sabePersistir(): boolean {
  return typeof navigator.storage?.persist === 'function'
}
