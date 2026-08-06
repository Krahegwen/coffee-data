-- Identidad nueva: UUID como clave, el slug queda de etiqueta.
--
-- Camino del modo local y de escribir sin cobertura, las ids las pondrá el
-- cliente. Un texto derivado de un nombre no puede ser la clave —dos
-- dispositivos inventarían el mismo `gary_2`—, así que `cafes.id` y
-- `recetas.id` pasan a UUID y el slug baja a una columna única: sigue siendo
-- lo que se lee en la URL, deja de ser lo que atan las claves foráneas.
-- `extracciones.id` deja el AUTOINCREMENT por lo mismo. El orden pasa a
-- mandarlo `creado_en`, que significa algo; la id v7 solo no desordena.
--
-- Se hace hoy y no mañana porque hay dos bolsas, una receta y dos
-- extracciones: esta migración no volverá a ser tan barata.
--
-- La maniobra evita las dos trampas que tumbaron el intento anterior de
-- rehacer `cafes` (está contado en el README): renombrar una tabla reescribe
-- las referencias que le apuntan, y tirar una tabla referenciada apunta
-- violaciones aplazadas que no se cancelan. Así que ni se renombra ni se tira
-- nada referenciado: tablas nuevas al lado, copiar, tirar las viejas
-- empezando por las hijas —cuando le toca a un padre ya no lo apunta nadie— y
-- renombrar las nuevas al final, que ahí la reescritura de referencias
-- trabaja a favor.
--
-- De paso se quedan fuera `fecha_compra` y `fecha_recepcion`, que no las leía
-- nadie: la reconstrucción que no se pudo hacer por las bravas sale gratis
-- dentro de esta.
--
-- Las ids de las filas copiadas se fabrican aquí, en SQL, con la forma de una
-- v7: los milisegundos de `creado_en` delante (más el rowid, para conservar
-- el orden entre filas del mismo segundo) y el resto al azar. No salen del
-- mismo código que las del cliente, pero ordenan igual y validan igual.

DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;
DROP TRIGGER cafes_actualizado;
DROP TRIGGER recetas_actualizado;
DROP TRIGGER extracciones_actualizado;

CREATE TABLE cafes2 (
    id              TEXT PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
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
    fecha_apertura  TEXT,
    peso_g          REAL,
    precio_eur      REAL,
    notas_tostador  TEXT,
    estado          TEXT NOT NULL DEFAULT 'abierto',
    foto            TEXT,   -- clave del objeto en R2, p. ej. fotos/gary-....webp
    url             TEXT,
    conservacion    TEXT,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (id GLOB '[0-9a-f]*' AND length(id) = 36),
    CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9_-]*'),
    CHECK (nombre <> ''),
    CHECK (estado IN ('abierto', 'terminado', 'pendiente')),
    CHECK (altitud_m IS NULL OR altitud_m > 0),
    CHECK (sca IS NULL OR sca BETWEEN 0 AND 100),
    CHECK (peso_g IS NULL OR peso_g > 0),
    CHECK (precio_eur IS NULL OR precio_eur >= 0),
    CHECK (fecha_tueste IS NULL OR (fecha_tueste GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_tueste) IS NOT NULL AND date(julianday(fecha_tueste)) = fecha_tueste)),
    CHECK (consumir_antes IS NULL OR (consumir_antes GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(consumir_antes) IS NOT NULL AND date(julianday(consumir_antes)) = consumir_antes)),
    CHECK (fecha_apertura IS NULL OR (fecha_apertura GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha_apertura) IS NOT NULL AND date(julianday(fecha_apertura)) = fecha_apertura))
) STRICT;

CREATE TABLE recetas2 (
    id             TEXT PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    nombre         TEXT NOT NULL,
    ratio          REAL,
    notas          TEXT,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (id GLOB '[0-9a-f]*' AND length(id) = 36),
    CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9_-]*'),
    CHECK (nombre <> ''),
    CHECK (ratio IS NULL OR ratio > 0)
) STRICT;

CREATE TABLE pasos2 (
    receta_id  TEXT NOT NULL REFERENCES recetas2(id) ON DELETE CASCADE ON UPDATE CASCADE,
    orden      INTEGER NOT NULL,
    t_inicio_s INTEGER,
    accion     TEXT NOT NULL,
    estilo     TEXT,
    agua_g     REAL NOT NULL DEFAULT 0,
    notas      TEXT,

    PRIMARY KEY (receta_id, orden),
    CHECK (orden > 0),
    CHECK (t_inicio_s IS NULL OR t_inicio_s >= 0),
    CHECK (accion IN ('verter', 'agitar', 'remover', 'esperar', 'retirar')),
    CHECK ((accion = 'verter' AND agua_g > 0) OR (accion <> 'verter' AND agua_g = 0)),
    CHECK (estilo IS NULL OR (estilo IN ('espiral', 'centro') AND accion = 'verter'))
) STRICT;

