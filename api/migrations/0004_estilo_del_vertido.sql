-- Cómo se vierte: en espiral o al centro.
--
-- Atributo del paso y no una acción aparte, a propósito. Si `verter_espiral`
-- fuese una acción, dejarían de valer las catorce comparaciones con 'verter'
-- que hay entre el Worker y la app —los gramos, el acumulado, el reparto y el
-- agua de referencia salen todas de ahí—. Como atributo, verter sigue siendo
-- verter y nada de eso se entera.
--
-- A la base va la clave, no la frase: 'espiral', no 'en espiral'. El texto en
-- castellano vive en la app, que es donde vivirá el i18n; una frase guardada
-- aquí habría que migrarla para traducirla.
--
-- El CHECK lleva las dos reglas: el estilo es uno de los dos que hay, y solo
-- lo llevan los vertidos. Sin la segunda colaría un 'esperar en espiral'.
ALTER TABLE pasos ADD COLUMN estilo TEXT
    CHECK (estilo IS NULL OR (estilo IN ('espiral', 'centro') AND accion = 'verter'));
