# Instrucciones para Claude

Bitácora de extracciones de café en V60 con el método 4:6 de Tetsu Kasuya. El
valor del repo está en el histórico: hay que poder mirar el `git blame` de una
fila y saber qué se cambió y cuándo.

## Reglas que no se rompen

- **Nunca añadas filas a mano ni con Write/Edit.** Usa `nueva.py` y `cafe.py`:
  son los que calculan los campos derivados y validan. Una fila escrita a mano
  se salta las validaciones.
- **Los dos ficheros no tienen la misma regla**, porque no son la misma clase de
  dato:

  | Fichero | Qué es | Regla |
  |---|---|---|
  | `extracciones.csv` | Log de eventos | **Append-only estricto.** Una fila registra algo que pasó. No se edita jamás. |
  | `cafes.csv` | Estado de entidades | Filas **mutables**: `estado` pasa a `terminado`, una ficha se completa cuando llegan los datos. |
  | `recetas.csv` | Catálogo | Como `cafes.csv`. |

- **Nunca reordenes ni reescribas el pasado**, en ningún fichero. Eso es lo que
  rompe el `git blame`, que es la razón de ser del repo. Cambiar el `estado` de
  una bolsa es legítimo; reordenar filas o reformatear las que ya están, no.
- **Los CSV van en UTF-8 y LF.** Si editas uno con una herramienta de Windows,
  comprueba que no lo ha dejado en CRLF: `.gitattributes` protege el repo, pero
  no el fichero de trabajo, y los scripts añaden con `\n`.
- **Fechas siempre en `AAAA-MM-DD`.**
- **Una sola variable por extracción.** Si el usuario cambió dos cosas a la vez,
  díselo: el dato no sirve para comparar. Regístralo igual si insiste, pero que
  `variable_cambiada` lo refleje. Ojo: **cambiar de dripper cuenta como
  variable**. El de cerámica tiene masa térmica y baja la temperatura real del
  lecho si no se precalienta, así que no se cambia de dripper y de `temp_c` en
  la misma extracción.
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
    --drawdown 40 --variable "91 °C" --defecto equilibrado --nota 8 --notas "..."
```

Enseña la fila del `--dry-run`, y cuando la confirme repite sin `--dry-run`.
`id`, `dias_tueste`, `ratio` y `reparto` los calcula el script: no los pases.
El `reparto` sale de escalar las fases de la receta al agua real, así que solo
pasa `--reparto` si ese día se desvió de la receta.

`--drawdown` va en segundos y es lo que mide el tiempo entre el final del último
vertido y el fin del goteo. Es el dato del que depende la sugerencia de
molienda: pídelo aunque sea opcional.

Si falta algún dato obligatorio (`--cafe`, `--temp`, `--clics`, `--tiempo`,
`--variable`, `--defecto`, `--nota`), pregúntaselo antes de ejecutar en vez de
inventarlo. Lo que no se diga toma el valor de la receta base.

Un commit por extracción, con el formato que imprime el propio script:

```
#N café: variable cambiada
```

Por ejemplo `#2 Gary: 91 °C`. El hook de `pre-commit` pasa los tests antes de
dejar entrar el commit; si fallan, arréglalos, no uses `--no-verify`.

Tras guardar, el script imprime un bloque `SUGERENCIAS` con qué mover en la
siguiente. Reléeselo al usuario: es la mitad del valor de registrar. Recuerda
que solo se aplica **la primera**.

## Corregir la ficha de una bolsa

`cafes.csv` es estado, así que sus filas se corrigen. Nunca a mano:

```bash
python cafe.py --editar abbie --estado terminado
python cafe.py --editar gary --conservacion "Fellow Atmos 1.2 L"
```

Solo cambia los campos que pases. El `id` no se puede tocar: es la clave a la
que apuntan las extracciones.

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
