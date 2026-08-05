"""Tests de sugerencias.py. Uso: python -m pytest"""
import pytest

import sugerencias


def extraccion(**campos):
    """Una extracción razonable, con lo que se le cambie encima."""
    base = {
        "id": "1", "cafe_id": "gary", "dias_tueste": "20", "temp_c": "94",
        "clics": "28", "dosis_g": "20", "agua_g": "300", "reparto": "60-60-90-90",
        "receta_id": "kasuya-46-base", "molinillo": "Comandante C40",
        "dripper": "v60-02-plastico",
        "drawdown_s": "", "defecto": "equilibrado", "nota": "7",
    }
    base.update(campos)
    return base


# --- capa 1: palancas por defecto --------------------------------------------

def test_amargor_propone_moler_mas_grueso_primero():
    cambios = sugerencias.cambios_de(extraccion(defecto="amargor"))
    assert cambios[0]["variable"] == "clics"
    assert cambios[0]["cambio"] == "+2"


def test_plano_propone_moler_mas_fino():
    cambios = sugerencias.cambios_de(extraccion(defecto="plano"))
    assert cambios[0]["variable"] == "clics"
    assert cambios[0]["cambio"] == "-2"


def test_agrio_ataca_primero_la_temperatura():
    cambios = sugerencias.cambios_de(extraccion(defecto="agrio"))
    assert cambios[0]["variable"] == "temp_c"
    assert cambios[0]["cambio"] == "+3"


def test_equilibrado_no_propone_nada():
    assert sugerencias.cambios_de(extraccion(defecto="equilibrado")) == []


@pytest.mark.parametrize("defecto", ["amargor", "astringente", "plano", "agrio", "salado", "carton"])
def test_todo_defecto_con_palanca_propone_algo(defecto):
    assert sugerencias.cambios_de(extraccion(defecto=defecto))


# --- capa 1: goteo -----------------------------------------------------------

def test_goteo_largo_manda_sobre_el_defecto():
    cambios = sugerencias.cambios_de(extraccion(defecto="plano", drawdown_s="95"))
    assert cambios[0]["variable"] == "clics"
    assert cambios[0]["cambio"] == "+2"
    assert "95" in cambios[0]["porque"]


def test_goteo_corto_propone_moler_mas_fino():
    cambios = sugerencias.cambios_de(extraccion(drawdown_s="15"))
    assert cambios[0]["cambio"] == "-2"


def test_goteo_normal_no_dice_nada():
    assert sugerencias.cambios_de(extraccion(drawdown_s="50")) == []


def test_no_repite_la_misma_variable_dos_veces():
    cambios = sugerencias.cambios_de(extraccion(defecto="amargor", drawdown_s="95"))
    variables = [c["variable"] for c in cambios]
    assert len(variables) == len(set(variables))


# --- avisos ------------------------------------------------------------------

def test_avisa_de_cafe_pasado():
    avisos = sugerencias.avisos_de(extraccion(dias_tueste="77"))
    assert any("77" in aviso for aviso in avisos)


def test_no_avisa_con_cafe_fresco():
    assert sugerencias.avisos_de(extraccion(dias_tueste="15")) == []


def test_dias_tueste_vacio_no_revienta():
    assert sugerencias.avisos_de(extraccion(dias_tueste="")) == []


# --- avisos de dripper -------------------------------------------------------

def test_avisa_de_la_masa_termica_de_la_ceramica():
    avisos = sugerencias.avisos_de(extraccion(dripper="v60-02-ceramica"))
    assert any("masa térmica" in aviso for aviso in avisos)


def test_el_plastico_no_avisa():
    assert sugerencias.avisos_de(extraccion(dripper="v60-02-plastico")) == []


def test_avisa_al_cambiar_de_dripper():
    anterior = extraccion(id="1", dripper="v60-02-plastico")
    nueva = extraccion(id="2", dripper="v60-02-ceramica")
    avisos = sugerencias.avisos_de(nueva, [anterior, nueva])
    assert any("cambiado de dripper" in aviso for aviso in avisos)


def test_no_avisa_de_cambio_si_repites_dripper():
    anterior = extraccion(id="1", dripper="v60-02-plastico")
    nueva = extraccion(id="2", dripper="v60-02-plastico")
    avisos = sugerencias.avisos_de(nueva, [anterior, nueva])
    assert not any("cambiado de dripper" in aviso for aviso in avisos)


