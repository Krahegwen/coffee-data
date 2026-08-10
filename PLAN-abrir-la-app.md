# Plan: abrir la app sin abrir mis datos

Propuesta para que la bitácora la pueda usar cualquiera, manteniendo que **en
el servidor solo haya datos míos**. No está decidido: es lo que hay que decidir.

## Lo que se pide

1. Que la usen amigos o gente de internet.
2. Que no se pierda nada de lo que hace hoy.
3. Que **en D1 y R2 solo estén mis datos**. Los de los demás, en su navegador.
4. Como consecuencia de (3), los `GET` también tienen que ir protegidos: hoy
   son públicos y cualquiera puede leer mi bitácora entera.
5. Distinguirme a mí del resto.
6. Que ellos puedan llevarse sus datos de un dispositivo a otro.

## De dónde partimos

Lo bueno: hay dos costuras ya hechas que hacen esto viable.

- **Toda la app pasa por `useApi()`.** Ninguna pantalla habla con la red por su
  cuenta. Cambiar qué hay detrás es cambiar un fichero.
- **La lógica de dominio ya es pura.** `recetas.js`, `sugerencias.js` y
  `validacion.js` no tocan la base ni la red: reciben datos y devuelven datos.
  Se pueden ejecutar en un navegador tal cual.

Lo que estorba:

- **`GET /api/*` es público.** Lo es a propósito —«mirar una bolsa no es
  editarla»— y hay que darle la vuelta.
- **El servidor no es solo almacén.** Calcula el reparto, el guion del
  cronómetro, las sugerencias, el id derivado del nombre, el
  `siguiente_ajuste`, y deriva `ratio`, `dias_tueste` y `dias_abierta` en una
  vista SQL. Un usuario local no tiene nada de eso.
- **Las garantías duras viven en los `CHECK` de D1.** IndexedDB no tiene
  `CHECK`, ni `STRICT`, ni claves foráneas.

## La decisión de fondo: cuántas veces escribimos la API

Este es el punto que decide si esto envejece bien o se pudre.

### Opción A — dos implementaciones (la directa)

`useApi()` pasa a ser una fachada con dos detrás: la de siempre (`fetch` al
Worker) y una nueva contra IndexedDB.

- Rápido de arrancar.
- **Cada función futura se escribe dos veces, para siempre.** Esta sesión ha
  añadido ocho; multiplícalo. Y dos implementaciones divergen: no es una
  posibilidad, es cuestión de tiempo.

### El árbitro no es lo que distingue A de B

Las dos tienen árbitro: algo que mira si hay sesión y manda la llamada a un
sitio o a otro. Eso es media docena de líneas en `useApi()` y no es la
decisión.

Lo que se decide es **qué hay detrás del árbitro**: dos implementaciones de la
misma API que hay que mantener a la par, o una sola atada a dos almacenes.

### Opción B — una API portátil (la recomendada)

`index.js` deja de hablar con D1 directamente y habla con un **puerto de
almacén**: una interfaz pequeña (`leer`, `escribir`, `listar`, `borrar`) con
dos adaptadores, D1 y IndexedDB. El enrutado, la validación, los cálculos y los
códigos de error son **los mismos objetos en memoria**.

En remoto, la app hace `fetch` como hoy. En local, `useApi()` llama en proceso
al mismo manejador con el adaptador de IndexedDB. Mismos `Request`/`Response`,
mismos 422 con la misma lista de errores.

- Una sola implementación de la API. Una función nueva se escribe una vez.
- Los tests de la API valen para los dos caminos sin tocarlos.
- **No hace falta service worker**: es una llamada de función, no una petición
  interceptada. Menos magia y depurable.
- Cuesta más al principio: hay que sacar el SQL de los manejadores.

**Recomiendo B.** El coste es una tarde de refactor contra el coste permanente
de escribirlo todo dos veces. Y el refactor es mecánico: los manejadores ya
están separados del enrutado.

## Arquitectura propuesta

```
nucleo/            paquete nuevo del workspace, sin dependencias
  recetas.js       escalado y guion          (se mueve tal cual)
  sugerencias.js   avisos, palancas, deltas  (se mueve tal cual)
  validacion.js    validación y slugs        (se mueve tal cual)
  derivar.js       ratio, dias_tueste, dias_abierta, cafe_nombre   ← NUEVO
  api/             manejadores + enrutado, contra el puerto        ← NUEVO

api/               el Worker: adaptador D1 + R2, y poco más
web/               la app: adaptador IndexedDB, y useApi() eligiendo
```

