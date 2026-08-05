#!/usr/bin/env python3
"""Catálogo de recetas y escalado de vertidos.

`fases_g` guarda los gramos de cada vertido, y su suma es el agua de
referencia. Escalar por el agua real hace la receta independiente de la dosis:
60-60-90-90 sobre 300 g son 54-54-81-81 sobre 270 g.
"""
from comun import RECETAS, leer_csv


def cargar_recetas(ruta=RECETAS):
    """Diccionario id -> fila de recetas.csv."""
    _, filas = leer_csv(ruta)
    return {r["id"]: r for r in filas}


def validar_receta_id(valor, recetas):
    """La receta_id debe existir en recetas.csv."""
    receta_id = str(valor).strip()
    if receta_id not in recetas:
        raise ValueError(
            f"receta_id desconocida: {receta_id!r}. Válidas: {', '.join(sorted(recetas))}"
        )
    return receta_id


def escalar_fases(fases_g, agua_g):
    """Vertidos escalados al agua real. La suma cuadra exactamente con el agua."""
    partes = [p for p in str(fases_g).split("-") if p.strip() != ""]
    if not partes:
        raise ValueError(f"fases_g vacío: {fases_g!r}")
    try:
        partes = [float(p) for p in partes]
    except ValueError:
        raise ValueError(f"fases_g debe ser números separados por guiones: {fases_g!r}") from None

    referencia = sum(partes)
    if referencia <= 0:
        raise ValueError(f"fases_g debe sumar más que 0: {fases_g!r}")

    agua = float(str(agua_g).replace(",", "."))
    if agua <= 0:
        raise ValueError(f"El agua debe ser mayor que 0: {agua_g!r}")

    escaladas = [round(parte * agua / referencia) for parte in partes]
    # El redondeo puede desviar algún gramo: se ajusta en el último vertido.
    escaladas[-1] += round(agua) - sum(escaladas)
    return escaladas


def formatear_fases(fases):
    """Lista de gramos -> '60-60-90-90'."""
    return "-".join(str(f) for f in fases)


def reparto_de(receta, agua_g):
    """Reparto listo para guardar en extracciones.csv."""
    return formatear_fases(escalar_fases(receta["fases_g"], agua_g))


def acumulado(fases):
    """Gramos acumulados tras cada vertido. Para el countdown de la app."""
    total = 0
    suma = []
    for fase in fases:
        total += fase
        suma.append(total)
    return suma
