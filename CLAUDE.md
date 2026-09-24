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
  el parche de la versión en los cuatro `package.json` y lo mete en el commit.
  Esa versión es la que sale en el pie de la app: no la toques a mano salvo
  para subir mayor o menor, que eso sí es una decisión — y entonces basta con
  el `package.json` de la raíz: si su número ya no es el de `HEAD`, el hook lo
  copia a los otros tres y no sube el parche encima. Un commit que **solo
  toca `datos/`** se salta las dos cosas —ninguna suite mira los CSV y la
  versión miente si sube sin cambiar código—, que es como poner el respaldo
  al día deja de invitar a `--no-verify`.
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

No mandes `id`, `creado_en`, `ratio`, `dias_tueste` ni `reparto`: los calcula
el servidor. Los dos primeros **se aceptan** si llegan —con formato: uuid y
sello de SQLite—, pero son para la cola de salida de la app, que reenvía
filas nacidas en local; repetir una id no duplica, responde 409 con
`repetida`. El `reparto` sale de escalar la receta al agua real, así que solo
se manda si ese día te desviaste de la receta.

`siguiente_ajuste` **tampoco hace falta**: si no lo mandas, el servidor guarda
la sugerencia principal. Lo que escribas manda siempre sobre eso.

`variable_cambiada` **igual**: sin ella, el servidor la compone del diff contra
la madre —`temp_c 91 → 94`—, y si no se movió nada apunta «Sin cambios»,
«Primera extracción» o «Taza suelta» según el caso. Mándala solo cuando el
cambio no sea una columna: otra agua, otra báscula, la mano del día. Si el
usuario cambió dos cosas, el diff las cuenta las dos y la respuesta trae un
aviso — el dato queda apuntado, pero no formará par.

Ese texto tiene **un solo formato**, el de `textoDeVariables` en el núcleo:
nombre de columna y slug, sin traducir, como ya hacía `siguiente_ajuste` con
`clics +2`. La app compone el suyo con la misma función; las etiquetas bonitas
—«Temperatura», el nombre de la receta— son de la pantalla que lo enseña y no
de la columna. Si añades otro sitio que escriba ahí, sale de esa función.

`dripper`, `molinillo`, `filtro`, `bascula`, `hervidor` y `agua` (qué agua;
cuánta es `agua_g`) son **accesorios del catálogo** (ver «Accesorios») y se
mandan por uuid, slug o nombre: `"origami"`, `"Comandante C40"`. Sin
mandarlos **se heredan de la madre**, y sin madre se pone el último que usó;
no hay valor de fábrica, que con él cada taza «cambiaba de molinillo» sola.
Así que no los mandes salvo que el usuario diga que cambió de aparato — y
entonces es la variable de esa extracción.

`desde_id` **tampoco**: dice de qué extracción es variación ésta —contra ella
mide el motor los deltas— y sin él el servidor cuelga la nueva de la última de
esa bolsa, que es el caso de todos los días. Se manda **solo al volver a una
rama anterior**: si el usuario cuenta que vuelve al 91 tras un callejón sin
salida, localiza esa extracción y mándala. La madre nunca sale de la bolsa,
tiene que ser anterior, y una taza suelta no cuelga de nadie.

`extraido_g` es lo que acabó en la taza. Es opcional, pero con el agua y la
dosis da la retención (unos 2 g por gramo de café en V60) y el servidor avisa
si se sale, que ahí lo que falla es la medida y no el café.

Si falta algún obligatorio (`temp_c`, `clics`, `tiempo_total`, `defecto`,
`nota`), pregúntaselo en vez de inventarlo.

**`defecto` admite varios**, en orden de relevancia: array
(`["amargor","astringente"]`) o texto con comas. Se registran todos y **la
sugerencia sale solo del primero** — dos palancas tirarían del molinillo en
direcciones opuestas—, así que si el usuario menciona dos, pregúntale cuál
molesta más y ponlo delante. Los avisos sí miran la lista entera.
`equilibrado` quiere decir que no hay defecto y por eso no acompaña a
ninguno: mandarlo junto a otro es un 422.

