#!/usr/bin/env python3
"""Genera la semilla de D1 a partir de los CSV.

Uso: python herramientas/csv_a_sql.py > migrations/0002_semilla.sql

Los CSV dejan de ser la fuente de verdad al pasar a D1, pero siguen siendo de
donde salen los datos que ya había. Este script existe para que la semilla sea
reproducible y revisable, no escrita a mano.

ratio y dias_tueste no se migran: ahora son derivados y los da la vista.
"""
import csv
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

# fichero -> (tabla, columnas del CSV que van a la tabla)
TABLAS = [
    ("cafes.csv", "cafes", [
        "id", "nombre", "tostador", "origen", "region", "variedad", "proceso",
        "altitud_m", "sca", "fecha_tueste", "consumir_antes", "peso_g",
        "precio_eur", "notas_tostador", "estado", "fecha_compra",
        "fecha_recepcion", "foto", "url", "conservacion",
    ]),
    ("recetas.csv", "recetas", ["id", "nombre", "ratio", "notas"]),
    ("pasos.csv", "pasos", [
        "receta_id", "orden", "t_inicio_s", "accion", "agua_g", "notas",
    ]),
    ("extracciones.csv", "extracciones", [
        "id", "fecha", "cafe_id", "dosis_g", "agua_g", "temp_c", "molinillo",
        "clics", "metodo", "reparto", "tiempo_total", "variable_cambiada",
        "defecto", "notas_cata", "nota", "siguiente_ajuste", "receta_id",
        "drawdown_s", "dripper",
    ]),
]

# Columnas numéricas: van sin comillas, y vacío es NULL y no cadena vacía.
NUMERICAS = {
    "altitud_m", "sca", "peso_g", "precio_eur", "orden", "t_inicio_s",
    "agua_g", "dosis_g", "temp_c", "clics", "nota", "drawdown_s", "ratio",
}


def literal(columna, valor, tabla):
    """Valor listo para meter en el SQL."""
    valor = (valor or "").strip()
    if valor == "":
        return "NULL"
    if columna in NUMERICAS or (columna == "id" and tabla == "extracciones"):
        return valor
    return "'" + valor.replace("'", "''") + "'"


def main():
    lineas = [
        "-- Semilla generada por herramientas/csv_a_sql.py a partir de los CSV.",
        "-- No editar a mano: regenerar.",
        "",
    ]

    for fichero, tabla, columnas in TABLAS:
        with open(BASE / fichero, encoding="utf-8", newline="") as f:
            filas = list(csv.DictReader(f))
        if not filas:
            continue

        lineas.append(f"-- {fichero} -> {tabla} ({len(filas)} filas)")
        lineas.append(f"INSERT INTO {tabla} ({', '.join(columnas)}) VALUES")
        valores = [
            "    (" + ", ".join(literal(c, fila.get(c), tabla) for c in columnas) + ")"
            for fila in filas
        ]
        lineas.append(",\n".join(valores) + ";")
        lineas.append("")

    # El AUTOINCREMENT tiene que continuar donde lo dejó el CSV.
    lineas.append("-- Que el siguiente id de extracción continúe la serie.")
    lineas.append(
        "INSERT INTO sqlite_sequence (name, seq) "
        "SELECT 'extracciones', MAX(id) FROM extracciones "
        "WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'extracciones');"
    )
    lineas.append("")

    sys.stdout.write("\n".join(lineas))
    return 0


if __name__ == "__main__":
    sys.exit(main())
