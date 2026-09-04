"""Los scripts del workspace llaman a otros scripts, no a pnpm.

`pnpm deploy` no ejecutaba `deploy` del `package.json`: es un comando propio de
pnpm —empaquetar un paquete del workspace a una carpeta— y gana al script. Con
pnpm 11 el despliegue moría en `ERR_PNPM_INVALID_DEPLOY_TARGET: this command
requires one parameter`, después de haber construido la web, y el mensaje no
menciona el `package.json` por ninguna parte.

Es un fallo caro por cuándo aparece: no lo ve ninguna suite, no lo ve el hook de
pre-commit, y sale a la cara justo al desplegar. La forma segura es la explícita
—`pnpm run <script>`—, que nunca es ambigua, y esto comprueba que se use.

Vale para cualquier nombre futuro: si mañana pnpm estrena un comando `build` o
`sync`, los scripts de aquí ya no se enteran.

Solo librería estándar, como el resto de scripts del repo.
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent

PAQUETES = [
    BASE / "package.json",
    BASE / "nucleo" / "package.json",
    BASE / "api" / "package.json",
    BASE / "web" / "package.json",
]

# `pnpm`, sus banderas (--filter <paquete>, -r, -C <ruta>…) y lo primero que no
# sea una bandera ni el valor de una. Eso es lo que pnpm intenta interpretar.
BANDERA_CON_VALOR = {"--filter", "-F", "--dir", "-C", "--workspace-root", "-w"}


def primer_argumento(orden):
    """El comando que pnpm resolverá, o None si la orden no invoca a pnpm."""
    piezas = orden.split()
    if not piezas or piezas[0] != "pnpm":
        return None

    i = 1
    while i < len(piezas):
        pieza = piezas[i]
        if pieza in BANDERA_CON_VALOR:
            i += 2
            continue
        if pieza.startswith("-"):
            i += 1
            continue
        return pieza
    return None


def ordenes_de(script):
    """Cada orden encadenada del script, por separado."""
    return [trozo.strip() for trozo in re.split(r"&&|\|\||;", script)]


def scripts_del_workspace():
    for ruta in PAQUETES:
        if not ruta.exists():
            continue
        paquete = json.loads(ruta.read_text(encoding="utf-8"))
        for nombre, orden in (paquete.get("scripts") or {}).items():
            yield ruta.relative_to(BASE).as_posix(), nombre, orden


def test_toda_llamada_a_un_script_pasa_por_run():
    fallos = []

    for fichero, nombre, script in scripts_del_workspace():
        for orden in ordenes_de(script):
            comando = primer_argumento(orden)
            if comando is not None and comando != "run":
                fallos.append(f"{fichero} · {nombre}: «{orden}» → usa «pnpm run {comando} ...»")

    assert not fallos, "Scripts que dejan decidir a pnpm:\n  " + "\n  ".join(fallos)


def test_el_guardian_detecta_la_forma_ambigua():
    # Sin esto, un error en el parseo dejaría el test en verde para siempre.
    assert primer_argumento("pnpm --filter @coffee/api deploy") == "deploy"
    assert primer_argumento("pnpm -r test") == "test"
    assert primer_argumento("pnpm --filter @coffee/api run deploy") == "run"
    assert primer_argumento("pnpm run build:web") == "run"
    # Lo que no es pnpm no se toca.
    assert primer_argumento("python herramientas/comprobar_despliegue.py") is None
    assert primer_argumento("wrangler deploy") is None
