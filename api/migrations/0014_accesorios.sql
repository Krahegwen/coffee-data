-- Los accesorios: el dripper y el molinillo pasan a ser un catálogo propio.
--
-- Hasta aquí eran dos columnas de texto en cada extracción. El dripper, una
-- lista cerrada de dos claves con su CHECK: comprar un Origami pedía una
-- migración, y qué dripper tiene masa térmica lo decía una constante del
-- motor. El molinillo, texto libre que el formulario ni enseñaba. Ahora son
-- filas de `accesorios` —uuid de clave, slug de etiqueta, como las bolsas y
-- las recetas— y la masa térmica es un dato del dripper.
--
-- Las columnas de `extracciones` **conservan su nombre** y pasan a guardar la
-- id del accesorio, con su clave foránea. No es descuido: la cola de salida
-- de un móvil con la app vieja, el curl de siempre y los respaldos de antes
-- mandan `"dripper": "v60-02-plastico"`, y el núcleo los resuelve por uuid,
-- slug o nombre. Cambiarles el nombre habría atascado esas colas en un 422.
--
-- **El tipo no lleva CHECK, lleva trigger.** Esta tabla va a colgar de cada
-- extracción, igual que `cafes`, y eso la deja sin reconstrucción posible en
-- D1 (está contado en el README, con `fecha_compra`). Un `CHECK (tipo IN
-- ...)` quedaría congelado para siempre; un trigger se tira y se rehace en
-- una migración de tres líneas el día que haya filtros o hervidores. La
-- garantía es la misma: lo que no es dripper ni molinillo no entra.
--
-- Lo que ya había se convierte aquí:
--
-- - Los dos drippers de la lista cerrada, siempre, con sus claves de siempre
--   como slug — así resuelven los envíos viejos. El de cerámica con masa
--   térmica, que es lo que decía la constante del motor.
-- - Un molinillo por cada texto distinto de la columna, con ese nombre. El
--   slug sale del nombre (`Comandante C40` -> `comandante_c40`), y si de ahí
--   no sale uno válido o repetido, `molinillo_N`.
--
-- Cada accesorio convertido nace con el `creado_en` de la primera taza que
-- lo usó: es desde cuándo está en casa, o lo más cerca que se sabe.
--
-- La tabla de extracciones se rehace a la manera de la 0008 —la nueva al
-- lado, copiar, tirar la vieja, renombrar— porque su CHECK del dripper no se
-- quita de otra forma. Tirar la vieja es seguro: solo se apunta a sí misma,
-- por `desde_id`, y sus filas se van todas a la vez.

CREATE TABLE accesorios (
    id             TEXT PRIMARY KEY,
    slug           TEXT NOT NULL UNIQUE,
    tipo           TEXT NOT NULL,
    nombre         TEXT NOT NULL,
    masa_termica   INTEGER NOT NULL DEFAULT 0,
    en_uso         INTEGER NOT NULL DEFAULT 1,
    notas          TEXT,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),

    CHECK (id GLOB '[0-9a-f]*' AND length(id) = 36),
    CHECK (slug GLOB '[a-z0-9]*' AND slug NOT GLOB '*[^a-z0-9_-]*'),
    CHECK (nombre <> ''),
    CHECK (masa_termica IN (0, 1)),
    CHECK (en_uso IN (0, 1)),
    -- La masa térmica es lo que baja la temperatura del lecho: en un molinillo
    -- no significa nada. Nombrar 'dripper' aquí no congela nada que importe.
    CHECK (masa_termica = 0 OR tipo = 'dripper')
) STRICT;

CREATE TRIGGER accesorios_tipo_conocido BEFORE INSERT ON accesorios
WHEN NEW.tipo NOT IN ('dripper', 'molinillo')
BEGIN
    SELECT RAISE(ABORT, 'tipo de accesorio desconocido: dripper o molinillo');
END;

-- Un molinillo no pasa a ser dripper: las extracciones que lo usan lo tienen
-- en su columna de molinillo, y cambiarle el tipo las dejaría mintiendo.
CREATE TRIGGER accesorios_tipo_fijo BEFORE UPDATE OF tipo ON accesorios
WHEN NEW.tipo IS NOT OLD.tipo
BEGIN
    SELECT RAISE(ABORT, 'un accesorio no cambia de tipo');
END;

