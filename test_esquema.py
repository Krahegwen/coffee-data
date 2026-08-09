"""Tests del esquema de D1. Uso: python -m pytest

D1 es SQLite, así que el esquema se puede aplicar y probar en memoria sin
Cloudflare de por medio. Estos tests comprueban que las restricciones muerden:
de nada sirve declararlas si luego cuelan datos malos.

Desde la migración de identidad las claves son UUID que pone quien escribe, y
el slug es una etiqueta única. La semilla sigue entrando con los ids viejos:
la migración la convierte, así que estos tests también prueban la conversión.
"""
import sqlite3
import uuid
from pathlib import Path

import pytest

BASE = Path(__file__).parent
MIGRACIONES = sorted((BASE / "api" / "migrations").glob("*.sql"))

# Las claves son subconsultas por slug: el uuid de cada fila nace en la
# migración y cambia en cada ejecución, como debe ser.
GARY = "(SELECT id FROM cafes WHERE slug = 'gary')"
RECETA_BASE = "(SELECT id FROM recetas WHERE slug = 'kasuya-46-base')"
SEMILLA = "(SELECT id FROM extracciones ORDER BY creado_en LIMIT 1)"

EXTRACCION = {
    "fecha": "'2026-08-06'", "cafe_id": GARY, "dosis_g": "20", "agua_g": "300",
    "temp_c": "91", "nota": "8", "defecto": "'equilibrado'",
    "dripper": "'v60-02-plastico'", "receta_id": RECETA_BASE,
}


def insertar_extraccion(db, **cambios):
    """
    Inserta y **devuelve la id**, para poder releer justo esa fila.

    Hace falta: la semilla escribe su `creado_en` con `datetime('now')`, igual
    que esto, así que pedir «la última» empata con ella y el desempate es un
    uuid4 aleatorio. Un test que releyera por orden acertaría unas veces sí y
    otras no.
    """
    clave = str(uuid.uuid4())
    campos = {"id": f"'{clave}'", **EXTRACCION, **cambios}
    columnas = ", ".join(campos)
    valores = ", ".join(str(v) for v in campos.values())
    db.execute(f"INSERT INTO extracciones ({columnas}) VALUES ({valores})")
    return clave


def defecto_de(db, clave):
    return db.execute(
        "SELECT defecto FROM extracciones WHERE id = ?", (clave,)
    ).fetchone()[0]


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


# --- la identidad nueva ------------------------------------------------------

def test_las_claves_son_uuid_y_el_slug_es_etiqueta(db):
    id_cafe, slug = db.execute(
        "SELECT id, slug FROM cafes WHERE slug = 'gary'"
    ).fetchone()
    assert len(id_cafe) == 36 and id_cafe.count("-") == 4
    assert slug == "gary"
    # Las extracciones apuntan al uuid, no al slug.
    apuntado = db.execute(f"SELECT cafe_id FROM extracciones WHERE id = {SEMILLA}").fetchone()[0]
    assert apuntado == id_cafe


def test_la_conversion_ato_los_pasos_a_su_receta(db):
    pasos = db.execute(
        f"SELECT COUNT(*) FROM pasos WHERE receta_id = {RECETA_BASE}"
    ).fetchone()[0]
    assert pasos == 6  # los de la semilla; los tres esperar llegaron después


def test_una_id_que_no_es_uuid_no_cuela(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, id="'3'")


def test_sin_id_no_hay_fila_porque_nadie_la_inventa_por_ti(db):
    campos = {k: v for k, v in EXTRACCION.items()}
    columnas = ", ".join(campos)
    valores = ", ".join(str(v) for v in campos.values())
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(f"INSERT INTO extracciones ({columnas}) VALUES ({valores})")


def test_una_id_repetida_choca_en_vez_de_duplicar(db):
    repetida = f"'{uuid.uuid4()}'"
    insertar_extraccion(db, id=repetida)
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, id=repetida)


