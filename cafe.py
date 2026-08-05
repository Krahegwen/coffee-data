#!/usr/bin/env python3
"""Da de alta una bolsa en cafes.csv.

Interactivo:  python cafe.py
Un comando:   python cafe.py --id etiopia --nombre "Etiopía Guji" \
                  --tostador "Manea Coffee" --tueste 2026-08-01
"""
import argparse
import re
import sys

from comun import (
    CAFES,
    actualizar_fila,
    agregar_fila,
    confirmar,
    leer_csv,
    mostrar_resumen,
    preguntar,
    validar_fecha,
    validar_numero,
    validar_opcion,
)

ESTADOS = ["abierto", "terminado", "pendiente"]
ESTADO_BASE = "abierto"

# El id va en los mensajes de commit y en cada fila de extracciones.csv:
# minúsculas, sin espacios ni acentos.
FORMATO_ID = re.compile(r"^[a-z0-9][a-z0-9_-]*$")

CAMPOS_CLI = (
    "id", "nombre", "tostador", "origen", "region", "variedad", "proceso",
    "altitud", "sca", "tueste", "consumir_antes", "peso", "precio",
    "notas_tostador", "estado", "compra", "recepcion", "foto", "url",
    "conservacion",
)
OBLIGATORIOS_CLI = ("id", "nombre")

# Flag -> columna. El id no está: es la clave a la que apuntan las extracciones.
CAMPO_A_COLUMNA = {
    "nombre": "nombre", "tostador": "tostador", "origen": "origen",
    "region": "region", "variedad": "variedad", "proceso": "proceso",
    "altitud": "altitud_m", "sca": "sca", "tueste": "fecha_tueste",
    "consumir_antes": "consumir_antes", "peso": "peso_g", "precio": "precio_eur",
    "notas_tostador": "notas_tostador", "estado": "estado",
    "compra": "fecha_compra", "recepcion": "fecha_recepcion", "foto": "foto",
    "url": "url", "conservacion": "conservacion",
}


def validar_id(valor, cafes):
    """El id tiene que ser un identificador limpio y no estar ya usado."""
    cafe_id = str(valor).strip()
    if not FORMATO_ID.match(cafe_id):
        raise ValueError(
            f"id inválido: {valor!r}. Solo minúsculas, números, guion y guion bajo."
        )
    if cafe_id in cafes:
        raise ValueError(f"ya existe un café con id {cafe_id!r}")
    return cafe_id


def validar_estado(valor):
    """El estado debe ser uno de los valores permitidos."""
    return validar_opcion(valor, ESTADOS, "estado")


def opcional(valor, validador):
    """Aplica el validador solo si hay valor; si no, cadena vacía."""
    if valor is None or str(valor).strip() == "":
        return ""
    return validador(valor)


VALIDADORES = {
    "altitud_m": validar_numero,
    "sca": validar_numero,
    "peso_g": validar_numero,
    "precio_eur": validar_numero,
    "fecha_tueste": validar_fecha,
    "consumir_antes": validar_fecha,
    "fecha_compra": validar_fecha,
    "fecha_recepcion": validar_fecha,
    "estado": validar_estado,
}


def construir_cambios(args):
    """Solo las columnas cuyo flag se ha pasado. Un flag vacío borra el valor."""
    if args.id is not None:
        raise ValueError(
            "el id no se puede cambiar: es la clave a la que apuntan las extracciones"
        )
    cambios = {}
    for campo, columna in CAMPO_A_COLUMNA.items():
        valor = getattr(args, campo)
        if valor is None:
            continue
        cambios[columna] = opcional(valor, VALIDADORES[columna]) if columna in VALIDADORES else valor
    if not cambios:
        raise ValueError("--editar necesita al menos un campo que cambiar")
    return cambios


def construir_fila(args, cafes):
    """Fila completa a partir de los argumentos de línea de comandos."""
    faltan = [f"--{c}" for c in OBLIGATORIOS_CLI if getattr(args, c) is None]
    if faltan:
        raise ValueError(f"faltan argumentos obligatorios: {', '.join(faltan)}")

    return {
        "id": validar_id(args.id, cafes),
        "nombre": args.nombre.strip(),
        "tostador": args.tostador or "",
        "origen": args.origen or "",
        "region": args.region or "",
        "variedad": args.variedad or "",
        "proceso": args.proceso or "",
        "altitud_m": opcional(args.altitud, validar_numero),
        "sca": opcional(args.sca, validar_numero),
        "fecha_tueste": opcional(args.tueste, validar_fecha),
        "consumir_antes": opcional(args.consumir_antes, validar_fecha),
        "peso_g": opcional(args.peso, validar_numero),
        "precio_eur": opcional(args.precio, validar_numero),
        "notas_tostador": args.notas_tostador or "",
        "estado": validar_estado(args.estado or ESTADO_BASE),
        "fecha_compra": opcional(args.compra, validar_fecha),
        "fecha_recepcion": opcional(args.recepcion, validar_fecha),
        "foto": args.foto or "",
        "url": args.url or "",
        "conservacion": args.conservacion or "",
    }


