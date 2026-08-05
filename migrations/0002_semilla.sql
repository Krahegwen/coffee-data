-- Semilla generada por herramientas/csv_a_sql.py a partir de los CSV.
-- No editar a mano: regenerar.

-- cafes.csv -> cafes (2 filas)
INSERT INTO cafes (id, nombre, tostador, origen, region, variedad, proceso, altitud_m, sca, fecha_tueste, consumir_antes, peso_g, precio_eur, notas_tostador, estado, fecha_compra, fecha_recepcion, foto, url, conservacion) VALUES
    ('gary', 'Gary', 'Manea Coffee', 'Perú', 'Cajamarca', 'Catimor, Marsellesa, Pache', 'Lavado', 1500, 84, '2026-05-20', '2027-05-20', 340, NULL, 'Nibs de cacao y dulce de leche', 'abierto', NULL, NULL, NULL, NULL, NULL),
    ('abbie', 'Abbie', 'Manea Coffee', 'México', 'Chiapas', 'Bourbon, Catimor, Garnica y Typica', 'Mountain Water (descafeinado)', 1200, 82, '2026-05-11', '2027-05-11', 340, NULL, 'Canela, caramelo y chocolate', 'abierto', '2026-05-11', '2026-05-14', NULL, NULL, 'Fellow Atmos 1.2 L');

-- recetas.csv -> recetas (3 filas)
INSERT INTO recetas (id, nombre, ratio, notas) VALUES
    ('kasuya-46-base', '4:6 Kasuya base', 15, 'Receta base del repo'),
    ('kasuya-46-dulzor', '4:6 más dulzor', 15, 'Fase 1 desigual: más dulzor y menos acidez'),
    ('kasuya-46-claridad', '4:6 más claridad', 15, 'Fase 2 en tres vertidos: más claridad');

-- pasos.csv -> pasos (19 filas)
INSERT INTO pasos (receta_id, orden, t_inicio_s, accion, agua_g, notas) VALUES
    ('kasuya-46-base', 1, 0, 'verter', 60, 'Fase 1'),
    ('kasuya-46-base', 2, 45, 'verter', 60, 'Fase 1'),
    ('kasuya-46-base', 3, 90, 'verter', 90, 'Fase 2'),
    ('kasuya-46-base', 4, 135, 'verter', 90, 'Fase 2'),
    ('kasuya-46-base', 5, 180, 'esperar', 0, 'Hasta que deje de gotear'),
    ('kasuya-46-base', 6, NULL, 'retirar', 0, 'Retirar el dripper'),
    ('kasuya-46-dulzor', 1, 0, 'verter', 50, 'Fase 1 desigual'),
    ('kasuya-46-dulzor', 2, 45, 'verter', 70, 'Fase 1 desigual'),
    ('kasuya-46-dulzor', 3, 90, 'verter', 90, 'Fase 2'),
    ('kasuya-46-dulzor', 4, 135, 'verter', 90, 'Fase 2'),
    ('kasuya-46-dulzor', 5, 180, 'esperar', 0, 'Hasta que deje de gotear'),
    ('kasuya-46-dulzor', 6, NULL, 'retirar', 0, 'Retirar el dripper'),
    ('kasuya-46-claridad', 1, 0, 'verter', 60, 'Fase 1'),
    ('kasuya-46-claridad', 2, 45, 'verter', 60, 'Fase 1'),
    ('kasuya-46-claridad', 3, 90, 'verter', 60, 'Fase 2'),
    ('kasuya-46-claridad', 4, 135, 'verter', 60, 'Fase 2'),
    ('kasuya-46-claridad', 5, 180, 'verter', 60, 'Fase 2'),
    ('kasuya-46-claridad', 6, 225, 'esperar', 0, 'Hasta que deje de gotear'),
    ('kasuya-46-claridad', 7, NULL, 'retirar', 0, 'Retirar el dripper');

-- extracciones.csv -> extracciones (1 filas)
INSERT INTO extracciones (id, fecha, cafe_id, dosis_g, agua_g, temp_c, molinillo, clics, metodo, reparto, tiempo_total, variable_cambiada, defecto, notas_cata, nota, siguiente_ajuste, receta_id, drawdown_s, dripper) VALUES
    (1, '2026-08-05', 'gary', 20, 300, 94, 'Comandante C40', 28, 'V60 4:6 Kasuya', '60-60-90-90', '3:25', 'basal', 'amargor', 'Amargor agradable, nada de acidez, buen cuerpo', 7, 'Bajar a 91 °C manteniendo 28 clics', 'kasuya-46-base', NULL, 'v60-02-plastico');

-- Que el siguiente id de extracción continúe la serie.
INSERT INTO sqlite_sequence (name, seq) SELECT 'extracciones', MAX(id) FROM extracciones WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'extracciones');
