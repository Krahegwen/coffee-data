"""La versión la sube el hook, salvo la que se puso a mano.

Mayor y menor son decisiones: si el hook subiera el parche encima de un 1.0.0
recién escrito, la versión decidida no llegaría a existir nunca.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent / "herramientas"))

from subir_version import la_que_toca  # noqa: E402


def test_sin_tocar_sube_el_parche():
    assert la_que_toca("0.1.107", "0.1.107") == ("0.1.108", False)


def test_la_puesta_a_mano_se_respeta():
    assert la_que_toca("1.0.0", "0.1.107") == ("1.0.0", True)


def test_sin_commit_anterior_sube_como_siempre():
    assert la_que_toca("0.1.0", None) == ("0.1.1", False)


def test_una_version_a_mano_que_no_se_sabe_subir_se_rechaza():
    with pytest.raises(ValueError):
        la_que_toca("1.0", "0.1.107")