def preguntar_fila(cafes):
    """Fila completa preguntando campo a campo. Casi todo es opcional."""
    print("\nNueva bolsa. Deja en blanco lo que no sepas.\n")
    fila = {}
    fila["id"] = preguntar("id (minúsculas, sin espacios)", validador=lambda v: validar_id(v, cafes))
    fila["nombre"] = preguntar("nombre")
    fila["tostador"] = preguntar("tostador", obligatorio=False)
    fila["origen"] = preguntar("origen", obligatorio=False)
    fila["region"] = preguntar("region", obligatorio=False)
    fila["variedad"] = preguntar("variedad", obligatorio=False)
    fila["proceso"] = preguntar("proceso", obligatorio=False)
    fila["altitud_m"] = preguntar("altitud_m", validador=validar_numero, obligatorio=False)
    fila["sca"] = preguntar("sca", validador=validar_numero, obligatorio=False)
    fila["fecha_tueste"] = preguntar("fecha_tueste (AAAA-MM-DD)", validador=validar_fecha, obligatorio=False)
    fila["consumir_antes"] = preguntar("consumir_antes (AAAA-MM-DD)", validador=validar_fecha, obligatorio=False)
    fila["peso_g"] = preguntar("peso_g", validador=validar_numero, obligatorio=False)
    fila["precio_eur"] = preguntar("precio_eur", validador=validar_numero, obligatorio=False)
    fila["notas_tostador"] = preguntar("notas_tostador", obligatorio=False)
    fila["estado"] = preguntar(f"estado ({', '.join(ESTADOS)})", ESTADO_BASE, validar_estado)
    fila["fecha_compra"] = preguntar("fecha_compra (AAAA-MM-DD)", validador=validar_fecha, obligatorio=False)
    fila["fecha_recepcion"] = preguntar("fecha_recepcion (AAAA-MM-DD)", validador=validar_fecha, obligatorio=False)
    fila["foto"] = preguntar("foto (ruta, p. ej. fotos/abbie.jpg)", obligatorio=False)
    fila["url"] = preguntar("url de la ficha del tostador", obligatorio=False)
    fila["conservacion"] = preguntar("conservacion (bolsa, tarro de vacío...)", obligatorio=False)
    return fila


def parsear_argumentos(argv=None):
    parser = argparse.ArgumentParser(
        prog="cafe.py",
        description="Da de alta una bolsa en cafes.csv.",
        epilog="Sin argumentos, pregunta campo a campo. Solo --id y --nombre son "
               "obligatorios: lo que no sepas se queda vacío.",
    )
    parser.add_argument("--id", help="identificador corto, el que usarás en --cafe")
    parser.add_argument("--nombre", help="nombre de la bolsa")
    parser.add_argument("--tostador")
    parser.add_argument("--origen")
    parser.add_argument("--region")
    parser.add_argument("--variedad")
    parser.add_argument("--proceso", help="lavado, natural, honey...")
    parser.add_argument("--altitud", help="altitud en metros")
    parser.add_argument("--sca", help="puntuación SCA")
    parser.add_argument("--tueste", help="fecha de tueste, AAAA-MM-DD")
    parser.add_argument("--consumir-antes", dest="consumir_antes", help="AAAA-MM-DD")
    parser.add_argument("--peso", help="peso de la bolsa en gramos")
    parser.add_argument("--precio", help="precio en euros")
    parser.add_argument("--notas-tostador", dest="notas_tostador")
    parser.add_argument("--estado", help=f"{', '.join(ESTADOS)} (por defecto, {ESTADO_BASE})")
    parser.add_argument("--compra", help="fecha de compra, AAAA-MM-DD")
    parser.add_argument("--recepcion", help="fecha de recepción, AAAA-MM-DD")
    parser.add_argument("--foto", help="ruta de la foto, p. ej. fotos/abbie.jpg")
    parser.add_argument("--url", help="ficha del tostador")
    parser.add_argument("--conservacion", help="dónde está el café: bolsa, tarro de vacío...")
    parser.add_argument(
        "--editar", metavar="ID",
        help="corrige una ficha ya existente con los flags que le pases",
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="muestra la fila sin escribirla"
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parsear_argumentos(argv)
    columnas, filas = leer_csv(CAFES)
    cafes = {c["id"]: c for c in filas}

    if args.editar:
        try:
            if args.editar not in cafes:
                raise ValueError(
                    f"no existe ningún café con id {args.editar!r}. "
                    f"Hay: {', '.join(sorted(cafes))}"
                )
            cambios = construir_cambios(args)
        except ValueError as error:
            print(f"cafe.py: {error}", file=sys.stderr)
            return 2

        mostrar_resumen({**cafes[args.editar], **cambios}, columnas)
        if args.dry_run:
            print("\n--dry-run: no se ha escrito nada.")
            return 0
        actualizar_fila(args.editar, cambios, CAFES)
        print(f"\nFicha de {args.editar!r} actualizada: {', '.join(sorted(cambios))}")
        print(f'Commit:  git commit -am "Actualizar ficha de {cafes[args.editar]["nombre"]}"')
        return 0

    interactivo = all(getattr(args, campo) is None for campo in CAMPOS_CLI)
    if interactivo:
        fila = preguntar_fila(cafes)
    else:
        try:
            fila = construir_fila(args, cafes)
        except ValueError as error:
            print(f"cafe.py: {error}", file=sys.stderr)
            return 2

    mostrar_resumen(fila, columnas)

    if args.dry_run:
        print("\n--dry-run: no se ha escrito nada.")
        return 0
    if interactivo and not confirmar():
        print("No se ha guardado nada.")
        return 1

    agregar_fila(fila, CAFES)
    print(f"\nCafé {fila['id']!r} añadido a cafes.csv")
    print(f'Commit:  git commit -am "Nuevo café: {fila["nombre"]}"')
    print(f"Ya puedes usarlo:  python nueva.py --cafe {fila['id']} ...")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nCancelado.")
        sys.exit(1)
