-- Un defecto más: `aguado`, la taza sin cuerpo.
--
-- El cuerpo no es un defecto en sí —una taza puede tener poco cuerpo y estar
-- buena—, pero cuando molesta, molesta como los demás y tiene su palanca:
-- moler más fino y, si no, subir la dosis. Va a la lista cerrada porque el
-- motor de sugerencias está montado sobre ella: defecto manda palanca.
--
-- SQLite no sabe cambiar un CHECK, así que toca rehacer la tabla entera. Es la
-- danza de siempre y por eso va sola en su migración:
--
--   1. fuera las vistas y el trigger, que dependen de la tabla
--   2. tabla nueva con el CHECK nuevo, idéntica en todo lo demás
--   3. copiar las filas con los id explícitos, que son la clave a la que
--      apuntan las correcciones y el respaldo
--   4. tirar la vieja (sus índices se van con ella) y rehacer lo demás
--
-- Los índices no se pueden crear antes de tirar la vieja: renombrar una tabla
-- se lleva sus índices con el nombre puesto, y chocarían.

DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;
DROP TRIGGER extracciones_actualizado;

ALTER TABLE extracciones RENAME TO extracciones_vieja;

CREATE TABLE extracciones (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha             TEXT NOT NULL,
    cafe_id           TEXT NOT NULL REFERENCES cafes(id) ON UPDATE CASCADE,
    dosis_g           REAL NOT NULL,
    agua_g            REAL NOT NULL,
    temp_c            REAL,
    molinillo         TEXT,
    clics             REAL,
    metodo            TEXT,
    reparto           TEXT,
    tiempo_total      TEXT,
    variable_cambiada TEXT,
    defecto           TEXT,
    notas_cata        TEXT,
    nota              INTEGER,
    siguiente_ajuste  TEXT,
    receta_id         TEXT REFERENCES recetas(id) ON UPDATE CASCADE,
    drawdown_s        INTEGER,
    dripper           TEXT,
    creado_en         TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en    TEXT,
    borrada_en        TEXT,

    CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha) IS NOT NULL AND date(julianday(fecha)) = fecha),
    CHECK (dosis_g > 0),
    CHECK (agua_g > 0),
    CHECK (temp_c IS NULL OR temp_c BETWEEN 0 AND 100),
    CHECK (clics IS NULL OR clics >= 0),
    CHECK (nota IS NULL OR nota BETWEEN 1 AND 10),
    CHECK (drawdown_s IS NULL OR drawdown_s >= 0),
    CHECK (defecto IS NULL OR defecto IN ('equilibrado', 'amargor', 'astringente', 'plano', 'agrio', 'salado', 'carton', 'aguado')),
    CHECK (dripper IS NULL OR dripper IN ('v60-02-plastico', 'v60-02-ceramica'))
) STRICT;

INSERT INTO extracciones (
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, variable_cambiada, defecto, notas_cata, nota,
    siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en
)
SELECT
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, variable_cambiada, defecto, notas_cata, nota,
    siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en
FROM extracciones_vieja;

DROP TABLE extracciones_vieja;

CREATE INDEX idx_extracciones_cafe ON extracciones(cafe_id, id);
CREATE INDEX idx_extracciones_fecha ON extracciones(fecha);

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

CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
