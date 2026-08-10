-- La exploración es un árbol, no una línea: `desde_id`.
--
-- El motor empareja extracciones para leer los deltas, y hasta aquí lo hacía
-- por vecindad: cada una contra la inmediatamente anterior del mismo café. Eso
-- da por supuesto que se explora en línea recta, y no es verdad. Tras un
-- callejón sin salida se vuelve a una anterior y se mueve otra cosa: contra la
-- de ayer eso son dos cambios y el par se descarta; contra aquélla es uno solo
-- y limpio. La comparación buena existía y el motor no podía verla.
--
-- Así que cada extracción apunta de qué otra es variación. Nulo es «no
-- compara con nada»: la primera de una bolsa, y todas las sueltas — sin ficha
-- no hay serie, y dos tazas sueltas no son el mismo café.
--
-- **El padre nunca sale de la bolsa.** El tueste es lo que hace la taza, así
-- que comparar contra otra bolsa mentiría aunque fuera el mismo café. Ojo con
-- no confundirlo con de dónde salen los valores al abrir el formulario: eso es
-- otra cadena, puede venir de donde sea porque solo rellena campos, y vive en
-- la app.
--
-- Aquí basta ADD COLUMN: nulable, sin rehacer la tabla y sin la danza de
-- vistas de la 0009 y la 0010. Las vistas expanden su `e.*` al usarse, así que
-- la columna aparece en ellas sola.
--
-- El trigger se quita para el relleno y se vuelve a poner. Si no, marcar el
-- padre de filas viejas les tocaría `actualizado_en` a todas, y eso diría que
-- el usuario corrigió unas extracciones que no ha tocado.

DROP TRIGGER extracciones_actualizado;

ALTER TABLE extracciones ADD COLUMN desde_id TEXT REFERENCES extracciones(id) ON UPDATE CASCADE
    CHECK (desde_id IS NULL OR (desde_id GLOB '[0-9a-f]*' AND length(desde_id) = 36 AND desde_id <> id));

-- Las filas viejas heredan «la anterior del mismo café», que es exactamente lo
-- que el motor hacía por vecindad: cambio de esquema sin cambio de lecturas.
-- Las retiradas no valen de madre —el histórico que ve el motor va filtrado
-- por `borrada_en`, y un delta medido contra un error de registro no vale
-- nada—, así que se salta a la anterior que siga en pie.
UPDATE extracciones
SET desde_id = (
    SELECT p.id
    FROM extracciones p
    WHERE p.cafe_id = extracciones.cafe_id
      AND p.borrada_en IS NULL
      AND (p.creado_en < extracciones.creado_en
           OR (p.creado_en = extracciones.creado_en AND p.id < extracciones.id))
    ORDER BY p.creado_en DESC, p.id DESC
    LIMIT 1
)
WHERE cafe_id IS NOT NULL;

CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
