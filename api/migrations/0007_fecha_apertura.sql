-- Cuándo se abrió la bolsa.
--
-- La frescura tiene dos relojes y hasta ahora solo se guardaba uno. Desde el
-- tueste manda mientras la bolsa está precintada; desde que la abres, el café
-- se oxida y se desgasifica a otro ritmo, y ahí ya no importa tanto cuándo se
-- tostó como cuánto lleva respirando. Dos bolsas del mismo tueste, una abierta
-- hace un mes y otra precintada, no son el mismo café.
--
-- `fecha_recepcion` se queda aunque no la lea nadie. Quitarla de verdad no es
-- un DROP COLUMN: SQLite se niega mientras un CHECK la mencione, y rehacer
-- `cafes` con todas las extracciones apuntándola por clave foránea es mucho
-- riesgo para un campo opcional. Deja de pedirse en el formulario y ahí queda,
-- con lo que ya tenía.
ALTER TABLE cafes ADD COLUMN fecha_apertura TEXT
    CHECK (fecha_apertura IS NULL OR (fecha_apertura GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_apertura) IS NOT NULL AND date(julianday(fecha_apertura)) = fecha_apertura));

-- Las vistas se expandieron con `e.*` al crearse y hay que rehacerlas para que
-- salga `dias_abierta`. Se cuenta desde la fecha de la extracción, igual que
-- los días de tueste: si registras una con fecha atrasada, los días son los
-- que la bolsa llevaba abierta ese día.
DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;

CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NULL;

CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id
WHERE e.borrada_en IS NOT NULL;
