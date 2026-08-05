# Registro de café

Bitácora de extracciones en V60 con el método 4:6 de Tetsu Kasuya.
Objetivo: cambiar **una sola variable** entre extracciones y ver qué efecto tiene.

## Ficheros

| Fichero | Qué es |
|---|---|
| `cafes.csv` | Una fila por bolsa: origen, variedad, proceso, fecha de tueste, etc. |
| `extracciones.csv` | Una fila por preparación. `cafe_id` apunta a `cafes.csv`. |
| `recetas.csv` | Catálogo de recetas: vertidos, intervalo y ratio. |
| `nueva.py` | Añade una extracción. `python nueva.py` |
| `cafe.py` | Da de alta una bolsa. `python cafe.py` |
| `resumen.py` | Ranking, histórico y aviso de frescura. `python resumen.py` |
| `comun.py` | Lectura, escritura y validaciones que comparten los scripts. |
| `recetas.py` | Carga del catálogo y escalado de vertidos al agua real. |

## Esquema · `cafes.csv`

`id` · `nombre` · `tostador` · `origen` · `region` · `variedad` · `proceso` ·
`altitud_m` · `sca` · `fecha_tueste` (AAAA-MM-DD) · `consumir_antes` · `peso_g` ·
`precio_eur` · `notas_tostador` · `estado` (`abierto` | `terminado` | `pendiente`) ·
`fecha_compra` · `fecha_recepcion` · `foto` (ruta relativa) · `url`

## Esquema · `extracciones.csv`

`id` · `fecha` · `cafe_id` · `dias_tueste` · `dosis_g` · `agua_g` · `ratio` ·
`temp_c` · `molinillo` · `clics` · `metodo` · `reparto` · `tiempo_total` ·
`variable_cambiada` · `defecto` · `notas_cata` · `nota` (1-10) ·
`siguiente_ajuste` · `receta_id` · `drawdown_s`

`drawdown_s`: segundos entre el final del último vertido y el fin del goteo. Va
en segundos enteros, no en `m:ss`, porque es el valor con el que se decide si
hay que mover la molienda.

## Esquema · `recetas.csv`

`id` · `nombre` · `fases_g` · `intervalo_s` · `ratio` · `notas`

`fases_g` son los gramos de cada vertido, y **su suma es el agua de
referencia**. Escalar por el agua real hace la receta independiente de la
dosis: `60-60-90-90` sobre 300 g son `54-54-81-81` sobre 270 g. La receta es la
intención; el `reparto` de la extracción es lo que echaste de verdad.

## Las dos reglas de edición

`extracciones.csv` es un **log de eventos**: append-only estricto, una fila no
se edita nunca. `cafes.csv` y `recetas.csv` son **estado**: sus filas se pueden
corregir y `estado` tiene que poder pasar a `terminado`.

En ninguno de los tres se reordenan ni se reescriben filas del pasado.

`defecto`: `equilibrado` | `amargor` | `astringente` | `plano` | `agrio` | `salado` | `carton`

`reparto`: gramos de cada vertido separados por guiones. `60-60-90-90` son dos
vertidos de fase 1 y dos de fase 2.

## Método base

20 g · 300 g de agua (1:15) · V60 · Comandante C40.
Fase 1 = primer 40 % del agua (dulzor y acidez).
Fase 2 = último 60 % (fuerza y cuerpo).
Intervalos de 45 s contados **desde el inicio** de cada vertido.
Retirar el dripper al terminar el goteo.

## Palancas de ajuste

| Síntoma | Qué mover |
|---|---|
| Amargo, seco | Moler más grueso, o bajar temperatura |
| Plano, aguado, a cartón | Moler más fino, o subir temperatura |
| Poca acidez, quiero más dulzor | Fase 1 desigual: 50-70 o 40-80 |
| Quiero más cuerpo | Fase 2 en 2 vertidos (90-90) |
| Quiero más claridad y fuerza | Fase 2 en 3 vertidos (60-60-60) |

Una variable por extracción. Si mueves dos, el dato no sirve.

## Convención

Los CSV se editan añadiendo filas al final, nunca reordenando. Un commit por
extracción, con el mensaje `#N café: variable cambiada` (ej. `#2 Gary: 91 °C`).

## Puesta en marcha

Requiere Python 3.11 o superior. Los scripts solo usan la librería estándar;
pytest hace falta únicamente para desarrollar.

```bash
git clone https://github.com/Krahegwen/coffee-data.git
cd coffee-data
git config core.hooksPath hooks
python -m pip install pytest
```

`git config core.hooksPath hooks` activa el hook de `pre-commit`, que ejecuta
los tests antes de cada commit y lo aborta si fallan. Hay que ejecutarlo una
vez por clon: git no activa los hooks solo.

| Comando | Qué hace |
|---|---|
| `python nueva.py` | Añade una extracción preguntando campo a campo. Calcula `id`, `dias_tueste` y `ratio`. |
| `python cafe.py` | Da de alta una bolsa nueva en `cafes.csv`. |
| `python resumen.py` | Ranking, histórico y aviso de frescura. |
| `python -m pytest` | Tests. |

## En un solo comando

Los dos scripts aceptan también los campos como argumentos, para no depender de
las preguntas. La fila entra entera o no entra: si algo no valida, no se
escribe nada y el script sale con código 2.

```bash
python nueva.py --cafe gary --temp 91 --clics 28 --tiempo 3:30 \
    --variable "91 °C" --defecto equilibrado --nota 8 \
    --notas "Más dulzor, menos amargor" --siguiente "Probar 26 clics"

python cafe.py --id etiopia --nombre "Etiopía Guji" --tostador "Manea Coffee" \
    --tueste 2026-08-01 --proceso Natural --sca 87
```

Lo que no pases toma el valor de la receta base: `--dosis 20`, `--agua 300`,
`--molinillo "Comandante C40"`, `--metodo "V60 4:6 Kasuya"`,
`--reparto 60-60-90-90` y `--fecha` de hoy. En `cafe.py` solo `--id` y
`--nombre` son obligatorios; lo que no sepas se queda vacío.

Añade `--dry-run` para ver la fila sin escribirla. `--help` lista todo.