`cafe_id` es opcional: una taza sin ficha —el café de un amigo, una muestra—
se registra **suelta**, sin bolsa. El motor no la compara con ninguna otra
(dos sueltas no son el mismo café), pero las reglas de la propia taza sí
sugieren: defecto, goteo y retención hablan igual y `siguiente_ajuste` se
guarda como siempre. Si el usuario va a repetir ese café, ofrécele dar de
alta la bolsa antes que registrar a ciegas. Si `cafe_id` viene, tiene que
existir.

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

**No mandes `slug`**: la API lo rechaza — sale del nombre (minúsculas, sin
acentos, espacios a guion bajo) y si ya existe se le pone sufijo — `gary`,
`gary_2` — porque la segunda bolsa del mismo café es normal. La clave es un
UUIDv7 que pone quien crea la fila: el servidor si no llega, o el cliente —la
cola de salida la manda puesta al reenviar—; a mano tampoco la mandes. **Los
endpoints aceptan uuid o slug indistintamente**: `gary` sigue valiendo en
rutas, filtros y cuerpos (`cafe_id`, `receta_id`).

La frescura tiene **dos relojes**: `fecha_tueste` mientras la bolsa está
precintada y `fecha_apertura` desde que la abres. La vista deriva
`dias_abierta` y el motor avisa pasados 21 días. `fecha_compra` y
`fecha_recepcion` ya no se piden ni se escriben —la API las rechaza—, pero las
columnas siguen ahí: quitarlas obliga a rehacer `cafes` y D1 no deja, porque
tirar una tabla que cuelga de cada extracción apunta violaciones aplazadas que
ya no se cancelan. Está contado en el README; **no lo vuelvas a intentar** sin
una idea nueva.

**Lo que queda en la bolsa se pesa, no se adivina.** El contador resta las
dosis registradas al `peso_g`, así que se queda largo con todo lo que no pasó
por la app —la bolsa anterior a la bitácora, la taza que no apuntaste—. Se
corrige mandando `restante_g` con lo que marque la báscula: el sello
(`restante_en`) lo pone quien escribe, y desde ahí se descuenta solo lo
registrado después. Van los dos o ninguno —`{"restante_g":null}` quita el
pesaje y el contador vuelve a restar del peso—, y si el pesaje pasa del peso
declarado la respuesta trae un aviso pero se guarda igual: ahí lo que falla
suele ser el peso. La cuenta es de `nucleo/src/restante.js`, que es de donde
la saca también la app.

Una fila es **una bolsa**, no un café: el tueste es lo que hace la taza, y dos
bolsas con el mismo `cafe_id` harían que el motor emparejase extracciones de
lotes distintos. La app duplica la ficha desde la bolsa vieja («Otra bolsa») y
arranca la primera extracción con los valores de la última de aquélla, pero el
motor empieza de cero igual. **Si compras dos bolsas del mismo tueste, es una
sola ficha.**

El `PATCH` solo toca lo que mandes; el `id` no se puede cambiar. **Los datos
del usuario no son un banco de pruebas**: para verificar, usa la base local
(`pnpm run dev:api`) o un cuerpo inválido, que devuelve 422 sin escribir nada.

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
curl -X POST https://brew.krahegwen.com/api/recetas -H "Authorization: Bearer $COFFEE_TOKEN"   -H 'content-type: application/json' -d '{"nombre":"4:6 con agitado",
  "ratio":15,"pasos":[{"accion":"verter","agua_g":60,"t_inicio_s":0},
  {"accion":"agitar","t_inicio_s":20},{"accion":"verter","agua_g":240,"t_inicio_s":45}]}'
```

Sin `id`: como en las bolsas, la clave es un UUID del servidor y el slug sale
del nombre. Editar y borrar aceptan el slug: `PUT /api/recetas/4_6_con_agitado`.

Solo `verter` lleva gramos; el resto van a 0. La suma de los vertidos es el
agua de referencia. Los tiempos tienen que ir en aumento, y toda receta
necesita al menos un vertido o el cronómetro no sabría qué guiar.

Un vertido puede llevar `estilo`: `espiral` o `centro`. Es **cómo** se vierte,
no una acción aparte, así que ningún otro paso lo admite. A la base va la clave
(`espiral`); la frase de cada idioma vive en `web/i18n/locales/`.
**Ningún texto visible se guarda en la base.**

Editar una receta **no cambia las extracciones ya registradas**: cada una
guardó su propio `reparto`. Para variar una que funciona, la app la duplica
desde la ficha: es el `POST` de siempre con el formulario relleno.

Borrar sí es de verdad —se van receta y pasos, sin papelera—, y el servidor
devuelve 409 si alguna extracción la usa, retiradas incluidas.

```bash
curl -X DELETE https://brew.krahegwen.com/api/recetas/kasuya-46-claridad \
  -H "Authorization: Bearer $COFFEE_TOKEN"
