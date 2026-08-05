# Registro de café

Bitácora de extracciones en V60 con el método 4:6 de Tetsu Kasuya.
Objetivo: cambiar **una sola variable** entre extracciones y ver qué efecto tiene.

Los datos viven en **Cloudflare D1** y se registran por la **API**. Los CSV de
este repo son una **exportación**, no el original: se regeneran con
`python herramientas/exportar_csv.py` y editarlos a mano no cambia nada.

## La API

En producción, **`https://brew.krahegwen.com`**: la app y la API las sirve el
**mismo Worker**. `/api/*` lo atiende el script y el resto sale de los
estáticos de la app.

Compartir origen no es cosmético: elimina CORS de raíz, y deja la puerta
abierta a mover el token de `localStorage` a una cookie `httpOnly`, que es la
mejora pendiente de la autenticación.

En local, con su propia base y sin tocar la de verdad:

```bash
pnpm install
pnpm db:local     # esquema y semilla en una D1 local
pnpm dev:api      # la API en :8787
pnpm dev:web      # la app en :3000, con /api proxeado a :8787
```

| Ruta | Qué hace |
|---|---|
| `GET /api/cafes` | Las bolsas |
| `GET /api/recetas` | Recetas con sus pasos |
| `GET /api/extracciones` | Historial, con `ratio` y `dias_tueste` ya derivados. `?cafe=gary` filtra |
| `POST /api/extracciones` | Registra una extracción. Devuelve la fila y las sugerencias |

El `POST` recibe **una extracción en JSON, nunca una operación de git ni SQL**.
Ese contrato es lo que permite cambiar de método de autenticación sin tocar la
app: solo se reescribe `autorizado()` en `api/src/auth.js`.

Lo que calcula el servidor y no debes mandar: el `id`, el `reparto` (sale de
escalar la receta al agua real, salvo que lo mandes explícito porque ese día te
desviaste), y `ratio` y `dias_tueste`, que los deriva la vista.

Escribir exige `Authorization: Bearer <TOKEN_ESCRITURA>`. En local va en
`.dev.vars`; en producción, `wrangler secret put`. Sin secreto configurado el
Worker **falla cerrado**: no autoriza a nadie.

El Worker no sirve por `workers.dev`, solo por el dominio propio. El subdominio
`workers.dev` de una cuenta se genera a partir del correo y puede llevar el
nombre real dentro, y esa URL acabaría incrustada en el código de la app.

## Ficheros

| Fichero | Qué es |
|---|---|
| `api/migrations/` | El esquema de D1 y la semilla. Es la definición de los datos. |
| `api/src/` | La API: rutas, validación, escalado de recetas y sugerencias. |
| `web/` | La app: Nuxt estático, instalable en el móvil. |
| `datos/` | Exportación legible de lo que hay en D1. **No es la fuente.** |
| `resumen.py` | Ranking, histórico y frescura, leyendo de la API. `python resumen.py` |
| `herramientas/exportar_csv.py` | Vuelca D1 a los CSV. Es el respaldo. |
| `herramientas/csv_a_sql.py` | Generó la semilla desde los CSV originales. Ya cumplió. |

Ya no hay CLI de alta. Se registra por la API, y de ahí tira la app.

## La app

Nuxt 4 con `ssr: false`: los datos son personales y viven tras la API, así que
no hay nada que renderizar en servidor y `nuxt generate` produce ficheros
estáticos. El día que haya páginas públicas indexables —recetas, una landing—
se activa el prerender **solo para esas rutas** y el resto sigue siendo cliente.
Esa puerta abierta es la razón de elegir Nuxt y no Vue pelado.

Instalable como PWA, con la API cacheada en modo *network first*: unos datos
viejos en la bitácora confunden más que un error, pero sin cobertura responde
la caché.

La app se despliega dentro del Worker, así que **hay que construirla antes**:

```bash
pnpm --filter @coffee/web build
pnpm deploy:api
```

En desarrollo, `nuxt dev` proxea `/api` al Worker de `:8787`, así que también
ahí es el mismo origen y el código no se entera de la diferencia.

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

`guion(pasos, agua)` en `api/src/recetas.js` devuelve todo eso ya resuelto: agua
escalada, acumulado y si la lectura es fiable en cada paso.

## Qué garantiza la base

Las reglas ya no dependen de que un script se acuerde: están en los `CHECK` del
esquema y las aplica D1 aunque el que escriba sea otro.

- `nota` de 1 a 10, y listas cerradas para `defecto`, `dripper`, `estado` y `accion`
- **Solo `verter` lleva gramos**; el resto de acciones van a 0
- Claves foráneas: no hay extracción sin café, ni paso sin receta
- Fechas en AAAA-MM-DD **que existan de verdad**: el 30 de febrero se rechaza
- `ratio` y `dias_tueste` no se guardan, los deriva la vista `v_extracciones`

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

Cada `POST /api/extracciones` devuelve, junto a la fila creada, qué mover en la
siguiente. No hay ningún modelo detrás, y es deliberado:

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
`api/src/sugerencias.js` y son puntos de partida, no verdades: cámbialos cuando
tengas extracciones suficientes para saber cuáles son los tuyos.

## Registrar una extracción

```bash
curl -X POST https://brew.krahegwen.com/api/extracciones \
  -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"cafe_id":"gary","temp_c":91,"clics":28,"tiempo_total":"3:30",
       "drawdown_s":45,"variable_cambiada":"91 °C","defecto":"equilibrado",
       "nota":8,"notas_cata":"Más dulzor"}'
```

Obligatorios: `cafe_id`, `temp_c`, `clics`, `tiempo_total`, `variable_cambiada`,
`defecto` y `nota`. Lo que no mandes toma la receta base: `dosis_g` 20, `agua_g`
300, molinillo Comandante C40, receta `kasuya-46-base`, dripper de plástico y la
fecha de hoy. La fila entra entera o no entra: si algo no valida, **422** con la
lista de errores y no se escribe nada.

## Puesta en marcha

```bash
git clone https://github.com/Krahegwen/coffee-data.git
cd coffee-data
git config core.hooksPath hooks
pnpm install
python -m pip install pytest
```

`git config core.hooksPath hooks` activa el hook de `pre-commit`, que ejecuta
**las dos suites** —pytest para el esquema y el runner de Node para el Worker—
y aborta el commit si fallan. Hay que ejecutarlo una vez por clon: git no
activa los hooks solo.

| Comando | Qué hace |
|---|---|
| `python resumen.py` | Ranking, histórico y frescura, desde la API |
| `python herramientas/exportar_csv.py` | Vuelca D1 a los CSV del repo |
| `python -m pytest` | Tests del esquema SQL |
| `pnpm test` | Tests del Worker |
| `pnpm dev` | La API en local, contra una D1 local |
| `pnpm exec wrangler deploy` | A producción |

Apunta a otra API con `COFFEE_API`, por ejemplo `COFFEE_API=http://127.0.0.1:8787`.

## Respaldo

Al dejar de llevar los datos en git, **D1 pasó a ser la única copia**.
`herramientas/exportar_csv.py` vuelca la base a los CSV del repo; commitearlos
de vez en cuando es el respaldo, y de paso devuelve un diff mirable de lo que
cambió.
