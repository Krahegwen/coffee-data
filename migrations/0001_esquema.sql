-- Esquema inicial de la bitácora en D1.
--
-- Tablas STRICT: SQLite comprueba el tipo de cada valor en vez de tragarse
-- cualquier cosa. Es la primera garantía que un CSV no podía dar.
--
-- Las fechas van en AAAA-MM-DD y se comprueban tres veces. Hacen falta las
-- tres, comprobado a base de intentarlo:
--
--   GLOB                        fija el formato
--   julianday(x) IS NOT NULL    descarta lo imparseable (2026-13-01, 'ayer')
--   date(julianday(x)) = x      descarta días que no existen
--
-- La tercera no es paranoia: date('2026-02-30') devuelve '2026-02-30' tal
-- cual, y date('2026-02-29') también, aunque 2026 no sea bisiesto. Solo el
-- round-trip por día juliano hace la aritmética y delata la fecha falsa.

CREATE TABLE cafes (
    id              TEXT PRIMARY KEY,
    nombre          TEXT NOT NULL,
    tostador        TEXT,
    origen          TEXT,
    region          TEXT,
    variedad        TEXT,
    proceso         TEXT,
    altitud_m       INTEGER,
    sca             REAL,
    fecha_tueste    TEXT,
    consumir_antes  TEXT,
    peso_g          REAL,
    precio_eur      REAL,
    notas_tostador  TEXT,
    estado          TEXT NOT NULL DEFAULT 'abierto',
    fecha_compra    TEXT,
    fecha_recepcion TEXT,
    foto            TEXT,   -- clave del objeto en R2, p. ej. fotos/abbie.jpg
    url             TEXT,
    conservacion    TEXT,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),

    -- El id viaja en cada extracción y en la URL de la app: sin espacios,
    -- sin mayúsculas y sin acentos.
    CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*'),
    CHECK (nombre <> ''),
    CHECK (estado IN ('abierto', 'terminado', 'pendiente')),
    CHECK (altitud_m IS NULL OR altitud_m > 0),
    CHECK (sca IS NULL OR sca BETWEEN 0 AND 100),
    CHECK (peso_g IS NULL OR peso_g > 0),
    CHECK (precio_eur IS NULL OR precio_eur >= 0),
    CHECK (fecha_tueste IS NULL OR (fecha_tueste GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_tueste) IS NOT NULL AND date(julianday(fecha_tueste)) = fecha_tueste)),
    CHECK (consumir_antes IS NULL OR (consumir_antes GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(consumir_antes) IS NOT NULL AND date(julianday(consumir_antes)) = consumir_antes)),
    CHECK (fecha_compra IS NULL OR (fecha_compra GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_compra) IS NOT NULL AND date(julianday(fecha_compra)) = fecha_compra)),
    CHECK (fecha_recepcion IS NULL OR (fecha_recepcion GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_recepcion) IS NOT NULL AND date(julianday(fecha_recepcion)) = fecha_recepcion))
) STRICT;


CREATE TABLE recetas (
    id             TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL,
    ratio          REAL,
    notas          TEXT,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (id GLOB '[a-z0-9]*' AND id NOT GLOB '*[^a-z0-9_-]*'),
    CHECK (nombre <> ''),
    CHECK (ratio IS NULL OR ratio > 0)
) STRICT;


-- Una receta es una lista de pasos, no solo de vertidos: agitar, meter la
-- cuchara o esperar el goteo son pasos sin agua.
CREATE TABLE pasos (
    receta_id  TEXT NOT NULL REFERENCES recetas(id) ON DELETE CASCADE ON UPDATE CASCADE,
    orden      INTEGER NOT NULL,
    t_inicio_s INTEGER,
    accion     TEXT NOT NULL,
    agua_g     REAL NOT NULL DEFAULT 0,
    notas      TEXT,

    PRIMARY KEY (receta_id, orden),
    CHECK (orden > 0),
    CHECK (t_inicio_s IS NULL OR t_inicio_s >= 0),
    CHECK (accion IN ('verter', 'agitar', 'remover', 'esperar', 'retirar')),
    -- Solo verter lleva gramos. La regla vive aquí y no en la app.
    CHECK ((accion = 'verter' AND agua_g > 0) OR (accion <> 'verter' AND agua_g = 0))
) STRICT;


-- Log de extracciones. El id lo pone la base de datos.
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

    CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha) IS NOT NULL AND date(julianday(fecha)) = fecha),
    CHECK (dosis_g > 0),
    CHECK (agua_g > 0),
    CHECK (temp_c IS NULL OR temp_c BETWEEN 0 AND 100),
    CHECK (clics IS NULL OR clics >= 0),
    CHECK (nota IS NULL OR nota BETWEEN 1 AND 10),
    CHECK (drawdown_s IS NULL OR drawdown_s >= 0),
    CHECK (defecto IS NULL OR defecto IN ('equilibrado', 'amargor', 'astringente', 'plano', 'agrio', 'salado', 'carton')),
    CHECK (dripper IS NULL OR dripper IN ('v60-02-plastico', 'v60-02-ceramica'))
) STRICT;

CREATE INDEX idx_extracciones_cafe ON extracciones(cafe_id, id);
CREATE INDEX idx_extracciones_fecha ON extracciones(fecha);


-- ratio y dias_tueste ya no se guardan: son derivados y un valor guardado se
-- queda obsoleto en cuanto corriges la fecha de tueste de la bolsa.
--
-- Ojo, cambio deliberado: dias_tueste se cuenta desde la fecha de la
-- extracción, no desde hoy. Si registras una extracción con fecha atrasada,
-- los días son los que tenía el café ese día, que es lo que quieres comparar.
CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste
FROM extracciones e
JOIN cafes c ON c.id = e.cafe_id;


-- Sin historial de git, estas marcas son el único registro de cuándo se
-- tocó una ficha.
CREATE TRIGGER cafes_actualizado AFTER UPDATE ON cafes
BEGIN
    UPDATE cafes SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER recetas_actualizado AFTER UPDATE ON recetas
BEGIN
    UPDATE recetas SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
