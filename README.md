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

Compartir origen no es cosmético: elimina CORS de raíz, y es lo que permitió
sacar el token de `localStorage` y meterlo en una cookie `HttpOnly`.

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
| `GET /api/extracciones` | Historial, con `ratio` y `dias_tueste` derivados. `?cafe=gary` filtra, `?retiradas=1` es la papelera |
| `GET /api/guion` | Los pasos de una receta escalados. `?receta=kasuya-46-base&agua=270` |
| `POST /api/cafes` | Da de alta una bolsa. Sin `id`, se deriva del nombre |
| `POST /api/recetas` | Crea una receta con sus pasos |
| `PUT /api/recetas/:id` | Guarda una receta. Los pasos **reemplazan** a los que había |
| `DELETE /api/recetas/:id` | La borra con sus pasos. **Sin papelera**, y da 409 si alguna extracción la usa |
| `PATCH /api/cafes/:id` | Corrige una ficha. Solo toca los campos que mandes |
| `PATCH /api/extracciones/:id` | Corrige una extracción |
| `DELETE /api/extracciones/:id` | La retira. **Borrado lógico**: la fila se queda |
| `POST /api/extracciones/:id/restaurar` | La devuelve |
| `POST /api/extracciones` | Registra una extracción. Devuelve la fila y las sugerencias |
| `PUT /api/cafes/:id/foto` | Sube o reemplaza la foto de la bolsa. El cuerpo es la imagen tal cual (jpeg, png o webp, 10 MB máximo) |
| `DELETE /api/cafes/:id/foto` | La quita |
| `GET /api/fotos/...` | Sirve la foto desde R2. La URL es `/api/` + la clave que guarda la ficha |
| `GET/POST/DELETE /api/sesion` | Consulta, abre y cierra la sesión de escritura |

El `POST` recibe **una extracción en JSON, nunca una operación de git ni SQL**.
Ese contrato es lo que permite cambiar de método de autenticación sin tocar la
app: solo se reescribe `autorizado()` en `api/src/auth.js`.

Lo que calcula el servidor y no debes mandar: el `id`, el `reparto` (sale de
escalar la receta al agua real, salvo que lo mandes explícito porque ese día te
desviaste), y `ratio` y `dias_tueste`, que los deriva la vista.

Escribir exige el mismo secreto por una de dos vías: `Authorization: Bearer
<TOKEN_ESCRITURA>` para curl y scripts, o la **cookie de sesión** para la app.
En local el secreto va en `.dev.vars`; en producción, `wrangler secret put`.
Sin secreto configurado el Worker **falla cerrado**: no autoriza a nadie.

La app abre sesión con `POST /api/sesion`: el token viaja una vez y a cambio
recibe una cookie `HttpOnly`, `SameSite=Strict`, `Path=/api`. El JavaScript no
puede leerla, así que un XSS ya no se lleva el token, y otro sitio no puede
provocar una escritura desde tu navegador. Antes vivía en `localStorage`; solo
se pudo cambiar cuando la app y la API pasaron a compartir origen.

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
| `herramientas/subir_version.py` | Sube el parche en los tres `package.json`. Lo llama el hook. |

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

El botón de instalar no sale si ya la tienes puesta, **aunque estés viéndola en
una pestaña del navegador**. Mirar el `display-mode` solo dice cómo la abriste
tú; para saber si existe en la pantalla de inicio hace falta
`getInstalledRelatedApps()`, y para que conteste algo, que el manifiesto se
declare a sí mismo en `related_applications`. Es de Chromium: en iOS y en
Firefox no se sabe, y entonces no se dice nada.

El botón sale además **solo con puntero grueso** (`pointer: coarse`), que
es el móvil o la tablet. No se mira el ancho de la ventana, que miente en
cuanto encoges el navegador, ni el user agent, que miente siempre. Tampoco
vale gatearlo por `beforeinstallprompt`: en el Chrome de escritorio también
llega —una PWA se instala igual en un PC— y en iOS no llega nunca, que es
justo donde hace falta el botón para poder explicar dónde está la opción en el
menú.

