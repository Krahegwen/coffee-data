# Instrucciones para Claude

Bitácora de extracciones de café en V60 con el método 4:6 de Tetsu Kasuya.
Los datos viven en **Cloudflare D1** y se registran por la **API**
(`https://brew.krahegwen.com`). Los CSV del repo son una exportación.

## Reglas que no se rompen

- **Los CSV no son la fuente.** Editarlos no cambia nada: se regeneran desde D1
  con `python herramientas/exportar_csv.py`. Si alguien pide «añade una fila al
  CSV», lo que quiere es un `POST` a la API.
- **Una sola variable por extracción.** Si el usuario cambió dos cosas a la vez,
  díselo: el dato no sirve para comparar. Regístralo igual si insiste, pero que
  `variable_cambiada` lo refleje. Ojo: **cambiar de dripper cuenta como
  variable**. El de cerámica tiene masa térmica y baja la temperatura real del
  lecho si no se precalienta, así que no se cambia de dripper y de `temp_c` en
  la misma extracción.
- **La PWA nunca hablará con la base ni mandará SQL.** Manda una extracción en
  JSON al endpoint. Ese contrato es lo que permite cambiar de autenticación sin
  tocar la app, y toda la decisión de auth vive en `api/src/auth.js`.
- **Nada de GitHub Actions.** La verificación vive en el hook de `pre-commit`,
  que ejecuta pytest y los tests del Worker, y al final —solo si pasan— sube
  el parche de la versión en los tres `package.json` y lo mete en el commit.
  Esa versión es la que sale en el pie de la app: no la toques a mano salvo
  para subir mayor o menor, que eso sí es una decisión.
- **Repo público**: ni datos personales ni credenciales en el código, en los
  mensajes de commit o en la configuración. Y ojo con las URL: el subdominio
  `workers.dev` de la cuenta lleva el nombre real dentro, por eso el Worker
  sirve solo por `brew.krahegwen.com`.
- **Solo librería estándar** en los scripts de Python. En el Worker, cero
  dependencias de runtime.

## Registrar una extracción

El usuario lo contará en lenguaje normal («un Gary a 91 grados, 28 clics, 3:30,
equilibrado, un 8»). Tradúcelo a un `POST`:

```bash
curl -X POST https://brew.krahegwen.com/api/extracciones \
  -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"cafe_id":"gary","temp_c":91,"clics":28,"tiempo_total":"3:30",
       "drawdown_s":45,"variable_cambiada":"91 °C","defecto":"equilibrado","nota":8}'
```

El token está en la variable de entorno `COFFEE_TOKEN` del usuario. Si el shell
no la ve, se lee del registro de Windows sin imprimirla:
`(Get-ItemProperty HKCU:\Environment -Name COFFEE_TOKEN).COFFEE_TOKEN`.

**Leer también pide token** desde que la bitácora es privada: cualquier `GET`
a `/api/*` (salvo `/api/sesion`) va con la misma cabecera. `resumen.py` y
`exportar_csv.py` lo cogen solos de `COFFEE_TOKEN`.

No mandes `id`, `ratio`, `dias_tueste` ni `reparto`: los calcula el servidor.
El `reparto` sale de escalar la receta al agua real, así que solo se manda si
ese día te desviaste de la receta.

`siguiente_ajuste` **tampoco hace falta**: si no lo mandas, el servidor guarda
la sugerencia principal. Lo que escribas manda siempre sobre eso.

`extraido_g` es lo que acabó en la taza. Es opcional, pero con el agua y la
dosis da la retención (unos 2 g por gramo de café en V60) y el servidor avisa
si se sale, que ahí lo que falla es la medida y no el café.

Si falta algún obligatorio (`cafe_id`, `temp_c`, `clics`, `tiempo_total`,
`variable_cambiada`, `defecto`, `nota`), pregúntaselo en vez de inventarlo.

`--drawdown_s` va en segundos, del final del último vertido al fin del goteo.
Es el dato del que depende la sugerencia de molienda: pídelo aunque sea
opcional.

