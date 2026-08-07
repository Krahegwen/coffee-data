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

/** Lo que le pasa a la taza. La clave va sin acentos; la etiqueta, con ellos. */
export const DEFECTOS = {
  equilibrado: 'Equilibrado',
  amargor: 'Amargor',
  astringente: 'Astringente',
  plano: 'Plano',
  agrio: 'Agrio',
  salado: 'Salado',
  carton: 'Cartón',
  aguado: 'Aguado (sin cuerpo)',
} as const

/** Lo que se puede tocar de una extracción a la siguiente. */
export const VARIABLES = {
  temp_c: 'Temperatura (°C)',
  clics: 'Clics',
  dosis_g: 'Dosis (g)',
  agua_g: 'Agua (g)',
  receta_id: 'Receta',
  dripper: 'Dripper',
} as const

export const DRIPPERS = {
  'v60-02-plastico': 'V60 02 plástico',
  'v60-02-ceramica': 'V60 02 cerámica',
} as const

export type Accion = keyof typeof ACCIONES
export type Estilo = keyof typeof ESTILOS
export type Variable = keyof typeof VARIABLES

/**
 * «2026-08-06» → «6 ago». Desde que la id es un uuid opaco, lo que identifica
 * una taza para un humano es el café y el día: esto es la mitad de eso.
 */
export function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return ''
  const dia = new Date(`${fecha}T00:00:00Z`)
  if (Number.isNaN(dia.getTime())) return String(fecha)
  return dia.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/**
 * El nombre de la bolsa, o «Sin bolsa» si la extracción se apuntó suelta.
 * En la base es un null; en una tarjeta, un hueco mudo no cuenta nada.
 */
export function nombreCafe(nombre: string | null | undefined): string {
  return nombre ?? 'Sin bolsa'
}

/** Las variables que son de elegir de una lista, no de teclear un número. */
export type OpcionesDeVariable = Record<string, { valor: string; etiqueta: string }[]>

/** «Temperatura (°C)» → «Temperatura»: dentro de una frase la unidad estorba. */
export function nombreDeVariable(clave: string): string {
  return (VARIABLES[clave as Variable] ?? clave).replace(/\s*\(.*\)$/, '')
}

/** El valor tal y como se lee: la etiqueta si la variable es de una lista. */
export function valorDeVariable(
  clave: string, valor: unknown, opciones?: OpcionesDeVariable,
): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  const lista = opciones?.[clave]
  return lista?.find((o) => o.valor === String(valor))?.etiqueta ?? String(valor)
}

/**
 * «Temperatura 91 → 88 · Clics 28 → 26».
 *
 * Vive aquí y no en cada pantalla porque lo escriben dos —el alta y la
 * corrección— y dos versiones del mismo texto acabarían diciendo cosas
 * distintas de lo mismo.
 */
export function textoDeCambios(
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