-- Los dos drippers de la lista cerrada. El de plástico nace con la primera
-- taza que lo usó; el de cerámica, si ninguna lo usó, ahora.
INSERT INTO accesorios (id, slug, tipo, nombre, masa_termica, creado_en, actualizado_en)
SELECT
    substr(printf('%012x', CAST(strftime('%s', sello) AS INTEGER) * 1000 + orden), 1, 8)
      || '-' || substr(printf('%012x', CAST(strftime('%s', sello) AS INTEGER) * 1000 + orden), 9, 4)
      || '-7' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-8' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-' || lower(hex(randomblob(6))),
    slug, 'dripper', nombre, masa_termica, sello, sello
FROM (
    SELECT 1 AS orden, 'v60-02-plastico' AS slug, 'V60 02 plástico' AS nombre, 0 AS masa_termica,
           coalesce((SELECT MIN(creado_en) FROM extracciones WHERE dripper = 'v60-02-plastico'),
                    datetime('now')) AS sello
    UNION ALL
    SELECT 2, 'v60-02-ceramica', 'V60 02 cerámica', 1,
           coalesce((SELECT MIN(creado_en) FROM extracciones WHERE dripper = 'v60-02-ceramica'),
                    datetime('now'))
);

-- Los molinillos, de uno en uno por texto distinto. La tabla de paso guarda
-- la id que le toca a cada nombre, que es con lo que luego se atan las filas.
-- Es una tabla normal y no TEMP: D1 no promete las temporales en migraciones.
CREATE TABLE molinillos_viejos (
    nombre    TEXT PRIMARY KEY,
    n         INTEGER NOT NULL,
    creado_en TEXT NOT NULL,
    candidato TEXT NOT NULL,
    id        TEXT
) STRICT;

INSERT INTO molinillos_viejos (nombre, n, creado_en, candidato)
SELECT
    molinillo,
    ROW_NUMBER() OVER (ORDER BY MIN(creado_en), molinillo),
    MIN(creado_en),
    -- `slugDe` en pobre: minúsculas y los separadores de siempre a guion bajo.
    -- Lo que aun así no valga cae al número, más abajo.
    replace(replace(replace(replace(lower(trim(molinillo)), ' ', '_'), '.', '_'), '/', '_'), '-', '_')
FROM extracciones
WHERE trim(coalesce(molinillo, '')) <> ''
GROUP BY molinillo;

UPDATE molinillos_viejos
SET id = substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + 10 + n), 1, 8)
      || '-' || substr(printf('%012x', CAST(strftime('%s', creado_en) AS INTEGER) * 1000 + 10 + n), 9, 4)
      || '-7' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-8' || substr(lower(hex(randomblob(2))), 1, 3)
      || '-' || lower(hex(randomblob(6)));

INSERT INTO accesorios (id, slug, tipo, nombre, creado_en, actualizado_en)
SELECT
    m.id,
    CASE
        WHEN m.candidato GLOB '[a-z0-9]*' AND m.candidato NOT GLOB '*[^a-z0-9_-]*'
             AND NOT EXISTS (SELECT 1 FROM molinillos_viejos o WHERE o.candidato = m.candidato AND o.n < m.n)
             AND NOT EXISTS (SELECT 1 FROM accesorios a WHERE a.slug = m.candidato)
        THEN m.candidato
        ELSE 'molinillo_' || m.n
    END,
    'molinillo', trim(m.nombre), m.creado_en, m.creado_en
FROM molinillos_viejos m;

-- La tabla nueva: las mismas columnas, el dripper sin su CHECK y los dos
-- accesorios con su clave foránea. `desde_id` se apunta a sí misma por su
-- nombre provisional, y el RENAME del final la sigue.
DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;
DROP TRIGGER extracciones_actualizado;

