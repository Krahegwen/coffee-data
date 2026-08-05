#!/usr/bin/env python3
"""Qué cambiar en la próxima extracción.

Dos capas, y ninguna es un modelo estadístico:

1. Reglas fijas, la tabla de palancas del README más el goteo. Sirven desde la
   segunda extracción.
2. Deltas emparejados: como el protocolo cambia una sola variable entre
   extracciones, cada par consecutivo del mismo café es una comparación
   controlada. Eso es lo que hay que leer, no una regresión sobre variables
   que nunca se movieron a la vez.
"""
from collections import defaultdict

# Umbrales de partida, no verdades reveladas: están aquí para calibrarlos con
# tus propios datos cuando haya extracciones suficientes.
DRAWDOWN_LARGO_S = 75
DRAWDOWN_CORTO_S = 30
NOTA_BUENA = 8
DIAS_TUESTE_VIEJO = 60

# Un par emparejado es una anécdota; dos empiezan a ser una tendencia.
MINIMO_PARES = 2

# Variables que el protocolo considera "la variable cambiada".
VARIABLES = (
    "temp_c", "clics", "dosis_g", "agua_g", "reparto", "receta_id", "molinillo",
    "dripper",
)

# Drippers con masa térmica: sin precalentar roban calor al lecho, así que el
# mismo temp_c de hervidor no da la misma temperatura de extracción.
DRIPPERS_CON_INERCIA = ("v60-02-ceramica",)

# defecto -> palancas, la primera es la principal. En un Comandante los clics se
# cuentan desde cerrado: más clics es moler más grueso.
PALANCAS = {
    "amargor": [
        ("clics", "+2", "sobreextracción: moler más grueso"),
        ("temp_c", "-3", "o bajar la temperatura"),
    ],
    "astringente": [
        ("clics", "+3", "la astringencia casi siempre es molienda demasiado fina"),
    ],
    "plano": [
        ("clics", "-2", "subextracción: moler más fino"),
        ("temp_c", "+3", "o subir la temperatura"),
    ],
    "agrio": [
        ("temp_c", "+3", "subextracción: subir la temperatura"),
        ("clics", "-2", "o moler más fino"),
    ],
    "salado": [
        ("clics", "-2", "subextracción: moler más fino"),
        ("dosis_g", "+1", "o subir la dosis"),
    ],
    "carton": [
        ("clics", "-2", "si el café está fresco, moler más fino"),
    ],
    "equilibrado": [],
}


def num(valor):
    """Número o None. Los CSV devuelven cadenas y las filas nuevas, enteros."""
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


# --- capa 1: reglas ----------------------------------------------------------

def avisos_de(extraccion, historico=()):
    """Cosas que mirar antes de tocar la receta."""
    avisos = []

    if extraccion.get("dripper") in DRIPPERS_CON_INERCIA:
        avisos.append(
            "dripper con masa térmica: si no lo precalentaste, la temperatura "
            "real del lecho fue menor que los grados del hervidor"
        )

    anteriores = [
        e for e in historico
        if e.get("cafe_id") == extraccion.get("cafe_id")
        and str(e.get("id")) != str(extraccion.get("id"))
    ]
    if anteriores and anteriores[-1].get("dripper") != extraccion.get("dripper"):
        avisos.append(
            f"has cambiado de dripper ({anteriores[-1].get('dripper')} -> "
            f"{extraccion.get('dripper')}): esa es la variable de esta extracción, "
            "no compares el resto"
        )

    dias = num(extraccion.get("dias_tueste"))
    if dias is not None and dias > DIAS_TUESTE_VIEJO:
        avisos.append(
            f"el café lleva {dias:.0f} días de tueste: por encima de "
            f"{DIAS_TUESTE_VIEJO} la taza se apaga sola y la receta no tiene la culpa"
        )
    if extraccion.get("defecto") == "carton" and (dias is None or dias > DIAS_TUESTE_VIEJO):
        avisos.append("a cartón casi siempre es café pasado, no extracción")

    return avisos


def cambios_de(extraccion):
    """Palancas a mover, la primera es la principal."""
    cambios = []

    goteo = num(extraccion.get("drawdown_s"))
    if goteo is not None:
        if goteo > DRAWDOWN_LARGO_S:
            cambios.append({
                "variable": "clics",
                "cambio": "+2",
                "porque": f"el goteo tardó {goteo:.0f} s (más de {DRAWDOWN_LARGO_S}): "
                          "la molienda está atascando el filtro",
            })
        elif goteo < DRAWDOWN_CORTO_S:
            cambios.append({
                "variable": "clics",
                "cambio": "-2",
                "porque": f"el goteo tardó {goteo:.0f} s (menos de {DRAWDOWN_CORTO_S}): "
                          "el agua pasa de largo",
            })

    for variable, cambio, porque in PALANCAS.get(extraccion.get("defecto"), []):
        if any(c["variable"] == variable for c in cambios):
            continue
        cambios.append({"variable": variable, "cambio": cambio, "porque": porque})

    return cambios


