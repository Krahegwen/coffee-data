/**
 * Lo que el cajón guardaba antes del catálogo de accesorios, pasado a él.
 *
 * Es la migración 0014 para quien no tiene servidor: en el modo local las
 * extracciones viven en este navegador con el dripper y el molinillo como
 * texto —`v60-02-plastico`, `Comandante C40`—, y nadie más va a convertirlas.
 * Crea los accesorios que falten, por el manejador de verdad, y apunta cada
 * taza a su id.
 *
 * No va en el `onupgradeneeded` de IndexedDB aunque sea donde nace la tabla:
 * ahí no se puede esperar a nada que no sea la propia transacción, y crear un
 * accesorio es pasar por el núcleo. Así que la versión 4 solo abre el hueco y
 * esto lo rellena al arrancar, y como mira antes de tocar, la segunda vez no
 * hace nada.
 *
 * **Solo sin sesión.** Con ella, lo que hay aquí es una copia del servidor, que
 * ya se convirtió allí, y el primer refresco la reemplaza. Convertir aquí
 * inventaría accesorios con ids que el servidor no conoce.
 */
import {
  accesoriosDelLegado, resolverAccesorio, TIPOS_ACCESORIO,
} from "@coffee/nucleo/accesorios";
import { crearAccesorio } from "@coffee/nucleo/api";

/** Cuántas extracciones se han apuntado a su accesorio. */
export async function pasarAlCatalogo(almacen) {
  const extracciones = await almacen.extracciones.listar();
  let accesorios = await almacen.accesorios.listar();
  const esId = (valor) => accesorios.some((a) => a.id === valor);
  const viejas = extracciones.filter(
    (e) => TIPOS_ACCESORIO.some((tipo) => e[tipo] && !esId(e[tipo])),
  );
  if (!viejas.length) return 0;

  for (const { cuerpo, slug } of accesoriosDelLegado(viejas, accesorios)) {
    const { estado, datos } = await crearAccesorio(almacen, cuerpo);
    if (estado >= 400) continue;
    // Los drippers conservan su clave de siempre: es lo que mandan los
    // respaldos de antes, y así resuelven igual aquí que en el servidor.
    if (slug && datos.accesorio.slug !== slug && !accesorios.some((a) => a.slug === slug)) {
      await almacen.accesorios.actualizar(datos.accesorio.id, { slug });
    }
  }
  accesorios = await almacen.accesorios.listar();

  // Solo las dos columnas, y a pelo contra el almacén: pasar por el manejador
  // sellaría `actualizado_en`, y eso diría que se corrigió una taza que nadie
  // ha tocado.
  let apuntadas = 0;
  for (const extraccion of viejas) {
    const cambios = {};
    for (const tipo of TIPOS_ACCESORIO) {
      const valor = extraccion[tipo];
      if (!valor || esId(valor)) continue;
      const accesorio = resolverAccesorio(accesorios, valor, tipo);
      if (accesorio) cambios[tipo] = accesorio.id;
    }
    if (Object.keys(cambios).length) {
      await almacen.extracciones.actualizar(extraccion.id, cambios);
      apuntadas += 1;
    }
  }
  return apuntadas;
}