CREATE TABLE extracciones2 (
    id                TEXT PRIMARY KEY,
    fecha             TEXT NOT NULL,
    cafe_id           TEXT REFERENCES cafes(id) ON UPDATE CASCADE,
    dosis_g           REAL NOT NULL,
    agua_g            REAL NOT NULL,
    temp_c            REAL,
    molinillo         TEXT REFERENCES accesorios(id) ON UPDATE CASCADE,
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
    dripper           TEXT REFERENCES accesorios(id) ON UPDATE CASCADE,
    creado_en         TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en    TEXT,
    borrada_en        TEXT,
    desde_id          TEXT REFERENCES extracciones2(id) ON UPDATE CASCADE,

    CHECK (id GLOB '[0-9a-f]*' AND length(id) = 36),
    CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND julianday(fecha) IS NOT NULL AND date(julianday(fecha)) = fecha),
    CHECK (dosis_g > 0),
    CHECK (agua_g > 0),
    CHECK (temp_c IS NULL OR temp_c BETWEEN 0 AND 100),
    CHECK (clics IS NULL OR clics >= 0),
    CHECK (nota IS NULL OR nota BETWEEN 1 AND 10),
    CHECK (drawdown_s IS NULL OR drawdown_s >= 0),
    CHECK (extraido_g IS NULL OR extraido_g > 0),
    CHECK (defecto IS NULL OR replace(replace(replace(replace(replace(replace(replace(replace(
        ',' || defecto || ',',
        ',equilibrado,', ','),
        ',amargor,',     ','),
        ',astringente,', ','),
        ',plano,',       ','),
        ',agrio,',       ','),
        ',salado,',      ','),
        ',carton,',      ','),
        ',aguado,',      ',') = ','),
    CHECK (desde_id IS NULL OR (desde_id GLOB '[0-9a-f]*' AND length(desde_id) = 36 AND desde_id <> id))
) STRICT;

-- Una sola sentencia: las madres y las hijas entran a la vez, y la clave
-- foránea de `desde_id` se comprueba al final de ella, no fila a fila.
INSERT INTO extracciones2 (
    id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo,
    reparto, tiempo_total, extraido_g, variable_cambiada, defecto, notas_cata,
    nota, siguiente_ajuste, receta_id, drawdown_s, dripper, creado_en,
    actualizado_en, borrada_en, desde_id
)
SELECT
    e.id, e.fecha, e.cafe_id, e.dosis_g, e.agua_g, e.temp_c,
    (SELECT m.id FROM molinillos_viejos m WHERE m.nombre = e.molinillo),
    e.clics, e.metodo, e.reparto, e.tiempo_total, e.extraido_g,
    e.variable_cambiada, e.defecto, e.notas_cata, e.nota, e.siguiente_ajuste,
    e.receta_id, e.drawdown_s,
    (SELECT a.id FROM accesorios a WHERE a.tipo = 'dripper' AND a.slug = e.dripper),
    e.creado_en, e.actualizado_en, e.borrada_en, e.desde_id
FROM extracciones e;

DROP TABLE molinillos_viejos;
DROP TABLE extracciones;
ALTER TABLE extracciones2 RENAME TO extracciones;

CREATE INDEX idx_extracciones_cafe ON extracciones(cafe_id, creado_en, id);
CREATE INDEX idx_extracciones_fecha ON extracciones(fecha);

-- Que cada columna apunte a un accesorio de su tipo. La clave foránea dice
-- que existe; esto, que es lo que dice ser. Va en trigger porque un CHECK no
-- puede mirar otra tabla.
CREATE TRIGGER extracciones_accesorios_alta BEFORE INSERT ON extracciones
WHEN (NEW.dripper IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.dripper AND tipo = 'dripper'))
  OR (NEW.molinillo IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.molinillo AND tipo = 'molinillo'))
BEGIN
    SELECT RAISE(ABORT, 'dripper y molinillo tienen que ser accesorios de su tipo');
END;

CREATE TRIGGER extracciones_accesorios_cambio BEFORE UPDATE OF dripper, molinillo ON extracciones
WHEN (NEW.dripper IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.dripper AND tipo = 'dripper'))
  OR (NEW.molinillo IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.molinillo AND tipo = 'molinillo'))
BEGIN
    SELECT RAISE(ABORT, 'dripper y molinillo tienen que ser accesorios de su tipo');
END;

CREATE TRIGGER extracciones_actualizado AFTER UPDATE ON extracciones
BEGIN
    UPDATE extracciones SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER accesorios_actualizado AFTER UPDATE ON accesorios
BEGIN
    UPDATE accesorios SET actualizado_en = datetime('now') WHERE id = NEW.id;
END;

-- Las vistas, con el slug de cada accesorio al lado del de la receta: lo que
-- se lee a mano no se resuelve de cabeza.
CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    d.slug AS dripper_slug,
    m.slug AS molinillo_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
LEFT JOIN accesorios d ON d.id = e.dripper
LEFT JOIN accesorios m ON m.id = e.molinillo
WHERE e.borrada_en IS NULL;

CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    d.slug AS dripper_slug,
    m.slug AS molinillo_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
LEFT JOIN accesorios d ON d.id = e.dripper
LEFT JOIN accesorios m ON m.id = e.molinillo
WHERE e.borrada_en IS NOT NULL;
