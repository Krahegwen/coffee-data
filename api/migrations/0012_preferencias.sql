-- Las preferencias: lo que el usuario decide una vez y la app respeta después.
--
-- Clave y valor, y no una columna por ajuste, porque los ajustes son de la
-- interfaz y no del dominio: el esquema no puede saber qué interruptores
-- tendrá la app dentro de tres versiones, y una migración por cada switch
-- sería ceremonia sin garantía. Qué claves existen y de qué tipo es cada una
-- lo dice `nucleo/src/preferencias.js`, que es quien puede saberlo, y lo
-- prueban sus tests.
--
-- `actualizado_en` no es decorado: es lo que permite fusionar clave a clave
-- en vez de reemplazar la tabla entera. Sin el sello, sincronizar borraba el
-- interruptor que acababas de pulsar si el refresco caía en el hueco entre
-- guardarlo y encolarlo.

CREATE TABLE preferencias (
    clave          TEXT PRIMARY KEY,
    valor          TEXT NOT NULL,
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;
