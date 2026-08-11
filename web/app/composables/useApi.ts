/**
 * Acceso a los datos. La app no sabe de SQL ni de red: pide y manda
 * extracciones, y punto.
 *
 * Desde la cola de salida hay **un solo camino**: toda lectura y toda
 * escritura pasan por los manejadores del núcleo contra el cajón de
 * IndexedDB, haya sesión o no. La sesión solo añade una cosa: cada
 * escritura se apunta además en la cola, y useSincro() la va subiendo al
 * Worker y trayendo de vuelta la copia buena. Offline-first sin dos rutas
 * que mantener a la par.
 */

import * as nucleo from '@coffee/nucleo/api'
import { textos } from '@coffee/nucleo/textos'
import { claveDeFoto, validarFoto } from '@coffee/nucleo/validacion'

import { cuerpoDeCafe, cuerpoDeExtraccion, cuerpoDeReceta } from '~/almacen/cola'
import { almacenLocal } from '~/almacen/local'

import type { EntradaCola } from './useSincro'

type AlmacenLocal = Awaited<ReturnType<typeof almacenLocal>>

export const ESTADOS = ['abierto', 'terminado', 'pendiente'] as const

export interface Cafe {
  /** UUID opaco. Lo que se lee y viaja en la URL es el slug. */
  id: string
  slug: string
  nombre: string
  tostador: string | null
  origen: string | null
  region: string | null
  variedad: string | null
  proceso: string | null
  altitud_m: number | null
  sca: number | null
  fecha_tueste: string | null
  consumir_antes: string | null
  peso_g: number | null
  precio_eur: number | null
  notas_tostador: string | null
  estado: (typeof ESTADOS)[number]
  /** Cuándo se abrió. El otro reloj de la frescura, junto al tueste. */
  fecha_apertura: string | null
  foto: string | null
  url: string | null
  conservacion: string | null
}

export interface Extraccion {
  /** UUID opaco: dejó de haber «extracción #7». */
  id: string
  fecha: string
  creado_en: string
  /** Null en una taza suelta: se apuntó sin bolsa y no compara con nada. */
  cafe_id: string | null
  cafe_nombre: string | null
  cafe_slug: string | null
  receta_slug: string | null
  dosis_g: number
  agua_g: number
  ratio: number
  dias_tueste: number | null
  /** Días que llevaba la bolsa abierta ese día. Null si no consta la apertura. */
  dias_abierta: number | null
  temp_c: number | null
  clics: number | null
  reparto: string | null
  tiempo_total: string | null
  drawdown_s: number | null
  variable_cambiada: string | null
  /** Los defectos en orden de relevancia, separados por comas. El primero manda. */
  defecto: string | null
  notas_cata: string | null
  nota: number | null
  siguiente_ajuste: string | null
  receta_id: string | null
  dripper: string | null
  /** Lo que acabó en la taza. Con el agua y la dosis da la retención. */
  extraido_g: number | null
  /**
   * De qué extracción es variación ésta: contra ella la compara el motor.
   *
   * Null es «no compara con nada» —la primera de la bolsa, o una suelta—. No
   * confundirla con de dónde salen los valores al abrir el formulario: eso es
   * otra cadena y puede venir de cualquier bolsa, porque solo rellena campos.
   */
  desde_id: string | null
}

export interface Paso {
  receta_id: string
  orden: number
  t_inicio_s: number | null
  accion: 'verter' | 'agitar' | 'remover' | 'esperar' | 'retirar'
  /** Cómo se vierte. Solo lo llevan los vertidos, y ni todos. */
  estilo: 'espiral' | 'centro' | null
  agua_g: number
  notas: string | null
}

export interface Receta {
  /** UUID opaco. El slug es lo legible y lo que va en la URL. */
  id: string
  slug: string
  nombre: string
  ratio: number | null
  notas: string | null
  pasos: Paso[]
}

/** Un paso listo para el cronómetro: agua escalada y acumulada. */
export interface PasoGuion {
  orden: number
  t_inicio_s: number | null
  accion: 'verter' | 'agitar' | 'remover' | 'esperar' | 'retirar'
  estilo: 'espiral' | 'centro' | null
  agua_g: number
  acumulado_g: number
  /** Falso al agitar o remover: la cuchara pesa y el peso deja de valer. */
  lectura_fiable: boolean
  notas: string
}

export interface Cambio {
  variable: string
  cambio: string
  porque: string
}

export interface Sugerencias {
  avisos: string[]
  cambios: Cambio[]
  cobertura: Record<string, string[]>
  conforme: boolean
  resumen: string
}

export interface Creada {
  extraccion: Extraccion
  /** El nombre de la bolsa, o null si la taza se apuntó suelta. */
  cafe: string | null
  sugerencias: Sugerencias
}

