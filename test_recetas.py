"""Tests de recetas.py. Uso: python -m pytest"""
import pytest

import recetas

CATALOGO = {
    "kasuya-46-base": {"id": "kasuya-46-base", "ratio": "15"},
    "kasuya-46-claridad": {"id": "kasuya-46-claridad", "ratio": "15"},
}


def paso(orden, accion, agua_g, t_inicio_s="", notas=""):
    return {
        "receta_id": "kasuya-46-base", "orden": str(orden),
        "t_inicio_s": str(t_inicio_s), "accion": accion,
        "agua_g": str(agua_g), "notas": notas,
    }


BASE = [
    paso(1, "verter", 60, 0),
    paso(2, "verter", 60, 45),
    paso(3, "verter", 90, 90),
    paso(4, "verter", 90, 135),
    paso(5, "esperar", 0, 180),
    paso(6, "retirar", 0),
]

CON_AGITACION = [
    paso(1, "verter", 60, 0),
    paso(2, "agitar", 0, 30),
    paso(3, "verter", 60, 45),
    paso(4, "remover", 0, 60),
    paso(5, "verter", 180, 90),
]


# --- validación --------------------------------------------------------------

def test_receta_valida():
    assert recetas.validar_receta_id(" kasuya-46-base ", CATALOGO) == "kasuya-46-base"


def test_receta_desconocida():
    with pytest.raises(ValueError):
        recetas.validar_receta_id("chemex", CATALOGO)


@pytest.mark.parametrize("accion", recetas.ACCIONES)
def test_acciones_conocidas(accion):
    assert recetas.validar_accion(accion.upper()) == accion


def test_accion_inventada():
    with pytest.raises(ValueError):
        recetas.validar_accion("bailar")


# --- escalado ----------------------------------------------------------------

def test_escalar_no_cambia_nada_con_el_agua_de_referencia():
    assert recetas.reparto_de(BASE, 300) == "60-60-90-90"


def test_escalar_reparte_proporcionalmente():
    assert recetas.reparto_de(BASE, 270) == "54-54-81-81"


@pytest.mark.parametrize("agua", [150, 225, 270, 300, 333, 450, 500])
def test_los_vertidos_siempre_suman_el_agua(agua):
    escalados = recetas.escalar_pasos(BASE, agua)
    assert sum(p["agua_g"] for p in recetas.vertidos(escalados)) == agua


def test_los_pasos_sin_agua_no_se_tocan():
    escalados = recetas.escalar_pasos(BASE, 270)
    assert [p["accion"] for p in escalados] == [p["accion"] for p in BASE]
    assert escalados[4]["agua_g"] == "0"
    assert escalados[5]["agua_g"] == "0"


def test_los_tiempos_no_se_escalan():
    escalados = recetas.escalar_pasos(BASE, 500)
    assert [p["t_inicio_s"] for p in escalados] == [p["t_inicio_s"] for p in BASE]


def test_escalar_no_muta_los_pasos_originales():
    recetas.escalar_pasos(BASE, 270)
    assert BASE[0]["agua_g"] == "60"


def test_escalar_con_agitacion_solo_toca_los_vertidos():
    escalados = recetas.escalar_pasos(CON_AGITACION, 150)
    assert sum(p["agua_g"] for p in recetas.vertidos(escalados)) == 150
    assert escalados[1]["accion"] == "agitar"
    assert escalados[1]["agua_g"] == "0"


def test_una_receta_sin_vertidos_no_se_puede_escalar():
    with pytest.raises(ValueError, match="ningún vertido"):
        recetas.escalar_pasos([paso(1, "esperar", 0)], 300)


def test_escalar_rechaza_agua_no_positiva():
    with pytest.raises(ValueError):
        recetas.escalar_pasos(BASE, 0)


# --- guion para el countdown -------------------------------------------------

def test_el_guion_lleva_el_acumulado():
    assert [p["acumulado_g"] for p in recetas.guion(BASE, 300)] == [60, 120, 210, 300, 300, 300]


def test_el_guion_marca_donde_no_fiarse_de_la_bascula():
    fiable = {p["accion"]: p["lectura_fiable"] for p in recetas.guion(CON_AGITACION, 300)}
    assert fiable["verter"] is True
    assert fiable["agitar"] is False
    assert fiable["remover"] is False


def test_el_guion_deja_el_tiempo_a_none_cuando_no_lo_hay():
    assert recetas.guion(BASE, 300)[-1]["t_inicio_s"] is None
    assert recetas.guion(BASE, 300)[0]["t_inicio_s"] == 0


# --- catálogo real -----------------------------------------------------------

def test_el_catalogo_del_repo_cuadra():
    catalogo = recetas.cargar_recetas()
    pasos = recetas.cargar_pasos()

    assert set(pasos) <= set(catalogo), "hay pasos de recetas que no existen"
    for receta_id in catalogo:
        assert receta_id in pasos, f"{receta_id} no tiene pasos"
        assert recetas.vertidos(pasos[receta_id]), f"{receta_id} no tiene vertidos"
        for p in pasos[receta_id]:
            recetas.validar_accion(p["accion"])
        assert sum(v["agua_g"] for v in recetas.vertidos(
            recetas.escalar_pasos(pasos[receta_id], 300))) == 300


def test_la_receta_base_del_repo_da_el_reparto_de_siempre():
    pasos = recetas.cargar_pasos()
    assert recetas.reparto_de(pasos["kasuya-46-base"], 300) == "60-60-90-90"