**La respuesta trae un bloque `sugerencias`. Reléeselo al usuario**: es la mitad
del valor de registrar. Solo se aplica la primera.

## Cafés

Tienen endpoints, y la app tiene pantallas: `/cafes`, `/cafes/nueva` y
`/cafes/<id>`.

```bash
curl -X POST https://brew.krahegwen.com/api/cafes -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"nombre":"Etiopía Guji","peso_g":250}'

curl -X PATCH https://brew.krahegwen.com/api/cafes/abbie -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"estado":"terminado"}'
```

**No mandes `id`**: sale del nombre (minúsculas, sin acentos, espacios a guion
bajo). Si ya existe, se le pone sufijo — `gary`, `gary_2` — porque la segunda
bolsa del mismo café es normal. Un `id` explícito que choque sigue dando 409.

La frescura tiene **dos relojes**: `fecha_tueste` mientras la bolsa está
precintada y `fecha_apertura` desde que la abres. La vista deriva
`dias_abierta` y el motor avisa pasados 21 días. `fecha_compra` y
`fecha_recepcion` ya no se piden ni se escriben —la API las rechaza—, pero las
columnas siguen ahí: quitarlas obliga a rehacer `cafes` y D1 no deja, porque
tirar una tabla que cuelga de cada extracción apunta violaciones aplazadas que
ya no se cancelan. Está contado en el README; **no lo vuelvas a intentar** sin
una idea nueva.

Una fila es **una bolsa**, no un café: el tueste es lo que hace la taza, y dos
bolsas con el mismo `cafe_id` harían que el motor emparejase extracciones de
lotes distintos. La app duplica la ficha desde la bolsa vieja («Otra bolsa») y
arranca la basal con los valores de la última extracción de aquélla, pero el
motor empieza de cero igual. **Si compras dos bolsas del mismo tueste, es una
sola ficha.**

El `PATCH` solo toca lo que mandes; el `id` no se puede cambiar. **Los datos
del usuario no son un banco de pruebas**: para verificar, usa la base local
(`pnpm dev:api`) o un cuerpo inválido, que devuelve 422 sin escribir nada.

La foto de la bolsa va aparte, en binario (jpeg, png o webp, 10 MB máximo);
**no entra por JSON**, así el servidor mantiene la columna y el objeto de R2
a la par. La sirve el Worker en `/api/` + la clave que guarda la ficha, y
cada subida estrena clave: reemplazar no deja cachés con la foto vieja.

```bash
curl -X PUT https://brew.krahegwen.com/api/cafes/gary/foto \
  -H "Authorization: Bearer $COFFEE_TOKEN" -H 'content-type: image/jpeg' \
  --data-binary @bolsa.jpg

curl -X DELETE https://brew.krahegwen.com/api/cafes/gary/foto \
  -H "Authorization: Bearer $COFFEE_TOKEN"
```

## Recetas

Tienen endpoints y pantallas: `/recetas`, `/recetas/nueva`, `/recetas/<id>`.
Los pasos se mandan **enteros y reemplazan** a los que hubiera; el orden lo da
la posición en la lista.

```bash
curl -X POST https://brew.krahegwen.com/api/recetas -H "Authorization: Bearer $COFFEE_TOKEN"   -H 'content-type: application/json' -d '{"id":"kasuya-46-agitado","nombre":"4:6 con agitado",
  "ratio":15,"pasos":[{"accion":"verter","agua_g":60,"t_inicio_s":0},
  {"accion":"agitar","t_inicio_s":20},{"accion":"verter","agua_g":240,"t_inicio_s":45}]}'
```

Solo `verter` lleva gramos; el resto van a 0. La suma de los vertidos es el
agua de referencia. Los tiempos tienen que ir en aumento, y toda receta
necesita al menos un vertido o el cronómetro no sabría qué guiar.

