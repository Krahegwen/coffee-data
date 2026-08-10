import { goteoTrasMoverTotal, totalTrasMoverGoteo } from '@coffee/nucleo/validacion'

/**
 * El tiempo total y el goteo, atados en los formularios.
 *
 * Los dos terminan en el mismo instante y solo cambia desde dónde se cuentan,
 * así que `tiempo_total = fin del último vertido + drawdown_s`. El cronómetro
 * los calcula a la vez y por eso salen coherentes de él; en cuanto se teclea
 * uno a mano esa atadura se perdía, y corregir el total dejando el goteo
 * quieto es exactamente cómo se rompió una fila el 2026-08-07.
 *
 * La cuenta es del núcleo; esto es el cable a los campos. El servidor lo sigue
 * comprobando —esto es que no llegue a pasar, no la red de seguridad—, y el
 * usuario manda siempre: si después toca el campo que se movió, se queda con
 * lo que escriba.
 */
export function useAtadura(form: Record<string, any>) {
  const num = (valor: unknown) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return null
    const n = Number(valor)
    return Number.isFinite(n) ? n : null
  }

  const leer = () => ({ total: String(form.tiempo_total ?? ''), goteo: num(form.drawdown_s) })

  /*
   * La base del delta se toma al entrar en el campo, no al salir del anterior:
   * así vale venga el valor de donde venga —del cronómetro, de un preset, de
   * vaciar el formulario— sin que nadie tenga que avisar de que cambió por
   * debajo. Y al entrar y no al teclear porque a mitad de escribir «3:32» el
   * campo pasa por «3:3», que es otro tiempo y movería el goteo dos veces.
   */
  let alEntrar = leer()

  /** Qué campo se movió solo en el último cambio, para poder decirlo. */
  const movido = ref<'goteo' | 'tiempo' | null>(null)

  function anotar() {
    alEntrar = leer()
    movido.value = null
  }

  /** Cambió el tiempo total: el goteo lo sigue, porque va por dentro. */
  function desdeElTiempo() {
    const antes = alEntrar
    const ahora = leer()
    anotar()
    // El goteo tocado a mano en la misma pasada manda: no se pisa.
    if (ahora.goteo !== antes.goteo) return

    const nuevo = goteoTrasMoverTotal(antes.total, ahora.total, ahora.goteo)
    if (nuevo === null) return
    form.drawdown_s = nuevo
    alEntrar = leer()
    movido.value = 'goteo'
  }

  /** Y al revés: mover el goteo alarga o acorta el total lo mismo. */
  function desdeElGoteo() {
    const antes = alEntrar
    const ahora = leer()
    anotar()
    if (ahora.total !== antes.total) return

    const nuevo = totalTrasMoverGoteo(antes.goteo, ahora.goteo, ahora.total)
    if (nuevo === null) return
    form.tiempo_total = nuevo
    alEntrar = leer()
    movido.value = 'tiempo'
  }

  return { movido, anotar, desdeElTiempo, desdeElGoteo }
}
