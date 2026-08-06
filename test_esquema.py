"""Tests del esquema de D1. Uso: python -m pytest

D1 es SQLite, así que el esquema se puede aplicar y probar en memoria sin
Cloudflare de por medio. Estos tests comprueban que las restricciones muerden:
de nada sirve declararlas si luego cuelan datos malos.
"""
import sqlite3
from pathlib import Path

import pytest

BASE = Path(__file__).parent
MIGRACIONES = sorted((BASE / "api" / "migrations").glob("*.sql"))

EXTRACCION = {
    "fecha": "'2026-08-06'", "cafe_id": "'gary'", "dosis_g": "20", "agua_g": "300",
    "temp_c": "91", "nota": "8", "defecto": "'equilibrado'",
    "dripper": "'v60-02-plastico'", "receta_id": "'kasuya-46-base'",
}


def insertar_extraccion(db, **cambios):
    campos = {**EXTRACCION, **{k: v for k, v in cambios.items()}}
    columnas = ", ".join(campos)
    valores = ", ".join(str(v) for v in campos.values())
    db.execute(f"INSERT INTO extracciones ({columnas}) VALUES ({valores})")


@pytest.fixture
def db():
    """Base en memoria con el esquema y la semilla aplicados."""
    conexion = sqlite3.connect(":memory:")
    conexion.execute("PRAGMA foreign_keys = ON")
    for migracion in MIGRACIONES:
        conexion.executescript(migracion.read_text(encoding="utf-8"))
    yield conexion
    conexion.close()


# --- las migraciones aplican -------------------------------------------------

def test_hay_migraciones():
    assert MIGRACIONES, "no se encontró ninguna migración"


def test_la_semilla_entra(db):
    assert db.execute("SELECT COUNT(*) FROM cafes").fetchone()[0] == 2
    assert db.execute("SELECT COUNT(*) FROM recetas").fetchone()[0] == 3
    assert db.execute("SELECT COUNT(*) FROM pasos").fetchone()[0] == 19
    assert db.execute("SELECT COUNT(*) FROM extracciones").fetchone()[0] == 1


def test_las_tablas_son_strict(db):
    for tabla in ("cafes", "recetas", "pasos", "extracciones"):
        sql = db.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (tabla,)
        ).fetchone()[0]
        assert "STRICT" in sql, tabla


# --- campos derivados --------------------------------------------------------

def test_la_vista_calcula_ratio_y_dias_tueste(db):
    fila = db.execute(
        "SELECT ratio, dias_tueste, cafe_nombre FROM v_extracciones WHERE id = 1"
    ).fetchone()
    assert fila == (15.0, 77, "Gary")


def test_los_dias_se_cuentan_desde_la_fecha_de_la_extraccion(db):
    insertar_extraccion(db, fecha="'2026-05-25'")
    dias = db.execute(
        "SELECT dias_tueste FROM v_extracciones ORDER BY id DESC LIMIT 1"
    ).fetchone()[0]
    assert dias == 5  # Gary se tostó el 2026-05-20


def test_un_cafe_sin_fecha_de_tueste_deja_los_dias_a_null(db):
    db.execute("UPDATE cafes SET fecha_tueste = NULL WHERE id = 'gary'")
    assert db.execute("SELECT dias_tueste FROM v_extracciones WHERE id = 1").fetchone()[0] is None


# --- claves foráneas ---------------------------------------------------------

def test_no_se_puede_registrar_un_cafe_inexistente(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, cafe_id="'etiopia'")


def test_no_se_puede_registrar_una_receta_inexistente(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, receta_id="'chemex'")


def test_los_pasos_exigen_que_la_receta_exista(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            "VALUES ('chemex', 1, 'verter', 60)"
        )


# --- restricciones de extracciones -------------------------------------------

@pytest.mark.parametrize("nota", ["0", "11", "-3"])
def test_la_nota_va_de_1_a_10(db, nota):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, nota=nota)


def test_el_defecto_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, defecto="'quemado'")


def test_la_apertura_tiene_que_ser_una_fecha(db):
    db.execute("UPDATE cafes SET fecha_apertura = '2026-06-01' WHERE id = 'gary'")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE cafes SET fecha_apertura = 'ayer' WHERE id = 'gary'")


