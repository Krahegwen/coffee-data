-- Extracciones sin bolsa: `cafe_id` deja de ser obligatorio.
--
-- Hay tazas que merecen apuntarse y no tienen ficha: el café de un amigo, una
-- muestra suelta, la cata en un tostador. Obligar a inventarles una bolsa era
-- peor que dejarlas sin bolsa: una ficha falsa envenena frescura y consumo, y
-- no apuntarlas pierde la taza. Sin bolsa no hay serie que comparar —el motor
-- trata cada una como suelta— pero la taza queda en la bitácora.
--
-- SQLite no sabe quitarle el NOT NULL a una columna, así que toca rehacer la
-- tabla. La danza de la 0005: fuera vistas y trigger, renombrar, tabla nueva,
-- copiar con los id puestos, tirar la vieja y rehacer índices, vistas y
-- trigger. Renombrar aquí es seguro: a `extracciones` no le apunta nadie, y
-- las trampas de la 0008 eran de las tablas referenciadas.
--
-- Las vistas pasan de JOIN a LEFT JOIN cafes: una extracción sin bolsa también
-- se tiene que ver, con el nombre y los días a NULL — que es justo lo que
-- derivar.js ya hace en el almacén local cuando el café no está.

DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;
DROP TRIGGER extracciones_actualizado;

ALTER TABLE extracciones RENAME TO extracciones_vieja;

CREATE TABLE extracciones (
    id                TEXT PRIMARY KEY,
    fecha             TEXT NOT NULL,
    cafe_id           TEXT REFERENCES cafes(id) ON UPDATE CASCADE,
    dosis_g           REAL NOT NULL,
    agua_g            REAL NOT NULL,
    temp_c            REAL,
    molinillo         TEXT,
    clics             REAL,
    metodo            TEXT,
    reparto           TEXT,
    tiempo_total      TEXT,
    extraido_g        REAL,
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

    CHECK (id GLOB '[0-9a-f]*' AND length(id) = 36),
    CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha) IS NOT NULL AND date(julianday(fecha)) = fecha),
    CHECK (dosis_g > 0),
    CHECK (agua_g > 0),
    CHECK (temp_c IS NULL OR temp_c BETWEEN 0 AND 100),
    CHECK (clics IS NULL OR clics >= 0),
    CHECK (nota IS NULL OR nota BETWEEN 1 AND 10),
    CHECK (drawdown_s IS NULL OR drawdown_s >= 0),
    CHECK (extraido_g IS NULL OR extraido_g > 0),
    CHECK (defecto IS NULL OR defecto IN ('equilibrado', 'amargor', 'astringente', 'plano', 'agrio', 'salado', 'carton', 'aguado')),
    CHECK (dripper IS NULL OR dripper IN ('v60-02-plastico', 'v60-02-ceramica'))
) STRICT;

INSERT INTO extracciones (
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, extraido_g, variable_cambiada, defecto, notas_cata,
    nota, siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en
)
SELECT
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, extraido_g, variable_cambiada, defecto, notas_cata,
    nota, siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en
FROM extracciones_vieja;

DROP TABLE extracciones_vieja;

CREATE INDEX idx_extracciones_cafe ON extracciones(cafe_id, creado_en, id);
CREATE INDEX idx_extracciones_fecha ON extracciones(fecha);

CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
WHERE e.borrada_en IS NULL;

CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
WHERE e.borrada_en IS NOT NULL;

CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
