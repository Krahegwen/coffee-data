#!/usr/bin/env python3
"""Se niega a desplegar lo que no está en GitHub. Lo llama `pnpm deploy`.

`pnpm deploy` sube **lo que hay en el disco**, no lo que hay en `main`. Sin
ramas eso daba igual porque el disco y `main` eran lo mismo; con una rama por
tarea deja de serlo, y desplegar sin querer desde `feature/loquesea` es
exactamente el accidente que las ramas venían a evitar.

Tres comprobaciones, y las tres dicen lo mismo desde ángulos distintos: lo que
sirva el Worker tiene que poder reconstruirse desde el repo público.

- **En la rama de integración.** Producción sale de `main` y de ningún otro
  sitio.
- **Sin nada sin commitear.** Un cambio que solo existe en tu disco no lo tiene
  nadie más: si el portátil se va, lo desplegado no se puede reproducir.
- **Sin commits sin subir.** Es la regla de «primero el push, luego el
  despliegue»: si lo desplegado no está en GitHub, el histórico va por detrás
  de lo que hay sirviendo.

No lleva puerta de atrás a propósito, igual que el hook de pre-commit no la
lleva. Si algún día hace falta desplegar de verdad saltándose esto —una vuelta
atrás con GitHub caído—, ahí está `pnpm deploy:api`, que hace justo eso y
obliga a teclearlo a conciencia.
"""
import subprocess
import sys

RAMA_DE_PRODUCCION = "main"


def git(*argumentos):
    """Git en modo silencioso: devuelve (salida, código)."""
    hecho = subprocess.run(
        ["git", *argumentos], capture_output=True, text=True, encoding="utf-8",
    )
    return hecho.stdout.strip(), hecho.returncode


def no(motivo, *pistas):
    print(f"\ndespliegue abortado: {motivo}", file=sys.stderr)
    for pista in pistas:
        print(f"  {pista}", file=sys.stderr)
    print("", file=sys.stderr)
    return 1


def main():
    rama, codigo = git("rev-parse", "--abbrev-ref", "HEAD")
    if codigo != 0:
        return no("esto no parece un repositorio de git")

    if rama != RAMA_DE_PRODUCCION:
        return no(
            f"estás en «{rama}» y producción sale de «{RAMA_DE_PRODUCCION}»",
            "Termina la rama, mézclala y despliega desde ahí:",
            f"    git switch {RAMA_DE_PRODUCCION}",
            f"    git merge --no-ff {rama}",
        )

    sucio, _ = git("status", "--porcelain")
    if sucio:
        return no(
            "hay cambios sin commitear",
            "Lo que solo existe en tu disco no lo tiene nadie más, así que lo",
            "desplegado no se podría reproducir desde el repo.",
            "",
            *[f"    {linea}" for linea in sucio.splitlines()[:10]],
        )

    # Contra el remoto de verdad y no contra la referencia que quedó cacheada:
    # sin esto, un `origin/main` viejo daría por subido lo que no lo está.
    _, fallo = git("fetch", "--quiet", "origin", RAMA_DE_PRODUCCION)
    if fallo != 0:
        print(
            "aviso: no se pudo hablar con origin, así que se compara con la "
            "referencia local",
            file=sys.stderr,
        )

    sin_subir, codigo = git(
        "rev-list", "--count", f"origin/{RAMA_DE_PRODUCCION}..{RAMA_DE_PRODUCCION}",
    )
    if codigo != 0:
        return no(
            f"no hay ninguna referencia origin/{RAMA_DE_PRODUCCION} con la que comparar",
            "Sube la rama antes de desplegar:",
            f"    git push -u origin {RAMA_DE_PRODUCCION}",
        )

    if sin_subir != "0":
        cuantos = f"{sin_subir} commit" + ("" if sin_subir == "1" else "s")
        return no(
            f"tienes {cuantos} sin subir",
            "Primero el push y luego el despliegue: si lo que sirve el Worker",
            "no está en GitHub, el histórico va por detrás de producción.",
            "",
            f"    git push origin {RAMA_DE_PRODUCCION}",
        )

    print(f"despliegue: {RAMA_DE_PRODUCCION} limpia y al día con origin.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