/**
 * Los ajustes. Siempre completos: el núcleo rellena con los valores de
 * fábrica lo que nadie haya tocado, así que aquí no hay opcionales.
 */
export interface Preferencias {
  sonido: boolean
  latido: boolean
  cuenta_atras: boolean
  crono_cafe_id: string
  crono_receta_id: string
  crono_dosis_g: number
  crono_agua_g: number
}

/** Lo que la app manda. El servidor calcula id, reparto, ratio y dias_tueste. */
export interface NuevaExtraccion {
  /** Sin él, la extracción queda suelta: taza apuntada, sin serie. */
  cafe_id?: string
  temp_c: number
  clics: number
  tiempo_total: string
  /**
   * Qué se movió respecto a la madre. Opcional: sin él, el servidor lo
   * compone del diff —«temp_c 91 → 94»— y lo que mandes manda siempre.
   */
  variable_cambiada?: string
  /**
   * Uno, o varios en orden de relevancia. Como cadena —`"amargor,plano"`, la
   * forma en que se guarda— o como array; el núcleo acepta las dos y devuelve
   * siempre la cadena canónica.
   */
  defecto: string | string[]
  nota: number
  dosis_g?: number
  agua_g?: number
  drawdown_s?: number
  extraido_g?: number
  receta_id?: string
  dripper?: string
  notas_cata?: string
  siguiente_ajuste?: string
  fecha?: string
  /**
   * De qué extracción es variación. Sin mandarlo, el servidor cuelga la nueva
   * de la última de esa bolsa, que es el caso normal; se manda solo al volver
   * a una rama anterior.
   */
  desde_id?: string | null
}

