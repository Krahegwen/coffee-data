-- Lo que acabó en la taza.
--
-- El agua que echas no es el café que sacas: el lecho y el filtro se quedan
-- una parte. Con la dosis, eso da la retención en gramos de agua por gramo de
-- café, que en V60 ronda 2. Un número muy fuera de ahí no dice que la taza
-- esté mala: dice que algo se midió o se vertió mal, y eso invalida la
-- comparación con las demás.
--
-- En gramos y no en mililitros porque lo pesa la misma báscula que todo lo
-- demás, y en agua la diferencia no se nota.
ALTER TABLE extracciones ADD COLUMN extraido_g REAL
    CHECK (extraido_g IS NULL OR extraido_g > 0);

-- Las vistas se expandieron con `e.*` al crearse: sin rehacerlas, la columna
-- nueva no sale por la API.
DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;

CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NULL;

CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NOT NULL;