def test_el_slug_no_se_repite(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO cafes (id, slug, nombre) VALUES ('{uuid.uuid4()}', 'gary', 'Otro Gary')"
        )


# --- campos derivados --------------------------------------------------------

def test_la_vista_calcula_ratio_y_dias_tueste(db):
    fila = db.execute(
        "SELECT ratio, dias_tueste, cafe_nombre, cafe_slug FROM v_extracciones LIMIT 1"
    ).fetchone()
    assert fila == (15.0, 77, "Gary", "gary")


def test_los_dias_se_cuentan_desde_la_fecha_de_la_extraccion(db):
    insertar_extraccion(db, fecha="'2026-05-25'")
    dias = db.execute(
        "SELECT dias_tueste FROM v_extracciones ORDER BY creado_en DESC, id DESC LIMIT 1"
    ).fetchone()[0]
    assert dias == 5  # Gary se tostó el 2026-05-20


def test_un_cafe_sin_fecha_de_tueste_deja_los_dias_a_null(db):
    db.execute("UPDATE cafes SET fecha_tueste = NULL WHERE slug = 'gary'")
    assert db.execute("SELECT dias_tueste FROM v_extracciones LIMIT 1").fetchone()[0] is None


# --- claves foráneas ---------------------------------------------------------

def test_no_se_puede_registrar_un_cafe_inexistente(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, cafe_id=f"'{uuid.uuid4()}'")


def test_no_se_puede_registrar_una_receta_inexistente(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, receta_id=f"'{uuid.uuid4()}'")


def test_los_pasos_exigen_que_la_receta_exista(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            f"VALUES ('{uuid.uuid4()}', 1, 'verter', 60)"
        )


# --- extracciones sin bolsa --------------------------------------------------
# El café de un amigo o una muestra suelta se apuntan sin ficha: cafe_id
# admite NULL, pero si viene tiene que existir (el test de arriba).

def test_una_extraccion_sin_bolsa_entra(db):
    insertar_extraccion(db, cafe_id="NULL")
    fila = db.execute(
        "SELECT cafe_id FROM extracciones ORDER BY creado_en DESC, id DESC LIMIT 1"
    ).fetchone()
    assert fila[0] is None


def test_la_vista_saca_la_extraccion_sin_bolsa_con_el_cafe_a_null(db):
    insertar_extraccion(db, cafe_id="NULL")
    fila = db.execute(
        "SELECT cafe_nombre, cafe_slug, dias_tueste, dias_abierta, ratio "
        "FROM v_extracciones ORDER BY creado_en DESC, id DESC LIMIT 1"
    ).fetchone()
    assert fila == (None, None, None, None, 15.0)


def test_retirar_una_sin_bolsa_la_lleva_a_su_vista(db):
    insertar_extraccion(db, cafe_id="NULL")
    db.execute("UPDATE extracciones SET borrada_en = datetime('now') WHERE cafe_id IS NULL")
    assert db.execute(
        "SELECT COUNT(*) FROM v_extracciones_retiradas WHERE cafe_id IS NULL"
    ).fetchone()[0] == 1


# --- restricciones de extracciones -------------------------------------------

@pytest.mark.parametrize("nota", ["0", "11", "-3"])
def test_la_nota_va_de_1_a_10(db, nota):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, nota=nota)


def test_el_defecto_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, defecto="'quemado'")


@pytest.mark.parametrize(
    "lista",
    ["amargor,astringente", "astringente,amargor", "amargor,plano,agrio",
     "aguado,carton,salado,agrio"],
)
def test_el_defecto_admite_varios_en_orden(db, lista):
    """Desde la 0010 el defecto es una lista ordenada por relevancia."""
    clave = insertar_extraccion(db, defecto=f"'{lista}'")
    assert defecto_de(db, clave) == lista