`derivar.js` es lo que hoy hace la vista `v_extracciones` en SQL. En local no
hay vistas, así que hace falta en JS — y ahí aparece el primer riesgo de deriva
(ver contraindicaciones).

## Cómo se distingue quién eres

**Lo que propones —pulsaciones sobre el número de versión— me parece bien, y es
casi gratis.** Cinco toques en el `v0.1.20` del pie revelan el campo del token;
si el token vale, se abre sesión y la app pasa a modo servidor. Reaprovecha
`useSesion()`, la cookie `HttpOnly` y el endpoint `/api/sesion`, que ya existen.

Por defecto, **modo local**. Nadie ve un formulario de sesión que no le sirve.

**Google SSO u OTP no los recomiendo, y no por pereza**: resuelven «muchos
usuarios con cuenta», y aquí hay exactamente un usuario privilegiado y un
secreto compartido que ya funciona. Añadirían un proveedor de identidad, un
flujo OAuth en el Worker y sesiones de verdad para no ganar nada. `auth.js`
está escrito para poder cambiar de método el día que haga falta; ese día no es
hoy.

**Que quede claro**: el gesto no es seguridad, es discreción. Quien sepa que
existe puede tocarlo. Lo que protege es el token.

## Respaldo y restauración

En la app se llama **respaldo**, no «exportar»: es la misma palabra que usa el
repo para lo mismo, y sobre todo pone la expectativa correcta. «Exportar» e
«importar» suenan a intercambio de datos entre dos sitios vivos; restaurar un
respaldo, en cambio, ya suena a lo que de verdad hace —**reemplazar**—, que es
justo el malentendido que hay que evitar.

El fichero es un `.zip` con la misma forma que el respaldo del repo:
`cafes.csv`, `recetas.csv`, `pasos.csv`, `extracciones.csv`, `fotos/` y un
`manifiesto.json` con la versión de esquema y la fecha.

**Restaurar reemplaza, no fusiona.** Fusionar sin relojes ni ids globales es un
problema mayor que toda esta app junta: dos dispositivos que hayan registrado
extracciones distintas no se reconcilian sin inventarse criterios. La
restauración avisará de lo que va a tirar.

Y sirve además para llevarse los datos de un móvil a otro, que era el objetivo
original: no es sincronización, es mudanza.

Ventaja lateral: `exportar_csv.py` y el respaldo de un usuario producen el
mismo formato, así que alguien puede mandarme el suyo y lo abro con las
herramientas de siempre.

### Escribir el ZIP sin dependencias

Las fotos ya son webp comprimido, así que comprimir otra vez no gana nada: un
ZIP en modo *stored* —cabecera, bytes crudos y directorio central— son unas
ochenta líneas y evita meterle una dependencia a la app.

## Fotos en el modo local

**No hay que liarse mucho, y lo que cuesta hace falta igual.** IndexedDB guarda
`Blob` de forma nativa, y encoger la foto antes de guardarla ya lo hace la app
hoy (`encogerFoto` en `web/app/composables/foto.ts`): en local simplemente no
se sube.

Los dos únicos cambios reales:

- `urlFoto()` devuelve hoy `/api/` + la clave. En local hay que devolver un
  `URL.createObjectURL(blob)` y acordarse de revocarlo al desmontar, o se
  acumulan objetos en memoria.
- Meterlas en el respaldo, que es lo único que cuesta —y el escritor de ZIP
  hace falta con fotos o sin ellas—.

Así que las fotos **no son motivo para recortar la v1**.

## Fases

Cada una deja el repo funcionando y desplegable.

| # | Qué | Riesgo |
|---|---|---|
| 1 ✔ | Sacar `nucleo/` con la lógica pura y `derivar.js`. Sin cambio de comportamiento. | Bajo |
| 2 ✔ | Proteger los `GET`. Arreglar `resumen.py` y `exportar_csv.py`, que hoy leen sin token. | Bajo |
| 3 ✔ | **Identidad**: UUIDv7 en las tres tablas, slug a columna, orden por `creado_en`, URLs y pantallas al día. | Medio |
| 4 ✔ | Puerto de almacén y adaptador D1. El Worker sigue igual por fuera. | Medio |
| 5 ✔ | Adaptador IndexedDB + el árbitro en `useApi()`. **Aquí está el trabajo.** | Alto |
| 6 ✔ | Cola de salida: escribir en local y encolar para la red, con reintento. | Alto |
| 7 ✔ | El gesto del pie y el modo local por defecto. Absorbida por la 5: el árbitro no se podía probar sin la puerta. | Bajo |
| 8 ✔ | Respaldo y restauración en ZIP. | Medio |
| 9 ✔ | Estreno para desconocidos: recetas base sembradas, estado vacío, aviso de instalar y de respaldo viejo. Ko-fi. | Bajo |

