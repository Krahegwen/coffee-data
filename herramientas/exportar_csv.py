#!/usr/bin/env python3
"""Exporta D1 a los CSV del repo. Uso: python herramientas/exportar_csv.py

Desde el corte, D1 es la fuente de verdad y los CSV son una copia legible.
Esto no es cosmética: al dejar de llevar los datos en git, la base pasó a ser
la única copia que existe. Exportar y commitear de vez en cuando es el
respaldo, y encima vuelve a dar un diff mirable de lo que cambió.

Solo escribe si algo cambió, para no ensuciar el repo con exportaciones
idénticas.
"""
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATOS = Path(__file__).resolve().parent.parent / "datos"
API = os.environ.get("COFFEE_API", "https://brew.krahegwen.com")

# fichero -> (ruta de la API, columnas, clave de orden)
EXPORTS = [
    ("cafes.csv", "/api/cafes", [
        "id", "nombre", "tostador", "origen", "region", "variedad", "proceso",
        "altitud_m", "sca", "fecha_tueste", "consumir_antes", "peso_g",
        "precio_eur", "notas_tostador", "estado", "fecha_compra",
        "fecha_recepcion", "foto", "url", "conservacion",
    ], lambda f: f["id"]),
]

COLUMNAS_EXTRACCIONES = [
    "id", "fecha", "cafe_id", "dias_tueste", "dosis_g", "agua_g", "ratio",
    "temp_c", "molinillo", "clics", "metodo", "reparto", "tiempo_total",
    "extraido_g", "variable_cambiada", "defecto", "notas_cata", "nota",
    "siguiente_ajuste", "receta_id", "drawdown_s", "dripper", "borrada_en",
]


# Cloudflare responde 403 al User-Agent por defecto de urllib.
AGENTE = "coffee-data (+https://github.com/Krahegwen/coffee-data)"


def traer(ruta):
    peticion = urllib.request.Request(f"{API}{ruta}", headers={"User-Agent": AGENTE})
    try:
        with urllib.request.urlopen(peticion, timeout=15) as respuesta:
            return json.load(respuesta)
    except urllib.error.URLError as error:
        print(f"No se pudo leer {API}{ruta}: {error}", file=sys.stderr)
        raise SystemExit(1)


# JSON no distingue 15 de 15.0, así que el ratio perdería el decimal.
FORMATOS = {"ratio": lambda v: f"{float(v):.1f}"}


def valor(fila, columna):
    v = fila.get(columna)
    if v is None or v == "":
        return ""
    formato = FORMATOS.get(columna)
    return formato(v) if formato else v


def como_csv(filas, columnas):
    """Texto CSV con las columnas dadas, siempre en LF."""
    salida = io.StringIO()
    escritor = csv.writer(salida, lineterminator="\n")
    escritor.writerow(columnas)
    for fila in filas:
        escritor.writerow([valor(fila, c) for c in columnas])
    return salida.getvalue()


def exportar_extracciones():
    """Activas y retiradas juntas.

    Las retiradas también van al respaldo: si solo se exportaran las activas,
    retirar una la borraría de verdad en cuanto se regenerase el CSV, y todo
    el sentido del borrado lógico era que se pudiera recuperar.
    """
    filas = traer("/api/extracciones") + traer("/api/extracciones?retiradas=1")
    filas.sort(key=lambda f: int(f["id"]))
    return [("extracciones.csv", como_csv(filas, COLUMNAS_EXTRACCIONES))]


def exportar_recetas():
    """recetas.csv y pasos.csv salen de la misma llamada."""
    recetas = traer("/api/recetas")
    filas_recetas = sorted(recetas, key=lambda r: r["id"])
    pasos = [
        paso
        for receta in filas_recetas
        for paso in sorted(receta.get("pasos", []), key=lambda p: int(p["orden"]))
    ]
    return [
        ("recetas.csv", como_csv(filas_recetas, ["id", "nombre", "ratio", "notas"])),
        ("pasos.csv", como_csv(pasos, [
            "receta_id", "orden", "t_inicio_s", "accion", "estilo", "agua_g",
            "notas",
        ])),
    ]


def main():
    pendientes = []
    for fichero, ruta, columnas, orden in EXPORTS:
        filas = sorted(traer(ruta), key=orden)
        pendientes.append((fichero, como_csv(filas, columnas)))
    pendientes.extend(exportar_extracciones())
    pendientes.extend(exportar_recetas())

    cambiados = 0
    for fichero, contenido in pendientes:
        destino = DATOS / fichero
        anterior = destino.read_bytes() if destino.exists() else b""
        nuevo = contenido.encode("utf-8")
        if anterior == nuevo:
            print(f"  {fichero}: sin cambios")
            continue
        destino.write_bytes(nuevo)
        print(f"  {fichero}: actualizado ({contenido.count(chr(10)) - 1} filas)")
        cambiados += 1

    print(f"\n{cambiados} fichero(s) actualizado(s) desde {API}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
