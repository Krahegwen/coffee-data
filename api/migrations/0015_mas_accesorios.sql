-- Cuatro tipos más en el catálogo: filtro, báscula, hervidor y agua.
--
-- Cada uno es una variable de la taza, como el dripper: la extracción apunta
-- cuál usó, y cambiar de uno a otro cuenta como el cambio de esa extracción.
-- El filtro mueve el caudal y con él el goteo, que es de donde sale la
-- sugerencia de molienda. La báscula no cambia la taza pero sí la medida. El
-- hervidor, el chorro y lo que se parece la temperatura que marca a la real.
-- Y el agua, después del café, es lo que más cambia el sabor: hasta aquí solo
-- se podía apuntar a mano en `variable_cambiada`.
--
-- Es la migración que la 0014 dejó preparada. El tipo iba en un trigger y no en
-- un CHECK precisamente para esto: `accesorios` cuelga de cada extracción y D1
-- no deja rehacerla, pero un trigger se tira y se vuelve a crear.
--
-- Las columnas nuevas entran con ADD COLUMN, nulas y sin rellenar: de las tazas
-- de antes no se sabe con qué filtro se hicieron, y el motor trata un
-- accesorio que no consta como eso —no consta—, no como uno distinto. Sin
-- rehacer la tabla, sin danza de vistas para los datos y sin tocar ninguna
-- fila, así que el trigger de `actualizado_en` no tiene nada que marcar.
--
-- La columna del agua se llama `agua` a secas, como el tipo: el código lee cada
-- columna por el nombre de su tipo. Convive con `agua_g`, que es cuánta.

DROP TRIGGER accesorios_tipo_conocido;

CREATE TRIGGER accesorios_tipo_conocido BEFORE INSERT ON accesorios
WHEN NEW.tipo NOT IN ('dripper', 'molinillo', 'filtro', 'bascula', 'hervidor', 'agua')
BEGIN
    SELECT RAISE(ABORT, 'tipo de accesorio desconocido: dripper, molinillo, filtro, bascula, hervidor o agua');
END;

ALTER TABLE extracciones ADD COLUMN filtro TEXT REFERENCES accesorios(id) ON UPDATE CASCADE;
ALTER TABLE extracciones ADD COLUMN bascula TEXT REFERENCES accesorios(id) ON UPDATE CASCADE;
ALTER TABLE extracciones ADD COLUMN hervidor TEXT REFERENCES accesorios(id) ON UPDATE CASCADE;
ALTER TABLE extracciones ADD COLUMN agua TEXT REFERENCES accesorios(id) ON UPDATE CASCADE;

-- Los dos triggers que atan cada columna a un accesorio de su tipo, ahora con
-- las seis.
DROP TRIGGER extracciones_accesorios_alta;
DROP TRIGGER extracciones_accesorios_cambio;

CREATE TRIGGER extracciones_accesorios_alta BEFORE INSERT ON extracciones
WHEN (NEW.dripper IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.dripper AND tipo = 'dripper'))
  OR (NEW.molinillo IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.molinillo AND tipo = 'molinillo'))
  OR (NEW.filtro IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.filtro AND tipo = 'filtro'))
  OR (NEW.bascula IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.bascula AND tipo = 'bascula'))
  OR (NEW.hervidor IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.hervidor AND tipo = 'hervidor'))
  OR (NEW.agua IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.agua AND tipo = 'agua'))
BEGIN
    SELECT RAISE(ABORT, 'cada accesorio tiene que ir en la columna de su tipo');
END;

CREATE TRIGGER extracciones_accesorios_cambio
BEFORE UPDATE OF dripper, molinillo, filtro, bascula, hervidor, agua ON extracciones
WHEN (NEW.dripper IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.dripper AND tipo = 'dripper'))
  OR (NEW.molinillo IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.molinillo AND tipo = 'molinillo'))
  OR (NEW.filtro IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.filtro AND tipo = 'filtro'))
  OR (NEW.bascula IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.bascula AND tipo = 'bascula'))
  OR (NEW.hervidor IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.hervidor AND tipo = 'hervidor'))
  OR (NEW.agua IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM accesorios WHERE id = NEW.agua AND tipo = 'agua'))
BEGIN
    SELECT RAISE(ABORT, 'cada accesorio tiene que ir en la columna de su tipo');
END;

-- Las vistas ya sacan las columnas nuevas por su `e.*`; se rehacen solo para
-- que cada accesorio traiga su slug al lado, como el dripper y el molinillo.
DROP VIEW v_extracciones;
DROP VIEW v_extracciones_retiradas;

CREATE VIEW v_extracciones AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    d.slug AS dripper_slug,
    m.slug AS molinillo_slug,
    f.slug AS filtro_slug,
    b.slug AS bascula_slug,
    h.slug AS hervidor_slug,
    a.slug AS agua_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
LEFT JOIN accesorios d ON d.id = e.dripper
LEFT JOIN accesorios m ON m.id = e.molinillo
LEFT JOIN accesorios f ON f.id = e.filtro
LEFT JOIN accesorios b ON b.id = e.bascula
LEFT JOIN accesorios h ON h.id = e.hervidor
LEFT JOIN accesorios a ON a.id = e.agua
WHERE e.borrada_en IS NULL;

CREATE VIEW v_extracciones_retiradas AS
SELECT
    e.*,
    c.nombre AS cafe_nombre,
    c.slug AS cafe_slug,
    r.slug AS receta_slug,
    d.slug AS dripper_slug,
    m.slug AS molinillo_slug,
    f.slug AS filtro_slug,
    b.slug AS bascula_slug,
    h.slug AS hervidor_slug,
    a.slug AS agua_slug,
    ROUND(e.agua_g / e.dosis_g, 1) AS ratio,
    CAST(julianday(e.fecha) - julianday(c.fecha_tueste) AS INTEGER) AS dias_tueste,
    CAST(julianday(e.fecha) - julianday(c.fecha_apertura) AS INTEGER) AS dias_abierta
FROM extracciones e
LEFT JOIN cafes c ON c.id = e.cafe_id
LEFT JOIN recetas r ON r.id = e.receta_id
LEFT JOIN accesorios d ON d.id = e.dripper
LEFT JOIN accesorios m ON m.id = e.molinillo
LEFT JOIN accesorios f ON f.id = e.filtro
LEFT JOIN accesorios b ON b.id = e.bascula
LEFT JOIN accesorios h ON h.id = e.hervidor
LEFT JOIN accesorios a ON a.id = e.agua
WHERE e.borrada_en IS NOT NULL;