La 3 va antes que el almacén local **a propósito**: escribir el adaptador de
IndexedDB con ids numéricas para migrarlas después sería hacer el trabajo dos
veces. Y cuanto antes se haga, menos filas hay que migrar.

Las fases 1 y 2 valen la pena aunque el resto se descarte. La 3 solo tiene
sentido si se va a por todo.

## Contraindicaciones

Por orden de lo que más duele.

1. **iOS borra los datos.** Safari limpia el almacenamiento de un sitio tras
   ~7 días sin visitarlo. Un desconocido que entre por la URL y no instale la
   app **puede perderlo todo en una semana**. Instalada como PWA se salva, pero
   depende de que el usuario haga algo que no le hemos pedido nunca. Hay que
   pedir `navigator.storage.persist()` y avisar en el primer arranque; ninguna
   de las dos cosas es garantía.

   **Las notificaciones no salvan este caso, por desgracia.** En iOS el push
   web solo funciona con la app **instalada** —y quien la instala ya está a
   salvo del borrado—, así que avisan justo a quien no lo necesita. Peor: el
   push necesita guardar la suscripción de cada dispositivo en un servidor,
   o sea **datos de otros en mi servidor**, que es exactamente lo que este plan
   evita. Y la API de notificaciones programadas en local no existe en la
   práctica.

   Lo que sí funciona y no cuesta nada: **un aviso dentro de la app** al
   abrirla —«tu último respaldo es de hace 12 días»— y el empujón a instalarla
   la primera vez. Sin permisos, sin servidor y sin prometer lo que no se puede
   cumplir.

2. **Se acabó la red de seguridad de la base.** Mis datos los protegen `STRICT`,
   los `CHECK` y las claves foráneas: aunque el código se equivoque, D1
   rechaza. En IndexedDB solo queda `validacion.js`. Un fallo ahí corrompe los
   datos de un usuario en silencio y sin forma de detectarlo desde aquí.

3. **`derivar.js` puede desviarse de la vista SQL.** Son dos implementaciones
   de lo mismo, una en SQL y otra en JS. Mitigable con un test que compare
   ambas sobre los mismos datos, pero es deuda permanente.

4. **Mis CSV están en un repo público.** Sí, todo está ya en D1 y R2; los CSV
   de `datos/` son **una copia**, y son literalmente 1,9 KB con esto dentro:

   - `cafes.csv` (726 B): las dos bolsas enteras — tostador, origen, variedad,
     proceso, altitud, SCA, fechas, **precio pagado** y notas del tostador.
   - `extracciones.csv` (691 B): las dos extracciones con sus **notas de cata**
     tal cual las escribí, incluida la de «no sé si algo menos amargo que ayer».
   - `recetas.csv` y `pasos.csv` (526 B): la receta y sus pasos.
   - Las fotos **no** están: en el CSV solo va la clave de R2.

   Proteger los `GET` no esconde nada de eso, y el histórico de git guarda
   además todas las versiones anteriores.

   **Decidido el 2026-08-10: se quedan.** No hay nada personal ahí dentro —son
   cafés, sus fechas y lo que sabían—, así que el motivo para sacarlos no
   existe y el que hay para dejarlos sí: `datos/` **es** la red de seguridad de
   un despliegue que se puede caer, y quitarlos obligaría a buscarle otro sitio
   al respaldo sin ganar nada a cambio.

5. **ZIP no es sincronizar.** Dos dispositivos en paralelo acaban en «cuál
   importo». Para alguien que registre en el móvil y mire en el portátil está
   bien; para alguien que registre en los dos, no.

6. **Soporte a ciegas.** Si alguien reporta un fallo, sus datos están solo en su
   navegador. Sin su ZIP no hay forma de reproducir nada.

7. **Dos sistemas de migración.** Hoy: SQL versionado que aplica wrangler.
   Habrá que añadir `onupgradeneeded` de IndexedDB y, además, que los ZIP
   viejos se puedan importar en versiones nuevas. El `manifiesto.json` con la
   versión de esquema es obligatorio desde el primer día.

