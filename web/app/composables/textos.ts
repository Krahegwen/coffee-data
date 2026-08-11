/**
 * Los textos que ve el usuario, en un solo sitio.
 *
 * La base guarda claves —`verter`, `espiral`—, no frases: la clave es el dato
 * y una frase guardada sería intraducible sin migración. Aquí es donde una
 * clave se convierte en el idioma que toque.
 *
 * Las listas de claves siguen siendo constantes normales, porque son **datos**
 * y no cambian con el idioma; lo que se vuelve reactivo es la etiqueta. Por eso
 * esto es un composable y no un puñado de objetos sueltos: cambiar de idioma
 * tiene que repintar lo que ya está en pantalla, y un objeto congelado en el
 * módulo se quedaría en el idioma con el que arrancó la app.
 */
import type { ComputedRef } from 'vue'

export const CLAVES_ACCION = ['verter', 'agitar', 'remover', 'esperar', 'retirar'] as const
export const CLAVES_ESTILO = ['espiral', 'centro'] as const
export const CLAVES_DEFECTO = [
  'equilibrado', 'amargor', 'astringente', 'plano', 'agrio', 'salado', 'carton', 'aguado',
] as const
/** Lo que se puede tocar de una extracción a la siguiente. */
export const CLAVES_VARIABLE = [
  'temp_c', 'clics', 'dosis_g', 'agua_g', 'receta_id', 'dripper',
] as const
export const CLAVES_DRIPPER = ['v60-02-plastico', 'v60-02-ceramica'] as const

export type Accion = (typeof CLAVES_ACCION)[number]
export type Estilo = (typeof CLAVES_ESTILO)[number]
export type Variable = (typeof CLAVES_VARIABLE)[number]

/** Las variables que son de elegir de una lista, no de teclear un número. */
export type OpcionesDeVariable = Record<string, { valor: string; etiqueta: string }[]>

type Catalogo = ComputedRef<Record<string, string>>

export function useTextos() {
  const { t, locale } = useI18n()

  const mapa = (grupo: string, claves: readonly string[]): Catalogo =>
    computed(() => Object.fromEntries(claves.map((c) => [c, t(`${grupo}.${c}`)])))

  const ACCIONES = mapa('acciones', CLAVES_ACCION)
  const ESTILOS = mapa('estilos', CLAVES_ESTILO)
  const DEFECTOS = mapa('defectos', CLAVES_DEFECTO)
  const VARIABLES = mapa('variables', CLAVES_VARIABLE)
  const DRIPPERS = mapa('drippers', CLAVES_DRIPPER)

  /**
   * «2026-08-06» → «6 ago». Desde que la id es un uuid opaco, lo que identifica
   * una taza para un humano es el café y el día: esto es la mitad de eso.
   *
   * El formato lo pone el idioma activo, no una constante: «6 ago» en
   * castellano y «6 Aug» en inglés salen del mismo dato.
   */
  function fechaCorta(fecha: string | null | undefined): string {
    if (!fecha) return ''
    const dia = new Date(`${fecha}T00:00:00Z`)
    if (Number.isNaN(dia.getTime())) return String(fecha)
    return dia.toLocaleDateString(locale.value === 'en' ? 'en-GB' : 'es-ES', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    })
  }

  /**
   * El nombre de la bolsa, o «Sin bolsa» si la extracción se apuntó suelta.
   * En la base es un null; en una tarjeta, un hueco mudo no cuenta nada.
   */
  function nombreCafe(nombre: string | null | undefined): string {
    return nombre ?? t('comun.sin_bolsa')
  }

  /** «Temperatura (°C)» → «Temperatura»: dentro de una frase la unidad estorba. */
  function nombreDeVariable(clave: string): string {
    return (VARIABLES.value[clave] ?? clave).replace(/\s*\(.*\)$/, '')
  }

  /** El valor tal y como se lee: la etiqueta si la variable es de una lista. */
  function valorDeVariable(
    clave: string, valor: unknown, opciones?: OpcionesDeVariable,
  ): string {
    if (valor === null || valor === undefined || valor === '') return '—'
    const lista = opciones?.[clave]
    return lista?.find((o) => o.valor === String(valor))?.etiqueta ?? String(valor)
  }

  /**
   * «Temperatura 91 → 88 · Clics 28 → 26», para leer en pantalla.
   *
   * Vive aquí y no en cada pantalla porque lo enseñan dos —el alta y la
   * corrección— y dos versiones del mismo texto acabarían diciendo cosas
   * distintas de lo mismo.
   *
   * **Esto se lee, no se guarda.** Lo que va a la columna lo compone
   * `textoDeVariables` del núcleo, con el nombre de la columna y el slug:
   * componiendo cada uno el suyo, la misma bitácora acababa con dos
   * vocabularios —«Temperatura 91 → 94» de la app y «temp_c 91 → 94» del
   * servidor— según por dónde hubiera entrado la fila.
   */
  function textoDeCambios(
    claves: string[],
    antes: Record<string, unknown> | null,
    ahora: Record<string, unknown>,
    opciones?: OpcionesDeVariable,
  ): string {
    return claves
      .map((c) => `${nombreDeVariable(c)} ${valorDeVariable(c, antes?.[c], opciones)} → ${valorDeVariable(c, ahora[c], opciones)}`)
      .join(' · ')
  }

  /**
   * Lo que se lee del paso: «Verter en espiral».
   *
   * Nada de `text-transform: capitalize`, que pone en mayúscula cada palabra y
   * dejaría «Verter En Espiral».
   */
  function etiquetaPaso(accion: string, estilo?: string | null): string {
    const que = ACCIONES.value[accion] ?? capitalizar(accion)
    if (!estilo) return que
    return `${que} ${ESTILOS.value[estilo] ?? estilo}`
  }

  return {
    ACCIONES, ESTILOS, DEFECTOS, VARIABLES, DRIPPERS,
    fechaCorta, nombreCafe, nombreDeVariable, valorDeVariable, textoDeCambios,
    etiquetaPaso,
  }
}

/**
 * Red de seguridad: si algún día hay una acción en la base que este catálogo
 * no conoce, que salga legible en vez de en crudo y sin esperar a un despliegue.
 */
function capitalizar(texto: string): string {
  const limpio = texto.replace(/_/g, ' ')
  return limpio.charAt(0).toUpperCase() + limpio.slice(1)
}
