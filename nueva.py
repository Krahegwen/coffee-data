#!/usr/bin/env python3
"""Añade una extracción a extracciones.csv. Uso: python nueva.py"""
import csv
import sys
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).parent
CAFES = BASE / "cafes.csv"
EXTRACCIONES = BASE / "extracciones.csv"

DEFECTOS = ["equilibrado", "amargor", "astringente", "plano", "agrio", "salado", "carton"]

# Receta base del README, se ofrecen como valor por defecto en las preguntas.
DOSIS_BASE = "20"
AGUA_BASE = "300"
MOLINILLO_BASE = "Comandante C40"
METODO_BASE = "V60 4:6 Kasuya"
REPARTO_BASE = "60-60-90-90"


def leer_csv(ruta):
    """Devuelve (cabecera, filas) de un CSV."""
    with open(ruta, encoding="utf-8", newline="") as f:
        lector = csv.DictReader(f)
        return lector.fieldnames, list(lector)


def cargar_cafes(ruta=CAFES):
    """Diccionario id -> fila de cafes.csv."""
    _, filas = leer_csv(ruta)
    return {c["id"]: c for c in filas}


# --- campos calculados -------------------------------------------------------

def siguiente_id(extracciones):
    """Siguiente id autoincremental."""
    ids = [int(e["id"]) for e in extracciones if str(e.get("id", "")).strip().isdigit()]
    return max(ids) + 1 if ids else 1


def calcular_dias_tueste(fecha_tueste, hoy=None):
    """Días transcurridos desde el tueste. Vacío si el café no tiene fecha."""
    if not fecha_tueste:
        return ""
    hoy = hoy or date.today()
    tueste = datetime.strptime(fecha_tueste, "%Y-%m-%d").date()
    return (hoy - tueste).days


def calcular_ratio(dosis_g, agua_g):
    """Ratio agua/café con un decimal."""
    dosis = float(str(dosis_g).replace(",", "."))
    if dosis <= 0:
        raise ValueError("La dosis debe ser mayor que 0")
    return f"{float(str(agua_g).replace(',', '.')) / dosis:.1f}"


# --- validaciones ------------------------------------------------------------

def validar_cafe_id(valor, cafes):
    """El cafe_id debe existir en cafes.csv."""
    cafe_id = str(valor).strip()
    if cafe_id not in cafes:
        raise ValueError(
            f"cafe_id desconocido: {cafe_id!r}. Válidos: {', '.join(sorted(cafes))}"
        )
    return cafe_id


def validar_nota(valor):
    """La nota debe ser un entero de 1 a 10."""
    try:
        nota = int(str(valor).strip())
    except ValueError:
        raise ValueError(f"La nota debe ser un número entero de 1 a 10: {valor!r}") from None
    if not 1 <= nota <= 10:
        raise ValueError(f"La nota debe estar entre 1 y 10: {nota}")
    return nota


def validar_defecto(valor):
    """El defecto debe ser uno de los valores permitidos."""
    defecto = str(valor).strip().lower()
    if defecto not in DEFECTOS:
        raise ValueError(
            f"defecto no permitido: {valor!r}. Válidos: {', '.join(DEFECTOS)}"
        )
    return defecto


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


# --- escritura ---------------------------------------------------------------

def agregar_fila(fila, ruta=EXTRACCIONES):
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


def main():
    cafes = cargar_cafes()
    columnas, extracciones = leer_csv(EXTRACCIONES)
    hoy = date.today()

    fila = {"id": siguiente_id(extracciones)}
    print(f"\nNueva extracción #{fila['id']}\n")

    fila["fecha"] = preguntar("fecha (AAAA-MM-DD)", hoy.isoformat(), validar_fecha)
    fila["cafe_id"] = preguntar(
        f"cafe_id ({', '.join(sorted(cafes))})",
        validador=lambda v: validar_cafe_id(v, cafes),
    )

    cafe = cafes[fila["cafe_id"]]
    fila["dias_tueste"] = calcular_dias_tueste(cafe.get("fecha_tueste", ""), hoy)
    if fila["dias_tueste"] == "":
        print(f"    ({cafe['nombre'] or fila['cafe_id']} no tiene fecha de tueste)")
    else:
        print(f"    dias_tueste = {fila['dias_tueste']}")

    fila["dosis_g"] = preguntar("dosis_g", DOSIS_BASE, validar_numero)
    fila["agua_g"] = preguntar("agua_g", AGUA_BASE, validar_numero)
    fila["ratio"] = calcular_ratio(fila["dosis_g"], fila["agua_g"])
    print(f"    ratio = {fila['ratio']}")

    fila["temp_c"] = preguntar("temp_c", validador=validar_numero)
    fila["molinillo"] = preguntar("molinillo", MOLINILLO_BASE)
    fila["clics"] = preguntar("clics", validador=validar_numero)
    fila["metodo"] = preguntar("metodo", METODO_BASE)
    fila["reparto"] = preguntar("reparto", REPARTO_BASE)
    fila["tiempo_total"] = preguntar("tiempo_total (m:ss)")
    fila["variable_cambiada"] = preguntar("variable_cambiada")
    fila["defecto"] = preguntar(
        f"defecto ({', '.join(DEFECTOS)})", validador=validar_defecto
    )
    fila["notas_cata"] = preguntar("notas_cata", obligatorio=False)
    fila["nota"] = preguntar("nota (1-10)", validador=validar_nota)
    fila["siguiente_ajuste"] = preguntar("siguiente_ajuste", obligatorio=False)

    print("\nResumen:")
    for columna in columnas:
        print(f"  {columna:<18} {fila[columna]}")

    if input("\n¿Guardar? [s/N]: ").strip().lower() not in ("s", "si", "sí"):
        print("No se ha guardado nada.")
        return 1

    agregar_fila(fila, EXTRACCIONES)
    print(f"\nExtracción #{fila['id']} añadida a extracciones.csv")
    nombre = cafe["nombre"] or fila["cafe_id"]
    mensaje = f"#{fila['id']} {nombre}: {fila['variable_cambiada']}"
    print(f'Commit:  git commit -am "{mensaje}"')
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelado.")
        sys.exit(1)