Pantallas: listado, **cronómetro**, alta, bolsas (`/cafes`), recetas
(`/recetas`) y corrección de extracciones (`/extracciones/<id>`). Se navega con
migas de pan y no con un «volver»: desde la ficha de una bolsa, «volver» podía
ser el listado o la portada según por dónde hubieras entrado. Cada pantalla
declara su ruta en vez de deducirla de la URL, porque los tramos dinámicos son
ids —`gary`, `3`— y lo que hay que leer es el nombre de la bolsa.

El alta arranca con la extracción anterior de esa bolsa ya puesta, porque el
protocolo es repetir y mover una sola cosa: lo que teclees debería ser justo
esa cosa. La **variable cambiada** se elige de una lista —una fila por
variable, con el valor de antes en solo lectura y el nuevo para escribir— y el
texto se genera de ahí. Lo que escribes va a la columna de verdad; el texto
sale de las columnas y nunca al revés, que si no acaban contándose cosas
distintas. Si añades una segunda fila, el formulario avisa de que ese par ya no
va a decir nada.

La corrección de una extracción lleva el mismo editor, y ahí la tabla **sale
puesta**: se deduce comparando las columnas con las de la extracción
**inmediatamente anterior a ésa**, no con la última de la bolsa —corrigiendo la
#2 hay que comparar con la #1 aunque existan la #5 y la #6—. No se lee del
texto guardado: el texto es una etiqueta y las columnas son el dato; si alguna
vez discrepan, mandan las columnas.

La etiqueta se compone **al guardar**, nunca mientras editas, y solo si has
tocado la tabla. Reescribirla en caliente tenía un efecto feo: abrir una ficha
con dos variables y añadir una fila la truncaba a una sola.

**Quitar una fila deshace el cambio**: el valor vuelve al de la extracción
anterior. La tabla es la lista de lo que cambió, así que borrar una línea es
decir «esto no pasó»; si solo desapareciera del texto, la columna se quedaría
cambiada y las dos se contradirían. Sin extracción anterior no hay a dónde
volver y el valor se queda como está.

Y va en los dos sentidos: tocar el campo de siempre —el de Temperatura, el de
Clics— **crea su fila** en cuanto el valor se aleja de la anterior. Devolverlo
a su sitio, en cambio, **no la quita**: se queda con el mismo número a los dos
lados hasta que recargues o cambies de pantalla. Una tabla que se encoge sola
mientras escribes mueve de sitio lo que estás mirando, y basta pasar por un
valor intermedio al teclear para perder la fila recién creada.

De la portada se sale por una sola puerta, **preparar**. El paso previo del
cronómetro —café, receta, dosis, agua y el guion escalado delante— acaba en dos
salidas: al reloj, o al alta a mano con todo eso ya puesto. Hasta ahí se llega
con la misma información en pantalla, y solo entonces se sabe cuál de las dos
quieres: si el café ya está hecho, el reloj no pinta nada.

El cronómetro pide el guion a la API —no reimplementa el escalado—, muestra el
objetivo **acumulado** de cada vertido, avisa cuando no hay que fiarse de la
báscula y mantiene la pantalla encendida. Al marcar «dejó de gotear» calcula el
`drawdown_s` **solo** y salta al alta con tiempo, goteo, café y receta ya
puestos. Ese dato es justo el que a mano no se registra bien.

**Toda la esfera es el botón de pausa** —es lo más grande de la pantalla y se
acierta sin mirar—, y hay otro encima del de gotear para quien prefiera un
botón con su nombre. La pausa es de verdad: lo que dure no cuenta.

Marcar el goteo **se puede deshacer**, que se pulsa sin querer con el hervidor
en la mano. Al deshacerlo el reloj se pone al día con el tiempo real y no
vuelve a donde se marcó: el café siguió goteando mientras caías en la cuenta.
Salvo que estuvieras en pausa al marcarlo, y entonces se sigue donde estaba,
porque esa parada sí fue a propósito.

Las fotos de las bolsas se ven en la portada y en `/cafes` como miniatura, y
enteras en la ficha, que las enseña **sin necesidad de sesión**: mirar una
bolsa no es editarla. Antes de subirlas, la app las **encoge** a 1600 px de
lado y las recodifica a webp (`encogerFoto` en `web/app/composables/foto.ts`):
una foto de 12 MP son megas que el móvil se rebaja enteros para pintar 64
píxeles. Si la foto ya venía más ligera que el resultado, se sube tal cual.
Por `curl` no hay encogido: sube lo que le des.