def test_el_dripper_de_otro_cafe_no_cuenta_como_cambio():
    otro = extraccion(id="1", cafe_id="abbie", dripper="v60-02-ceramica")
    nueva = extraccion(id="2", cafe_id="gary", dripper="v60-02-plastico")
    avisos = sugerencias.avisos_de(nueva, [otro, nueva])
    assert not any("cambiado de dripper" in aviso for aviso in avisos)


def test_cambiar_de_dripper_cuenta_como_la_variable_del_par():
    historico = [
        extraccion(id="1", dripper="v60-02-plastico", nota="7"),
        extraccion(id="2", dripper="v60-02-ceramica", nota="8"),
    ]
    par = sugerencias.pares(historico)
    assert len(par) == 1
    assert par[0]["variable"] == "dripper"
    assert par[0]["direccion"] == "cambiar"


# --- capa 2: deltas emparejados ----------------------------------------------

def test_empareja_cuando_cambia_una_sola_variable():
    historico = [
        extraccion(id="1", temp_c="94", nota="7"),
        extraccion(id="2", temp_c="91", nota="8"),
    ]
    par = sugerencias.pares(historico)
    assert len(par) == 1
    assert par[0]["variable"] == "temp_c"
    assert par[0]["direccion"] == "bajar"
    assert par[0]["delta_nota"] == 1


def test_no_empareja_si_cambian_dos_variables():
    historico = [
        extraccion(id="1", temp_c="94", clics="28"),
        extraccion(id="2", temp_c="91", clics="26"),
    ]
    assert sugerencias.pares(historico) == []


def test_no_empareja_extracciones_de_cafes_distintos():
    historico = [
        extraccion(id="1", cafe_id="gary", temp_c="94"),
        extraccion(id="2", cafe_id="abbie", temp_c="91"),
    ]
    assert sugerencias.pares(historico) == []


def test_un_solo_par_no_llega_a_tendencia():
    historico = [
        extraccion(id="1", temp_c="94", nota="7"),
        extraccion(id="2", temp_c="91", nota="8"),
    ]
    assert sugerencias.efectos(historico) == {}


def test_dos_pares_ya_promedian():
    historico = [
        extraccion(id="1", temp_c="94", nota="6"),
        extraccion(id="2", temp_c="91", nota="8"),
        extraccion(id="3", temp_c="88", nota="9"),
    ]
    efecto = sugerencias.efectos(historico)[("temp_c", "bajar")]
    assert efecto["casos"] == 2
    assert efecto["media"] == pytest.approx(1.5)


# --- cobertura ---------------------------------------------------------------

def test_cobertura_lista_lo_ya_probado():
    historico = [
        extraccion(id="1", temp_c="94", clics="28"),
        extraccion(id="2", temp_c="91", clics="28"),
    ]
    probado = sugerencias.cobertura("gary", historico)
    assert probado["temp_c"] == ["91", "94"]
    assert probado["clics"] == ["28"]


def test_cobertura_ignora_los_otros_cafes():
    historico = [extraccion(id="1", cafe_id="abbie", temp_c="92")]
    assert sugerencias.cobertura("gary", historico)["temp_c"] == []


# --- salida ------------------------------------------------------------------

def test_texto_corto_es_la_palanca_principal():
    resultado = sugerencias.sugerir(extraccion(defecto="amargor"))
    assert sugerencias.texto_corto(resultado) == "clics +2"


def test_texto_corto_cuando_ya_esta_bien():
    resultado = sugerencias.sugerir(extraccion(defecto="equilibrado", nota="9"))
    assert sugerencias.texto_corto(resultado) == "Repetir igual para confirmar"


def test_formatear_no_revienta_con_lo_minimo():
    texto = sugerencias.formatear(sugerencias.sugerir(extraccion(), []))
    assert "SUGERENCIAS" in texto


def test_admite_una_fila_recien_construida_con_enteros():
    """nueva.py pasa la fila nueva con nota y drawdown como int, no como cadena."""
    fila = extraccion(nota=8, drawdown_s=95, dias_tueste=77)
    resultado = sugerencias.sugerir(fila, [fila])
    assert resultado["cambios"][0]["variable"] == "clics"
    assert resultado["avisos"]
