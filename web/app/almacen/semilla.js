/**
 * Las recetas con las que arranca el modo local.
 *
 * La casa no puede estar del todo vacía: sin al menos una receta no hay
 * cronómetro ni alta —toda extracción necesita un guion—, y quien acaba de
 * abrir la app no tiene por qué saberse el 4:6 de memoria. Son las tres del
 * repo de siempre; borrarlas o editarlas es suyo desde el primer día.
 *
 * Entran por el manejador de verdad, no por el almacén: así llevan uuid,
 * slug y sellos como cualquier receta creada a mano.
 */
import { guardarReceta } from "@coffee/nucleo/api";

/*
 * El ritmo de los pasos calca la receta rodada de verdad: cada vertido en
 * espiral dura lo que pide su agua a ~4 g/s —60 g ≈ 15 s, 70 ≈ 20, 90 ≈ 25—
 * y detrás va una espera explícita hasta el siguiente. Así el cronómetro
 * marca cuándo dejar de verter, no solo cuándo empezar.
 */
const RECETAS = [
  {
    nombre: "4:6 Kasuya base",
    ratio: 15,
    notas: "El método 4:6 de Tetsu Kasuya tal cual",
    pasos: [
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 0, notas: "Fase 1 - Bloom" },
      { accion: "esperar", t_inicio_s: 15 },
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 45, notas: "Fase 1" },
      { accion: "esperar", t_inicio_s: 60 },
      { accion: "verter", estilo: "espiral", agua_g: 90, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 115 },
      { accion: "verter", estilo: "espiral", agua_g: 90, t_inicio_s: 145, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 170, notas: "Hasta que deje de gotear" },
      { accion: "retirar", t_inicio_s: 200, notas: "Retirar el dripper" },
    ],
  },
  {
    nombre: "4:6 más claridad",
    ratio: 15,
    notas: "Fase 2 en tres vertidos: más claridad",
    pasos: [
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 0, notas: "Fase 1 - Bloom" },
      { accion: "esperar", t_inicio_s: 15 },
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 45, notas: "Fase 1" },
      { accion: "esperar", t_inicio_s: 60 },
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 105 },
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 135, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 150 },
      { accion: "verter", estilo: "espiral", agua_g: 60, t_inicio_s: 180, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 195, notas: "Hasta que deje de gotear" },
      { accion: "retirar", t_inicio_s: 225, notas: "Retirar el dripper" },
    ],
  },
  {
    nombre: "4:6 más dulzor",
    ratio: 15,
    notas: "Fase 1 desigual: más dulzor y menos acidez",
    pasos: [
      { accion: "verter", estilo: "espiral", agua_g: 50, t_inicio_s: 0, notas: "Fase 1 - Bloom" },
      { accion: "esperar", t_inicio_s: 15 },
      { accion: "verter", estilo: "espiral", agua_g: 70, t_inicio_s: 45, notas: "Fase 1" },
      { accion: "esperar", t_inicio_s: 65 },
      { accion: "verter", estilo: "espiral", agua_g: 90, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 115 },
      { accion: "verter", estilo: "espiral", agua_g: 90, t_inicio_s: 145, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 170, notas: "Hasta que deje de gotear" },
      { accion: "retirar", t_inicio_s: 200, notas: "Retirar el dripper" },
    ],
  },
];

/** Siembra una sola vez: si ya hay recetas —suyas o estas—, no toca nada. */
export async function sembrar(almacen) {
  const hay = await almacen.recetas.listar();
  if (hay.length) return;
  for (const receta of RECETAS) {
    await guardarReceta(almacen, { nuevo: true }, receta);
  }
}
