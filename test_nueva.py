"""Tests de nueva.py. Uso: python -m pytest"""
from datetime import date

import pytest

import nueva

HOY = date(2026, 8, 5)

CAFES = {
    "gary": {"id": "gary", "nombre": "Gary", "fecha_tueste": "2026-05-20"},
    "descafeinado": {"id": "descafeinado", "nombre": "Descafeinado", "fecha_tueste": ""},
}

CATALOGO = {
    "kasuya-46-base": {"id": "kasuya-46-base", "fases_g": "60-60-90-90"},
    "kasuya-46-claridad": {"id": "kasuya-46-claridad", "fases_g": "60-60-60-60-60"},
}

EXTRACCIONES = [{"id": "1"}]


def argumentos(*extra):
    """Los flags obligatorios, más lo que se le añada (lo último gana)."""
    base = [
        "--cafe", "gary", "--temp", "91", "--clics", "28", "--tiempo", "3:30",
        "--variable", "91 °C", "--defecto", "equilibrado", "--nota", "8",
    ]
    return nueva.parsear_argumentos(base + list(extra))


# --- cálculo de días ---------------------------------------------------------

def test_dias_tueste_cuenta_desde_la_fecha_de_tueste():
    assert nueva.calcular_dias_tueste("2026-05-20", HOY) == 77


def test_dias_tueste_es_cero_el_mismo_dia_del_tueste():
    assert nueva.calcular_dias_tueste("2026-08-05", HOY) == 0


def test_dias_tueste_vacio_si_el_cafe_no_tiene_fecha():
    assert nueva.calcular_dias_tueste("", HOY) == ""


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


# --- id autoincremental ------------------------------------------------------

def test_siguiente_id_continua_la_serie():
    assert nueva.siguiente_id([{"id": "1"}, {"id": "2"}]) == 3
    assert nueva.siguiente_id([]) == 1


# --- modo no interactivo -----------------------------------------------------

def test_fila_desde_flags_calcula_los_tres_campos():
    fila = nueva.construir_fila(argumentos(), CAFES, CATALOGO, EXTRACCIONES, HOY)
    assert fila["id"] == 2
    assert fila["dias_tueste"] == 77
    assert fila["ratio"] == "15.0"


def test_fila_desde_flags_aplica_la_receta_base():
    fila = nueva.construir_fila(argumentos(), CAFES, CATALOGO, EXTRACCIONES, HOY)
    assert fila["fecha"] == "2026-08-05"
    assert fila["dosis_g"] == "20"
    assert fila["agua_g"] == "300"
    assert fila["molinillo"] == "Comandante C40"
    assert fila["metodo"] == "V60 4:6 Kasuya"
    assert fila["reparto"] == "60-60-90-90"
    assert fila["notas_cata"] == ""
    assert fila["receta_id"] == "kasuya-46-base"
    assert fila["drawdown_s"] == ""


def test_fila_desde_flags_tiene_las_columnas_del_csv_real():
    columnas, _ = nueva.leer_csv(nueva.EXTRACCIONES)
    fila = nueva.construir_fila(argumentos(), CAFES, CATALOGO, EXTRACCIONES, HOY)
    assert sorted(fila) == sorted(columnas)


def test_fila_desde_flags_admite_sobrescribir_los_defectos():
    fila = nueva.construir_fila(
        argumentos("--dosis", "18", "--reparto", "50-70-90-90", "--fecha", "2026-08-04"),
        CAFES, CATALOGO, EXTRACCIONES, HOY,
    )
    assert fila["dosis_g"] == "18"
    assert fila["ratio"] == "16.7"
    assert fila["reparto"] == "50-70-90-90"
    assert fila["fecha"] == "2026-08-04"
    # dias_tueste se cuenta siempre desde hoy, no desde --fecha
    assert fila["dias_tueste"] == 77


def test_fila_desde_flags_exige_los_obligatorios():
    args = nueva.parsear_argumentos(["--cafe", "gary"])
    with pytest.raises(ValueError, match="obligatorios"):
        nueva.construir_fila(args, CAFES, CATALOGO, EXTRACCIONES, HOY)


def test_el_reparto_sale_de_la_receta_escalada_al_agua():
    fila = nueva.construir_fila(
        argumentos("--agua", "270"), CAFES, CATALOGO, EXTRACCIONES, HOY
    )
    assert fila["reparto"] == "54-54-81-81"


def test_otra_receta_cambia_el_reparto():
    fila = nueva.construir_fila(
        argumentos("--receta", "kasuya-46-claridad"), CAFES, CATALOGO, EXTRACCIONES, HOY
    )
    assert fila["receta_id"] == "kasuya-46-claridad"
    assert fila["reparto"] == "60-60-60-60-60"


def test_el_reparto_explicito_manda_sobre_la_receta():
    fila = nueva.construir_fila(
        argumentos("--reparto", "70-50-90-90"), CAFES, CATALOGO, EXTRACCIONES, HOY
    )
    assert fila["reparto"] == "70-50-90-90"


def test_drawdown_se_guarda_como_entero():
    fila = nueva.construir_fila(
        argumentos("--drawdown", "42"), CAFES, CATALOGO, EXTRACCIONES, HOY
    )
    assert fila["drawdown_s"] == 42


@pytest.mark.parametrize("valor", ["-1", "medio minuto", "1:05"])
def test_drawdown_invalido(valor):
    with pytest.raises(ValueError):
        nueva.validar_drawdown(valor)


@pytest.mark.parametrize(
    "extra",
    [
        ("--cafe", "etiopia"),
        ("--nota", "12"),
        ("--defecto", "quemado"),
        ("--temp", "caliente"),
        ("--receta", "chemex"),
        ("--drawdown", "-5"),
    ],
)
def test_fila_desde_flags_propaga_las_validaciones(extra):
    with pytest.raises(ValueError):
        nueva.construir_fila(argumentos(*extra), CAFES, CATALOGO, EXTRACCIONES, HOY)
