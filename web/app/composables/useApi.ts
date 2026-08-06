/**
 * Acceso a la API. La app no sabe de SQL ni de commits: pide y manda
 * extracciones, y punto. Ese contrato es lo que permite cambiar la
 * autenticación del servidor sin tocar nada de aquí.
 */

import * as nucleo from '@coffee/nucleo/api'
import { claveDeFoto, validarFoto } from '@coffee/nucleo/validacion'

import { almacenIDB } from '~/almacen/idb'
import { sembrar } from '~/almacen/semilla'

type AlmacenLocal = ReturnType<typeof almacenIDB>

/*
 * El cajón del modo local, uno por pestaña y perezoso: no se abre IndexedDB
 * ni se siembra nada hasta la primera llamada que de verdad va a local.
 */
let cajon: AlmacenLocal | null = null
let sembrado: Promise<void> | null = null

async function almacenLocal(): Promise<AlmacenLocal> {
  cajon ??= almacenIDB()
  sembrado ??= sembrar(cajon)
  await sembrado
  return cajon
}

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
  cafe_id: string
  cafe_nombre: string
  cafe_slug: string
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
  defecto: string | null
  notas_cata: string | null
  nota: number | null
  siguiente_ajuste: string | null
  receta_id: string | null
  dripper: string | null
  /** Lo que acabó en la taza. Con el agua y la dosis da la retención. */
  extraido_g: number | null
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
  cafe: string
  sugerencias: Sugerencias
}

/** Lo que la app manda. El servidor calcula id, reparto, ratio y dias_tueste. */
export interface NuevaExtraccion {
  cafe_id: string
  temp_c: number
  clics: number
  tiempo_total: string
  variable_cambiada: string
  defecto: string
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
}