8. **Mis umbrales, su paladar.** `DRAWDOWN_LARGO_S`, `DIAS_ABIERTA_VIEJA`,
   `NOTA_BUENA`… están documentados como puntos de partida calibrables con
   datos propios. Un desconocido hereda mis números y mi método 4:6. Es una
   bitácora opinionada, y conviene decirlo en la propia app.

9. ~~**Coste y abuso.**~~ **Comprobado: no es un problema.** La documentación de
   Cloudflare lo dice sin ambigüedad —*«Requests to static assets are free and
   unlimited»*, y *«There is no additional cost for storing Assets»*—. Lo único
   que consume cuota es lo que casa con `run_worker_first`, que en
   `wrangler.jsonc` es exactamente `/api/*`. Y en este diseño **al `/api/` solo
   llamo yo**: los demás no tocan el Worker ni una vez. Servirle la app a cien
   desconocidos cuesta lo mismo que servírmela a mí.

   Tampoco hay motivo para mirar a Vercel: partiría el despliegue en dos
   proveedores y devolvería el CORS que este diseño se quitó de encima al
   compartir origen.

10. **Superficie de la app.** Un modo local por defecto significa que el camino
    que más se usa es el que yo no uso nunca, y con dos o tres amigos usándolo
    tampoco van a llegar informes de fallos.

    **Es el segundo argumento fuerte para la opción B**: con una API portátil,
    su camino y el mío comparten enrutado, validación, cálculos y errores. Lo
    único distinto es el adaptador de almacén. No es un camino sin probar, es
    el mismo código con otro cajón detrás.

## Ko-fi

Un enlace, no el widget. El script de Ko-fi es un tercero cargando en la
página: se lleva por delante la política de contenido, mete una petición a otro
dominio en una app que presume de no mandar los datos de nadie a ningún sitio,
y encima hay que mantenerlo. Un `<a>` al perfil hace lo mismo.

Sitio: el pie, junto a la versión y la licencia. No en medio, y desde luego no
antes de que la app haya servido para algo.

Y una nota de honestidad: la app no cuesta nada de servir —ver el punto 9—, así
que el enlace es para quien quiera invitar a un café, no para cubrir gastos que
no existen.

## ¿Y si yo también voy por local, con sincronización de «premium»?

La idea: todos guardan en IndexedDB, y yo además sincronizo contra D1. Un solo
camino de verdad —no «una API con dos adaptadores», sino literalmente el mismo
recorrido— y el punto 10 desaparece del todo. Además yo ganaría algo que hoy no
tengo: **registrar sin cobertura**.

Es mejor destino. Pero la sincronización no es «el respaldo un poco más»: es la
pieza más difícil de todo el plan, y conviene mirar qué toca de verdad.

### Lo que se rompe en cuanto el mismo dato cambia en dos sitios

1. **Los ids los pone hoy el servidor.** `extracciones.id` es
   `INTEGER PRIMARY KEY AUTOINCREMENT`. Escribiendo sin cobertura hay que
   inventarse el id antes de que exista el servidor, y dos dispositivos
   inventarían el mismo.
2. **Los borrados resucitan.** Las extracciones ya tienen borrado lógico
   (`borrada_en`) y eso sincroniza bien. Pero las recetas se borran de verdad:
   borrar en un sitio y editar en otro devuelve la receta a la vida. Harían
   falta lápidas también ahí.
3. **Los conflictos hay que resolverlos con una regla escrita.** Lo pragmático
   es «gana la última escritura» por fila, y para eso ya existe
   `actualizado_en` en `cafes`, `recetas` y `extracciones`. Funciona casi
   siempre, y «casi siempre» significa **perder un cambio en silencio** el día
   que no.
4. **Y lo más importante: cambia dónde vive la verdad.** Hoy mis datos están en
   una base gestionada, con su *time travel*, y el móvil es una vista. En
   local-first el móvil pasa a ser el original y el servidor una copia tan
   fresca como la última sincronización. Es un modelo **menos seguro** que el
   de ahora, y lo estaría adoptando para que los demás y yo vayamos por el
   mismo sitio.

### La buena noticia: mi caso es de un solo escritor

Casi toda la dificultad de sincronizar viene de varios usuarios tocando el
mismo dato. Aquí **solo escribo yo**, y como mucho desde dos dispositivos
míos, rara vez a la vez y nunca la misma fila. Eso tumba el 80 % del problema.

Y el esquema ayuda más de lo que parece: **nada apunta a `extracciones.id`**.
Los cafés y las recetas se identifican por su slug —que la app ya sabe calcular
y de hecho te lo enseña mientras escribes el nombre—, así que la única id que
asigna el servidor no la referencia nadie. Se puede crear con una id
provisional en local y reescribirla al confirmar, sin arrastrar referencias
detrás.

