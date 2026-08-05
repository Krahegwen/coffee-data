"""Tests de cafe.py. Uso: python -m pytest"""
import pytest

import cafe

CAFES = {"gary": {"id": "gary", "nombre": "Gary"}}


def argumentos(*extra):
    """Los flags obligatorios, más lo que se le añada (lo último gana)."""
    return cafe.parsear_argumentos(["--id", "etiopia", "--nombre", "Etiopía Guji"] + list(extra))


# --- validación: id ----------------------------------------------------------

def test_id_valido():
    assert cafe.validar_id(" etiopia ", CAFES) == "etiopia"


def test_id_duplicado():
    with pytest.raises(ValueError, match="ya existe"):
        cafe.validar_id("gary", CAFES)


@pytest.mark.parametrize("valor", ["Etiopia", "con espacio", "etiopía", "-guion", ""])
def test_id_con_formato_invalido(valor):
    with pytest.raises(ValueError):
        cafe.validar_id(valor, CAFES)


# --- validación: estado ------------------------------------------------------

@pytest.mark.parametrize("valor", cafe.ESTADOS)
def test_estado_permitido(valor):
    assert cafe.validar_estado(valor.upper()) == valor


def test_estado_no_permitido():
    with pytest.raises(ValueError):
        cafe.validar_estado("a medias")


# --- modo no interactivo -----------------------------------------------------

def test_fila_minima_deja_vacio_lo_que_no_se_sabe():
    fila = cafe.construir_fila(argumentos(), CAFES)
    assert fila["id"] == "etiopia"
    assert fila["nombre"] == "Etiopía Guji"
    assert fila["estado"] == "abierto"
    vacios = ["tostador", "origen", "region", "variedad", "proceso", "altitud_m",
              "sca", "fecha_tueste", "consumir_antes", "peso_g", "precio_eur",
              "notas_tostador", "fecha_compra", "fecha_recepcion", "foto", "url"]
    assert all(fila[campo] == "" for campo in vacios)


def test_fila_tiene_las_columnas_del_csv_real():
    columnas, _ = cafe.leer_csv(cafe.CAFES)
    fila = cafe.construir_fila(argumentos(), CAFES)
    assert sorted(fila) == sorted(columnas)


def test_fila_completa():
    fila = cafe.construir_fila(
        argumentos(
            "--tostador", "Manea Coffee", "--origen", "Etiopía", "--altitud", "2000",
            "--sca", "87", "--tueste", "2026-08-01", "--consumir-antes", "2027-08-01",
            "--peso", "250", "--precio", "14,5", "--estado", "pendiente",
            "--compra", "2026-07-28", "--recepcion", "2026-07-31",
            "--foto", "fotos/etiopia.jpg", "--url", "https://ejemplo.test/etiopia",
        ),
        CAFES,
    )
    assert fila["altitud_m"] == "2000"
    assert fila["fecha_tueste"] == "2026-08-01"
    assert fila["precio_eur"] == "14.5"
    assert fila["estado"] == "pendiente"
    assert fila["fecha_compra"] == "2026-07-28"
    assert fila["fecha_recepcion"] == "2026-07-31"
    assert fila["foto"] == "fotos/etiopia.jpg"


def test_fila_exige_los_obligatorios():
    args = cafe.parsear_argumentos(["--id", "etiopia"])
    with pytest.raises(ValueError, match="obligatorios"):
        cafe.construir_fila(args, CAFES)


@pytest.mark.parametrize(
    "extra",
    [
        ("--id", "gary"),
        ("--tueste", "01-08-2026"),
        ("--sca", "muy bueno"),
        ("--estado", "a medias"),
        ("--compra", "11-05-2026"),
        ("--recepcion", "2026-13-40"),
    ],
)
def test_fila_propaga_las_validaciones(extra):
    with pytest.raises(ValueError):
        cafe.construir_fila(argumentos(*extra), CAFES)
