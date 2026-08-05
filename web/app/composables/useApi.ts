/**
 * Acceso a la API. La app no sabe de SQL ni de commits: pide y manda
 * extracciones, y punto. Ese contrato es lo que permite cambiar la
 * autenticación del servidor sin tocar nada de aquí.
 */

export interface Cafe {
  id: string
  nombre: string
  tostador: string | null
  origen: string | null
  proceso: string | null
  fecha_tueste: string | null
  peso_g: number | null
  estado: 'abierto' | 'terminado' | 'pendiente'
  conservacion: string | null
  foto: string | null
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

export function useApi() {
  const base = useRuntimeConfig().public.apiBase

  const cafes = () => $fetch<Cafe[]>(`${base}/api/cafes`)
  const recetas = () => $fetch<Receta[]>(`${base}/api/recetas`)
  const extracciones = (cafeId?: string) =>
    $fetch<Extraccion[]>(`${base}/api/extracciones`, {
      query: cafeId ? { cafe: cafeId } : undefined,
    })

  return { base, cafes, recetas, extracciones }
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