La app se despliega dentro del Worker, así que **hay que construirla antes**:

```bash
pnpm deploy      # construye la app y despliega el Worker, en ese orden
```

Comprueba siempre que el despliegue subió **las dos cosas**. Ha pasado dos
veces que wrangler suba solo los assets, o solo el script, y lo dé por bueno:
si falta `Uploaded coffee-api` o `Uploaded N of N assets` en la salida, vuelve
a desplegar y verifica una ruta nueva antes de cantar victoria.

En desarrollo, `nuxt dev` proxea `/api` al Worker de `:8787`, así que también
ahí es el mismo origen y el código no se entera de la diferencia.

## Esquema · `cafes.csv`

`id` · `nombre` · `tostador` · `origen` · `region` · `variedad` · `proceso` ·
`altitud_m` · `sca` · `fecha_tueste` (AAAA-MM-DD) · `consumir_antes` · `peso_g` ·
`precio_eur` · `notas_tostador` · `estado` (`abierto` | `terminado` | `pendiente`) ·
`fecha_apertura` ·
`foto` (clave del objeto en R2; la mantiene
el endpoint de subida, no entra por JSON) · `url`

## Esquema · `extracciones.csv`

`id` · `fecha` · `cafe_id` · `dias_tueste` · `dosis_g` · `agua_g` · `ratio` ·
`temp_c` · `molinillo` · `clics` · `metodo` · `reparto` · `tiempo_total` ·
`extraido_g` · `variable_cambiada` · `defecto` · `notas_cata` · `nota` (1-10) ·
`siguiente_ajuste` · `receta_id` · `drawdown_s` · `dripper` · `borrada_en`

`extraido_g`: lo que acabó en la taza. Con el agua y la dosis sale la
**retención** —los gramos que se queda el lecho por gramo de café—, que en V60
ronda 2. Fuera de la horquilla no dice que la taza esté mala: dice que algo se
midió mal, y una medida torcida invalida la comparación con las demás. Nunca
puede pasar del agua; el servidor lo rechaza con 422.

`dripper`: `v60-02-plastico` | `v60-02-ceramica`. Lista cerrada porque entra en
la detección de pares, y una errata parecería un cambio de variable. La
cerámica tiene masa térmica: sin precalentar, el mismo `temp_c` de hervidor da
una temperatura de extracción más baja.

`drawdown_s`: segundos entre el final del último vertido y el fin del goteo. Va
en segundos enteros, no en `m:ss`, porque es el valor con el que se decide si
hay que mover la molienda.

## Esquema · `recetas.csv` y `pasos.csv`

`recetas.csv`: `id` · `nombre` · `ratio` · `notas`

`pasos.csv`: `receta_id` · `orden` · `t_inicio_s` · `accion` · `estilo` ·
`agua_g` · `notas`

Una receta es una **lista de pasos**, no solo una lista de vertidos: agitar,
meter la cuchara o esperar el goteo son pasos sin agua y hacen falta para guiar
una extracción de verdad.

`accion`: `verter` | `agitar` | `remover` | `esperar` | `retirar`

`estilo`: `espiral` | `centro`, y vacío es «sin especificar». Es **cómo** se
vierte, así que solo lo llevan los vertidos: un `esperar en espiral` no cuela.
Va de atributo y no de acción aparte a propósito — si `verter_espiral` fuese
una acción habría que repasar las catorce comparaciones con `verter` de las que
salen los gramos, el acumulado, el reparto y el agua de referencia.

En la base van las claves, no las frases: `espiral`, no `en espiral`. El
castellano vive en `web/app/composables/textos.ts`, que es el fichero que se
duplicará por idioma el día que haya i18n.

Solo `verter` lleva gramos y solo `verter` escala con el agua: **la suma de los
vertidos es el agua de referencia**, así que `60-60-90-90` sobre 300 g son
`54-54-81-81` sobre 270 g. Los tiempos no se tocan. La receta es la intención;
el `reparto` de la extracción es lo que echaste de verdad.