def test_los_dias_abierta_se_cuentan_desde_la_fecha_de_la_extraccion(db):
    db.execute("UPDATE cafes SET fecha_apertura = '2026-08-01' WHERE id = 'gary'")
    dias = db.execute("SELECT dias_abierta FROM v_extracciones WHERE id = 1").fetchone()[0]
    assert dias == 4  # la extracción #1 es del 2026-08-05


def test_sin_fecha_de_apertura_los_dias_quedan_a_null(db):
    assert db.execute("SELECT dias_abierta FROM v_extracciones WHERE id = 1").fetchone()[0] is None


def test_aguado_es_un_defecto_valido(db):
    insertar_extraccion(db, defecto="'aguado'")
    fila = db.execute("SELECT defecto FROM extracciones ORDER BY id DESC LIMIT 1").fetchone()
    assert fila[0] == "aguado"


def test_rehacer_la_tabla_no_se_llevo_por_delante_la_semilla(db):
    """La migración de `aguado` recrea extracciones entera: que los id sigan."""
    fila = db.execute("SELECT id, cafe_id, temp_c FROM extracciones WHERE id = 1").fetchone()
    assert fila == (1, "gary", 94)
    siguiente = db.execute("SELECT seq FROM sqlite_sequence WHERE name = 'extracciones'").fetchone()
    assert siguiente[0] >= 1


def test_lo_extraido_tiene_que_ser_positivo(db):
    insertar_extraccion(db, extraido_g="260")
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, extraido_g="0")


def test_la_vista_saca_lo_extraido(db):
    insertar_extraccion(db, extraido_g="260")
    fila = db.execute(
        "SELECT extraido_g FROM v_extracciones ORDER BY id DESC LIMIT 1"
    ).fetchone()
    assert fila[0] == 260


def test_el_dripper_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, dripper="'chemex'")


@pytest.mark.parametrize(
    "fecha",
    [
        "'06-08-2026'",   # formato al revés
        "'2026/08/06'",   # separador
        "'2026-8-6'",     # sin cero a la izquierda
        "'2026-13-01'",   # mes que no existe
        "'2026-02-30'",   # día que no existe
        "'2026-02-29'",   # 2026 no es bisiesto
        "'2026-04-31'",   # abril tiene 30
        "'ayer'",
        "''",
    ],
)
def test_las_fechas_van_en_aaaa_mm_dd_y_deben_existir(db, fecha):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, fecha=fecha)


def test_el_29_de_febrero_de_un_bisiesto_si_vale(db):
    insertar_extraccion(db, fecha="'2024-02-29'")
    assert db.execute(
        "SELECT COUNT(*) FROM extracciones WHERE fecha = '2024-02-29'"
    ).fetchone()[0] == 1


def test_la_dosis_no_puede_ser_cero(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, dosis_g="0")


def test_el_drawdown_no_puede_ser_negativo(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, drawdown_s="-5")


def test_el_id_lo_pone_la_base_y_continua_la_serie(db):
    insertar_extraccion(db)
    assert db.execute("SELECT MAX(id) FROM extracciones").fetchone()[0] == 2


# --- restricciones de pasos --------------------------------------------------

def test_solo_verter_lleva_agua(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            "VALUES ('kasuya-46-base', 99, 'agitar', 30)"
        )


def test_un_vertido_sin_agua_no_cuela(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            "VALUES ('kasuya-46-base', 99, 'verter', 0)"
        )


def test_el_vertido_admite_estilo(db):
    db.execute(
        "INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
        "VALUES ('kasuya-46-base', 99, 'verter', 60, 'espiral')"
    )
    estilo = db.execute("SELECT estilo FROM pasos WHERE orden = 99").fetchone()[0]
    assert estilo == "espiral"


def test_un_estilo_inventado_no_cuela(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
            "VALUES ('kasuya-46-base', 99, 'verter', 60, 'zigzag')"
        )


def test_solo_los_vertidos_llevan_estilo(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
            "VALUES ('kasuya-46-base', 99, 'esperar', 0, 'espiral')"
        )


def test_los_pasos_de_siempre_se_quedan_sin_estilo(db):
    sin_estilo = db.execute("SELECT COUNT(*) FROM pasos WHERE estilo IS NULL").fetchone()[0]
    assert sin_estilo == db.execute("SELECT COUNT(*) FROM pasos").fetchone()[0]


def test_la_accion_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            "VALUES ('kasuya-46-base', 99, 'bailar', 0)"
        )


