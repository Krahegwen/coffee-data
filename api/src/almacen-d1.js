/**
 * El puerto de almacén sobre D1. El adaptador es tonto a propósito: filas
 * dentro, filas fuera, y las únicas decisiones —transacciones y SQL— son las
 * que un almacén no puede delegar. Todo lo demás vive en @coffee/nucleo/api.
 *
 * Los nombres de columna de los INSERT/UPDATE dinámicos vienen del núcleo,
 * que trabaja con listas blancas; los valores van siempre atados con bind.
 *
 * Se lee de las tablas crudas, no de las vistas: los derivados los calcula el
 * núcleo con derivar.js, que es la única implementación que comparten los dos
 * caminos. Las vistas quedan para mirar la base a mano.
 */

function inserta(db, tabla, fila) {
  const columnas = Object.keys(fila);
  const marcadores = columnas.map(() => "?").join(", ");
  return db
    .prepare(`INSERT INTO ${tabla} (${columnas.join(", ")}) VALUES (${marcadores})`)
    .bind(...columnas.map((c) => fila[c]));
}

function actualiza(db, tabla, id, cambios) {
  const columnas = Object.keys(cambios);
  const asignaciones = columnas.map((c) => `${c} = ?`).join(", ");
  return db
    .prepare(`UPDATE ${tabla} SET ${asignaciones} WHERE id = ?`)
    .bind(...columnas.map((c) => cambios[c]), id);
}

export function almacenD1(db) {
  const tablaSimple = (tabla) => ({
    async listar() {
      return (await db.prepare(`SELECT * FROM ${tabla}`).all()).results;
    },
    async poner(fila) {
      await inserta(db, tabla, fila).run();
    },
    async actualizar(id, cambios) {
      await actualiza(db, tabla, id, cambios).run();
    },
  });

  return {
    cafes: tablaSimple("cafes"),
    extracciones: tablaSimple("extracciones"),
    recetas: {
      async listar() {
        const [recetas, pasos] = await Promise.all([
          db.prepare("SELECT * FROM recetas").all(),
          db.prepare("SELECT * FROM pasos ORDER BY orden").all(),
        ]);
        return recetas.results.map((r) => ({
          ...r,
          pasos: pasos.results.filter((p) => p.receta_id === r.id),
        }));
      },
      // Atómico: si un paso falla, no queda una receta a medias.
      async escribir(receta, pasos, { nueva }) {
        const cabecera = nueva
          ? inserta(db, "recetas", receta)
          : actualiza(db, "recetas", receta.id, {
              nombre: receta.nombre,
              ratio: receta.ratio,
              notas: receta.notas,
              actualizado_en: receta.actualizado_en,
            });
        await db.batch([
          cabecera,
          db.prepare("DELETE FROM pasos WHERE receta_id = ?").bind(receta.id),
          ...pasos.map((p) => inserta(db, "pasos", p)),
        ]);
      },
      async borrar(id) {
        await db.batch([
          db.prepare("DELETE FROM pasos WHERE receta_id = ?").bind(id),
          db.prepare("DELETE FROM recetas WHERE id = ?").bind(id),
        ]);
      },
    },
  };
}