@pytest.mark.parametrize(
    "lista",
    [
        "amargor,quemado",      # una clave que el motor no sabe traducir
        "",                     # lista vacía: o hay defecto o la columna es NULL
        "amargor,",             # coma suelta al final
        ",amargor",             # y al principio
        "amargor,,plano",       # hueco en medio
        "amargor,amargor",      # repetido pegado
        "amargor, astringente",  # con espacio: la forma canónica no lo lleva
    ],
)
def test_una_lista_de_defectos_mal_formada_no_entra(db, lista):
    """
    El CHECK va tachando defectos conocidos de ',<lista>,' hasta dejar ','.
    Lo que garantiza es lo que importa: que no entre una clave desconocida.
    """
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, defecto=f"'{lista}'")


def test_la_apertura_tiene_que_ser_una_fecha(db):
    db.execute("UPDATE cafes SET fecha_apertura = '2026-06-01' WHERE slug = 'gary'")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("UPDATE cafes SET fecha_apertura = 'ayer' WHERE slug = 'gary'")


def test_los_dias_abierta_se_cuentan_desde_la_fecha_de_la_extraccion(db):
    db.execute("UPDATE cafes SET fecha_apertura = '2026-08-01' WHERE slug = 'gary'")
    dias = db.execute("SELECT dias_abierta FROM v_extracciones LIMIT 1").fetchone()[0]
    assert dias == 4  # la extracción de la semilla es del 2026-08-05


def test_sin_fecha_de_apertura_los_dias_quedan_a_null(db):
    assert db.execute("SELECT dias_abierta FROM v_extracciones LIMIT 1").fetchone()[0] is None


def test_aguado_es_un_defecto_valido(db):
    clave = insertar_extraccion(db, defecto="'aguado'")
    assert defecto_de(db, clave) == "aguado"


def test_lo_extraido_tiene_que_ser_positivo(db):
    insertar_extraccion(db, extraido_g="260")
    with pytest.raises(sqlite3.IntegrityError):
        insertar_extraccion(db, extraido_g="0")


def test_la_vista_saca_lo_extraido(db):
    insertar_extraccion(db, extraido_g="260")
    fila = db.execute(
        "SELECT extraido_g FROM v_extracciones ORDER BY creado_en DESC, id DESC LIMIT 1"
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


# --- restricciones de pasos --------------------------------------------------

def test_solo_verter_lleva_agua(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            f"VALUES ({RECETA_BASE}, 99, 'agitar', 30)"
        )


def test_un_vertido_sin_agua_no_cuela(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            f"VALUES ({RECETA_BASE}, 99, 'verter', 0)"
        )


def test_el_vertido_admite_estilo(db):
    db.execute(
        f"INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
        f"VALUES ({RECETA_BASE}, 99, 'verter', 60, 'espiral')"
    )
    estilo = db.execute("SELECT estilo FROM pasos WHERE orden = 99").fetchone()[0]
    assert estilo == "espiral"


def test_un_estilo_inventado_no_cuela(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
            f"VALUES ({RECETA_BASE}, 99, 'verter', 60, 'zigzag')"
        )


def test_solo_los_vertidos_llevan_estilo(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g, estilo) "
            f"VALUES ({RECETA_BASE}, 99, 'esperar', 0, 'espiral')"
        )


def test_los_pasos_de_siempre_se_quedan_sin_estilo(db):
    sin_estilo = db.execute("SELECT COUNT(*) FROM pasos WHERE estilo IS NULL").fetchone()[0]
    assert sin_estilo == db.execute("SELECT COUNT(*) FROM pasos").fetchone()[0]


def test_la_accion_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            f"VALUES ({RECETA_BASE}, 99, 'bailar', 0)"
        )


def test_no_se_repite_el_orden_dentro_de_una_receta(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO pasos (receta_id, orden, accion, agua_g) "
            f"VALUES ({RECETA_BASE}, 1, 'verter', 60)"
        )


# --- restricciones de cafés --------------------------------------------------