export function useApi() {
  const { activa } = useSesion()
  const { encolar } = useSincro()
  const { locale } = useI18n()

  /*
   * En qué idioma habla el núcleo. Los manejadores corren **aquí**, en el
   * navegador, así que el idioma no viaja a ninguna parte: se le pasa a la
   * llamada. Es lo que hace que un 422 o una sugerencia salgan en el mismo
   * idioma que el botón que los provocó.
   *
   * Lo que sí viaja es al reenviar por la cola, y eso lo resuelve el Worker
   * leyendo `Accept-Language` — ver `useSincro`.
   */
  const t = computed(() => textos(locale.value))
  const idioma = () => ({ t: t.value })

  /*
   * El cajón, sembrado solo sin sesión: a quien trabaja contra el servidor
   * las recetas le llegan con el primer refresco, y unas semillas con uuid
   * propio solo estorbarían al reemplazo.
   */
  const cajon = () => almacenLocal(!activa.value)

  /** Un {estado, datos} del núcleo, con la forma de error de $fetch. */
  async function local<T>(fn: (a: AlmacenLocal) => Promise<{ estado: number; datos: unknown }>): Promise<T> {
    const { estado, datos } = await fn(await cajon())
    if (estado >= 400) {
      const cuerpo = datos as { error?: string; errores?: string[] }
      throw Object.assign(new Error(cuerpo.error ?? cuerpo.errores?.[0] ?? `HTTP ${estado}`), {
        data: datos,
        statusCode: estado,
      })
    }
    return datos as T
  }

  /** Con sesión, además de escribirse en local se apunta para la red. */
  const subir = async (entrada: EntradaCola) => {
    if (activa.value) await encolar(entrada)
  }

  const cafes = () =>
    local<Cafe[]>((a) => nucleo.listaCafes(a)).then(async (filas) => {
      await refrescarFotosLocales()
      return filas
    })

  const recetas = () => local<Receta[]>((a) => nucleo.listaRecetas(a))

  /** Los ajustes, completos y tipados: nunca faltan claves. */
  const preferencias = () =>
    local<{ preferencias: Preferencias }>((a) => nucleo.leerPreferencias(a))
      .then((r) => r.preferencias)

  /**
   * Cambia los ajustes que se le manden y **solo ésos**. Por eso viaja como
   * PATCH: dos dispositivos que tocan interruptores distintos no se pisan, y
   * reintentarlo desde la cola da siempre el mismo resultado.
   */
  const guardarPreferencias = async (cambios: Partial<Preferencias>): Promise<Preferencias> => {
    const r = await local<{ preferencias: Preferencias }>(
      (a) => nucleo.guardarPreferencias(a, cambios, idioma()),
    )
    await subir({ metodo: 'PATCH', camino: '/api/preferencias', cuerpo: cambios })
    return r.preferencias
  }

  const extracciones = (cafeId?: string) =>
    local<Extraccion[]>((a) => nucleo.listaExtracciones(a, { cafe: cafeId }))

  /** La papelera. */
  const retiradas = () =>
    local<Extraccion[]>((a) => nucleo.listaExtracciones(a, { retiradas: true }))

  /** Los pasos de una receta, ya escalados al agua y con el acumulado. */
  const guion = (recetaId: string, aguaG: number) =>
    local<PasoGuion[]>((a) => nucleo.guionDe(a, recetaId, String(aguaG), idioma()))

  /**
   * Registra una extracción. Entera o ninguna: si algo se rechaza, no se
   * escribe nada y llega la lista de errores. A la cola va la fila creada
   * —identidad, reparto y ajuste del motor incluidos—, no lo tecleado: así
   * el servidor escribe exactamente lo mismo.
   */
  const crear = async (datos: NuevaExtraccion): Promise<Creada> => {
    const r = await local<Creada>((a) => nucleo.crearExtraccion(a, datos as unknown as Record<string, unknown>, idioma()))
    await subir({ metodo: 'POST', camino: '/api/extracciones', cuerpo: cuerpoDeExtraccion(r.extraccion) })
    return r
  }

  /**
   * Corrige una extracción. Solo se manda lo que cambia.
   *
   * Devuelve avisos como el alta: corregir a mano es justo donde una fila se
   * queda incoherente —el tiempo total movido y el goteo quieto—, así que la
   * corrección se mira con los mismos ojos que el registro.
   */
  const editarExtraccion = async (id: string, cambios: Record<string, unknown>) => {
    const r = await local<{ extraccion: Extraccion; cambiado: string[]; avisos: string[] }>(
      (a) => nucleo.editarExtraccion(a, id, cambios, idioma()),
    )
    await subir({ metodo: 'PATCH', camino: `/api/extracciones/${r.extraccion.id}`, cuerpo: cambios })
    return r
  }

  /** Retira una extracción. Borrado lógico: la fila se queda, marcada. */
  const retirarExtraccion = async (id: string) => {
    const r = await local<{ retirada: boolean }>((a) => nucleo.retirarExtraccion(a, id, idioma()))
    await subir({ metodo: 'DELETE', camino: `/api/extracciones/${id}` })
    return r
  }

  const restaurarExtraccion = async (id: string) => {
    const r = await local<{ extraccion: Extraccion }>((a) => nucleo.restaurarExtraccion(a, id, idioma()))
    await subir({ metodo: 'POST', camino: `/api/extracciones/${id}/restaurar` })
    return r
  }

  /** Da de alta una bolsa. */
  const crearCafe = async (datos: Record<string, unknown>) => {
    const r = await local<{ cafe: Cafe }>((a) => nucleo.crearCafe(a, datos, idioma()))
    await subir({ metodo: 'POST', camino: '/api/cafes', cuerpo: cuerpoDeCafe(r.cafe) })
    return r
  }

  /** Corrige una ficha. Solo se manda lo que cambia. */
  const editarCafe = async (id: string, cambios: Record<string, unknown>) => {
    const r = await local<{ cafe: Cafe; cambiado: string[] }>((a) => nucleo.editarCafe(a, id, cambios, idioma()))
    await subir({ metodo: 'PATCH', camino: `/api/cafes/${r.cafe.id}`, cuerpo: cambios })
    return r
  }

  /** Crea una receta con sus pasos. */
  const crearReceta = async (datos: Record<string, unknown>) => {
    const r = await local<{ receta: Receta }>((a) => nucleo.guardarReceta(a, { nuevo: true }, datos, idioma()))
    await subir({ metodo: 'POST', camino: '/api/recetas', cuerpo: cuerpoDeReceta(r.receta) })
    return r
  }

  /** Guarda una receta: los pasos reemplazan a los que hubiera. */
  const guardarReceta = async (id: string, datos: Record<string, unknown>) => {
    const r = await local<{ receta: Receta }>(
      (a) => nucleo.guardarReceta(a, { ref: id, nuevo: false }, datos, idioma()),
    )
    await subir({
      metodo: 'PUT',
      camino: `/api/recetas/${r.receta.id}`,
      cuerpo: cuerpoDeReceta(r.receta, { conIdentidad: false }),
    })
    return r
  }

  /** Borra una receta y sus pasos. Da 409 si alguna extracción la usa. */
  const borrarReceta = async (id: string) => {
    const r = await local<{ borrada: boolean; id: string; slug: string }>(
      (a) => nucleo.borrarReceta(a, id, idioma()),
    )
    await subir({ metodo: 'DELETE', camino: `/api/recetas/${r.id}` })
    return r
  }

  /**
   * Sube o reemplaza la foto de la bolsa. El Blob se queda en IndexedDB con
   * la misma validación y el mismo esquema de claves que R2; con sesión, el
   * binario viaja en su entrada de cola detrás del alta de su bolsa.
   */
  const subirFotoCafe = async (id: string, fichero: File) => {
    const r = await subirFotoLocal(id, fichero)
    await subir({
      metodo: 'PUT',
      camino: `/api/cafes/${r.cafe.id}/foto`,
      blob: fichero,
      tipo: fichero.type,
    })
    return r
  }

  const quitarFotoCafe = async (id: string) => {
    const r = await quitarFotoLocal(id)
    await subir({ metodo: 'DELETE', camino: `/api/cafes/${r.cafe.id}/foto` })
    return r
  }

  /**
   * La URL de una foto: un object URL del Blob del cajón, en un estado
   * reactivo para que la imagen aparezca cuando el Blob ya está leído. En el
   * modo con sesión los Blob los baja el refresco.
   */
  const urlsLocales = useState<Record<string, string>>('fotos-locales', () => ({}))
  const urlFoto = (foto: string | null) => {
    if (!foto) return null
    return urlsLocales.value[foto] ?? null
  }

  async function refrescarFotosLocales() {
    const guardadas = await (await cajon()).fotos.listar()
    const mapa: Record<string, string> = { ...urlsLocales.value }
    for (const f of guardadas) {
      if (!mapa[f.clave]) mapa[f.clave] = URL.createObjectURL(f.blob)
    }
    urlsLocales.value = mapa
  }

  function noExiste(ref: string): never {
    throw Object.assign(new Error('no existe'), {
      data: { errores: [`no existe ningún café '${ref}'`] },
      statusCode: 404,
    })
  }

  async function subirFotoLocal(ref: string, fichero: File) {
    const almacen = await cajon()
    const cafe = nucleo.porRef(await almacen.cafes.listar(), ref) as Cafe | null
    if (!cafe) noExiste(ref)
    const foto = validarFoto(fichero.type, fichero.size) as {
      tipo?: string; extension?: string; error?: string; estado?: number
    }
    if (foto.error) {
      throw Object.assign(new Error(foto.error), {
        data: { errores: [foto.error] },
        statusCode: foto.estado,
      })
    }

    const clave = claveDeFoto(cafe.slug, foto.extension!) as string
    await almacen.fotos.poner(clave, fichero, foto.tipo!)
    await almacen.cafes.actualizar(cafe.id, { foto: clave, actualizado_en: nucleo.ahoraSQL() })
    if (cafe.foto && cafe.foto !== clave) {
      await almacen.fotos.quitar(cafe.foto)
      const vieja = urlsLocales.value[cafe.foto]
      if (vieja) URL.revokeObjectURL(vieja)
    }
    await refrescarFotosLocales()
    const actualizado = nucleo.porRef(await almacen.cafes.listar(), cafe.id) as Cafe
    return { cafe: actualizado }
  }

  async function quitarFotoLocal(ref: string) {
    const almacen = await cajon()
    const cafe = nucleo.porRef(await almacen.cafes.listar(), ref) as Cafe | null
    if (!cafe) noExiste(ref)
    if (cafe.foto) {
      await almacen.fotos.quitar(cafe.foto)
      const vieja = urlsLocales.value[cafe.foto]
      if (vieja) URL.revokeObjectURL(vieja)
      await almacen.cafes.actualizar(cafe.id, { foto: null, actualizado_en: nucleo.ahoraSQL() })
    }
    const actualizado = nucleo.porRef(await almacen.cafes.listar(), cafe.id) as Cafe
    return { cafe: actualizado }
  }

  return {
    cafes, recetas, extracciones, guion, crear, crearCafe, editarCafe,
    editarExtraccion, retirarExtraccion, restaurarExtraccion, retiradas,
    crearReceta, guardarReceta, borrarReceta, subirFotoCafe, quitarFotoCafe, urlFoto,
    preferencias, guardarPreferencias,
  }
}

/** Saca los mensajes legibles de lo que devuelva la API al fallar. */
export function erroresDe(fallo: unknown): string[] {
  const datos = (fallo as { data?: { errores?: string[]; error?: string } })?.data
  if (datos?.errores?.length) return datos.errores
  if (datos?.error) return [datos.error]
  const mensaje = (fallo as Error)?.message
  return [mensaje || 'No se pudo guardar']
}

/** Días desde el tueste hasta hoy. Null si la bolsa no tiene fecha. */
export function diasDesdeTueste(fechaTueste: string | null): number | null {
  if (!fechaTueste) return null
  const tueste = new Date(`${fechaTueste}T00:00:00Z`)
  if (Number.isNaN(tueste.getTime())) return null
  const hoy = new Date()
  const dia = 24 * 60 * 60 * 1000
  return Math.floor((Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - tueste.getTime()) / dia)
}
