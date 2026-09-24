"""Sube el parche de la versión en los package.json del workspace.

Lo llama el hook de `pre-commit`, así que la versión sube sola en cada commit.
No es cosmética: es lo que enseña el pie de la app y lo único que responde de
un vistazo a «¿el móvil ya tiene el despliegue nuevo o el service worker me
está sirviendo el de antes?».

**Una versión puesta a mano se respeta.** Mayor y menor son decisiones y se
escriben a mano en el `package.json` de la raíz; si el hook subiera el parche
encima, el 1.0.0 que se decidió saldría como 1.0.1. Así que cuando el número
del disco ya no es el del último commit, es que alguien lo puso: se copia a los
demás tal cual y no se sube.

Los cuatro ficheros van a la vez a propósito — la raíz y los tres paquetes.
Son el mismo producto, y cuatro números distintos solo servirían para no saber
cuál mirar.

Solo librería estándar, como el resto de scripts del repo.
"""
import json
import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

# El primero manda: de ahí sale el número que se copia a los demás.
FICHEROS = [
    BASE / "package.json",
    BASE / "nucleo" / "package.json",
    BASE / "api" / "package.json",
    BASE / "web" / "package.json",
]


def siguiente(version):
    """0.1.7 -> 0.1.8. Mayor y menor se suben a mano, que son decisiones."""
    partes = version.split(".")
    if len(partes) != 3 or not all(p.isdigit() for p in partes):
        raise ValueError(f"no sé subir esta versión: {version!r}")
    mayor, menor, parche = (int(p) for p in partes)
    return f"{mayor}.{menor}.{parche + 1}"


def la_que_toca(en_disco, en_head):
    """La del disco si alguien la puso a mano; si no, el parche siguiente.

    Sin commit anterior —el primero del repo— no hay con qué comparar y se
    sube como siempre.
    """
    if en_head is not None and en_disco != en_head:
        siguiente(en_disco)  # que sea una versión que se sepa subir después
        return en_disco, True
    return siguiente(en_disco), False


def version_en_head():
    hecho = subprocess.run(
        ["git", "show", "HEAD:package.json"],
        capture_output=True, text=True, encoding="utf-8", cwd=BASE,
    )
    if hecho.returncode != 0:
        return None
    return json.loads(hecho.stdout)["version"]


def main():
    en_disco = json.loads(FICHEROS[0].read_text(encoding="utf-8"))["version"]
    nueva, a_mano = la_que_toca(en_disco, version_en_head())
    for fichero in FICHEROS:
        datos = json.loads(fichero.read_text(encoding="utf-8"))
        datos["version"] = nueva
        texto = json.dumps(datos, indent=2, ensure_ascii=False) + "\n"
        # En bytes y no con write_text: así el salto de línea es LF en Windows
        # también, que es lo que pide .gitattributes.
        fichero.write_bytes(texto.encode("utf-8"))
    print(f"pre-commit: versión {nueva}" + (" (puesta a mano)" if a_mano else ""))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"no se pudo subir la versión: {error}", file=sys.stderr)
        raise SystemExit(1)
