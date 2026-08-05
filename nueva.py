#!/usr/bin/env python3
"""Añade una extracción a extracciones.csv.

Interactivo:  python nueva.py
Un comando:   python nueva.py --cafe gary --temp 91 --clics 28 --tiempo 3:30 \
                  --variable "91 °C" --defecto equilibrado --nota 8
"""
import argparse
import sys
from datetime import date, datetime

from comun import (
    CAFES,
    EXTRACCIONES,
    agregar_fila,
    confirmar,
    leer_csv,
    mostrar_resumen,
    preguntar,
    validar_fecha,
    validar_numero,
    validar_opcion,
)
from recetas import cargar_pasos, cargar_recetas, reparto_de, validar_receta_id
from sugerencias import formatear, sugerir, texto_corto

DEFECTOS = ["equilibrado", "amargor", "astringente", "plano", "agrio", "salado", "carton"]

# Lista cerrada a propósito: el dripper entra en la detección de pares, y una
# errata ("plastico" por "plastico ") parecería un cambio de variable.
DRIPPERS = ["v60-02-plastico", "v60-02-ceramica"]

# Receta base del README: valores por defecto de las preguntas y de los flags.
DOSIS_BASE = "20"
AGUA_BASE = "300"
MOLINILLO_BASE = "Comandante C40"
METODO_BASE = "V60 4:6 Kasuya"
RECETA_BASE = "kasuya-46-base"
DRIPPER_BASE = "v60-02-plastico"

CAMPOS_CLI = (
    "fecha", "cafe", "dosis", "agua", "temp", "molinillo", "clics", "metodo",
    "receta", "reparto", "dripper", "tiempo", "drawdown", "variable", "defecto",
    "notas", "nota", "siguiente",
)
OBLIGATORIOS_CLI = ("cafe", "temp", "clics", "tiempo", "variable", "defecto", "nota")


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


# --- validaciones propias de una extracción ----------------------------------

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
    return validar_opcion(valor, DEFECTOS, "defecto")


def validar_dripper(valor):
    """El dripper debe ser uno de los que hay en casa."""
    return validar_opcion(valor, DRIPPERS, "dripper")


def validar_drawdown(valor):
    """Drawdown en segundos enteros: desde el último vertido hasta que deja de gotear."""
    try:
        segundos = int(str(valor).strip())
    except ValueError:
        raise ValueError(f"El drawdown va en segundos enteros: {valor!r}") from None
    if segundos < 0:
        raise ValueError(f"El drawdown no puede ser negativo: {segundos}")
    return segundos


# --- construcción de la fila -------------------------------------------------

def construir_fila(args, cafes, recetas, pasos, extracciones, hoy):
    """Fila completa a partir de los argumentos de línea de comandos."""
    faltan = [f"--{c}" for c in OBLIGATORIOS_CLI if getattr(args, c) is None]
    if faltan:
        raise ValueError(f"faltan argumentos obligatorios: {', '.join(faltan)}")

    cafe_id = validar_cafe_id(args.cafe, cafes)
    dosis = validar_numero(DOSIS_BASE if args.dosis is None else args.dosis)
    agua = validar_numero(AGUA_BASE if args.agua is None else args.agua)
    receta_id = validar_receta_id(
        RECETA_BASE if args.receta is None else args.receta, recetas
    )
    if receta_id not in pasos:
        raise ValueError(f"la receta {receta_id!r} no tiene pasos en pasos.csv")

    return {
        "id": siguiente_id(extracciones),
        "fecha": validar_fecha(args.fecha) if args.fecha else hoy.isoformat(),
        "cafe_id": cafe_id,
        "dias_tueste": calcular_dias_tueste(cafes[cafe_id].get("fecha_tueste", ""), hoy),
        "dosis_g": dosis,
        "agua_g": agua,
        "ratio": calcular_ratio(dosis, agua),
        "temp_c": validar_numero(args.temp),
        "molinillo": args.molinillo or MOLINILLO_BASE,
        "clics": validar_numero(args.clics),
        "metodo": args.metodo or METODO_BASE,
        "reparto": args.reparto or reparto_de(pasos[receta_id], agua),
        "tiempo_total": args.tiempo,
        "variable_cambiada": args.variable,
        "defecto": validar_defecto(args.defecto),
        "notas_cata": args.notas or "",
        "nota": validar_nota(args.nota),
        "siguiente_ajuste": args.siguiente or "",
        "receta_id": receta_id,
        "drawdown_s": "" if args.drawdown is None else validar_drawdown(args.drawdown),
        "dripper": validar_dripper(args.dripper or DRIPPER_BASE),
    }


