# Instrucciones para Claude

Bitácora de extracciones de café en V60 con el método 4:6 de Tetsu Kasuya. El
valor del repo está en el histórico: hay que poder mirar el `git blame` de una
fila y saber qué se cambió y cuándo.

## Reglas que no se rompen

- **Nunca edites los CSV a mano ni con Write/Edit.** Usa `nueva.py` y `cafe.py`:
  son los que calculan los campos derivados y validan. Una fila escrita a mano
  se salta las validaciones.
- **Los CSV solo crecen por abajo.** Jamás reordenes, reformatees ni reescribas
  filas existentes: rompe el `git blame`, que es la razón de ser del repo.
- **Fechas siempre en `AAAA-MM-DD`.**
- **Una sola variable por extracción.** Si el usuario cambió dos cosas a la vez,
  díselo: el dato no sirve para comparar. Regístralo igual si insiste, pero que
  `variable_cambiada` lo refleje.
- **Solo librería estándar** en el código. `pytest` es dependencia de desarrollo
  y nada más. No añadas paquetes.
- **Nada de GitHub Actions**, aunque el repo sea público. La verificación vive en
  el hook de `pre-commit`.
- **Repo público**: ni datos personales ni credenciales en el código, en los
  mensajes de commit o en la configuración.

## Añadir una extracción

El usuario lo contará en lenguaje normal («un Gary a 91 grados, 28 clics, 3:30,
equilibrado, un 8»). Tradúcelo a un comando, no a una edición del CSV:

```bash
python nueva.py --dry-run --cafe gary --temp 91 --clics 28 --tiempo 3:30 \
    --variable "91 °C" --defecto equilibrado --nota 8 --notas "..."
```

Enseña la fila del `--dry-run`, y cuando la confirme repite sin `--dry-run`.
`id`, `dias_tueste` y `ratio` los calcula el script: no los pases.

Si falta algún dato obligatorio (`--cafe`, `--temp`, `--clics`, `--tiempo`,
`--variable`, `--defecto`, `--nota`), pregúntaselo antes de ejecutar en vez de
inventarlo. Lo que no se diga toma el valor de la receta base.

Un commit por extracción, con el formato que imprime el propio script:

```
#N café: variable cambiada
```

Por ejemplo `#2 Gary: 91 °C`. El hook de `pre-commit` pasa los tests antes de
dejar entrar el commit; si fallan, arréglalos, no uses `--no-verify`.

## Dar de alta una bolsa

```bash
python cafe.py --id etiopia --nombre "Etiopía Guji" --tueste 2026-08-01
```

Solo `--id` y `--nombre` son obligatorios. El `id` va en minúsculas, sin espacios
ni acentos, porque se usa como `--cafe` y aparece en cada fila de extracciones.
Commit: `Nuevo café: <nombre>`.

## Interpretar los resultados

`python resumen.py` da ranking, histórico y frescura. Las palancas de ajuste
(qué mover ante cada síntoma) están en la tabla del README; úsala para sugerir
el `siguiente_ajuste`, y recuerda mover una sola cosa.

## Si tocas el código

Los tests están en `test_nueva.py`, `test_cafe.py` y `test_comun.py`. Ejecuta
`python -m pytest` antes de commitear. La lógica compartida (append, validaciones
genéricas, preguntas) vive en `comun.py`: si añades una validación que sirva a
los dos scripts, va ahí.
