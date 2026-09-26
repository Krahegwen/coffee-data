import { tramosDe } from '@coffee/nucleo/crono'
import { finDeLosVertidos } from '@coffee/nucleo/recetas'

import { isla } from '~/isla'
import type { Mando, PlanIsla } from '~/isla/puerto'
import { VERSION_ISLA } from '~/isla/puerto'
import type { Cue } from '~/composables/useSonido'
import type { PasoGuion } from '~/composables/useApi'

/** Lo que la isla necesita saber de un paso: lo que tiene un `PasoGuion`. */
export type PasoIsla = Pick<PasoGuion, 'accion' | 'estilo' | 't_inicio_s' | 'acumulado_g'>

/**
 * La isla desde un componente: el adaptador que toque más `planDe`, que es
 * donde los tramos del núcleo se convierten en frases. Los textos son de
 * aquí y no del adaptador: el nativo los recibe hechos y en Kotlin no nace
 * ninguna cadena.
 */
export function useIsla() {
  const { t, locale } = useI18n()
  const { etiquetaPaso } = useTextos()

  /** «Verter en espiral hasta 120 g»: la báscula es lo que se mira al verter. */
  const tituloDe = (p: PasoIsla) => {
    const que = etiquetaPaso(p.accion, p.estilo)
    return p.accion === 'verter' ? t('sistema.titulo_verter', { paso: que, n: p.acumulado_g }) : que
  }

  function planDe(pasos: PasoIsla[], opciones: {
    album: string
    cues: Cue[]
    mandos: Partial<Record<Mando, string>>
    sonido: boolean
    voz: boolean
  }): PlanIsla {
    const tramos = tramosDe(pasos)
    const ultimo = tramos[tramos.length - 1]!
    /*
     * En el último tramo de un plan sin retirar, lo que pasa es el goteo: el
     * mismo número que se guardará como drawdown, viéndose crecer. Si la
     * receta cierra con el vertido nadie apuntó cuándo se dejó de verter y
     * contar sería inventar, así que ahí se queda el paso.
     */
    const acabaEnRetirar = ultimo.paso !== null && pasos[ultimo.paso]!.accion === 'retirar'
    const goteando = !acabaEnRetirar && finDeLosVertidos(pasos) !== null

    return {
      v: VERSION_ISLA,
      idioma: locale.value,
      album: opciones.album,
      tramos: tramos.map((tramo, i) => {
        const paso = tramo.paso === null ? null : pasos[tramo.paso]!
        const proximo = tramos[i + 1]
        const pasoProximo = proximo?.paso == null ? null : pasos[proximo.paso]!
        let titulo: string
        if (paso === null) titulo = t('reloj.preparados')
        else if (tramo.hasta === null && goteando) titulo = t('sistema.goteando')
        else titulo = tituloDe(paso)
        return {
          desde: tramo.desde,
          hasta: tramo.hasta,
          titulo,
          subtitulo: pasoProximo ? t('sistema.luego', { paso: tituloDe(pasoProximo) }) : t('sistema.ultimo'),
          corto: paso === null
            ? t('reloj.preparados')
            : paso.accion === 'verter' ? t('reloj.hasta_agua', { n: paso.acumulado_g }) : etiquetaPaso(paso.accion, paso.estilo),
        }
      }),
      cues: opciones.cues,
      mandos: opciones.mandos,
      sonido: opciones.sonido,
      voz: opciones.voz,
    }
  }

  return { ...isla, planDe }
}