def test_no_se_repite_el_orden_dentro_de_una_receta(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            "VALUES ('kasuya-46-base', 1, 'verter', 60)"
        )


# --- restricciones de cafés --------------------------------------------------

@pytest.mark.parametrize("id_cafe", ["'Etiopia'", "'con espacio'", "'etiopía'", "''"])
def test_el_id_de_cafe_es_un_slug(db, id_cafe):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(f"INSERT INTO cafes (id, nombre) VALUES ({id_cafe}, 'X')")


def test_el_estado_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO cafes (id, nombre, estado) VALUES ('x', 'X', 'a medias')")


def test_no_se_repite_el_id_de_cafe(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO cafes (id, nombre) VALUES ('gary', 'Otro Gary')")


def test_la_sca_tiene_que_ser_puntuacion(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO cafes (id, nombre, sca) VALUES ('x', 'X', 120)")


# --- marcas de tiempo --------------------------------------------------------

def test_actualizado_en_se_mueve_al_editar(db):
    db.execute("UPDATE cafes SET actualizado_en = '2020-01-01 00:00:00' WHERE id = 'gary'")
    db.execute("UPDATE cafes SET estado = 'terminado' WHERE id = 'gary'")
    actualizado = db.execute(
        "SELECT actualizado_en FROM cafes WHERE id = 'gary'"
    ).fetchone()[0]
    assert actualizado > "2020-01-01 00:00:00"


def test_la_semilla_conserva_los_datos_de_abbie(db):
    fila = db.execute(
        "SELECT peso_g, conservacion, fecha_tueste FROM cafes WHERE id = 'abbie'"
    ).fetchone()
    assert fila == (340.0, "Fellow Atmos 1.2 L", "2026-05-11")


def test_las_fechas_de_compra_siguen_en_la_tabla_pero_congeladas(db):
    """Se intentó quitarlas y D1 no dejó. Quedan ahí, y nadie las escribe.

    El intento está contado en el README: no vale un DROP COLUMN mientras un
    CHECK las mencione, y rehacer `cafes` no cuela porque tirar la tabla apunta
    una violación aplazada por cada extracción que la referencia. Fuera del
    formulario y fuera de CAMPOS_CAFE, que es lo que de verdad importaba.
    """
    columnas = {c[1] for c in db.execute("PRAGMA table_info(cafes)")}
    assert {"fecha_compra", "fecha_recepcion"} <= columnas
    assert "fecha_apertura" in columnas


# --- borrado lógico ----------------------------------------------------------

def test_lo_retirado_desaparece_de_la_vista_normal(db):
    db.execute("UPDATE extracciones SET borrada_en = datetime('now') WHERE id = 1")
    assert db.execute("SELECT COUNT(*) FROM v_extracciones").fetchone()[0] == 0


def test_pero_la_fila_sigue_ahi(db):
    db.execute("UPDATE extracciones SET borrada_en = datetime('now') WHERE id = 1")
    assert db.execute("SELECT COUNT(*) FROM extracciones").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM v_extracciones_retiradas").fetchone()[0] == 1


def test_restaurar_la_devuelve(db):
    db.execute("UPDATE extracciones SET borrada_en = datetime('now') WHERE id = 1")
    db.execute("UPDATE extracciones SET borrada_en = NULL WHERE id = 1")
    assert db.execute("SELECT COUNT(*) FROM v_extracciones").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM v_extracciones_retiradas").fetchone()[0] == 0


def test_el_id_no_se_reutiliza_tras_retirar(db):
    """Retirar no libera el id: la serie sigue, que si no se pisarían."""
    db.execute("UPDATE extracciones SET borrada_en = datetime('now') WHERE id = 1")
    insertar_extraccion(db)
    assert db.execute("SELECT MAX(id) FROM extracciones").fetchone()[0] == 2


def test_actualizado_en_se_marca_al_corregir(db):
    assert db.execute("SELECT actualizado_en FROM extracciones WHERE id = 1").fetchone()[0] is None
    db.execute("UPDATE extracciones SET nota = 9 WHERE id = 1")
    assert db.execute("SELECT actualizado_en FROM extracciones WHERE id = 1").fetchone()[0] is not None


def test_las_restricciones_siguen_valiendo_al_corregir(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE extracciones SET nota = 12 WHERE id = 1")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE extracciones SET defecto = 'quemado' WHERE id = 1")
