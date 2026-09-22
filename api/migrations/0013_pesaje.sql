-- Pesar la bolsa: el contador de gramos se recalibra con la báscula.
--
-- Hasta aquí los gramos restantes salían de restar las dosis registradas al
-- peso de la bolsa, y eso da por supuesto que toda taza pasó por la app. Una
-- bolsa anterior a la bitácora —la mitad gastada antes de que existiera esto—
-- se queda contando de más para siempre, y con ella la mañana que no apuntas
-- y el café que le das a un amigo. El aviso al pie de la lista decía que el
-- número sobreestima, que es verdad y no es un arreglo: el dato se sabía malo
-- y no había forma de corregirlo.
--
-- `restante_g` es lo que marcó la báscula y `restante_en` cuándo lo marcó. Con
-- los dos, el contador arranca de ahí y descuenta solo lo registrado después;
-- sin ellos, todo sigue igual. El sello no es decorado: sin él no se sabría
-- qué tazas ya estaban dentro del peso y volverían a restarse.
--
-- Van los dos o no va ninguno, y lo dice un CHECK en vez de la costumbre:
-- gramos sin sello serían un punto de partida sin fecha, y el contador no
-- sabría desde cuándo descontar. El de pareja va en la segunda columna, que
-- es cuando la primera ya existe.
--
-- Dos ALTER y no una tabla nueva: `cafes` cuelga de cada extracción por clave
-- foránea y rehacerla es justo lo que D1 no deja —está contado en el README,
-- con `fecha_compra`—. Aquí no hace falta: añadir columnas sí lo permite
-- SQLite en sitio, y las vistas no las tocan porque el restante es de la
-- bolsa y no de la extracción.

ALTER TABLE cafes ADD COLUMN restante_g REAL
    CHECK (restante_g IS NULL OR restante_g >= 0);

ALTER TABLE cafes ADD COLUMN restante_en TEXT
    CHECK ((restante_g IS NULL) = (restante_en IS NULL)
        AND (restante_en IS NULL OR (
            restante_en GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]'
            AND datetime(restante_en) IS NOT NULL
        )));
