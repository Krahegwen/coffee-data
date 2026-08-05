-- Corregir y retirar extracciones.
--
-- El borrado es lógico: `borrada_en` con fecha en vez de DELETE. Una fila
-- retirada por error se recupera, y el motor de sugerencias deja de verla sin
-- que el dato desaparezca.
--
-- Ojo con lo que esto permite: si retiras las extracciones que salieron mal,
-- las medias suben solas y los deltas emparejados dejan de significar nada.
-- Retirar es para errores de registro, no para tazas decepcionantes.

ALTER TABLE extracciones ADD COLUMN actualizado_en TEXT;
ALTER TABLE extracciones ADD COLUMN borrada_en TEXT;

-- La vista se recrea porque `e.*` se expandió al crearla y no conoce las
-- columnas nuevas. Y ahora filtra: lo retirado no sale por la puerta normal.
DROP VIEW v_extracciones;

CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NULL;

-- Para poder mirar y restaurar lo retirado.
CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NOT NULL;

-- Sin historial de git, esta marca es el único registro de que una fila se tocó.
CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
