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

const RECETAS = [
  {
    nombre: "4:6 Kasuya base",
    ratio: 15,
    notas: "El método 4:6 de Tetsu Kasuya tal cual",
    pasos: [
      { accion: "verter", agua_g: 60, t_inicio_s: 0, notas: "Fase 1" },
      { accion: "verter", agua_g: 60, t_inicio_s: 45, notas: "Fase 1" },
      { accion: "verter", agua_g: 90, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "verter", agua_g: 90, t_inicio_s: 135, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 180, notas: "Hasta que deje de gotear" },
      { accion: "retirar", notas: "Retirar el dripper" },
    ],
  },
  {
    nombre: "4:6 más claridad",
    ratio: 15,
    notas: "Fase 2 en tres vertidos: más claridad",
    pasos: [
      { accion: "verter", agua_g: 60, t_inicio_s: 0, notas: "Fase 1" },
      { accion: "verter", agua_g: 60, t_inicio_s: 45, notas: "Fase 1" },
      { accion: "verter", agua_g: 60, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "verter", agua_g: 60, t_inicio_s: 135, notas: "Fase 2" },
      { accion: "verter", agua_g: 60, t_inicio_s: 180, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 225, notas: "Hasta que deje de gotear" },
      { accion: "retirar", notas: "Retirar el dripper" },
    ],
  },
  {
    nombre: "4:6 más dulzor",
    ratio: 15,
    notas: "Fase 1 desigual: más dulzor y menos acidez",
    pasos: [
      { accion: "verter", agua_g: 50, t_inicio_s: 0, notas: "Fase 1 desigual" },
      { accion: "verter", agua_g: 70, t_inicio_s: 45, notas: "Fase 1 desigual" },
      { accion: "verter", agua_g: 90, t_inicio_s: 90, notas: "Fase 2" },
      { accion: "verter", agua_g: 90, t_inicio_s: 135, notas: "Fase 2" },
      { accion: "esperar", t_inicio_s: 180, notas: "Hasta que deje de gotear" },
      { accion: "retirar", notas: "Retirar el dripper" },
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