Un vertido puede llevar `estilo`: `espiral` o `centro`. Es **cómo** se vierte,
no una acción aparte, así que ningún otro paso lo admite. A la base va la clave
(`espiral`); el castellano («en espiral») vive en
`web/app/composables/textos.ts`, el catálogo que se duplicará por idioma
cuando haya i18n. **Ningún texto visible se guarda en la base.**

Editar una receta **no cambia las extracciones ya registradas**: cada una
guardó su propio `reparto`. Para variar una que funciona, la app la duplica
desde la ficha: es el `POST` de siempre con el formulario relleno.

Borrar sí es de verdad —se van receta y pasos, sin papelera—, y el servidor
devuelve 409 si alguna extracción la usa, retiradas incluidas.

```bash
curl -X DELETE https://brew.krahegwen.com/api/recetas/kasuya-46-claridad \
  -H "Authorization: Bearer $COFFEE_TOKEN"
```

## Estructura

Workspace de pnpm con tres paquetes: `nucleo/` (la lógica, sin dependencias),
`api/` (el Worker) y `web/` (Nuxt). En la raíz, documentación, el hook y las
herramientas de Python. `datos/` son los CSV exportados.

## Si tocas el código

- `nucleo/` es la lógica de la bitácora sin saber dónde corre: `recetas.js`,
  `sugerencias.js`, `validacion.js` y `derivar.js` (el equivalente JS de la
  vista SQL, para el almacén local). Cero dependencias; si una función no
  puede correr en un navegador, no va aquí.
- `api/src/` es la API: `index.js` enruta y habla con D1, `auth.js` decide
  quién escribe. Todo lo demás lo importa de `@coffee/nucleo`.
- Las dos suites van con `pnpm test` (el runner de Node, sin dependencias).
- `api/migrations/` es la definición de los datos. Un cambio de esquema es una
  migración nueva, nunca editar una ya aplicada. `test_esquema.py` las aplica
  en un SQLite en memoria y comprueba que las restricciones muerden de verdad.
- `web/` es la app. `ssr: false` a propósito. Todo el acceso a la API pasa por
  `useApi()`: si añades una llamada, va ahí y con su tipo. La sesión vive en
  `useSesion()` y **no guarda el token en ninguna parte**: lo cambia por una
  cookie `HttpOnly` que este código no puede leer.
- La app **no reimplementa reglas del servidor**. El escalado de recetas lo da
  `GET /api/guion`; si necesitas otra lógica de dominio, hazle un endpoint.
- Al desplegar, comprueba que subieron **script y assets**. Ha pasado dos veces
  que wrangler suba solo uno y lo dé por bueno: verifica una ruta nueva antes
  de dar el despliegue por hecho.
- Ejecuta **las dos suites** antes de commitear. El hook lo hace por ti; no uses
  `--no-verify`.
- Tras desplegar, `python herramientas/exportar_csv.py` mantiene el respaldo al
  día.

## Interpretar los resultados

`python resumen.py` da ranking, histórico y frescura leyendo de la API. Las
palancas de ajuste están en la tabla del README; úsala para sugerir el
`siguiente_ajuste`, y recuerda mover una sola cosa.

## Corregir y retirar extracciones

```bash
curl -X PATCH https://brew.krahegwen.com/api/extracciones/3 -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"nota":8}'

curl -X DELETE https://brew.krahegwen.com/api/extracciones/3 -H "Authorization: Bearer $COFFEE_TOKEN"
curl -X POST https://brew.krahegwen.com/api/extracciones/3/restaurar -H "Authorization: Bearer $COFFEE_TOKEN"
```

El borrado es lógico: marca `borrada_en` y la fila se queda. **Si el usuario
quiere retirar una extracción porque salió mal, adviértele**: quitar las malas
sube las medias solas y deja los deltas emparejados sin sentido. Retirar es
para errores de registro.

## Tras desplegar, espera antes de verificar

La propagación tarda **hasta un minuto**. Verificar antes ha dado cuatro falsos
negativos —404 en rutas que existían— y llevó a diagnosticar bugs inexistentes.
Espera 45-60 s, y si algo falla, repítelo un par de veces antes de concluir nada.
