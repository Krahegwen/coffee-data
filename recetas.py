#!/usr/bin/env python3
"""Catálogo de recetas y sus pasos.

Una receta es una lista de pasos, no solo una lista de vertidos: agitar, meter
la cuchara o esperar el goteo son pasos sin agua, y hacen falta para guiar una
extracción de verdad.

Solo los pasos `verter` llevan gramos y solo ellos escalan con el agua: la suma
de los vertidos es el agua de referencia, así que 60-60-90-90 sobre 300 g son
54-54-81-81 sobre 270 g. Los tiempos no se tocan.

Cada acción se comporta distinto frente a una báscula, y eso importa cuando la
app la lea:

    verter   el peso sube; el objetivo es acumulado ("hasta 120 g")
    agitar   el peso hace ruido; hay que ignorar la báscula
    remover  el peso SUBE, la cuchara pesa mientras está dentro; ignorar
    esperar  el peso hace meseta; la meseta es el fin del goteo
    retirar  el peso cae de golpe; la caída marca el fin de la extracción
"""
from collections import defaultdict

from comun import PASOS, RECETAS, leer_csv, validar_opcion

ACCIONES = ["verter", "agitar", "remover", "esperar", "retirar"]

# La única acción que lleva agua y, por tanto, la única que escala.
CON_AGUA = "verter"

# Acciones durante las que la lectura de la báscula no es de fiar.
SIN_LECTURA_FIABLE = ("agitar", "remover")


def cargar_recetas(ruta=RECETAS):
    """Diccionario id -> fila de recetas.csv."""
    _, filas = leer_csv(ruta)
    return {r["id"]: r for r in filas}


def cargar_pasos(ruta=PASOS):
    """Diccionario receta_id -> lista de pasos, ordenada."""
    _, filas = leer_csv(ruta)
    por_receta = defaultdict(list)
    for fila in filas:
        por_receta[fila["receta_id"]].append(fila)
    for pasos in por_receta.values():
        pasos.sort(key=lambda p: int(p["orden"]))
    return dict(por_receta)


def validar_receta_id(valor, recetas):
    """La receta_id debe existir en recetas.csv."""
    receta_id = str(valor).strip()
    if receta_id not in recetas:
        raise ValueError(
            f"receta_id desconocida: {receta_id!r}. Válidas: {', '.join(sorted(recetas))}"
        )
    return receta_id


def validar_accion(valor):
    """La acción debe ser una de las conocidas."""
    return validar_opcion(valor, ACCIONES, "accion")


def vertidos(pasos):
    """Solo los pasos que llevan agua."""
    return [p for p in pasos if p["accion"] == CON_AGUA]


def escalar(gramos, agua_g):
    """Escala una lista de gramos para que sume exactamente el agua."""
    if not gramos:
        raise ValueError("No hay ningún vertido que escalar")

    referencia = sum(gramos)
    if referencia <= 0:
        raise ValueError("Los vertidos deben sumar más que 0")

    agua = float(str(agua_g).replace(",", "."))
    if agua <= 0:
        raise ValueError(f"El agua debe ser mayor que 0: {agua_g!r}")

    escalados = [round(g * agua / referencia) for g in gramos]
    # El redondeo puede desviar algún gramo: se ajusta en el último vertido.
    escalados[-1] += round(agua) - sum(escalados)
    return escalados


def escalar_pasos(pasos, agua_g):
    """Los pasos con los vertidos escalados al agua real."""
    salida = [dict(paso) for paso in pasos]
    indices = [i for i, paso in enumerate(salida) if paso["accion"] == CON_AGUA]
    if not indices:
        raise ValueError("La receta no tiene ningún vertido")

    try:
        gramos = [float(salida[i]["agua_g"]) for i in indices]
    except (TypeError, ValueError):
        raise ValueError("Hay un vertido sin gramos válidos") from None

    for indice, escalado in zip(indices, escalar(gramos, agua_g)):
        salida[indice]["agua_g"] = escalado
    return salida


def reparto_de(pasos, agua_g):
    """Reparto listo para guardar en extracciones.csv: '60-60-90-90'."""
    return "-".join(str(p["agua_g"]) for p in vertidos(escalar_pasos(pasos, agua_g)))


def guion(pasos, agua_g):
    """Los pasos con el agua escalada y el acumulado. Para el countdown."""
    total = 0
    salida = []
    for paso in escalar_pasos(pasos, agua_g):
        total += float(paso["agua_g"] or 0)
        salida.append({
            "orden": int(paso["orden"]),
            "t_inicio_s": int(paso["t_inicio_s"]) if str(paso["t_inicio_s"]).strip() else None,
            "accion": paso["accion"],
            "agua_g": paso["agua_g"],
            "acumulado_g": round(total),
            "lectura_fiable": paso["accion"] not in SIN_LECTURA_FIABLE,
            "notas": paso["notas"],
        })
    return salida
