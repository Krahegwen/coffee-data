"""Tests de nueva.py. Uso: python -m pytest"""
from datetime import date

import pytest

import nueva

CAFES = {
    "gary": {"id": "gary", "nombre": "Gary", "fecha_tueste": "2026-05-20"},
    "descafeinado": {"id": "descafeinado", "nombre": "Descafeinado", "fecha_tueste": ""},
}


# --- cálculo de días ---------------------------------------------------------

def test_dias_tueste_cuenta_desde_la_fecha_de_tueste():
    assert nueva.calcular_dias_tueste("2026-05-20", date(2026, 8, 5)) == 77


def test_dias_tueste_es_cero_el_mismo_dia_del_tueste():
    assert nueva.calcular_dias_tueste("2026-08-05", date(2026, 8, 5)) == 0


def test_dias_tueste_vacio_si_el_cafe_no_tiene_fecha():
    assert nueva.calcular_dias_tueste("", date(2026, 8, 5)) == ""


# --- cálculo del ratio -------------------------------------------------------

def test_ratio_de_la_receta_base():
    assert nueva.calcular_ratio(20, 300) == "15.0"


def test_ratio_redondea_a_un_decimal():
    assert nueva.calcular_ratio(18, 300) == "16.7"


def test_ratio_rechaza_dosis_cero():
    with pytest.raises(ValueError):
        nueva.calcular_ratio(0, 300)


# --- validación: cafe_id existe en cafes.csv ---------------------------------

def test_cafe_id_valido():
    assert nueva.validar_cafe_id(" gary ", CAFES) == "gary"


def test_cafe_id_desconocido():
    with pytest.raises(ValueError):
        nueva.validar_cafe_id("etiopia", CAFES)


# --- validación: nota entre 1 y 10 -------------------------------------------

@pytest.mark.parametrize("valor", ["1", "10", " 7 ", 7])
def test_nota_dentro_de_rango(valor):
    assert 1 <= nueva.validar_nota(valor) <= 10


@pytest.mark.parametrize("valor", ["0", "11", "-3", "siete", "7.5", ""])
def test_nota_invalida(valor):
    with pytest.raises(ValueError):
        nueva.validar_nota(valor)


# --- validación: defecto permitido -------------------------------------------

@pytest.mark.parametrize("valor", nueva.DEFECTOS)
def test_defecto_permitido(valor):
    assert nueva.validar_defecto(valor.upper()) == valor


def test_defecto_no_permitido():
    with pytest.raises(ValueError):
        nueva.validar_defecto("quemado")


# --- escritura ---------------------------------------------------------------

def test_siguiente_id_continua_la_serie():
    assert nueva.siguiente_id([{"id": "1"}, {"id": "2"}]) == 3
    assert nueva.siguiente_id([]) == 1


def test_agregar_fila_respeta_el_orden_de_columnas(tmp_path):
    ruta = tmp_path / "extracciones.csv"
    ruta.write_text("id,fecha,nota\n1,2026-08-05,7\n", encoding="utf-8", newline="")

    nueva.agregar_fila({"nota": 8, "id": 2, "fecha": "2026-08-06"}, ruta)

    assert ruta.read_bytes() == b"id,fecha,nota\n1,2026-08-05,7\n2,2026-08-06,8\n"
