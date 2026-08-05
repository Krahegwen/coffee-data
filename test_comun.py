"""Tests de comun.py. Uso: python -m pytest"""
import pytest

import comun


# --- validaciones genéricas --------------------------------------------------

def test_fecha_valida():
    assert comun.validar_fecha(" 2026-08-05 ") == "2026-08-05"


@pytest.mark.parametrize("valor", ["05-08-2026", "2026/08/05", "2026-13-01", "ayer", ""])
def test_fecha_invalida(valor):
    with pytest.raises(ValueError):
        comun.validar_fecha(valor)


def test_numero_admite_coma_decimal():
    assert comun.validar_numero("14,5") == "14.5"
    assert comun.validar_numero("300") == "300"


def test_numero_invalido():
    with pytest.raises(ValueError):
        comun.validar_numero("mucho")


def test_opcion_normaliza_a_minusculas():
    assert comun.validar_opcion(" ABIERTO ", ["abierto", "terminado"], "estado") == "abierto"


def test_opcion_fuera_de_la_lista():
    with pytest.raises(ValueError):
        comun.validar_opcion("medio", ["abierto", "terminado"], "estado")


# --- escritura ---------------------------------------------------------------

def test_agregar_fila_respeta_el_orden_de_columnas(tmp_path):
    ruta = tmp_path / "datos.csv"
    ruta.write_text("id,fecha,nota\n1,2026-08-05,7\n", encoding="utf-8", newline="")

    comun.agregar_fila({"nota": 8, "id": 2, "fecha": "2026-08-06"}, ruta)

    assert ruta.read_bytes() == b"id,fecha,nota\n1,2026-08-05,7\n2,2026-08-06,8\n"


def test_agregar_fila_no_pega_la_fila_si_falta_el_salto_final(tmp_path):
    ruta = tmp_path / "datos.csv"
    ruta.write_text("id,nota\n1,7", encoding="utf-8", newline="")

    comun.agregar_fila({"id": 2, "nota": 8}, ruta)

    assert ruta.read_bytes() == b"id,nota\n1,7\n2,8\n"


def test_agregar_fila_entrecomilla_las_comas(tmp_path):
    ruta = tmp_path / "datos.csv"
    ruta.write_text("id,notas\n", encoding="utf-8", newline="")

    comun.agregar_fila({"id": 1, "notas": "Dulce, con cuerpo"}, ruta)

    assert ruta.read_bytes() == 'id,notas\n1,"Dulce, con cuerpo"\n'.encode("utf-8")


def test_agregar_fila_rechaza_columnas_que_faltan(tmp_path):
    ruta = tmp_path / "datos.csv"
    ruta.write_text("id,fecha,nota\n", encoding="utf-8", newline="")

    with pytest.raises(ValueError):
        comun.agregar_fila({"id": 1}, ruta)


def test_agregar_fila_rechaza_columnas_desconocidas(tmp_path):
    ruta = tmp_path / "datos.csv"
    ruta.write_text("id\n", encoding="utf-8", newline="")

    with pytest.raises(ValueError):
        comun.agregar_fila({"id": 1, "inventada": "x"}, ruta)


# --- edición de filas de estado ----------------------------------------------

def csv_de_estado(tmp_path):
    ruta = tmp_path / "cafes.csv"
    ruta.write_text(
        "id,nombre,notas,estado\n"
        'gary,Gary,"Cacao, dulce de leche",abierto\n'
        "abbie,Abbie,Canela,abierto\n",
        encoding="utf-8",
        newline="",
    )
    return ruta


def test_actualizar_solo_toca_la_fila_indicada(tmp_path):
    ruta = csv_de_estado(tmp_path)

    comun.actualizar_fila("abbie", {"estado": "terminado"}, ruta)

    assert ruta.read_bytes() == (
        "id,nombre,notas,estado\n"
        'gary,Gary,"Cacao, dulce de leche",abierto\n'
        "abbie,Abbie,Canela,terminado\n"
    ).encode("utf-8")


def test_actualizar_no_reformatea_las_comillas_de_la_fila_editada(tmp_path):
    ruta = csv_de_estado(tmp_path)

    comun.actualizar_fila("gary", {"estado": "terminado"}, ruta)

    assert b'gary,Gary,"Cacao, dulce de leche",terminado\n' in ruta.read_bytes()


def test_actualizar_admite_varias_columnas(tmp_path):
    ruta = csv_de_estado(tmp_path)

    comun.actualizar_fila("abbie", {"notas": "Otra cosa", "estado": "terminado"}, ruta)

    assert b"abbie,Abbie,Otra cosa,terminado\n" in ruta.read_bytes()


def test_actualizar_rechaza_una_clave_inexistente(tmp_path):
    ruta = csv_de_estado(tmp_path)

    with pytest.raises(ValueError, match="No existe"):
        comun.actualizar_fila("etiopia", {"estado": "terminado"}, ruta)


def test_actualizar_rechaza_columnas_desconocidas(tmp_path):
    ruta = csv_de_estado(tmp_path)

    with pytest.raises(ValueError):
        comun.actualizar_fila("abbie", {"inventada": "x"}, ruta)


def test_actualizar_rechaza_no_cambiar_nada(tmp_path):
    ruta = csv_de_estado(tmp_path)

    with pytest.raises(ValueError):
        comun.actualizar_fila("abbie", {}, ruta)


def test_actualizar_se_niega_a_tocar_el_log_de_extracciones(tmp_path):
    ruta = tmp_path / "extracciones.csv"
    ruta.write_text("id,nota\n1,7\n", encoding="utf-8", newline="")

    with pytest.raises(ValueError, match="log de eventos"):
        comun.actualizar_fila("1", {"nota": "9"}, ruta)

    assert ruta.read_bytes() == b"id,nota\n1,7\n"