```

## Accesorios

El dripper, el molinillo, el filtro, la báscula, el hervidor y el agua son
filas de `accesorios`, con pantallas en
`/accesorios`, `/accesorios/nuevo` y `/accesorios/<slug>` (en inglés, `/gear`).
Se llega desde el menú del engranaje, arriba a la derecha.

```bash
curl -X POST https://brew.krahegwen.com/api/accesorios -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"tipo":"dripper","nombre":"Origami","masa_termica":true}'

curl -X PATCH https://brew.krahegwen.com/api/accesorios/comandante_c40 -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"en_uso":false}'
```

Como en las bolsas: **sin `id` ni `slug`**, que salen solos, y los endpoints
aceptan uuid o slug. `tipo` es `dripper`, `molinillo`, `filtro`, `bascula`,
`hervidor` o `agua`, cada uno con su columna del mismo nombre en `extracciones`,
y **no se cambia** —las tazas que lo usan lo apuntaron en su columna—. Un tipo
nuevo es una migración como la 0015: rehacer el trigger `accesorios_tipo_conocido`
y los dos de `extracciones`, y un `ADD COLUMN`.

Un accesorio que **no consta** en la madre no cuenta como cambio: las tazas de
antes de la 0015 no dicen qué filtro usaron, y la primera que lo apunta no
«cambió de filtro». Lo decide `diferencias` en el núcleo; no lo reimplementes. `masa_termica` solo la lleva un
dripper, y es de donde saca el motor el aviso de precalentar: ya no hay una
lista de drippers escrita en el código.

**Borrar es solo para lo que ninguna taza usa** (409 si no, retiradas
incluidas). Si el usuario vendió o rompió algo, se saca de uso con
`{"en_uso":false}`: deja de ofrecerse y las tazas lo siguen nombrando.

Las columnas `dripper` y `molinillo` de `extracciones` **conservan el nombre y
guardan la id**, a propósito: la cola vieja y los respaldos de antes mandan
texto y tienen que seguir entrando. No las renombres a `_id` sin pensar en
eso. Lo que había lo convirtió la migración 0014, y lo mismo hacen el modo local
(`web/app/almacen/legado.js`) y restaurar un respaldo del formato 1.

## Ramas y despliegue

**Una rama por tarea**: `feature/<lo-que-sea>` sale de `main` y vuelve a `main`
al terminarla, con `git merge --no-ff` para que la tarea se lea como un bloque
en el histórico. Nada de `develop` ni de ramas de release: eso coordina equipos
y versiones en paralelo, y aquí hay una persona y un despliegue a mano.

Tampoco hacen falta PR: el merge es local. La única vez que se salió de aquí fue
el **2026-09-04**, cuando las cinco tareas del día salieron de una sola rama
`claude/chat-link-preview-9509tw` y se cerraron con cinco PR — así nacen las
sesiones de Claude Code en la nube, que no tienen el disco delante. Se lee peor
en el histórico (hay un `Merge branch 'main'` de por medio que no dice nada), y
por eso queda anotado y no como precedente. Si una sesión trabaja en la nube,
que traiga su rama y se mezcle aquí como las demás.

El orden al cerrar una tarea es **commit → merge → push → deploy**, y las dos
últimas no dependen de que alguien se acuerde:

- El hook de **`pre-push`** exporta los CSV y **corta el push** si estaban
  desfasados, para que lo commitees. Sin red no corta: avisa y deja pasar, y
  **un push que solo borra ramas tampoco paga el peaje** — no sube contenido,
  así que no puede dejar el respaldo viejo. Si va contenido en el mismo push,
  se comprueba igual.
- **`pnpm run deploy`** llama antes a `herramientas/comprobar_despliegue.py`, que
  se niega si no estás en `main`, si hay algo sin commitear o si quedan commits
  sin subir. Producción tiene que poder reconstruirse desde el repo público.

Ninguno de los dos tiene puerta de atrás, igual que el de `pre-commit`. Para una
vuelta atrás de emergencia con GitHub caído está `pnpm run deploy:api`, que se
salta el guardia y hay que teclear a conciencia.

**Siempre `pnpm run <script>`, nunca `pnpm <script>`.** `deploy` es además un
comando propio de pnpm y gana al del `package.json`: el despliegue moría en
`ERR_PNPM_INVALID_DEPLOY_TARGET` con la web ya construida, y el error no
nombraba el `package.json` por ningún lado. `test_scripts.py` lo vigila en los
cuatro paquetes, así que también cubre el comando que pnpm estrene mañana.

## La voz del cronómetro

Los clips viven en `web/public/audio/{es,en}/` con un `duraciones.json` al
lado. **El manifiesto no es un extra**: `cuesDe()` lo necesita para colocar
cada frase de modo que acabe justo antes del primer pip, y sin él la agenda
sale sin voz y todo lo demás funciona igual. El primer paso no cabe en el
plan —antes del segundo 0 no hay nada—, así que lo dice la cuenta atrás de
arrancar (`cuentaAtrasDe()`): ahí son los pips los que esperan a la frase.

Se generaron con **Piper** (voz `es_ES-carlfm-x_low`, `en_GB-alan-medium`),
con un script que vive fuera del repo — al repositorio solo entra el audio.
Lo que se decidió escuchando, por si hay que rehacerlos:

- Las frases **no llevan números**. Los gramos son datos del usuario y
  concatenarlos suena a locutor de estación; la pantalla ya los enseña.
- **Punto final, más lento y menos variación de fonema.** Sin puntuación el
  modelo se come el final, y a velocidad de fábrica se atropella.
- **Las frases de una palabra no funcionan.** «Agita.» a secas sonaba plano
  por lento que fuera: un TTS necesita algo de frase para asentar la
  entonación, así que son «Agita ahora.», «Remueve ahora.». Por lo mismo se
  descartaron las voces de audiolibros, que devolvían nueve segundos para
  «Vierte en espiral».

`m4a` está en `globPatterns` de workbox: sin eso los clips no se precachean y
la cocina sin cobertura se queda muda.

## El cronómetro en la pantalla de bloqueo

Una web no llega a las Live Activities de iOS ni a las notificaciones con
cronómetro de Android. Lo que sí llega es el reproductor del sistema, así que
`usePantallaBloqueo` reproduce **un silencio en bucle por un `<audio>`** y
escribe el paso como si fuera una canción (Media Session): título, el siguiente
paso debajo y la barra del paso, que es la vuelta del anillo. En el OnePlus
sale también en la cápsula de OxygenOS; en un iPhone, falta probarlo.

- El silencio **no puede ir por Web Audio**, que es por donde suenan los pips:
  el sistema solo ve elementos multimedia. Y dura más de 5 s, porque Chrome
  trata lo más corto como un aviso suelto.
- La primera reproducción **tiene que salir de un toque** (iOS); por eso el
  reloj llama a `alSistema()` desde los gestos que arrancan, y a partir de ahí
  el audio sigue solo al reloj.
- Con la pantalla bloqueada `requestAnimationFrame` no pinta: el reloj lleva un
  intervalo de respaldo que avanza `transcurrido` mientras `document.hidden`,
  o la tarjeta no cambiaría de paso justo cuando es lo único que se ve.
- Los botones del sistema son funciones de la pantalla del reloj: se quitan al
  salir de ella y se ponen al volver. Parar no está, que restablecer pregunta.
- Se apaga en el ajuste `pantalla_bloqueo`. La prueba de la portada
  (`PruebaBloqueo.vue`) es provisional: está para que alguien con iPhone lo
  pruebe sin saber usar el crono.

## Ajustes

`/ajustes` (`/en/settings`) guarda lo que se decide una vez: los avisos del
cronómetro —sonido, cuenta atrás, latido— y la selección de preparar. Van a
la tabla `preferencias`, de clave y valor, porque son de la interfaz y no del
dominio: qué claves existen y de qué tipo es cada una lo dice
`nucleo/src/preferencias.js`, no el esquema, y así un interruptor nuevo no
pide una migración.

La cuenta atrás son **dos interruptores**: `cuenta_atras` para arrancar y
reanudar, y `cuenta_atras_saltos` para las flechas, que nace apagado —quien
salta ya está en ese paso—. Reanudar tras elegir paso con las flechas en
pausa **es un salto** y va con el segundo (`saltoEnPausa` en `useCrono()`):
no es un fallo que no cuente aunque el primero esté puesto.

Se leen con `usePreferencias()` y **se guardan con un PATCH parcial**: solo
las claves que mandas. Un PUT entero haría que dos dispositivos que cambian
cosas distintas se borrasen el uno al otro. Cada clave lleva su
`actualizado_en`, y al sincronizar **se fusionan por sello en vez de
reemplazarse** —`preferencias.fusionar`, fuera de `reemplazar`—: sin eso, un
refresco que entrara entre guardar un ajuste y encolarlo se lo llevaba por
delante para siempre.

Dos reglas que salieron de romperlas:

- Un ajuste que el servidor rechaza **se cae de la cola** en vez de atascarla
  (`PRESCINDIBLE` en `almacen/cola.js`). Nada depende de él, y bloquear por un
  interruptor dejaba la bitácora entera sin subir ni bajar.
- El `$fetch` de preferencias en `traerTodo` lleva su propio `catch`: el
  recurso menos importante no decide si baja lo importante.

## Dos idiomas

La app está en castellano e inglés, y el idioma llega hasta el fondo:

- **El núcleo también habla los dos.** Los mensajes de validación, los avisos y
  los porqués de las palancas son claves con su catálogo en
  `nucleo/src/textos.js`. Cada función recibe su `t` y por defecto es
  castellano, así que curl y los scripts se leen igual que siempre. El Worker
  saca el idioma del `Accept-Language`; en local se le pasa a la llamada.
- **Las rutas están traducidas**, no solo prefijadas: `/crono/reloj` y
  `/en/brew/timer`. El castellano no lleva prefijo y sus URLs no se mueven —la
  app instalada arranca en `/`—. El mapa está en `i18n.pages` de
  `web/nuxt.config.ts`.
- **En las plantillas no queda texto**: todo sale de `web/i18n/locales/`, y las
  etiquetas de las claves de la base (`verter`, `amargor`) las sirve
  `useTextos()`.

Tres reglas al tocarlo:

- **Nada de HTML dentro de un mensaje**: el módulo lo rechaza. Lo que lleva
  énfasis se parte en dos claves y lo compone `<i18n-t>` con una ranura.
- **Todo enlace es `NuxtLinkLocale`** y toda navegación pasa por `localePath`, o
  desde el inglés se vuelve al castellano a mitad de camino.
- **Si añades una frase, va a los dos ficheros.** Falta una clave en inglés y
  se cae al castellano, que es mejor que enseñar la clave, pero pasa
  desapercibido.

## Estructura

Workspace de pnpm con tres paquetes: `nucleo/` (la lógica, sin dependencias),
`api/` (el Worker) y `web/` (Nuxt). En la raíz, documentación, el hook y las
herramientas de Python. `datos/` son los CSV exportados.

## Si tocas el código

- `nucleo/` es la lógica de la bitácora sin saber dónde corre. `api.js` son
  **los manejadores enteros de la API**: reciben un almacén (el puerto: quince
  métodos sobre cafés, recetas, accesorios, extracciones y preferencias) y
  devuelven `{estado, datos}`. `almacen-memoria.js` es el puerto
  sobre Maps —con él se prueba la API sin base, y es la forma de referencia
  del futuro adaptador de IndexedDB—. El resto: `recetas.js`,
  `sugerencias.js`, `validacion.js`, `derivar.js`, `ids.js` y `accesorios.js`,
  que resuelve un accesorio por uuid, slug o nombre y sabe convertir el texto
  de antes del catálogo. Cero
  dependencias; si una función no puede correr en un navegador, no va aquí.
- `api/src/` es solo lo que es del servidor: `index.js` enruta y envuelve en
  Response, `auth.js` decide quién escribe, `almacen-d1.js` enchufa el puerto
  a D1, y las fotos viven aquí porque R2 no existe en el modo local.
- **Si añades un endpoint, el manejador va en `nucleo/src/api.js`** con su
  test en `nucleo/test/api.test.js` contra el almacén en memoria; en el Worker
  solo se añade la ruta.
- Las suites de Node van con `pnpm run test` (el runner de Node; la única
  dependencia de test es fake-indexeddb, en `web/`).
- `api/migrations/` es la definición de los datos. Un cambio de esquema es una
  migración nueva, nunca editar una ya aplicada. `test_esquema.py` las aplica
  en un SQLite en memoria y comprueba que las restricciones muerden de verdad.
- El cronómetro son **dos rutas**: `/crono` elige (café, receta, dosis, agua)
  y `/crono/reloj` mide. El estado lo comparten en `useCrono()`, que es
  también donde está escrita **cuándo caduca un borrador**: al guardar la
  extracción muere la medición y lo que no se repite del formulario; la
  selección de preparar es una preferencia y sobrevive. Entrar directo al
  reloj sin pasos escalados reconduce a `/crono`.
- `web/` es la app. `ssr: false` a propósito. Todo el acceso a los datos pasa
  por `useApi()`, y desde la cola de salida hay **un solo camino**: leer y
  escribir van siempre por los manejadores del núcleo contra IndexedDB
  (`web/app/almacen/idb.js`). La sesión solo añade que cada escritura se
  apunta además en la cola (`almacen/cola.js`) y `useSincro()` la sube al
  Worker y trae de vuelta la copia buena — drenar primero, traer todo y
  reemplazar después, y **nunca reemplazar con la cola no vacía**. El estado
  de la cola se ve en el pie. La sesión vive en `useSesion()` y **no guarda
  el token en ninguna parte**: lo cambia por una cookie `HttpOnly` que este
  código no puede leer; la puerta son cinco toques en la versión del pie.
- El adaptador de IndexedDB se prueba con la **misma suite de contrato** que
  los demás (`nucleo/test/contrato.js`), con fake-indexeddb; el modo sin
  sesión arranca sembrando las tres recetas base (`web/app/almacen/semilla.js`).
  La cola tiene su suite (`web/test/cola.test.js`), con el test de paridad:
  drenar contra un almacén en memoria deja «el servidor» idéntico al local.
- El respaldo (`/respaldo`, `web/app/almacen/respaldo.js`) es un ZIP *stored*
  con los CSV en el **mismo formato que `datos/`** —si tocas columnas en
  `exportar_csv.py`, tócalas también ahí; `test_columnas.py` lo vigila— y
  restaurar valida todo por los
  manejadores contra memoria antes de reemplazar el cajón. Ojo al pasar filas
  a IndexedDB desde Vue: un proxy reactivo no se deja clonar — `shallowRef`.
- La app **no reimplementa reglas del servidor**. El escalado de recetas lo da
  el manejador `guion` del núcleo — por la red o en proceso, según el modo —;
  si necesitas otra lógica de dominio, hazle un manejador al núcleo.
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

Las extracciones van por su uuid — no hay slug que teclear, así que primero se
localiza con un GET (por ejemplo `?cafe=gary`) y se copia el `id`:

```bash
curl -X PATCH https://brew.krahegwen.com/api/extracciones/<uuid> -H "Authorization: Bearer $COFFEE_TOKEN" \
  -H 'content-type: application/json' -d '{"nota":8}'

curl -X DELETE https://brew.krahegwen.com/api/extracciones/<uuid> -H "Authorization: Bearer $COFFEE_TOKEN"
curl -X POST https://brew.krahegwen.com/api/extracciones/<uuid>/restaurar -H "Authorization: Bearer $COFFEE_TOKEN"
```

El borrado es lógico: marca `borrada_en` y la fila se queda. **Si el usuario
quiere retirar una extracción porque salió mal, adviértele**: quitar las malas
sube las medias solas y deja los deltas emparejados sin sentido. Retirar es
para errores de registro.

La respuesta trae `huerfanas`: cuántas colgaban de ella. No impide nada —esto
se deshace y restaurarla devuelve los pares—, pero dilo: esas extracciones se
quedan sin base con la que compararse y pasan a contar como primeras. Y debe
ser así, que un delta medido contra un error de registro no vale nada.

## Tras desplegar, espera antes de verificar

La propagación tarda **hasta un minuto**. Verificar antes ha dado cuatro falsos
negativos —404 en rutas que existían— y llevó a diagnosticar bugs inexistentes.
Espera 45-60 s, y si algo falla, repítelo un par de veces antes de concluir nada.
