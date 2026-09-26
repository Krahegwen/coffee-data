/**
 * El puerto de la isla: el cronómetro fuera de la app —la pantalla de
 * bloqueo, la cortina de notificaciones, la cápsula del OnePlus o la Dynamic
 * Island de un iPhone—, escrito una vez y con un adaptador por sitio.
 *
 * La idea es la misma que ya tenía la barra del reproductor del sistema:
 * **anclar y dejar que extrapolen**, aplicada al plan entero. El plan se
 * manda una vez, con los tramos ya resueltos y los textos ya traducidos; a
 * partir de ahí solo viajan anclajes —«corriendo desde este instante», «en
 * pausa en este segundo»— y es el adaptador quien deriva el tramo vigente y
 * pinta lo que su sistema sepa pintar. JS no lleva el reloj de la isla.
 *
 * Hoy hay un adaptador, el de la web (`web.ts`: Media Session sobre un
 * silencio en bucle). El nativo del plan de la app —una notificación con
 * cronómetro, barra y botones— es el segundo, y lo que se le pasa es
 * exactamente esto: por eso va todo en datos serializables y lleva número de
 * versión, para que un APK viejo con una web nueva se declare incompatible en
 * vez de fallar en silencio.
 */
import type { Cue } from '~/composables/useSonido'

/** Versión del protocolo: sube cuando cambie la forma del plan o del anclaje. */
export const VERSION_ISLA = 1

/**
 * Un tramo del reloj con sus textos. `desde` y `hasta` salen de `tramosDe`
 * en el núcleo; el último va abierto (`hasta: null`), que ya no hay siguiente
 * contra el que contar. `corto` es para donde solo caben unos caracteres —el
 * chip de la barra de estado de Android 16, la isla compacta de iOS—.
 */
export type TramoIsla = {
  desde: number
  hasta: number | null
  titulo: string
  subtitulo: string
  corto: string
}

/** Los mandos que un sistema puede ofrecer. `gotear` no existe en la web. */
export type Mando = 'pausar' | 'reanudar' | 'siguiente' | 'anterior' | 'gotear' | 'parar'

export type PlanIsla = {
  v: typeof VERSION_ISLA
  idioma: string
  /** La tercera línea de la tarjeta: el nombre de la app, o el de la prueba. */
  album: string
  tramos: TramoIsla[]
  /** La agenda sonora de `cuesDe()`: el nativo la toca él; la web la ignora aquí. */
  cues: Cue[]
  /** Qué botones ofrecer, con su etiqueta traducida para donde haga falta. */
  mandos: Partial<Record<Mando, string>>
  sonido: boolean
  voz: boolean
}

/**
 * Dónde está el reloj. `epochMs` es el instante en que valía el segundo 0
 * —`Date.now()` menos lo transcurrido—: un dato absoluto que cualquier
 * proceso convierte en el acto a su propio reloj monótono.
 */
export type Anclaje =
  | { estado: 'corriendo'; epochMs: number }
  | { estado: 'pausado'; segundo: number }
  | { estado: 'cuenta_atras'; segundo: number; arrancaEnEpochMs: number }
  | { estado: 'cerrado' }

export interface Isla {
  /** Si este sistema tiene dónde enseñarlo. */
  disponible(): boolean
  /**
   * Pide la isla para `quien`, con su plan. **Desde un toque** la primera vez:
   * en la web el silencio no arranca sin gesto. Si otro la tenía, se le
   * despide. `alCeder` avisa si el sistema se la quita —otra app se queda el
   * audio, el usuario descarta la notificación— para que no se vuelva a pedir.
   */
  encender(quien: string, plan: PlanIsla, alCeder: () => void): Promise<void>
  /** Si la isla es de ése: nadie apaga ni escribe en la de otro. */
  esDe(quien: string): boolean
  /** Otro plan para la misma isla: cambió la agenda, el idioma, un ajuste. */
  planificar(plan: PlanIsla): void
  anclar(anclaje: Anclaje): void
  /** Quién atiende los botones. Sin oyente, se quitan. */
  atender(oyente: ((mando: Mando) => void) | null): void
  /** Isla fuera, botones fuera. */
  apagar(): void
}
