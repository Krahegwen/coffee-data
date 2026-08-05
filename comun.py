#!/usr/bin/env python3
"""Utilidades compartidas por nueva.py y cafe.py."""
import csv
import io
import sys
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).parent
CAFES = BASE / "cafes.csv"
EXTRACCIONES = BASE / "extracciones.csv"
RECETAS = BASE / "recetas.csv"


def leer_csv(ruta):
    """Devuelve (cabecera, filas) de un CSV."""
    with open(ruta, encoding="utf-8", newline="") as f:
        lector = csv.DictReader(f)
        return lector.fieldnames, list(lector)


def agregar_fila(fila, ruta):
    """Añade una fila al final del CSV, en el orden de columnas de la cabecera."""
    columnas, _ = leer_csv(ruta)
    faltan = [c for c in columnas if c not in fila]
    if faltan:
        raise ValueError(f"Faltan columnas: {', '.join(faltan)}")
    sobran = [c for c in fila if c not in columnas]
    if sobran:
        raise ValueError(f"Columnas desconocidas: {', '.join(sobran)}")

    # Sin salto de línea final la nueva fila se pegaría a la última existente.
    datos = Path(ruta).read_bytes()
    if datos and not datos.endswith(b"\n"):
        with open(ruta, "ab") as f:
            f.write(b"\n")

    with open(ruta, "a", encoding="utf-8", newline="") as f:
        csv.writer(f, lineterminator="\n").writerow([fila[c] for c in columnas])


def actualizar_fila(clave, cambios, ruta, columna_clave="id"):
    """Reescribe una sola fila de un CSV de estado, dejando el resto intacto.

    Solo vale para `cafes.csv` y `recetas.csv`. `extracciones.csv` es un log de
    eventos: una fila registra algo que pasó y no se corrige nunca.
    """
    if Path(ruta).name == EXTRACCIONES.name:
        raise ValueError(
            "extracciones.csv es un log de eventos: sus filas no se editan"
        )

    columnas, _ = leer_csv(ruta)
    desconocidas = [c for c in cambios if c not in columnas]
    if desconocidas:
        raise ValueError(f"Columnas desconocidas: {', '.join(desconocidas)}")
    if not cambios:
        raise ValueError("No hay nada que cambiar")

    indice_clave = columnas.index(columna_clave)
    texto = Path(ruta).read_bytes().decode("utf-8")
    lineas = texto.split("\n")

    encontrada = False
    for numero, linea in enumerate(lineas):
        if numero == 0 or linea == "":
            continue
        fila = next(csv.reader([linea]))
        if fila[indice_clave] != clave:
            continue

        actual = dict(zip(columnas, fila))
        actual.update(cambios)
        salida = io.StringIO()
        csv.writer(salida, lineterminator="").writerow([actual[c] for c in columnas])
        lineas[numero] = salida.getvalue()
        encontrada = True
        break

    if not encontrada:
        raise ValueError(f"No existe ninguna fila con {columna_clave}={clave!r}")

    Path(ruta).write_bytes("\n".join(lineas).encode("utf-8"))


# --- validaciones genéricas --------------------------------------------------

def validar_fecha(valor):
    """Fecha en formato AAAA-MM-DD."""
    fecha = str(valor).strip()
    try:
        datetime.strptime(fecha, "%Y-%m-%d")
    except ValueError:
        raise ValueError(f"La fecha debe ir en formato AAAA-MM-DD: {valor!r}") from None
    return fecha


def validar_numero(valor):
    """Número, guardado tal cual pero con punto decimal."""
    numero = str(valor).strip().replace(",", ".")
    try:
        float(numero)
    except ValueError:
        raise ValueError(f"Se esperaba un número: {valor!r}") from None
    return numero


def validar_opcion(valor, permitidas, campo):
    """Valor dentro de una lista cerrada."""
    opcion = str(valor).strip().lower()
    if opcion not in permitidas:
        raise ValueError(
            f"{campo} no permitido: {valor!r}. Válidos: {', '.join(permitidas)}"
        )
    return opcion


# --- interfaz interactiva ----------------------------------------------------

def preguntar(etiqueta, defecto="", validador=None, obligatorio=True):
    """Pregunta un campo y lo repite hasta que sea válido."""
    sufijo = f" [{defecto}]" if defecto != "" else ""
    while True:
        try:
            respuesta = input(f"  {etiqueta}{sufijo}: ").strip()
        except EOFError:
            print("\nCancelado.")
            sys.exit(1)
        if not respuesta:
            respuesta = str(defecto)
        if not respuesta:
            if not obligatorio:
                return ""
            print("    Campo obligatorio.")
            continue
        if validador is None:
            return respuesta
        try:
            return validador(respuesta)
        except ValueError as error:
            print(f"    {error}")


def mostrar_resumen(fila, columnas):
    """Imprime la fila que se va a escribir."""
    print("\nResumen:")
    for columna in columnas:
        print(f"  {columna:<18} {fila[columna]}")


def confirmar(pregunta="¿Guardar?"):
    """Confirmación interactiva. Por defecto, no."""
    try:
        return input(f"\n{pregunta} [s/N]: ").strip().lower() in ("s", "si", "sí")
    except EOFError:
        return False
