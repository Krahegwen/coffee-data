/**
 * Acceso a la API. La app no sabe de SQL ni de commits: pide y manda
 * extracciones, y punto. Ese contrato es lo que permite cambiar la
 * autenticación del servidor sin tocar nada de aquí.
 */

export const ESTADOS = ['abierto', 'terminado', 'pendiente'] as const

export interface Cafe {
  id: string
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
  fecha_compra: string | null
  fecha_recepcion: string | null
  foto: string | null
  url: string | null
  conservacion: string | null
}

export interface Extraccion {
  id: number
  fecha: string
  cafe_id: string
  cafe_nombre: string
  dosis_g: number
  agua_g: number
  ratio: number
  dias_tueste: number | null
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
}

export interface Paso {
  receta_id: string
  orden: number
  t_inicio_s: number | null
  accion: 'verter' | 'agitar' | 'remover' | 'esperar' | 'retirar'
  agua_g: number
  notas: string | null
}

export interface Receta {
  id: string
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
  receta_id?: string
  dripper?: string
  notas_cata?: string
  siguiente_ajuste?: string
  fecha?: string
}

export function useApi() {
  const base = useRuntimeConfig().public.apiBase

  const cafes = () => $fetch<Cafe[]>(`${base}/api/cafes`)
  const recetas = () => $fetch<Receta[]>(`${base}/api/recetas`)
  const extracciones = (cafeId?: string) =>
    $fetch<Extraccion[]>(`${base}/api/extracciones`, {
      query: cafeId ? { cafe: cafeId } : undefined,
    })

  /** Corrige una extracción. Solo se manda lo que cambia. */
  const editarExtraccion = (id: number, cambios: Record<string, unknown>) =>
    $fetch<{ extraccion: Extraccion; cambiado: string[] }>(`${base}/api/extracciones/${id}`, {
      method: 'PATCH',
      body: cambios,
    })

  /** Retira una extracción. Borrado lógico: la fila se queda, marcada. */
  const retirarExtraccion = (id: number) =>
    $fetch<{ retirada: boolean }>(`${base}/api/extracciones/${id}`, { method: 'DELETE' })

  const restaurarExtraccion = (id: number) =>
    $fetch<{ extraccion: Extraccion }>(`${base}/api/extracciones/${id}/restaurar`, {
      method: 'POST',
    })

  /** La papelera. */
  const retiradas = () =>
    $fetch<Extraccion[]>(`${base}/api/extracciones`, { query: { retiradas: 1 } })

  /** Da de alta una bolsa. */
  const crearCafe = (datos: Record<string, unknown>) =>
    $fetch<{ cafe: Cafe }>(`${base}/api/cafes`, { method: 'POST', body: datos })

  /** Corrige una ficha. Solo se manda lo que cambia. */
  const editarCafe = (id: string, cambios: Record<string, unknown>) =>
    $fetch<{ cafe: Cafe; cambiado: string[] }>(`${base}/api/cafes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: cambios,
    })

  /** Los pasos de una receta, ya escalados al agua y con el acumulado. */
  const guion = (recetaId: string, aguaG: number) =>
    $fetch<PasoGuion[]>(`${base}/api/guion`, { query: { receta: recetaId, agua: aguaG } })

  /**
   * Registra una extracción. Entera o ninguna: si el servidor rechaza algo,
   * no se escribe nada y devuelve la lista de errores.
   *
   * No lleva token: la sesión va en una cookie HttpOnly que manda el navegador.
   */
  async function crear(datos: NuevaExtraccion): Promise<Creada> {
    return await $fetch<Creada>(`${base}/api/extracciones`, {
      method: 'POST',
      body: datos,
    })
  }

  return {
    base, cafes, recetas, extracciones, guion, crear, crearCafe, editarCafe,
    editarExtraccion, retirarExtraccion, restaurarExtraccion, retiradas,
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
