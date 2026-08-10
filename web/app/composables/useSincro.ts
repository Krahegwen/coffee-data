/**
 * La sincronización del modo con sesión: la cola hacia arriba, el reemplazo
 * hacia abajo.
 *
 * El refresco hace las dos cosas y siempre en este orden: **primero se vacía
 * la cola, después se trae todo y se reemplaza**. Al revés, lo del servidor
 * pisaría con información vieja lo que este dispositivo aún no ha subido. Y
 * si la cola no queda vacía —sin red, o una entrada que no pasa— no se
 * reemplaza nada: lo local es lo único que tiene esas filas.
 *
 * Traer todo y reemplazar, sin sincronización incremental: la bitácora
 * entera son unos KB, y los borrados salen gratis — lo que no viene en la
 * respuesta desaparece del cajón.
 */
import { uuidv7 } from '@coffee/nucleo/ids'

import { drenar } from '~/almacen/cola'
import { cajonLocal } from '~/almacen/local'

export interface EntradaCola {
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  camino: string
  cuerpo?: unknown
  blob?: Blob
  tipo?: string
}

export function useSincro() {
  const base = useRuntimeConfig().public.apiBase
  const { activa } = useSesion()
  const { locale } = useI18n()

  /** Cuántas escrituras esperan red. Visible en el pie: la cola nunca calla. */
  const pendientes = useState<number>('cola-pendientes', () => 0)
  /** El error de una entrada que el servidor rechaza. Null si todo fluye. */
  const atasco = useState<string | null>('cola-atasco', () => null)
  const sincronizando = useState<boolean>('sincronizando', () => false)
  const urlsFotos = useState<Record<string, string>>('fotos-locales', () => ({}))

  async function recontar() {
    const cola = cajonLocal().cola
    pendientes.value = await cola.contar()
    atasco.value = (await cola.listar()).find((e) => e.error)?.error ?? null
  }

  /** Apunta una escritura para la red y dispara el drenado sin esperar. */
  async function encolar(entrada: EntradaCola) {
    await cajonLocal().cola.poner({ id: uuidv7(), error: null, ...entrada })
    pendientes.value += 1
    void drenarCola()
  }

  /**
   * Repite una entrada contra el Worker, lanzando como lanza $fetch.
   *
   * El idioma va en `Accept-Language`: si el servidor rechaza una escritura,
   * su motivo acaba en el pie —«hay una escritura que el servidor no acepta»—
   * y ahí no puede salir en otro idioma que el resto de la app.
   */
  const enviar = (entrada: EntradaCola & { id: string }) =>
    $fetch(`${base}${entrada.camino}`, {
      method: entrada.metodo,
      ...(entrada.blob
        ? {
            body: entrada.blob,
            headers: { 'content-type': entrada.tipo ?? '', 'accept-language': locale.value },
          }
        : {
            headers: { 'accept-language': locale.value },
            ...(entrada.cuerpo !== undefined && entrada.cuerpo !== null
              ? { body: entrada.cuerpo }
              : {}),
          }),
    })

  /*
   * Un solo drenado a la vez, compartido: lo que se encole mientras sube se
   * recoge en la pasada siguiente del bucle, no en un drenado paralelo que
   * desordenaría la cola.
   */
  let drenando: Promise<void> | null = null
  function drenarCola() {
    drenando ??= (async () => {
      try {
        let pasada
        do {
          pasada = await drenar(cajonLocal(), enviar)
        } while (pasada.subidas > 0 && (await cajonLocal().cola.contar()) > 0)
      } finally {
        drenando = null
        await recontar()
      }
    })()
    return drenando
  }

  /** Baja del servidor lo que el cajón no tiene y tira lo que ya no existe. */
  async function sincronizarFotos(cafes: Array<{ foto: string | null }>) {
    const fotos = cajonLocal().fotos
    const referidas = new Set(cafes.map((c) => c.foto).filter(Boolean) as string[])
    const locales: Array<{ clave: string; blob: Blob }> = await fotos.listar()
    const tengo = new Set(locales.map((f) => f.clave))

    for (const clave of referidas) {
      if (tengo.has(clave)) continue
      const blob = await $fetch<Blob>(`${base}/api/${clave}`, { responseType: 'blob' })
      await fotos.poner(clave, blob, blob.type)
    }
    for (const foto of locales) {
      if (referidas.has(foto.clave)) continue
      await fotos.quitar(foto.clave)
      const url = urlsFotos.value[foto.clave]
      if (url) URL.revokeObjectURL(url)
    }
    const mapa: Record<string, string> = {}
    for (const foto of await fotos.listar()) {
      mapa[foto.clave] = urlsFotos.value[foto.clave] ?? URL.createObjectURL(foto.blob)
    }
    urlsFotos.value = mapa
  }

  /** La bajada: todo, de una vez, y el cajón local pasa a ser esa copia. */
  async function traerTodo() {
    const [cafes, recetas, vivas, retiradas] = await Promise.all([
      $fetch<any[]>(`${base}/api/cafes`),
      $fetch<any[]>(`${base}/api/recetas`),
      $fetch<any[]>(`${base}/api/extracciones`),
      $fetch<any[]>(`${base}/api/extracciones`, { query: { retiradas: 1 } }),
    ])
    await cajonLocal().reemplazar({ cafes, recetas, extracciones: [...vivas, ...retiradas] })
    await sincronizarFotos(cafes)
  }

  let ultimoRefresco = 0

  /**
   * El ciclo entero: drenar y, con la cola ya vacía, traer y reemplazar.
   * Nunca lanza — sin red se queda lo local, que es el punto—. Devuelve si
   * de verdad refrescó, para que quien llama sepa si toca repintar.
   */
  async function refrescar({ minimo = 0 } = {}): Promise<boolean> {
    if (!activa.value || sincronizando.value) return false
    if (minimo && Date.now() - ultimoRefresco < minimo) return false
    sincronizando.value = true
    try {
      await drenarCola()
      if ((await cajonLocal().cola.contar()) === 0) {
        await traerTodo()
        ultimoRefresco = Date.now()
        return true
      }
    } catch {
      // Sin red: la cola espera y las pantallas siguen leyendo del cajón.
    } finally {
      sincronizando.value = false
      await recontar()
    }
    return false
  }

  return { pendientes, atasco, sincronizando, encolar, refrescar, recontar }
}
