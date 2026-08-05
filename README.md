# Registro de café

Bitácora de extracciones en V60 con el método 4:6 de Tetsu Kasuya.
Objetivo: cambiar **una sola variable** entre extracciones y ver qué efecto tiene.

> **En migración a D1.** Los datos se van a Cloudflare D1 y el alta pasará a
> hacerse solo desde la app. Los CSV **siguen siendo la fuente de verdad hasta
> el corte**: hasta entonces se registra como siempre, con `nueva.py`.
> El esquema SQL ya está en `migrations/` y la semilla se genera desde los CSV
> con `herramientas/csv_a_sql.py`.

## Ficheros

| Fichero | Qué es |
|---|---|
| `cafes.csv` | Una fila por bolsa: origen, variedad, proceso, fecha de tueste, etc. |
| `extracciones.csv` | Una fila por preparación. `cafe_id` apunta a `cafes.csv`. |
| `recetas.csv` | Catálogo de recetas. |
| `pasos.csv` | Los pasos de cada receta: vertidos, agitados, esperas. |
| `nueva.py` | Añade una extracción. `python nueva.py` |
| `cafe.py` | Da de alta una bolsa. `python cafe.py` |
| `resumen.py` | Ranking, histórico y aviso de frescura. `python resumen.py` |
| `comun.py` | Lectura, escritura y validaciones que comparten los scripts. |
| `recetas.py` | Carga del catálogo y escalado de vertidos al agua real. |
| `sugerencias.py` | Qué cambiar en la próxima extracción. |

## Esquema · `cafes.csv`

`id` · `nombre` · `tostador` · `origen` · `region` · `variedad` · `proceso` ·
`altitud_m` · `sca` · `fecha_tueste` (AAAA-MM-DD) · `consumir_antes` · `peso_g` ·
`precio_eur` · `notas_tostador` · `estado` (`abierto` | `terminado` | `pendiente`) ·
`fecha_compra` · `fecha_recepcion` · `foto` (ruta relativa) · `url`

## Esquema · `extracciones.csv`

`id` · `fecha` · `cafe_id` · `dias_tueste` · `dosis_g` · `agua_g` · `ratio` ·
`temp_c` · `molinillo` · `clics` · `metodo` · `reparto` · `tiempo_total` ·
`variable_cambiada` · `defecto` · `notas_cata` · `nota` (1-10) ·
`siguiente_ajuste` · `receta_id` · `drawdown_s` · `dripper`

`dripper`: `v60-02-plastico` | `v60-02-ceramica`. Lista cerrada porque entra en
la detección de pares, y una errata parecería un cambio de variable. La
cerámica tiene masa térmica: sin precalentar, el mismo `temp_c` de hervidor da
una temperatura de extracción más baja.

`drawdown_s`: segundos entre el final del último vertido y el fin del goteo. Va
en segundos enteros, no en `m:ss`, porque es el valor con el que se decide si
hay que mover la molienda.

## Esquema · `recetas.csv` y `pasos.csv`

`recetas.csv`: `id` · `nombre` · `ratio` · `notas`

`pasos.csv`: `receta_id` · `orden` · `t_inicio_s` · `accion` · `agua_g` · `notas`

Una receta es una **lista de pasos**, no solo una lista de vertidos: agitar,
meter la cuchara o esperar el goteo son pasos sin agua y hacen falta para guiar
una extracción de verdad.

`accion`: `verter` | `agitar` | `remover` | `esperar` | `retirar`

Solo `verter` lleva gramos y solo `verter` escala con el agua: **la suma de los
vertidos es el agua de referencia**, así que `60-60-90-90` sobre 300 g son
`54-54-81-81` sobre 270 g. Los tiempos no se tocan. La receta es la intención;
el `reparto` de la extracción es lo que echaste de verdad.

### Cada acción frente a la báscula

Importa para el cronómetro, y explica por qué un autoavance por peso a lo bruto
se rompería:

| Acción | El peso | Qué debe hacer la app |
|---|---|---|
| `verter` | Sube | Objetivo **acumulado** («hasta 120 g»), que es como se vierte con báscula |
| `agitar` | Ruido y picos | Ignorar la báscula, solo tiempo |
| `remover` | **Sube**: la cuchara pesa mientras está dentro | Ignorar la báscula, o saltará el paso sola |
| `esperar` | Meseta | La meseta **es** el fin del goteo: de ahí sale `drawdown_s` |
| `retirar` | **Cae de golpe** | La caída marca el fin de la extracción |

`recetas.guion(pasos, agua)` devuelve todo eso ya resuelto: agua escalada,
acumulado y si la lectura es fiable en cada paso.

## Las dos reglas de edición

`extracciones.csv` es un **log de eventos**: append-only estricto, una fila no
se edita nunca. `cafes.csv`, `recetas.csv` y `pasos.csv` son **catálogo y
estado**: sus filas se pueden corregir, y `estado` tiene que poder pasar a
`terminado`.

En ninguno se reordenan ni se reescriben filas del pasado.

`defecto`: `equilibrado` | `amargor` | `astringente` | `plano` | `agrio` | `salado` | `carton`

`reparto`: gramos de cada vertido separados por guiones. `60-60-90-90` son dos
vertidos de fase 1 y dos de fase 2.

## Equipo

Hario V60 02 de plástico (el de diario) y V60 02 de cerámica. Comandante C40.
Báscula con temporizador y tara.

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

## Sugerencias

`nueva.py` propone qué mover en la siguiente, y lo usa como valor por defecto
de `siguiente_ajuste`. No hay ningún modelo detrás, y es deliberado:

- **Reglas fijas.** La tabla de arriba más el goteo. El `drawdown_s` manda sobre
  el sabor: es una señal mecánica y no depende de cómo tengas el paladar ese día.
- **Deltas emparejados.** Como el protocolo cambia **una** variable entre
  extracciones, cada par consecutivo del mismo café ya es una comparación
  controlada. Con dos pares en la misma dirección empieza a informar: «bajar
  `temp_c` movió la nota +1.5 de media». Una regresión sobre estos datos daría
  coeficientes de ruido con pinta de precisión.
- **Cobertura.** Qué valores ya has probado con ese café, para no repetir sin
  darte cuenta.

Los umbrales (`DRAWDOWN_LARGO_S`, `DIAS_TUESTE_VIEJO`...) están al principio de
`sugerencias.py` y son puntos de partida, no verdades: cámbialos cuando tengas
extracciones suficientes para saber cuáles son los tuyos.

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
