"""El hook de pre-push no cobra el respaldo a quien no sube nada.

Borrar una rama ya mergeada no sube contenido y no puede dejar los CSV
desfasados, pero el hook exportaba igual, encontraba extracciones nuevas y
abortaba el push. Limpiar una rama pasaba por commitear el respaldo primero,
que no tiene nada que ver.

Lo que se prueba es el corte, en los dos sentidos: que un borrado se salte la
comprobación y que un push con contenido siga pasando por ella. Lo segundo
importa más — un `exit 0` de más aquí deja el respaldo de GitHub obsoleto sin
que nadie se entere, que es justo lo que el hook existe para evitar.

El hook se ejecuta de verdad, en un repo de usar y tirar y con un exportador
falso que deja una marca. Solo librería estándar, como el resto.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest

BASE = Path(__file__).resolve().parent
HOOK = BASE / "hooks" / "pre-push"

CEROS = "0" * 40
SHA = "1111111111111111111111111111111111111111"

# Formato de la entrada estándar del hook: <ref local> <sha local> <ref remota> <sha remota>
BORRADO = f"(delete) {CEROS} refs/heads/rama {SHA}\n"
CONTENIDO = f"refs/heads/main {SHA} refs/heads/main {CEROS}\n"


def buscar_sh():
    """`sh` a secas en Unix; en Windows, el que trae Git y no está en el PATH."""
    encontrado = shutil.which("sh")
    if encontrado:
        return encontrado

    git = shutil.which("git")
    if git:
        raiz = Path(git).resolve().parent.parent
        for candidato in (raiz / "bin" / "sh.exe", raiz / "usr" / "bin" / "sh.exe"):
            if candidato.exists():
                return str(candidato)
    return None


SH = buscar_sh()

pytestmark = pytest.mark.skipif(SH is None, reason="no se encuentra un `sh` con el que correr el hook")


@pytest.fixture
def repo(tmp_path):
    """Repo de usar y tirar con el hook y un exportador que solo deja marca."""
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    (tmp_path / "datos").mkdir()
    (tmp_path / "herramientas").mkdir()
    (tmp_path / "hooks").mkdir()
    shutil.copy(HOOK, tmp_path / "hooks" / "pre-push")

    # No toca datos/: así el hook no corta por otra razón y lo que se mide es
    # solo si llegó a llamarlo.
    (tmp_path / "herramientas" / "exportar_csv.py").write_text(
        'from pathlib import Path\nPath("exporto.marca").write_text("si")\n', encoding="utf-8"
    )
    return tmp_path


def correr_hook(repo, entrada):
    return subprocess.run(
        [SH, "hooks/pre-push"],
        cwd=repo,
        input=entrada,
        capture_output=True,
        text=True,
        env={**os.environ, "GIT_DIR": ".git"},
    )


def exporto(repo):
    return (repo / "exporto.marca").exists()


def test_un_borrado_de_rama_no_paga_el_respaldo(repo):
    resultado = correr_hook(repo, BORRADO)

    assert resultado.returncode == 0, resultado.stderr
    assert not exporto(repo), "el borrado no debería llamar al exportador"
    assert "solo se borran ramas" in resultado.stdout


def test_varios_borrados_a_la_vez_tampoco(repo):
    resultado = correr_hook(repo, BORRADO + BORRADO.replace("rama", "otra"))

    assert resultado.returncode == 0, resultado.stderr
    assert not exporto(repo)


def test_un_push_con_contenido_sigue_comprobando(repo):
    # El que importa: si esto dejara de exportar, el respaldo de GitHub se
    # quedaría viejo en silencio.
    resultado = correr_hook(repo, CONTENIDO)

    assert exporto(repo), "un push con contenido tiene que exportar"
    assert "comprobando que los CSV" in resultado.stdout


def test_un_borrado_junto_a_contenido_comprueba_igual(repo):
    resultado = correr_hook(repo, BORRADO + CONTENIDO)

    assert exporto(repo), "si algo sube contenido, hay respaldo que comprobar"


def test_sin_saber_que_se_empuja_no_se_salta_nada(repo):
    # Igual que el de pre-commit con el índice vacío: en la duda, comprobar.
    resultado = correr_hook(repo, "")

    assert exporto(repo)