### Cada acción frente a la báscula

Importa para el cronómetro, y explica por qué un autoavance por peso a lo bruto
se rompería:

| Acción | El peso | Qué debe hacer la app |
|---|---|---|
| `verter` | Sube | Objetivo **acumulado** («hasta 120 g»), que es como se vierte con báscula. El `estilo` solo se lee: en espiral o al centro |
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
| Plano, a cartón | Moler más fino, o subir temperatura |
| Aguado, sin cuerpo | Moler más fino, o subir la dosis dejando el agua |
| Poca acidez, quiero más dulzor | Fase 1 desigual: 50-70 o 40-80 |
| Quiero más cuerpo | Fase 2 en 2 vertidos (90-90) |
| Quiero más claridad y fuerza | Fase 2 en 3 vertidos (60-60-60) |

Una variable por extracción. Si mueves dos, el dato no sirve.

`aguado` es un defecto y el cuerpo no: una taza puede tener poco cuerpo y estar
buena. Está en la lista porque, cuando molesta, molesta como los demás y tiene
palanca propia. Para describir el cuerpo sin que sea un problema están las
notas de cata.

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
- **Extrapolación.** Solo si las reglas callan. `equilibrado` no tiene palanca,
  así que una taza correcta y sosa se quedaba sin propuesta: ahí se mira el
  último par limpio de ese café y se sigue por el eje que ya se movió —otro
  paso en la misma dirección si no empeoró, media vuelta si empeoró—. Nunca
  sobre una receta o un molinillo: de esos no se sabe cuál sería el siguiente.
- **Cobertura.** Qué valores ya has probado con ese café, para no repetir sin
  darte cuenta.

La principal se guarda en `siguiente_ajuste` **si no mandas uno**. Lo que
escribas manda siempre; el automático solo rellena el hueco, que es el campo
que le da continuidad a la bitácora y el que se quedaba vacío.

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

El hook hace una cosa más al final, y solo si los tests pasan: **sube el
parche de la versión** en los tres `package.json` y la mete en ese mismo
commit. Va al final para que un commit que no llega a hacerse no gaste número.
La versión sale en el pie de la app, y no es cosmética: instalada como PWA es
lo único que responde a «¿ya tengo el despliegue nuevo o el service worker me
está sirviendo el de ayer?».

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

## Retirar extracciones

El borrado es **lógico**: `DELETE` marca `borrada_en` y la fila se queda. Deja
de salir en el historial y de contar para las sugerencias, pero se recupera con
`POST /api/extracciones/:id/restaurar`, y el respaldo la sigue exportando.

Los ids **no se reutilizan**: retirar la #3 no hace que la siguiente sea la #3.

Y la advertencia que sale también en el modal de la app: **retira solo errores
de registro**. Si quitas las extracciones que salieron mal, las medias suben
solas y los deltas emparejados dejan de significar nada — te estarías mintiendo
con tus propios datos.

## Editar recetas

Los pasos se mandan enteros y **reemplazan** a los que hubiera: es como se
piensa una receta y como se edita en la app, viendo la lista. El orden lo da la
posición, y el servidor renumera.

Comprobaciones que hace: solo `verter` lleva gramos, los tiempos van en
aumento, y toda receta necesita al menos un vertido — sin él el cronómetro no
sabría qué guiar.

Editar una receta **no toca las extracciones ya registradas**: cada una guardó
su propio `reparto` cuando se registró. La receta es la intención; el reparto
es lo que echaste.

Para partir de una que ya funciona, **duplicar**: el botón de la ficha abre el
alta con todo relleno —nombre, ratio, notas y pasos— y el id vacío, que es lo
único que no se puede cambiar luego. No hay endpoint de copia: es el `POST` de
siempre con el formulario ya escrito.

Borrar una receta **no tiene papelera**, al revés que las extracciones: una
receta es una plantilla, no un dato observado. Y el servidor se niega con 409
si alguna extracción la usa —retiradas incluidas—, porque sin la fila no
habría forma de saber con qué se preparó aquella taza.

## Los dos relojes de la frescura