CREATE TABLE extracciones2 (
    id                TEXT PRIMARY KEY,
    fecha             TEXT NOT NULL,
    cafe_id           TEXT NOT NULL REFERENCES cafes2(id) ON UPDATE CASCADE,
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
    receta_id         TEXT REFERENCES recetas2(id) ON UPDATE CASCADE,
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

-- La copia. El id viejo era el slug: se guarda en su columna y los hijos se
-- atan por él.
INSERT INTO cafes2 (
    id, slug, nombre, tostador, origen, region, variedad, proceso, altitud_m,
    sca, fecha_tueste, consumir_antes, fecha_apertura, peso_g, precio_eur,
    notas_tostador, estado, foto, url, conservacion, creado_en, actualizado_en
)
SELECT
    substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + (rowid % 1000)), 1, 8)
      || '-' || substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + (rowid % 1000)), 9, 4)
      || '-7' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-8' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-' || lower(hex(randomblob(6))),
    id, nombre, tostador, origen, region, variedad, proceso, altitud_m,
    sca, fecha_tueste, consumir_antes, fecha_apertura, peso_g, precio_eur,
    notas_tostador, estado, foto, url, conservacion, creado_en, actualizado_en
FROM cafes;

INSERT INTO recetas2 (id, slug, nombre, ratio, notas, creado_en, actualizado_en)
SELECT
    substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + (rowid % 1000)), 1, 8)
      || '-' || substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + (rowid % 1000)), 9, 4)
      || '-7' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-8' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-' || lower(hex(randomblob(6))),
    id, nombre, ratio, notas, creado_en, actualizado_en
FROM recetas;

INSERT INTO pasos2 (receta_id, orden, t_inicio_s, accion, estilo, agua_g, notas)
SELECT r.id, p.orden, p.t_inicio_s, p.accion, p.estilo, p.agua_g, p.notas
FROM pasos p
JOIN recetas2 r ON r.slug = p.receta_id;

INSERT INTO extracciones2 (
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, extraido_g, variable_cambiada, defecto, notas_cata,
    nota, siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en
)
SELECT
    substr(printf('%012x', CAST(strftime('%s', e.creado_en) AS INTEGER) * 1000 + (e.rowid % 1000)), 1, 8)
      || '-' || substr(printf('%012x', CAST(strftime('%s', e.creado_en) AS INTEGER) * 1000 + (e.rowid % 1000)), 9, 4)
      || '-7' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-8' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-' || lower(hex(randomblob(6))),
    e.fecha, c.id, e.dosis_g, e.agua_g, e.temp_c, e.molinillo, e.clics,
    e.metodo, e.reparto, e.tiempo_total, e.extraido_g, e.variable_cambiada,
    e.defecto, e.notas_cata, e.nota, e.siguiente_ajuste, r.id, e.drawdown_s,
    e.dripper, e.creado_en, e.actualizado_en, e.borrada_en
FROM extracciones e
JOIN cafes2 c ON c.slug = e.cafe_id
LEFT JOIN recetas2 r ON r.slug = e.receta_id;

-- Las viejas, hijas primero: cuando le toca a un padre ya no lo apunta nadie.
DROP TABLE extracciones;
DROP TABLE pasos;
DROP TABLE recetas;
DROP TABLE cafes;

-- Y las nuevas ocupan los nombres. Aquí la reescritura de referencias del
-- RENAME trabaja a favor: las claves foráneas de las nuevas se siguen entre sí.
ALTER TABLE cafes2 RENAME TO cafes;
ALTER TABLE recetas2 RENAME TO recetas;
ALTER TABLE pasos2 RENAME TO pasos;
ALTER TABLE extracciones2 RENAME TO extracciones;

CREATE INDEX idx_extracciones_cafe ON extracciones(cafe_id, creado_en, id);
CREATE INDEX idx_extracciones_fecha ON extracciones(fecha);

-- Las vistas exponen también el slug del café y de la receta: la app enseña
-- slugs en las URLs y así no tiene que resolverlos ella.
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
JOIN cafes c ON c.id = e.cafe_id
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
JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
WHERE e.borrada_en IS NOT NULL;

CREATE TRIGGER cafes_actualizado AFTER UPDATE ON cafes
BEGIN
    UPDATE cafes SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER recetas_actualizado AFTER UPDATE ON recetas
BEGIN
    UPDATE recetas SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;