export function useApi() {
  const base = useRuntimeConfig().public.apiBase
  const { activa } = useSesion()

  /*
   * El árbitro. Con sesión abierta, la app habla con el Worker por fetch,
   * como siempre. Sin ella, llama a los mismos manejadores del núcleo en
   * proceso, contra IndexedDB: mismos códigos, mismos mensajes, otro cajón.
   * Se decide en cada llamada, no al montar: abrir o cerrar sesión cambia de
   * camino sin recargar.
   */
  const servidor = () => activa.value

  /** Un {estado, datos} del núcleo, con la forma de error de $fetch. */
  async function local<T>(fn: (a: AlmacenLocal) => Promise<{ estado: number; datos: unknown }>): Promise<T> {
    const { estado, datos } = await fn(await almacenLocal())
    if (estado >= 400) {
      const cuerpo = datos as { error?: string; errores?: string[] }
      throw Object.assign(new Error(cuerpo.error ?? cuerpo.errores?.[0] ?? `HTTP ${estado}`), {
        data: datos,
        statusCode: estado,
      })
    }
    return datos as T
  }

  const cafes = () =>
    servidor()
      ? $fetch<Cafe[]>(`${base}/api/cafes`)
      : local<Cafe[]>((a) => nucleo.listaCafes(a)).then(async (filas) => {
          await refrescarFotosLocales()
          return filas
        })

  const recetas = () =>
    servidor()
      ? $fetch<Receta[]>(`${base}/api/recetas`)
      : local<Receta[]>((a) => nucleo.listaRecetas(a))

  const extracciones = (cafeId?: string) =>
    servidor()
      ? $fetch<Extraccion[]>(`${base}/api/extracciones`, {
          query: cafeId ? { cafe: cafeId } : undefined,
        })
      : local<Extraccion[]>((a) => nucleo.listaExtracciones(a, { cafe: cafeId }))

  /** Corrige una extracción. Solo se manda lo que cambia. */
  const editarExtraccion = (id: string, cambios: Record<string, unknown>) =>
    servidor()
      ? $fetch<{ extraccion: Extraccion; cambiado: string[] }>(`${base}/api/extracciones/${id}`, {
          method: 'PATCH',
          body: cambios,
        })
      : local<{ extraccion: Extraccion; cambiado: string[] }>((a) => nucleo.editarExtraccion(a, id, cambios))

  /** Retira una extracción. Borrado lógico: la fila se queda, marcada. */
  const retirarExtraccion = (id: string) =>
    servidor()
      ? $fetch<{ retirada: boolean }>(`${base}/api/extracciones/${id}`, { method: 'DELETE' })
      : local<{ retirada: boolean }>((a) => nucleo.retirarExtraccion(a, id))

  const restaurarExtraccion = (id: string) =>
    servidor()
      ? $fetch<{ extraccion: Extraccion }>(`${base}/api/extracciones/${id}/restaurar`, {
          method: 'POST',
        })
      : local<{ extraccion: Extraccion }>((a) => nucleo.restaurarExtraccion(a, id))

  /** La papelera. */
  const retiradas = () =>
    servidor()
      ? $fetch<Extraccion[]>(`${base}/api/extracciones`, { query: { retiradas: 1 } })
      : local<Extraccion[]>((a) => nucleo.listaExtracciones(a, { retiradas: true }))

  /** Crea una receta con sus pasos. */
  const crearReceta = (datos: Record<string, unknown>) =>
    servidor()
      ? $fetch<{ receta: Receta }>(`${base}/api/recetas`, { method: 'POST', body: datos })
      : local<{ receta: Receta }>((a) => nucleo.guardarReceta(a, { nuevo: true }, datos))

  /** Guarda una receta: los pasos reemplazan a los que hubiera. */
  const guardarReceta = (id: string, datos: Record<string, unknown>) =>
    servidor()
      ? $fetch<{ receta: Receta }>(`${base}/api/recetas/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: datos,
        })
      : local<{ receta: Receta }>((a) => nucleo.guardarReceta(a, { ref: id, nuevo: false }, datos))

  /** Borra una receta y sus pasos. Da 409 si alguna extracción la usa. */
  const borrarReceta = (id: string) =>
    servidor()
      ? $fetch<{ borrada: boolean; id: string }>(`${base}/api/recetas/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      : local<{ borrada: boolean; id: string }>((a) => nucleo.borrarReceta(a, id))

  /** Da de alta una bolsa. */
  const crearCafe = (datos: Record<string, unknown>) =>
    servidor()
      ? $fetch<{ cafe: Cafe }>(`${base}/api/cafes`, { method: 'POST', body: datos })
      : local<{ cafe: Cafe }>((a) => nucleo.crearCafe(a, datos))

  /** Corrige una ficha. Solo se manda lo que cambia. */
  const editarCafe = (id: string, cambios: Record<string, unknown>) =>
    servidor()
      ? $fetch<{ cafe: Cafe; cambiado: string[] }>(`${base}/api/cafes/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: cambios,
        })
      : local<{ cafe: Cafe; cambiado: string[] }>((a) => nucleo.editarCafe(a, id, cambios))

  /**
   * Sube o reemplaza la foto de la bolsa. En el servidor va en binario a R2;
   * en local el Blob se queda en IndexedDB, con la misma validación y el
   * mismo esquema de claves, y la URL sale de createObjectURL.
   */
  const subirFotoCafe = (id: string, fichero: File) =>
    servidor()
      ? $fetch<{ cafe: Cafe }>(`${base}/api/cafes/${encodeURIComponent(id)}/foto`, {
          method: 'PUT',
          body: fichero,
          headers: { 'content-type': fichero.type },
        })
      : subirFotoLocal(id, fichero)

  const quitarFotoCafe = (id: string) =>
    servidor()
      ? $fetch<{ cafe: Cafe }>(`${base}/api/cafes/${encodeURIComponent(id)}/foto`, {
          method: 'DELETE',
        })
      : quitarFotoLocal(id)

  /** Los pasos de una receta, ya escalados al agua y con el acumulado. */
  const guion = (recetaId: string, aguaG: number) =>
    servidor()
      ? $fetch<PasoGuion[]>(`${base}/api/guion`, { query: { receta: recetaId, agua: aguaG } })
      : local<PasoGuion[]>((a) => nucleo.guionDe(a, recetaId, String(aguaG)))

  /**
   * Registra una extracción. Entera o ninguna: si algo se rechaza, no se
   * escribe nada y llega la lista de errores.
   *
   * En el servidor no lleva token: la sesión va en una cookie HttpOnly.
   */
  const crear = (datos: NuevaExtraccion): Promise<Creada> =>
    servidor()
      ? $fetch<Creada>(`${base}/api/extracciones`, { method: 'POST', body: datos })
      : local<Creada>((a) => nucleo.crearExtraccion(a, datos as unknown as Record<string, unknown>))

  /**
   * La URL de una foto. En el servidor, /api/ + la clave; en local, un
   * object URL del Blob, en un estado reactivo para que la imagen aparezca
   * cuando el Blob ya está leído.
   */
  const urlsLocales = useState<Record<string, string>>('fotos-locales', () => ({}))
  const urlFoto = (foto: string | null) => {
    if (!foto) return null
    return servidor() ? `${base}/api/${foto}` : urlsLocales.value[foto] ?? null
  }

  async function refrescarFotosLocales() {
    const guardadas = await (await almacenLocal()).fotos.listar()
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
    const almacen = await almacenLocal()
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
    const almacen = await almacenLocal()
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
    base, cafes, recetas, extracciones, guion, crear, crearCafe, editarCafe,
    editarExtraccion, retirarExtraccion, restaurarExtraccion, retiradas,
    crearReceta, guardarReceta, borrarReceta, subirFotoCafe, quitarFotoCafe, urlFoto,
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