def preguntar_fila(cafes, recetas, pasos, extracciones, hoy):
    """Fila completa preguntando campo a campo."""
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
    fila["receta_id"] = preguntar(
        f"receta_id ({', '.join(sorted(recetas))})",
        RECETA_BASE,
        lambda v: validar_receta_id(v, recetas),
    )
    fila["reparto"] = preguntar(
        "reparto", reparto_de(pasos[fila["receta_id"]], fila["agua_g"])
    )
    fila["dripper"] = preguntar(
        f"dripper ({', '.join(DRIPPERS)})", DRIPPER_BASE, validar_dripper
    )
    fila["tiempo_total"] = preguntar("tiempo_total (m:ss)")
    fila["drawdown_s"] = preguntar(
        "drawdown_s (segundos, opcional)", validador=validar_drawdown, obligatorio=False
    )
    fila["variable_cambiada"] = preguntar("variable_cambiada")
    fila["defecto"] = preguntar(
        f"defecto ({', '.join(DEFECTOS)})", validador=validar_defecto
    )
    fila["notas_cata"] = preguntar("notas_cata", obligatorio=False)
    fila["nota"] = preguntar("nota (1-10)", validador=validar_nota)
    # Con la cata ya respondida el motor puede proponer el siguiente ajuste.
    propuesta = texto_corto(sugerir(fila, list(extracciones) + [fila]))
    fila["siguiente_ajuste"] = preguntar("siguiente_ajuste", propuesta, obligatorio=False)
    return fila


# --- línea de comandos -------------------------------------------------------

def parsear_argumentos(argv=None):
    parser = argparse.ArgumentParser(
        prog="nueva.py",
        description="Añade una extracción a extracciones.csv.",
        epilog="Sin argumentos, pregunta campo a campo. Con argumentos, añade la fila "
               "en un solo paso: o entra entera o no entra ninguna.",
    )
    parser.add_argument("--fecha", help="AAAA-MM-DD (por defecto, hoy)")
    parser.add_argument("--cafe", help="cafe_id, tiene que existir en cafes.csv")
    parser.add_argument("--dosis", help=f"gramos de café (por defecto, {DOSIS_BASE})")
    parser.add_argument("--agua", help=f"gramos de agua (por defecto, {AGUA_BASE})")
    parser.add_argument("--temp", help="temperatura del agua en °C")
    parser.add_argument("--molinillo", help=f"por defecto, {MOLINILLO_BASE}")
    parser.add_argument("--clics", help="clics del molinillo")
    parser.add_argument("--metodo", help=f"por defecto, {METODO_BASE}")
    parser.add_argument("--receta", help=f"receta_id (por defecto, {RECETA_BASE})")
    parser.add_argument("--reparto", help="por defecto, las fases de la receta escaladas al agua")
    parser.add_argument("--dripper", help=f"{', '.join(DRIPPERS)} (por defecto, {DRIPPER_BASE})")
    parser.add_argument("--tiempo", help="tiempo total, m:ss")
    parser.add_argument("--drawdown", help="segundos desde el último vertido hasta que deja de gotear")
    parser.add_argument("--variable", help="qué has cambiado respecto a la extracción anterior")
    parser.add_argument("--defecto", help=", ".join(DEFECTOS))
    parser.add_argument("--notas", help="notas de cata")
    parser.add_argument("--nota", help="de 1 a 10")
    parser.add_argument("--siguiente", help="siguiente ajuste a probar")
    parser.add_argument(
        "--dry-run", action="store_true", help="muestra la fila sin escribirla"
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parsear_argumentos(argv)
    cafes = cargar_cafes()
    recetas = cargar_recetas()
    pasos = cargar_pasos()
    columnas, extracciones = leer_csv(EXTRACCIONES)
    hoy = date.today()

    interactivo = all(getattr(args, campo) is None for campo in CAMPOS_CLI)
    if interactivo:
        fila = preguntar_fila(cafes, recetas, pasos, extracciones, hoy)
    else:
        try:
            fila = construir_fila(args, cafes, recetas, pasos, extracciones, hoy)
        except ValueError as error:
            print(f"nueva.py: {error}", file=sys.stderr)
            return 2

    mostrar_resumen(fila, columnas)
    print()
    print(formatear(sugerir(fila, list(extracciones) + [fila])))

    if args.dry_run:
        print("\n--dry-run: no se ha escrito nada.")
        return 0
    if interactivo and not confirmar():
        print("No se ha guardado nada.")
        return 1

    agregar_fila(fila, EXTRACCIONES)
    print(f"\nExtracción #{fila['id']} añadida a extracciones.csv")
    nombre = cafes[fila["cafe_id"]]["nombre"] or fila["cafe_id"]
    print(f'Commit:  git commit -am "#{fila["id"]} {nombre}: {fila["variable_cambiada"]}"')
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelado.")
        sys.exit(1)
