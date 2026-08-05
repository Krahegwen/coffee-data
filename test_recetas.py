"""Tests de recetas.py. Uso: python -m pytest"""
import pytest

import recetas

CATALOGO = {
    "kasuya-46-base": {"id": "kasuya-46-base", "fases_g": "60-60-90-90"},
    "kasuya-46-claridad": {"id": "kasuya-46-claridad", "fases_g": "60-60-60-60-60"},
}


# --- validación --------------------------------------------------------------

def test_receta_valida():
    assert recetas.validar_receta_id(" kasuya-46-base ", CATALOGO) == "kasuya-46-base"


def test_receta_desconocida():
    with pytest.raises(ValueError):
        recetas.validar_receta_id("chemex", CATALOGO)


# --- escalado ----------------------------------------------------------------

def test_escalar_no_cambia_nada_con_el_agua_de_referencia():
    assert recetas.escalar_fases("60-60-90-90", 300) == [60, 60, 90, 90]


def test_escalar_reparte_proporcionalmente():
    assert recetas.escalar_fases("60-60-90-90", 270) == [54, 54, 81, 81]


@pytest.mark.parametrize("agua", [150, 225, 270, 300, 333, 450, 500])
def test_escalar_siempre_suma_el_agua(agua):
    assert sum(recetas.escalar_fases("60-60-90-90", agua)) == agua


@pytest.mark.parametrize("agua", [175, 260, 301, 410])
def test_escalar_cuadra_tambien_con_cinco_vertidos(agua):
    assert sum(recetas.escalar_fases("60-60-60-60-60", agua)) == agua


def test_escalar_mantiene_el_numero_de_vertidos():
    assert len(recetas.escalar_fases("50-70-90-90", 265)) == 4


@pytest.mark.parametrize("fases", ["", "-", "60-x-90", "0-0"])
def test_escalar_rechaza_fases_invalidas(fases):
    with pytest.raises(ValueError):
        recetas.escalar_fases(fases, 300)


def test_escalar_rechaza_agua_no_positiva():
    with pytest.raises(ValueError):
        recetas.escalar_fases("60-60-90-90", 0)


# --- formato y acumulado -----------------------------------------------------

def test_reparto_de_devuelve_la_cadena_del_csv():
    assert recetas.reparto_de(CATALOGO["kasuya-46-base"], 300) == "60-60-90-90"
    assert recetas.reparto_de(CATALOGO["kasuya-46-base"], 270) == "54-54-81-81"


def test_acumulado_para_el_countdown():
    assert recetas.acumulado([60, 60, 90, 90]) == [60, 120, 210, 300]


# --- catálogo real -----------------------------------------------------------

def test_el_catalogo_del_repo_se_carga_y_escala():
    catalogo = recetas.cargar_recetas()
    assert "kasuya-46-base" in catalogo
    for receta in catalogo.values():
        assert sum(recetas.escalar_fases(receta["fases_g"], 300)) == 300
