import { tramoEn } from '@coffee/nucleo/crono'
import { relojDe } from '@coffee/nucleo/validacion'

import type { PasoIsla } from '~/composables/useIsla'

/** El 4:6 Kasuya base de `almacen/semilla.js`, con 20 g de café. */
const RECETA = '4:6 Kasuya base'
const PASOS: PasoIsla[] = [
  { accion: 'verter', estilo: 'espiral', acumulado_g: 60, t_inicio_s: 0 },
  { accion: 'esperar', estilo: null, acumulado_g: 60, t_inicio_s: 15 },
  { accion: 'verter', estilo: 'espiral', acumulado_g: 120, t_inicio_s: 45 },
  { accion: 'esperar', estilo: null, acumulado_g: 120, t_inicio_s: 60 },
  { accion: 'verter', estilo: 'espiral', acumulado_g: 210, t_inicio_s: 90 },
  { accion: 'esperar', estilo: null, acumulado_g: 210, t_inicio_s: 115 },
  { accion: 'verter', estilo: 'espiral', acumulado_g: 300, t_inicio_s: 145 },
  { accion: 'esperar', estilo: null, acumulado_g: 300, t_inicio_s: 170 },
  { accion: 'retirar', estilo: null, acumulado_g: 300, t_inicio_s: 200 },
]
const DURACION_S = 210

const estado = ref<'parado' | 'corriendo' | 'pausado'>('parado')
const segundo = ref(0)
const tramo = ref(0)
/** El `performance.now()` que corresponde al segundo 0 de la prueba. */
let origen = 0
let bucle: ReturnType<typeof setInterval> | null = null

/**
 * La prueba de la portada: una extracción de 3:30 con la receta base, sin
 * pasar por el crono ni registrar nada. Es para ver en un móvil concreto qué
 * enseña su sistema sin tener que saber usar la app, y es una consumidora
 * más del puerto de la isla: en el navegador prueba Media Session; en una
 * cáscara nativa, lo que ésta pinte.
 */
export function usePruebaIsla() {
  const { t } = useI18n()
  const isla = useIsla()
  const sonido = useSonido()

  const plan = computed(() => isla.planDe(PASOS, {
    album: t('sistema.prueba', { receta: RECETA }),
    cues: [],
    mandos: { pausar: t('bloqueo.pausar'), reanudar: t('bloqueo.reanudar'), parar: t('bloqueo.parar') },
    sonido: true,
    voz: false,
  }))

  const ahora = () => (performance.now() - origen) / 1000

  function tic() {
    segundo.value = ahora()
    if (segundo.value >= DURACION_S) {
      sonido.pitido('cadencia')
      parar()
      return
    }
    const i = tramoEn(plan.value.tramos, segundo.value)
    if (i !== tramo.value) {
      tramo.value = i
      sonido.pitido('go')
    }
  }

  function andar() {
    if (bucle) clearInterval(bucle)
    bucle = setInterval(tic, 250)
  }

  function atender() {
    isla.atender((mando) => {
      if (mando === 'pausar') pausar()
      else if (mando === 'reanudar') reanudar()
      else if (mando === 'parar') parar()
    })
  }

  /** Tiene que llamarse desde un toque: sin gesto no suena nada. */
  async function empezar() {
    sonido.desbloquear()
    await isla.encender('prueba', plan.value, soltar)
    origen = performance.now()
    segundo.value = 0
    tramo.value = 0
    estado.value = 'corriendo'
    sonido.pitido('go')
    atender()
    isla.anclar({ estado: 'corriendo', epochMs: Date.now() })
    andar()
  }

  function pausar() {
    if (estado.value !== 'corriendo') return
    if (bucle) clearInterval(bucle)
    bucle = null
    segundo.value = ahora()
    estado.value = 'pausado'
    isla.anclar({ estado: 'pausado', segundo: segundo.value })
  }

  function reanudar() {
    if (estado.value !== 'pausado') return
    // El segundo en que se paró pasa a ser el de ahora: la pausa no cuenta.
    origen = performance.now() - segundo.value * 1000
    estado.value = 'corriendo'
    isla.anclar({ estado: 'corriendo', epochMs: Date.now() - segundo.value * 1000 })
    andar()
  }

  /** Lo de la prueba, sin tocar la isla: por aquí se va si llega el reloj. */
  function soltar() {
    if (bucle) clearInterval(bucle)
    bucle = null
    estado.value = 'parado'
  }

  function parar() {
    soltar()
    if (isla.esDe('prueba')) isla.apagar()
  }

  const texto = computed(() =>
    estado.value === 'parado'
      ? ''
      : `${plan.value.tramos[tramo.value]!.titulo} · ${relojDe(segundo.value)} / ${relojDe(DURACION_S)}`,
  )

  return {
    disponible: isla.disponible(), estado: readonly(estado), texto,
    duracion: relojDe(DURACION_S), empezar, pausar, reanudar, parar,
  }
}
