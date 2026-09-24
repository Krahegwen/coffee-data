"""Los CSV del respaldo dicen lo mismo los escriba quien los escriba.

Hay dos escritores de los mismos ficheros: `herramientas/exportar_csv.py`, que
pone al día `datos/` desde la API, y el respaldo de la app
(`web/app/almacen/respaldo.js`), que escribe esos CSV dentro de un ZIP.
Restaurar lee cualquiera de los dos, así que tienen que llevar las mismas
columnas en el mismo orden. La regla estaba escrita en el CLAUDE.md —«si tocas
columnas en `exportar_csv.py`, tócalas también ahí»— y nada la hacía saltar.
Con el catálogo de accesorios se tocaron las dos a la vez; la próxima vez puede
que no.

Solo librería estándar, como el resto de scripts del repo.
"""
import importlib.util
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent
RESPALDO = (BASE / "web" / "app" / "almacen" / "respaldo.js").read_text(encoding="utf-8")


def exportador():
    """El módulo del exportador, cargado sin ejecutarlo: su main va aparte."""
    ruta = BASE / "herramientas" / "exportar_csv.py"
    spec = importlib.util.spec_from_file_location("exportar_csv", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def columnas_js(nombre):
    """Las cadenas de `const NOMBRE = [ ... ];` en el respaldo, en orden."""
    bloque = re.search(rf"const {nombre} = \[(.*?)\];", RESPALDO, re.S)
    assert bloque, f"{nombre} no está en respaldo.js"
    return re.findall(r'"([a-z_]+)"', bloque.group(1))


def columnas_exportadas(fichero):
    return next(columnas for f, _, columnas, _ in exportador().EXPORTS if f == fichero)


def test_extracciones():
    assert exportador().COLUMNAS_EXTRACCIONES == columnas_js("COLUMNAS_EXTRACCIONES")


def test_cafes():
    assert columnas_exportadas("cafes.csv") == columnas_js("COLUMNAS_CAFES")


def test_accesorios():
    assert columnas_exportadas("accesorios.csv") == columnas_js("COLUMNAS_ACCESORIOS")