`fecha_tueste` manda mientras la bolsa está **precintada**. Desde que la abres
manda `fecha_apertura`: el café se oxida y se desgasifica a otro ritmo, y ahí
ya no importa tanto cuándo se tostó como cuánto lleva respirando. Dos bolsas
del mismo tueste —una abierta hace un mes y otra precintada— no son el mismo
café, y sin el segundo reloj no hay forma de explicar por qué dos tazas
idénticas no saben igual.

La vista deriva `dias_abierta` igual que `dias_tueste`: **desde la fecha de la
extracción**, no desde hoy. El aviso salta por encima de `DIAS_ABIERTA_VIEJA`
(21 días), que es un punto de partida para bolsa con clip — en un bote de vacío
aguanta bastante más, así que este umbral pide calibrarse más que ninguno.

`fecha_compra` y `fecha_recepcion` **ya no se piden ni se escriben**: no las
leía nadie —ni una vista, ni el motor, ni un aviso— y cuándo pagaste la bolsa
no cambia la taza. Fuera del formulario y fuera de `CAMPOS_CAFE`, así que la
API las rechaza como campo desconocido.

**Las columnas siguen en la tabla**, y no por dejadez. Se intentó quitarlas y
D1 no dejó:

- `DROP COLUMN` lo rechaza SQLite mientras un `CHECK` mencione la columna, y
  las dos lo tienen desde la migración inicial.
- Rehacer `cafes` tampoco vale. Todas las extracciones la apuntan por clave
  foránea: **renombrarla** hace que SQLite reescriba esa referencia para que
  siga al nombre nuevo, y **tirarla** apunta una violación aplazada por cada
  fila que la referencia — un contador que no se cancela porque la tabla
  vuelva después con ese nombre. D1 tira la transacción entera al confirmar.
  Probado con las dos variantes; el esquema en SQLite pelado las traga y el
  runtime de verdad no.

Dos columnas nulas y congeladas no molestan a nadie. Rehacer a martillazos la
tabla que cuelga de cada extracción, sí.

## Otra bolsa del mismo café

Una fila por **bolsa**, no por café, y es deliberado: lo que hace la taza no es
«Gary», es *este* Gary tostado el 20 de mayo. Si dos bolsas compartieran
`cafe_id`, el motor emparejaría extracciones de tuestes distintos como si
fueran comparables y te diría que bajar tres grados mejoró la nota cuando lo
que pasó es que el café era fresco.

Lo que sobraba era volver a teclear la ficha, no la fila. El botón **Otra
bolsa** abre el alta con lo que describe al café ya puesto —nombre, tostador,
origen, región, variedad, proceso, altitud, SCA, notas, url, conservación y el
peso— y en blanco lo que describe a *esa* bolsa: tueste, consumir antes,
compra, recepción, precio y foto. El id lo reparte el servidor: `gary`,
`gary_2`, `gary_3`.

Y la **basal de la bolsa nueva arranca donde lo dejaste**: el alta se rellena
con la última extracción de la bolsa anterior del mismo café. Solo rellena
campos. El motor empieza de cero igual —empareja por `cafe_id` y este es
otro—, así que no hay deltas contra la bolsa vieja, ni fila en la tabla, y la
extracción queda como `basal`.

La familia se reconoce por el id, que es como el servidor los reparte. Es una
pista y no una verdad: un café llamado «Finca 2» caería en la familia de
«Finca». Lo único en juego es de dónde parte un formulario que vas a repasar.

**Si compras dos bolsas del mismo tueste**, no las separes: ahí el café es
literalmente el mismo y partirlo en dos ids rompe las comparaciones sin ganar
nada. Una ficha y, como mucho, súbele el peso.

## El id de las bolsas

No se escribe: sale del nombre. `Etiopía Guji` → `etiopia_guji`. Minúsculas,
acentos fuera, y todo lo que no sea letra o número pasa a guion bajo.

Lo calcula el **servidor**, no el formulario, para que salga igual venga de la
app, de curl o de un script; la app solo enseña cuál va a ser mientras
escribes.

Si el id ya existe se le añade sufijo —`gary`, `gary_2`— porque comprar dos
veces el mismo café es normal y no debería ser un callejón sin salida. Mandar
un `id` explícito sigue siendo posible, y si choca da 409: ahí el error es tuyo.
