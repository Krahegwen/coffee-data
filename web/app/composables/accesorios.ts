import type { Accesorio, TipoAccesorio } from '~/composables/useApi'

/**
 * Los accesorios de un tipo como opciones de un desplegable.
 *
 * Lo que está en uso, más lo que haya que poder representar aunque ya no lo
 * esté: el valor que ya tiene el campo y el de la taza anterior. Es la regla
 * de siempre —**un selector nunca debe poder perder el valor que ya tiene**—,
 * y además la tabla de variables pinta con estas mismas opciones el «antes»:
 * sin la de la madre, un molinillo vendido se leería como una id.
 *
 * La etiqueta es el nombre que puso el usuario. Lo que ya no está en uso lo
 * dice al lado, para que nadie lo elija creyendo que sigue en casa.
 */
export function useOpcionesAccesorio() {
  const { t } = useI18n()
  return (lista: Accesorio[] | null | undefined, tipo: TipoAccesorio, ...conservar: unknown[]) =>
    (lista ?? [])
      .filter((a) => a.tipo === tipo && (a.en_uso || conservar.includes(a.id)))
      .map((a) => ({
        valor: a.id,
        etiqueta: a.en_uso ? a.nombre : `${a.nombre} (${t('accesorios.fuera_de_uso')})`,
      }))
}