### Tres niveles, no dos

Entre «como hoy» y «sincronización completa» hay un escalón intermedio que da
casi todo el beneficio por casi nada:

| Nivel | Qué | Coste |
|---|---|---|
| 1 | Como hoy: servidor para todo, en mi caso. | — |
| 2 | **Local para leer, servidor para escribir.** IndexedDB es una copia; toda escritura va al servidor y él sigue siendo la verdad. | Bajo |
| 3 | Local-first con sincronización: escribo sin cobertura y se concilia después. | Alto |

El nivel 2 me da el mismo camino de lectura que los demás y la app funcionando
sin cobertura para consultar, **sin un solo conflicto que resolver**, porque
sigue habiendo un único sitio donde se escribe. Lo que no da es registrar una
extracción sin señal — y mi cocina tiene wifi.

### Decidido: offline-first, con la red como destino

Leer siempre de local. Escribir a local **y** encolar para la red. Si hay
cobertura, la cola se vacía al momento y por fuera se comporta como hoy; si no
la hay, se vacía cuando la haya.

No es el nivel 2 pelado —ese no deja registrar sin señal— sino el 2 con la
puerta del 3 ya montada. Y la app se puede llamar offline-first sin mentir.

### Recomendación de orden

Primero el camino local, que hay que escribirlo igual y hoy no existe. La cola
de salida después, sobre un almacén ya rodado. Hacer las dos cosas a la vez es
pasarse semanas preguntándose si un fallo es del adaptador o de la
conciliación.

Lo que **sí** hay que hacer desde el minuto cero es el modelo de identidad, que
es lo que se cuenta a continuación.

## Cuándo se refresca lo local

La pregunta de verdad: termino en el Android, me siento en el PC. ¿Cuándo se
entera el PC?

### Cuándo

Se tira de la red en cuatro momentos, todos automáticos:

1. **Al abrir la app.**
2. **Al volver a la pestaña** si lleva un rato en segundo plano
   (`visibilitychange`).
3. **Al recuperar la conexión** (`online`).
4. **A mano**, con un tirador de «actualizar» para cuando uno desconfía.

Antes de traer nada se **vacía la cola de salida**. En ese orden y no al revés:
si primero trajera lo del servidor y luego subiera lo mío, lo mío pisaría cosas
con información vieja.

### Cómo: traer todo y reemplazar

Nada de sincronización incremental. Mis datos enteros son **menos de 2 KB de
CSV**; pedirlos todos en cada arranque cuesta menos que la lógica de calcular
qué ha cambiado desde cuándo.

Y reemplazar el local con lo que diga el servidor tiene un premio que la fusión
no da: **los borrados salen gratis**. Si borro una receta en el Android, en el
PC simplemente no viene en la respuesta y desaparece. Fusionando habría que
llevar lápidas y compararlas.

Esto vale porque **escribo solo yo**. En cuanto la cola está vacía, el servidor
es la versión buena por definición y machacar lo local es correcto, no
arriesgado.

El día que los datos crezcan, el endpoint puede aceptar un `?desde=` y devolver
solo lo tocado desde esa marca. Se diseña la puerta ahora; no se cruza hasta que
haga falta.

### La ventana incómoda

Hay un caso que conviene tener escrito: **el Android se quedó sin cobertura con
cosas en la cola** y abro el PC. El PC trae del servidor un histórico al que le
faltan esas extracciones, y el motor empareja contra lo que ve. La «anterior»
sería la equivocada, y el arranque del formulario también.

No es corrupción —cuando el Android suba, todo cuadra— pero sí una sugerencia
calculada con información incompleta. Mitigación: la cola se vacía en cuanto
hay red, así que la ventana solo existe si un dispositivo se quedó sin
conexión y sin volver a abrirse. Y el contador de pendientes, visible, avisa.

Para quien no es premium no hay nada de esto: no hay red que consultar, lo
local es todo.

## Identidad: las ids

Decidido que **las ids sean opacas para quien usa la app**. Eso desbloquea lo
demás, porque una id que nadie lee puede generarla el cliente.

### UUIDv7, no v4

`crypto.randomUUID()` da una v4, que es aleatoria pura. Una **v7 lleva el
tiempo delante**, así que ordena cronológicamente al ordenar por texto. Importa
más de lo que parece: hoy el motor empareja extracciones consecutivas fiándose
del orden por `id`, y con v7 ese orden sigue siendo el de siempre. Son unas
quince líneas en el núcleo compartido, sin dependencias.