@pytest.mark.parametrize("slug", ["'Etiopia'", "'con espacio'", "'etiopía'", "''"])
def test_el_slug_de_cafe_va_en_minusculas_y_sin_acentos(db, slug):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO cafes (id, slug, nombre) VALUES ('{uuid.uuid4()}', {slug}, 'X')"
        )


def test_el_estado_es_una_lista_cerrada(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO cafes (id, slug, nombre, estado) "
            f"VALUES ('{uuid.uuid4()}', 'x', 'X', 'a medias')"
        )


def test_la_sca_tiene_que_ser_puntuacion(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            f"INSERT INTO cafes (id, slug, nombre, sca) "
            f"VALUES ('{uuid.uuid4()}', 'x', 'X', 120)"
        )


# --- marcas de tiempo --------------------------------------------------------

def test_actualizado_en_se_mueve_al_editar(db):
    db.execute("UPDATE cafes SET actualizado_en = '2020-01-01 00:00:00' WHERE slug = 'gary'")
    db.execute("UPDATE cafes SET estado = 'terminado' WHERE slug = 'gary'")
    actualizado = db.execute(
        "SELECT actualizado_en FROM cafes WHERE slug = 'gary'"
    ).fetchone()[0]
    assert actualizado > "2020-01-01 00:00:00"


def test_la_semilla_conserva_los_datos_de_abbie(db):
    fila = db.execute(
        "SELECT peso_g, conservacion, fecha_tueste FROM cafes WHERE slug = 'abbie'"
    ).fetchone()
    assert fila == (340.0, "Fellow Atmos 1.2 L", "2026-05-11")


def test_las_fechas_de_compra_por_fin_no_estan(db):
    """No las leía nadie. El DROP COLUMN directo no pudo con ellas; la
    reconstrucción de la migración de identidad sí."""
    columnas = {c[1] for c in db.execute("PRAGMA table_info(cafes)")}
    assert "fecha_compra" not in columnas
    assert "fecha_recepcion" not in columnas
    assert "fecha_apertura" in columnas


# --- borrado lógico ----------------------------------------------------------

def test_lo_retirado_desaparece_de_la_vista_normal(db):
    db.execute(f"UPDATE extracciones SET borrada_en = datetime('now') WHERE id = {SEMILLA}")
    assert db.execute("SELECT COUNT(*) FROM v_extracciones").fetchone()[0] == 0


def test_pero_la_fila_sigue_ahi(db):
    db.execute(f"UPDATE extracciones SET borrada_en = datetime('now') WHERE id = {SEMILLA}")
    assert db.execute("SELECT COUNT(*) FROM extracciones").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM v_extracciones_retiradas").fetchone()[0] == 1


def test_restaurar_la_devuelve(db):
    db.execute(f"UPDATE extracciones SET borrada_en = datetime('now') WHERE id = {SEMILLA}")
    db.execute("UPDATE extracciones SET borrada_en = NULL")
    assert db.execute("SELECT COUNT(*) FROM v_extracciones").fetchone()[0] == 1
    assert db.execute("SELECT COUNT(*) FROM v_extracciones_retiradas").fetchone()[0] == 0


def test_actualizado_en_se_marca_al_corregir(db):
    assert db.execute(
        f"SELECT actualizado_en FROM extracciones WHERE id = {SEMILLA}"
    ).fetchone()[0] is None
    db.execute(f"UPDATE extracciones SET nota = 9 WHERE id = {SEMILLA}")
    assert db.execute(
        f"SELECT actualizado_en FROM extracciones WHERE id = {SEMILLA}"
    ).fetchone()[0] is not None


def test_las_restricciones_siguen_valiendo_al_corregir(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(f"UPDATE extracciones SET nota = 12 WHERE id = {SEMILLA}")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(f"UPDATE extracciones SET defecto = 'quemado' WHERE id = {SEMILLA}")
