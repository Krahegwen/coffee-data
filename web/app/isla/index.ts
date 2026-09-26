/**
 * Qué adaptador de la isla le toca a esta página. Hoy solo hay uno; el nativo
 * del plan de la app se elegirá aquí cuando exista, mirando si la cáscara
 * dejó su puente en `window`.
 */
import type { Isla } from './puerto'
import { islaWeb } from './web'

export const isla: Isla = islaWeb