Aun así, **el orden deja de colgar de la id**: se pasa a ordenar por
`creado_en`, que en offline-first lo pone el cliente al crear la fila y refleja
cuándo ocurrió de verdad. La id ordena bien por si acaso; el orden lo manda una
columna que significa algo.

### Regalo: la idempotencia sale gratis

Con la id puesta por el cliente, reintentar un envío encolado deja de ser
peligroso: crear dos veces la misma id no duplica nada, choca. Sin eso haría
falta inventar claves de idempotencia para la cola de salida.

### Decidido: UUID es la clave, el slug es etiqueta

`cafes.id` y `recetas.id` dejan de ser el slug del nombre. El slug pasa a una
columna propia y única, y sigue siendo lo que se lee en la URL —`/cafes/gary`
se resuelve al UUID—. Ninguna clave vuelve a depender de un texto sacado de un
nombre, así que dos dispositivos sin cobertura ya no pueden inventar el mismo
`gary_2` ni obligar a reescribir las extracciones que lo apuntaban.

Se hace ahora porque hoy hay **dos bolsas, una receta y dos extracciones**, y
esta migración no volverá a ser tan barata nunca.

Lo que cuesta: rehacer las tres tablas, tocar todas las claves foráneas,
cambiar las URLs de la app y regenerar la semilla y los CSV.

### Lo que se ve en pantalla

Si la id se vuelve opaca, «Extracción #7» deja de existir. Mejor así: en una
bitácora dice más **«Gary · 6 ago»**, y si hace falta un ordinal —«la tercera de
esta bolsa»— se calcula al pintar contando la lista, que ya viene ordenada. No
se guarda: es una vista, no un dato.

## Alternativas que descarto, y por qué

- **Multiusuario de verdad en D1** (columna `usuario_id` y cuentas). Un solo
  camino de código y sincronización real, pero me convierte en responsable de
  datos ajenos: copias, RGPD, abuso, coste. Es exactamente lo que pides evitar.
- **Que cada uno despliegue su Worker.** Cero datos ajenos y una sola
  implementación. Ningún desconocido va a desplegar un Worker.
- ~~**Local para todos, incluido yo, con el servidor como destino de sync.**~~
  Ya no lo descarto: es mejor destino y tiene su apartado arriba. Lo que
  descarto es **llegar ahí de una sentada**, estrenando el almacén local y la
  conciliación al mismo tiempo.

## Decidido

- **Opción B, API portátil.** Una implementación atada a dos almacenes.
- **Offline-first para todos, yo incluido**: leer de local, escribir en local y
  encolar para la red. Con la puerta abierta a sincronización completa.
- **Ids opacas**, UUIDv7 puestas por el cliente. El orden lo manda `creado_en`.
- **Fotos sí** en el modo local: cuestan poco y lo caro —el escritor de ZIP—
  hace falta igual.
- **Se llama respaldo**, no exportar/importar.
- **Ko-fi** como enlace en el pie, no como widget.
- **Coste**: no es una contraindicación, está comprobado.
- **iOS**: aviso dentro de la app, no notificaciones.

- **UUID es la clave** en las tres tablas; el slug se queda de etiqueta única
  para las URLs.
- **Refresco**: vaciar cola, traer todo y reemplazar. Al abrir, al volver a la
  pestaña, al recuperar red y a mano.

## Lo que quedaba por decidir

Nada: las dos se cerraron.

1. ~~¿Los CSV de `datos/` se quedan en el repo público?~~ **Se quedan**
   (2026-08-10): no hay nada personal dentro, y son la red de seguridad si D1
   se cae. Está razonado en la contraindicación 4.
2. ~~Al llegar a la fase 5, si el modo local arranca con las recetas base
   sembradas o con la casa vacía.~~ **Sembradas** (fase 5): sin una receta el
   cronómetro no tiene qué guiar, y la app se estrenaría inservible.

## Contraindicación nueva, por ir a offline-first

**El servidor deja de ser la verdad y pasa a ser el destino.** Hoy, si el móvil
arde, mis datos están en D1 con su *time travel*. Con la cola de salida puede
haber extracciones registradas que el servidor no ha visto todavía.

Mitigación: vaciar la cola en cuanto haya red, y **enseñar cuántas cosas quedan
por subir** en algún sitio visible. Una cola en silencio es una pérdida de datos
esperando el momento.