# --- capa 2: deltas emparejados ----------------------------------------------

def pares(historico):
    """Extracciones consecutivas del mismo café que cambian una sola variable."""
    por_cafe = defaultdict(list)
    for extraccion in historico:
        por_cafe[extraccion.get("cafe_id")].append(extraccion)

    emparejados = []
    for extracciones in por_cafe.values():
        for antes, despues in zip(extracciones, extracciones[1:]):
            distintas = [
                v for v in VARIABLES if str(antes.get(v, "")) != str(despues.get(v, ""))
            ]
            if len(distintas) != 1:
                continue
            nota_antes, nota_despues = num(antes.get("nota")), num(despues.get("nota"))
            if nota_antes is None or nota_despues is None:
                continue

            variable = distintas[0]
            valor_antes, valor_despues = num(antes.get(variable)), num(despues.get(variable))
            if valor_antes is not None and valor_despues is not None:
                direccion = "subir" if valor_despues > valor_antes else "bajar"
            else:
                direccion = "cambiar"

            emparejados.append({
                "cafe_id": despues.get("cafe_id"),
                "variable": variable,
                "direccion": direccion,
                "delta_nota": nota_despues - nota_antes,
            })
    return emparejados


def efectos(historico, minimo=MINIMO_PARES):
    """Efecto medio en la nota de mover cada variable, con los pares suficientes."""
    grupos = defaultdict(list)
    for par in pares(historico):
        grupos[(par["variable"], par["direccion"])].append(par["delta_nota"])

    return {
        clave: {"media": sum(deltas) / len(deltas), "casos": len(deltas)}
        for clave, deltas in grupos.items()
        if len(deltas) >= minimo
    }


# --- cobertura ---------------------------------------------------------------

def cobertura(cafe_id, historico):
    """Qué valores ya has probado con este café."""
    probado = {}
    for variable in ("temp_c", "clics", "receta_id"):
        valores = {
            str(e.get(variable))
            for e in historico
            if e.get("cafe_id") == cafe_id and str(e.get(variable, "")).strip()
        }
        probado[variable] = sorted(valores)
    return probado


# --- salida ------------------------------------------------------------------

def sugerir(extraccion, historico=()):
    """Todo junto: avisos, palancas, efectos observados y cobertura."""
    historico = list(historico)
    return {
        "avisos": avisos_de(extraccion, historico),
        "cambios": cambios_de(extraccion),
        "efectos": efectos(historico),
        "cobertura": cobertura(extraccion.get("cafe_id"), historico),
        "conforme": (
            extraccion.get("defecto") == "equilibrado"
            and (num(extraccion.get("nota")) or 0) >= NOTA_BUENA
        ),
    }


def texto_corto(sugerencia):
    """La sugerencia principal, para meterla en siguiente_ajuste."""
    if sugerencia["conforme"] and not sugerencia["cambios"]:
        return "Repetir igual para confirmar"
    if not sugerencia["cambios"]:
        return ""
    principal = sugerencia["cambios"][0]
    return f"{principal['variable']} {principal['cambio']}"


def formatear(sugerencia):
    """Bloque de texto para imprimir tras guardar."""
    lineas = ["SUGERENCIAS"]

    for aviso in sugerencia["avisos"]:
        lineas.append(f"  Aviso: {aviso}")

    if sugerencia["conforme"] and not sugerencia["cambios"]:
        lineas.append("  Equilibrado y con buena nota: no toques nada, repite para confirmar.")
    elif sugerencia["cambios"]:
        lineas.append("  Cambia UNA sola cosa:")
        for numero, cambio in enumerate(sugerencia["cambios"], 1):
            lineas.append(
                f"    {numero}. {cambio['variable']:<8} {cambio['cambio']:<4} {cambio['porque']}"
            )
    else:
        lineas.append("  Sin defecto claro que corregir.")

    for (variable, direccion), efecto in sorted(sugerencia["efectos"].items()):
        signo = "+" if efecto["media"] >= 0 else ""
        lineas.append(
            f"  Observado: {direccion} {variable} movió la nota {signo}{efecto['media']:.1f} "
            f"de media ({efecto['casos']} casos)"
        )

    probado = sugerencia["cobertura"]
    resumen = " · ".join(
        f"{variable} {', '.join(valores)}" for variable, valores in probado.items() if valores
    )
    if resumen:
        lineas.append(f"  Ya probado con este café: {resumen}")

    return "\n".join(lineas)
