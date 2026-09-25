# Plan: la isla de verdad, sin perder la web

Propuesta para que el cronómetro salga en la pantalla de bloqueo y en la
cápsula del OnePlus **como lo hace Hevy** —paso, siguiente paso, cuenta atrás
con barra y botones— sin quitarle el audio a la música, con un APK que se
instale en el móvil y, si se quiere, en las tiendas. **Manteniendo la web tal
cual.** No está decidido: es lo que hay que decidir.

Nace del 2026-09-25. El paso en la pantalla de bloqueo se consiguió haciendo
que la web se hiciera pasar por un reproductor (un silencio en bucle por
`<audio>` y Media Session), y eso paraba la música. Se dejó apagado por
defecto y se hizo que ceda si otra app coge el audio; pero es un parche, y
la web no tiene ninguna otra forma de enseñar una notificación viva.

## Lo que se pide

1. **La web sigue siendo la app.** Misma URL, misma PWA, mismo código.
2. **Una isla de verdad**: el paso de título, el siguiente debajo, la cuenta
   atrás y la barra, con pausa y saltos desde ahí. Y que **cuente sola** con el
   móvil bloqueado, que es cuando se mira.
3. **Que no pare la música.** Los pips y la voz suenan por encima; si acaso,
   la música baja un instante y vuelve.
4. **Un APK** para el OnePlus 15, y la opción de Play. iOS después: no hay
   iPhone propio, pero sí un Mac de empresa con el que compilar, y amigos con
   iPhone que prueban lo que se les ponga a un toque.
5. Que lo mantenga **una persona desde Windows**, sin GitHub Actions, con el
   repo público y con los hooks de siempre.

## Primero, Electron

Electron no entra: **solo hace escritorio** (Windows, macOS, Linux). No genera
APK ni entra en Play ni en la App Store. Y por si hubiera duda, sirve la app
por `file://` y todos los assets del build van con rutas absolutas desde `/`:
ni siquiera arrancaría sin tocar el build. Lo que se buscaba con él —«plugins
nativos alrededor de la misma web»— es exactamente lo que dan Capacitor y
Tauri en el móvil. Si algún día apetece una app de Windows con icono en la
bandeja, ahí sí; para la isla no aporta nada.

## Lo que la web no puede hacer, con fuentes

Merece la pena tenerlo por escrito, porque es lo que justifica todo lo demás.

- **Una notificación viva no existe en la web.** `showNotification` admite
  título, cuerpo, acciones, `timestamp`, `silent`… y nada de progreso,
  cronómetro ni «ongoing». El puente de notificaciones de Chromium en Android
  nunca llama a `setProgress`, `setOngoing` ni al cronómetro aunque el
  *builder* los tenga. Notification Triggers se abandonó y Periodic Background
  Sync tiene un mínimo de 12 h. Las **Live Updates** de Android 16 —lo que hace
  Hevy: chip en la barra de estado, tarjeta expandida en la pantalla de
  bloqueo, cuenta atrás que pinta el sistema— piden permiso de manifiesto,
  `setRequestPromotedOngoing` y `ProgressStyle`: solo nativo.
- **El audio se decide por elemento, no por página.** En Chromium (Chrome y el
  WebView de Android comparten el código): un `<audio>`/`<video>` de más de
  5 s o de duración desconocida pide `AUDIOFOCUS_GAIN`, que **para** la
  música; uno de 5 s o menos pide foco transitorio con *ducking*; y Web Audio
  se registra como «ambiente»: **no pide foco** —por eso los pips solos no
  molestan— y por lo mismo **no puede hacer ducking**. El silencio en bucle
  tiene que durar más de 5 s para que Media Session lo trate como canción, y
  cae de lleno en el primer caso. Un matiz nuevo: desde febrero de 2024 Chrome
  **aplaza** la petición de foco hasta que la pestaña suena de verdad (umbral
  −72 dBFS); el silencio a −90 dB no lo dispara, **lo dispara el primer pip**.
  Queda por probar en el OnePlus, pero apunta a que con los sonidos apagados
  la tarjeta y la música podrían convivir. Con pips, no hay combinación web
  que dé tarjeta y música a la vez.
- **La web no puede saber si otra app está sonando.** No hay API: solo se
  entera a posteriori, cuando le quitan el foco (el `pause` del silencio que
  ya usa `ceder`). El aviso previo de «esto te para la música» tiene que ser
  genérico; en nativo sí se consulta (`AudioManager.isMusicActive()`).
- **Con la pantalla bloqueada la página está oculta**: `requestAnimationFrame`
  se para, los temporizadores van a uno por segundo, el wake lock se suelta
  solo, y Web Audio sigue sonando mientras Android no mate el proceso. Dentro
  de una cáscara es peor: sin un servicio en primer plano, Android congela el
  proceso a los ~10 s de pasar a caché. Conclusión que manda sobre el diseño:
  **el reloj de la isla no puede ser JavaScript**; lo nativo tiene que contar
  solo.
- **En el iPhone el problema es otro y ya existe.** `useSonido` pone
  `navigator.audioSession.type = 'playback'` para que el interruptor de
  silencio no calle los pips, y en WebKit `playback` va a
  `AVAudioSessionCategoryPlayback` **sin** `mixWithOthers`: para la música.
  `transient` mezcla, pero el interruptor la calla. No hay tipo web que haga
  las dos cosas; es una decisión, no un fallo, y está apuntada en
  `PENDIENTES.md`.
- **Picture-in-Picture con un canvas** da una ventanita flotante sobre otras
  apps en Chrome Android, pero el sistema la oculta con la pantalla bloqueada
  y su vídeo pide foco igual. No sirve.

## De dónde partimos

Lo bueno, que es mucho:

- **Toda la app pasa por `useApi()`** y la red vive en tres funciones de dos
  ficheros (`useSesion`, `useSincro`), todas sobre `apiBase`. Cambiar cómo se
  habla con el Worker es tocar eso.
- **El núcleo es puro de verdad**: ni `window`, ni `fetch`, ni `navigator`. El
  plan del reloj son datos —`guion()` da `PasoGuion[]` con `t_inicio_s` y
  `acumulado_g`; `cuesDe()` y `cuentaAtrasDe()` dan la agenda como
  `{t, tipo, clave}`—: se puede mandar entero a un plugin nativo de una vez.
- **`usePantallaBloqueo` ya es un puente**: un estado serializable
  (`EnSistema`), mandos como mapa de funciones, un dueño (`sistemaEsDe`) y la
  idea de escribir «por cambio» y dejar que el sistema extrapole la barra. El
  adaptador nativo hereda ese contrato; el reloj apenas cambia.
- **El tiempo se ancla a `performance.now()`** (`inicioMs`) y el estado vive
  fuera del componente: sobrevive a navegar y a que la cáscara duerma el
  WebView. Lo que necesita un cronómetro nativo es `inicioMs` y `pasos`.
- **`auth.js` ya acepta dos vías** con el mismo secreto: cookie y
  `Authorization: Bearer`. Y todo texto visible sale de `web/i18n/`, así que la
  notificación puede recibir sus frases ya traducidas sin que nazca ninguna
  cadena en Kotlin.
- **La maquinaria de versión y el service worker están aislados** en
  `useVersion` y `plugins/actualizar.client.ts`; la instalación PWA en
  `instalar.*`; `crearRespaldo` devuelve `{nombre, bytes}` sin descargar nada.
  Apagar o cambiar cada pieza en nativo es un `if` en un sitio.

Lo que estorba:

- **La sesión descansa en que app y API comparten origen.** La cookie es
  `HttpOnly; SameSite=Strict; Path=/api`, `$fetch` no lleva `credentials` y el
  Worker no emite CORS ni atiende `OPTIONS`. En un WebView con origen propio
  (`https://localhost` en Android) las cuatro cosas fallan **a la vez y en
  silencio**: `GET /api/sesion` diría `activa: false`, la app arrancaría en
  modo local sin encolar, y el primer refresco con sesión pisaría lo escrito.
  Una migración a medias aquí no da error: pierde datos.
- **Hay cosas del build que en nativo sobran o mienten**: el service worker (un
  precache de workbox sobrevive a la actualización del APK y sirve la versión
  vieja), la comprobación de versión con `location.assign`, el botón «Instalar
  en el móvil» (en una cáscara `display-mode` no casa y lo ofrecería dentro de
  la app instalada), la analítica, y el `<a download>` sobre `blob:` del
  respaldo, que en WebView Android no hace nada.
- **`apiBase` se hornea al compilar**, igual que el módulo PWA: no hay un solo
  build que valga para la web y para la cáscara.
- **El ajuste `pantalla_bloqueo` se sincroniza** entre dispositivos y nace
  apagado por un motivo que solo existe en la web: encenderlo para el APK lo
  encendería también en el Chrome del PC.
- **Los hooks trabajan con listas cerradas**: `subir_version.py`, el `git add`
  del `pre-commit`, `test_scripts.py` y los globs de tests conocen exactamente
  cuatro `package.json`. Un paquete más se da de alta a mano en cada sitio.

## La decisión de fondo: qué cáscara

Lo que cubre cada vía de lo que se pide:

| | Web intacta | Isla (Android) | Música | APK / Play | iOS | Coste para una persona |
|---|---|---|---|---|---|---|
| **Capacitor** | Sí: el mismo build, un puerto con dos adaptadores | Sí, con un plugin propio en Kotlin (~200 líneas) | Sí: pips nativos con ducking, sin silencio ni Media Session | Sí | Posible, con Mac | Kotlin, Android Studio; sin Rust |
| **Tauri 2 móvil** | Sí | Igual: Kotlin propio, más una capa de Rust obligatoria | Igual | Sí (APK 43-45 MB frente a ~8) | Solo con Mac; hoy no enlaza con Xcode 27 | Rust + Kotlin; sus dos bugs abiertos más graves en Android son justo «servicio en primer plano + actividad destruida» |
| **TWA (Bubblewrap / PWABuilder)** | Sí: el APK *es* Chrome | **No**: sin código nativo | Igual que hoy | Play sí; con riesgo de «webview spam» | PWABuilder iOS archivado en 2025 | Una tarde |
| **React Native / Flutter** | No: se reescribe la interfaz | Sí (voltra, flutter_activity_kit) | Sí | Sí | Sí | Reescribir Vue; en RN el núcleo se importa tal cual, en Flutter no |
| **App compañera (Kotlin)** | Sí, sin tocarla | Sí | Sí, si ella da los pips | Sí | No | Dos apps; la web tiene que emparejarse con ella por `ws://127.0.0.1` |
| **Home Assistant** | Sí | Sí (Android 16) y también iOS | No: la barra no avanza sola y los botones vuelven a HA | No hay app | Sí, gratis | Cero código nativo… si ya tienes HA |

**Capacitor.** Por descarte y por encaje: es la única vía que mantiene un solo
código, llega a la isla y al audio, y no exige aprender Rust ni reescribir la
app. Lo que hay que escribir —la notificación viva y el foco de audio con
ducking— **es Kotlin propio en todas las vías** (no existe hoy ningún plugin
publicado de Capacitor ni de Tauri que exponga las Live Updates de Android 16;
los «Live Update» de Capawesome y Capgo son otra cosa: actualizaciones OTA del
bundle). La diferencia entre cáscaras es cuánto hay alrededor de ese Kotlin,
y en Capacitor es lo mínimo: una clase con `@CapacitorPlugin`, un
`registerPlugin` en `MainActivity` y una definición en TypeScript con
implementación web de reserva. Capacitor 8.5 pone `targetSdk 36` (lo que Play
exige desde el 31-08-2026 y lo que hace falta para las Live Updates), no
arrastra librerías nativas (el requisito de páginas de 16 KB no aplica) y
tiene un precedente grande de lo mismo que queremos: `audiobookshelf-app`, un
Nuxt con `ssr: false`, sin service worker en nativo, plugins locales
registrados con `registerPlugin` y una implementación web de cada uno, y un
servicio en primer plano en Kotlin.

Tauri se descarta con pena: es viable y hay plantillas Nuxt 4, pero pone Rust
entre JS y Kotlin para no dar nada a cambio en este problema, y sus dos
incidencias abiertas más votadas en Android (#11609 desde 2024, #15671 de
julio de 2026, sin respuesta) describen exactamente la isla: un servicio en
primer plano que mantiene vivo el proceso deja la actividad filtrada o un
WebView en blanco al volver.

## Arquitectura propuesta

### Un solo build de Nuxt, con bandera

`COFFEE_NATIVO=1` en `nuxt generate`: fija `apiBase` a
`https://brew.krahegwen.com`, desactiva el módulo PWA y la analítica, expone
`nativo: true` en `runtimeConfig.public` y escribe en otra carpeta de salida
para no pisar `web/.output/public`, que es lo que sube wrangler. Con esa
bandera, `useVersion` no registra nada ni busca versión (la versión llega por
el APK), `instalar.client.ts` da por instalada la app, y la sección «La
versión» de ajustes se esconde. Todo lo demás es idéntico: `pnpm run deploy`
sigue construyendo la web como siempre y no debe tocar lo nativo.

### `movil/`: la cáscara

Cuarto paquete del workspace con `capacitor.config.ts` (`webDir` apuntando a
esa carpeta de salida, `androidScheme: 'https'`, `hostname: 'localhost'`) y la
carpeta `android/` que genera `cap add android`, commiteada como hace
`audiobookshelf`. Ahí dentro va `Isla` como plugin **local** —no hace falta
publicar nada en npm—, y conviene partirlo en dos: un módulo Gradle
`android/isla/` **que no sabe que Capacitor existe** (el servicio, la
notificación, el sonido, la derivación de tramos y su test JVM) y un
adaptador fino `IslaPlugin.kt` con `@CapacitorPlugin` y su
`registerPlugin(IslaPlugin::class.java)` en `MainActivity`. Si un día la
cáscara cambia —o se prefiere la app compañera—, el Kotlin se reutiliza. En
`web/app/isla/nativa.ts`, el `registerPlugin('Isla')` con la implementación
web como reserva. Los clips de voz no se duplican: `cap sync` copia el build
entero dentro del APK y el servicio los abre de `assets` por la misma ruta
(`public/audio/<idioma>/<clave>.m4a`).

El origen del WebView (`https://localhost`) **se fija en el primer build y no
se toca nunca más**: ahí viven el IndexedDB del modo local y la cola de
salida, y cambiarlo es perderlos sin aviso. Se apunta junto a la regla del
`workers.dev`.

### El puerto de la isla

`usePantallaBloqueo` se generaliza a un puerto con dos adaptadores, y la
generalización es exactamente la idea que ya tiene para la barra —anclaje y
extrapolación— aplicada al plan entero:

- **El plan se manda una vez**: tramos ya resueltos
  (`{desde, hasta | null, titulo, subtitulo, corto}`, que cubren desde el
  segundo 0 sin huecos, con un tramo «preparados» si la receta empieza en
  t > 0 y un último tramo abierto que cuenta hacia arriba: retirar pasado,
  goteo o total), la agenda de `cuesDe()` tal cual, los textos y las
  etiquetas de los botones **ya traducidos**, el idioma (para encontrar los
  clips de voz en el bundle) y los ajustes de sonido. Nada de `notas` ni del
  guion entero: la isla compacta de iOS y el chip de Android 16 caben en
  ~7 caracteres, y una Live Activity tiene 4 KB de estado.
- **Después solo viajan anclajes**: `{estado: 'corriendo', epochMs}`,
  `{estado: 'pausado', segundo}`,
  `{estado: 'cuenta_atras', segundo, arrancaEnEpochMs}` y
  `{estado: 'cerrado'}`. El epoch sale de
  `Date.now() − (performance.now() − inicioMs)` en el momento de anclar, y lo
  nativo lo pasa en el acto a `elapsedRealtime`, que no se mueve con la hora
  ni con la suspensión. Son cinco llamadas en el reloj: `arrancarDesde`,
  `pausar`, `moverA` en pausa, `conCuentaAtras` y `marcarFinGoteo`.
- **Lo nativo deriva el tramo vigente** con `(ahora − epochMs) / 1000`, pinta
  el cronómetro del sistema y se reprograma él mismo en cada `hasta` para
  cambiar el título: ocho o diez actualizaciones por taza, no una por segundo.
  JS no lleva el reloj de la isla; cuando la pantalla vuelve, reconcilia
  `inicioMs` con `leerAnclaje()`.
- **De vuelta suben sucesos**: los mandos (`pausar`, `reanudar`, `siguiente`,
  `anterior` y, si se decide, `gotear`) con su instante, y `cedida` con motivo
  (`audio` en la web; `descartada` o `sistema` en nativo). `sistemaCedido`
  pasa a llamarse `islaCedida` y sigue significando lo mismo: en esta taza no
  se vuelve a pedir.

`tramosDe()` y `tramoEn()` van al núcleo, puros y con test, y **ese test
exporta sus casos como JSON** que las pruebas de Kotlin leen: la misma
receta, el mismo segundo, el mismo tramo. Es la forma de que la derivación
del paso no viva dos veces sin vectores que las aten. La tabla `TONOS` de
`useSonido` (frecuencia, duración, ganancia por tipo de pip) también es un
dato y se muda al núcleo, para que web y nativo sinteticen lo mismo.

El adaptador web es el de hoy, con dos mudanzas: el intervalo `aOscuras` sale
de la pantalla y entra en el adaptador (que ya tiene plan y anclaje y puede
derivar el tramo solo, a nivel de módulo), y la prueba de la portada pasa a
ser una consumidora más del puerto —en el navegador prueba Media Session; en
el APK, la notificación—.

### La sesión: dos vías, y se decide con el móvil delante

Lo que no vale es lo obvio: `server.hostname = brew.krahegwen.com` para que el
origen coincida, porque el servidor local de Capacitor intercepta también
`/api/*` (issue #6875, cerrado como «not planned»); y `server.url` (cargar la
web remota) está documentado como no apto para producción y es lo que las
tiendas penalizan. Quedan dos vías que respetan la regla de que la decisión
de auth vive en `auth.js`:

**A. `CapacitorHttp`, sin tocar el Worker.** Con el plugin activado, `fetch`
sale por red nativa y las cookies van por el tarro del sistema
(`android.webkit.CookieManager`). Ese tarro devuelve las cookies con
`CookieOptions::MakeAllInclusive()` —comprobado en el código de Chromium—,
así que **la cookie `HttpOnly; SameSite=Strict` viaja igual** y `auth.js` no
cambia una línea: la app sigue sin saber cómo se autoriza. El parche de
`fetch` deja pasar lo que va al propio bundle (`/audio/...`, iconos), así que
solo la API sale por nativo. Lo que no pasa por él tal cual son las dos
llamadas binarias de `useSincro`: el `PUT` de la foto con `body: Blob` (el
parche solo convierte `File` a base64; un `Blob` lo manda como si fuera JSON)
y el `GET` de la foto con `responseType: 'blob'` (sin `responseType`
explícito, lo nativo lee la respuesta como texto). En nativo la foto sube
como `new File([blob], nombre, {type})` y baja con
`CapacitorHttp.get({url, responseType: 'blob'})` llamado directo, que
devuelve base64 y se vuelve `Blob` ahí mismo. Menos código; a cambio, un
transporte con manías propias.

**B. CORS y la cookie por origen.** `cabeceraDeSesion` emite
`SameSite=None; Secure` **solo cuando** la cabecera `Origin` es exactamente la
de la cáscara (`https://localhost`) y `Strict` en cualquier otro caso: la web
sigue idéntica. `index.js` gana una capa CORS antes del portero (`OPTIONS` →
204; `Allow-Origin` con el origen exacto, nunca `*`; `Allow-Credentials`;
`Vary: Origin`), y en las escrituras desde ese origen exige que `Origin`
coincida, que es lo que devuelve la defensa contra CSRF que `Strict` daba.
Los tres `$fetch` hacia la API pasan a un `$fetch.create({baseURL,
credentials: 'include'})`, inocuo en la web. Las fotos van por el `fetch`
normal, sin trucos. Más piezas, todas estándar y con test en `api/test`.

Se decide en la fase 3: A primero, porque es la que menos toca; B si A da
guerra con el móvil delante. En las dos, **la comprobación es la misma y no
se salta**: tras abrir sesión en el APK, el pie tiene que decir «en el
servidor» antes de registrar nada, porque el fallo es silencioso. (Hay una
tercera vía, `Authorization: Bearer` con el token guardado en la app, que
`auth.js` también acepta; obliga a un `useSesion` distinto y a guardar el
token, que hoy no se guarda a propósito. Queda como último recurso.)

### Una sola versión

`versionName` es la cadena del `package.json` raíz tal cual, y `versionCode`
se deriva en Gradle leyendo ese mismo fichero: `mayor·1 000 000 +
menor·10 000 + parche` (0.1.108 → 10108; al subir menor, el parche vuelve a
0 y sigue siendo monótono). Nunca a mano en `build.gradle`: el hook no lo
tocaría y el pie de la app mentiría. Play no admite repetir un `versionCode`,
y el hook sube el parche en cada commit de código, así que es monótono por
construcción.

### El ajuste

`pantalla_bloqueo` se queda para la web (Media Session, apagado por defecto)
y nace otra clave, `isla`, para el adaptador nativo, **encendida** por
defecto: en nativo no hay pelea por el audio y apagarla sería renunciar a la
mitad del APK. Cada adaptador mira la suya; el texto de ayuda es por
adaptador. La alternativa —una clave local por dispositivo— rompe la regla
de que los ajustes van a `preferencias`.

## La isla en Android

Una sola notificación construida con `NotificationCompat`, que en Android 16
sale promocionada y en los anteriores como notificación *ongoing* de toda la
vida (`ProgressStyle` cae al estilo por defecto por debajo de la API 36 y
`setRequestPromotedOngoing` es un no-op: mismo código, `androidx.core` 1.17+).

- **Cuenta sola.** `setWhen(fin del tramo)` + `setUsesChronometer(true)` +
  `setChronometerCountDown(true)`: la cuenta atrás la pinta el sistema sin
  que nadie la actualice, y en Android 16 es lo que sale en el chip de la
  barra de estado. La barra va con `ProgressStyle` (un segmento por tramo, con
  `setStyledByProgress`) y se actualiza por tramo, no por segundo; el límite
  del sistema son cinco actualizaciones por segundo y paquete, muy lejos.
  `setShortCriticalText` lleva lo corto («120 g», «Agita») para el chip.
- **Botones**: hasta tres. Pausa/Reanudar y Siguiente seguro; «Dejó de
  gotear» es candidato porque es reversible (`seguirGoteando`) y es el botón
  que más se pulsa tras arrancar. Parar no está, como en la web. Cada acción
  es un `PendingIntent` a un `BroadcastReceiver`: el servicio re-ancla él
  mismo con el plan que tiene, republica, y sube el suceso con
  `notifyListeners(..., retainUntilConsumed)`; si el WebView duerme, lo
  recibe al despertar y reconcilia. Nunca al revés: si la pausa dependiera
  de que JS conteste, con la pantalla bloqueada no habría pausa.
- **Canal `IMPORTANCE_LOW`** y `setOnlyAlertOnce`: ni suena ni vibra al
  actualizar (`IMPORTANCE_MIN` la descalificaría como Live Update). Permiso
  de notificaciones en tiempo de ejecución (Android 13+), pedido al arrancar
  la primera taza.
- **Live Update en Android 16**: permiso de manifiesto
  `POST_PROMOTED_NOTIFICATIONS` (no es de runtime), `setOngoing(true)`,
  `setRequestPromotedOngoing(true)`, sin `RemoteViews` ni `colorized`. La app
  consulta `canPostPromotedNotifications()` y, si el sistema no la
  promociona, ofrece llevar a `ACTION_MANAGE_APP_PROMOTED_NOTIFICATIONS`. Es
  **lo que abre la cápsula en el OnePlus 15**: lleva OxygenOS 16 (16.1 ya,
  con «Live Space» en la pantalla de bloqueo), y ahí las Live Updates de
  cualquier app salen en los *Live Alerts*, pero con un interruptor por app
  que nace apagado —«Show Live Updates on Live Alerts»—. En los OnePlus
  anteriores, según lleven OxygenOS 16; sin Android 16, o con el interruptor
  apagado, queda la notificación clásica en la pantalla de bloqueo, que es lo
  que enseña la captura de Hevy. Google avisa además de que los fabricantes
  pueden poner criterios propios. Y si el usuario descarta
  una Live Update, Google pide no volver a publicarla: `setDeleteIntent` sube
  `cedida: 'descartada'` y esa taza se queda sin isla, como hoy con el audio.
- **El proceso vive por un servicio en primer plano**, y desde Android 14 hay
  que declararle tipo. No existe «temporizador»: `shortService` caduca a los
  ~3 min (una 4:6 dura 3:30 más el goteo), `mediaPlayback` es defendible solo
  porque el servicio reproduce los pips y la voz, y `specialUse` es lo que
  usan los relojes de terceros (Fossify Clock declara así temporizador,
  alarma y cronómetro), con la `property` que lo justifica en el manifiesto.
  El servicio arranca al pulsar «empezar» (app visible, sin restricción de
  arranque) y muere al cerrar el goteo o al restablecer. Sin él, Android
  congela el proceso a los ~10 s en caché y, desde Android 15, una app que no
  está delante ni tiene servicio **no puede pedir foco de audio**: los pips
  con la pantalla bloqueada dependen de esto. Para un APK propio no hay
  revisión de nada; para Play, cada tipo se declara con descripción y vídeo.
- **Los pips y la voz los da el servicio**, no el WebView: `SoundPool` con
  `USAGE_ASSISTANCE_SONIFICATION`, y justo antes de cada ráfaga
  `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`, que desde Android 8 hace que el
  sistema baje la música y la restaure solo (los podcasts y audiolibros se
  pausan en vez de bajar: es cosa de ellos). La voz son los mismos `m4a` del
  bundle; los pips se hornean una vez desde la tabla `TONOS` con un script de
  Node sin dependencias a `web/public/audio/tonos/*.wav`, para que web y
  nativo suenen igual desde la misma tabla. Un solo productor: con adaptador
  nativo el reloj no programa Web Audio —tampoco el `pitido('confirmacion')`
  del goteo— o habrá pips dobles en la frontera. La agenda ya es del núcleo y
  viaja en el plan; la cuenta atrás se pacta (`arrancaEnEpochMs`) y el GO
  ancla ahí, no en el `setTimeout` que hoy la dispara.
- **Código que mirar antes de escribir el nuestro**: el sample oficial de
  Google (`android/platform-samples`, Apache), `BrewingLiveUpdateService.kt`
  de `timer-coffee` —un temporizador de café con exactamente esta
  notificación, en Flutter—, `LiveNotifier.kt` de `GymMane` (segmentos,
  acciones, respaldo para Android 14-15) y `AudioFocusPlugin.kt` de
  `correlogo` (un plugin de Capacitor de foco con ducking). Los dos del medio
  son GPL-3.0 y este repo es MIT: se leen para la estructura, no se copian.

## La música

En la app nativa el problema **desaparece por construcción**: no hay silencio
ni Media Session —la isla es la notificación— y los pips piden el foco
correcto. Y `isMusicActive()` está a una llamada si se quiere avisar
(«tienes música: los avisos sonarán por encima»), aunque con ducking el aviso
sobra.

En la web se queda como está: ajuste apagado por defecto, y si otra app coge
el audio, ceder. El aviso previo genérico y la elección del iPhone
(`transient` frente a `playback`) están en `PENDIENTES.md`.

## iOS

Las Live Activities encajan casi a medida: `Text(timerInterval:)` y
`ProgressView(timerInterval:)` cuentan y rellenan solos con una `update()` por
paso, hay botones desde iOS 17 (con el móvil bloqueado sin autenticar no
responden), 8 h de vida y 4 KB de estado. Y hay tres plugins de Capacitor
vivos (kisimedia, ludufre, Capgo), ninguno con botones. Pero todo pasa por un
*target* de Widget Extension que se crea en Xcode, un iPhone real (el
simulador no las soporta), 99 $/año y una revisión con la guía 4.2 delante
(«web reempaquetada») y la 4.3(b) de junio de 2026, que nombra los «simple
timers» entre lo que no aceptan si no aporta algo distinto; una bitácora con
motor de sugerencias lo aporta, pero hay que contarlo. Sin Mac se puede
compilar y subir a TestFlight desde un servicio (Codemagic da 500 minutos al
mes; Capgo Build compila desde Windows), no depurar ni crear la extensión.

Hay un Mac de empresa con el que compilar, así que iOS deja de ser «si algún
día» y pasa a ser **la última fase, después de Android**: `cap add ios`, el
*target* de la Widget Extension en Xcode 26 (que pide un macOS reciente en
ese Mac y permiso para instalar Xcode), el adaptador Swift del mismo puerto, y
la sesión de audio `.playback` con `[.mixWithOthers, .duckOthers]`, que es la
única combinación que suena por encima de la música, ignora el interruptor de
silencio y la baja solo mientras dura el pip. El día a día sigue en Windows:
el Mac es para compilar y firmar. Dos cosas por ser un Mac que no es tuyo: la
clave privada del certificado de firma nace en su llavero —se exporta a un
`.p12` y se guarda fuera, como el keystore de Android— y el Apple Developer
Program (99 $/año) va a tu nombre, no al de la empresa. Y como no hay iPhone
propio, la prueba la hacen amigos: **TestFlight interno** admite hasta 100
probadores sin pasar revisión —les llega un enlace y la app TestFlight hace
el resto—, que es la versión iOS del botón de la portada. La App Store, con
su revisión (4.2 y 4.3(b)), solo si algún día se quiere publicar de verdad.
Nada del diseño de Android cambia por esto: el puerto es el mismo y el
adaptador iOS es el tercero.

## Distribución y tiendas

De menos a más peaje:

1. **El APK en el OnePlus**, por `adb` o abriendo el fichero. Sin peaje, y sin
   peaje también con la verificación de desarrolladores de Android: empieza
   el 30-09-2026 en cuatro países que no son España, llega en 2027, y cuando
   llegue habrá una cuenta gratuita de «distribución limitada» para 20
   dispositivos sin DNI.
2. **GitHub Releases + Obtainium**: el APK se construye en local, se adjunta
   a mano a la *release* y el móvil se actualiza solo. Sin Actions. Con la
   misma clave de firma siempre, y esa clave **no tiene reset** fuera de
   Play: se guarda con copia, fuera del repo.
3. **IzzyOnDroid** acepta ese mismo APK firmado (FOSS, hasta 30 MB, metadatos
   fastlane en el repo) y lo coge de la *release* en menos de 24 h. F-Droid
   compila él con toolchain libre y firma con su clave: otra liga, sin
   precedente Capacitor + Nuxt encontrado.
4. **Google Play**: 25 $ una vez, DNI y tarjeta a nombre real, verificar un
   Android con la app de Play Console, AAB con Play App Signing (la clave de
   subida sí tiene reset). Lo caro no es eso: una cuenta personal nueva tiene
   que pasar **una prueba cerrada con 12 testers durante 14 días seguidos**
   antes de pedir producción (revisión de esa solicitud, ≤7 días). Más la
   declaración del tipo de servicio en primer plano con vídeo. La política de
   «webview de una web ajena» no aplica siendo el dueño, y con notificación y
   audio nativos no es un mero envoltorio.
5. **App Store**: 99 $/año, la revisión de la guía 4.2 y, para que lo prueben
   amigos sin pasar por ella, TestFlight interno. Está en «iOS».

Actualizar el bundle web fuera de la tienda (OTA) está permitido por escrito
en Play y en el PLA de Apple mientras no cambie el propósito; Capgo se
autoaloja (AGPL) y el bundle podría servirlo el mismo Worker. Es opcional: con
la web intacta, el APK solo necesita rehacerse cuando cambie algo que importe
en el móvil, y con Obtainium eso es adjuntar un fichero. Lo que **nunca** va
por OTA es el plugin.

## Encaje con las reglas del repo

- **Nada de GitHub Actions**: el build es local (Android Studio, Gradle,
  JDK 17), y un `pnpm run release:android` llama al mismo
  `comprobar_despliegue.py` que `deploy` (solo habla con git; sirve tal cual)
  antes de construir. No puede llamarse `deploy` a secas ni chocar con
  comandos de pnpm: `test_scripts.py` lo vigila.
- **Repo público**: el keystore y sus contraseñas van fuera, como el token —un
  `%USERPROFILE%\.coffee\subida.jks` y variables en el registro
  (`COFFEE_KEYSTORE`, `COFFEE_KEYSTORE_PASS`…) que `signingConfigs` lee con
  `System.getenv`—. Y a `.gitignore`, **antes** de crear el proyecto:
  `android/local.properties` (lleva el nombre de usuario de Windows en
  `sdk.dir`, la misma fuga que el `workers.dev`), `*.jks`, `*.keystore`,
  `keystore.properties`, `android/.gradle/`, `android/app/build/`, y lo que
  copia `cap sync` (`android/app/src/main/assets/public/`,
  `capacitor.config.json`, `capacitor.plugins.json`). `google-services.json`
  no hace falta: no hay Firebase. Producción se reconstruye desde el repo
  **salvo la firma**, y eso se dice en el README para que la regla no mienta.
- **Los hooks**: `pnpm-workspace.yaml`, `subir_version.py`, la línea del
  `git add` del `pre-commit`, `PAQUETES` en `test_scripts.py` y los globs de
  `node --test`, una línea cada uno. `allowBuilds` de pnpm si entra alguna
  dependencia con `postinstall` (p. ej. `sharp` por `@capacitor/assets`).
- **`.gitattributes`**: `*.bat text eol=crlf` para `gradlew.bat`, y
  `gradlew` con bit de ejecución (`git update-index --chmod=+x`). Ojo:
  `hooks/pre-push` está en el índice como `100644` y por eso git lo ignora
  fuera de Windows —esta sesión lo comprobó—; se arregla igual.
- **Python solo stdlib**: nada del build tiene que ser Python. Si algo lo es,
  `json` basta (como en `subir_version.py`); no hay `pyyaml` ni SDK de Play:
  la subida a la tienda es a mano por consola.
- **Dos idiomas**: el plan lleva los textos resueltos y el nombre del canal
  se fija al encender con el idioma; en Kotlin no nace ninguna cadena.
- **Un tercer artefacto que verificar** tras cada release, con su reloj:
  instalar en el OnePlus y hacer una taza. La tienda tarda horas o días, no
  un minuto.

## Fases

Cada una deja el repo funcionando y desplegable.

| # | Qué | Riesgo |
|---|---|---|
| 0 | **Decidir** lo de abajo: iOS, Home Assistant, qué OnePlus, tienda o APK. | — |
| 1 | **El puerto de la isla en la web.** `tramosDe`/`tramoEn` y `TONOS` al núcleo con vectores; `useIsla()` con el adaptador web de hoy; `aOscuras` al adaptador; la prueba de la portada como consumidora. Sin cambio de comportamiento. | Bajo |
| 2 | **La bandera de build** y el alta del cuarto paquete en hooks, scripts y `.gitignore`. La web no cambia. | Bajo |
| 3 | **La cáscara**: `movil/`, `cap add android`, la sesión por la vía A (o la B), el respaldo por Filesystem + Share, el selector de ficheros, Ko-fi por `App.openUrl`. **Comprobar en el OnePlus**: el pie dice «en el servidor», una taza de prueba sube sin duplicar y baja a la web, la foto sube y baja, el respaldo se guarda, y `pnpm run deploy` de la web sigue igual con el árbol limpio tras `cap sync`. | Medio |
| 4 | **El plugin `Isla`**: notificación con cronómetro, barra y botones, servicio en primer plano, pips con ducking, adaptador `nativa.ts`. **Comprobar**: una taza entera con Spotify sonando y el móvil bloqueado; la música baja en cada pip y vuelve. | Alto |
| 5 | **Live Update en Android 16** y la guía al interruptor de OxygenOS. | Medio |
| 6 | **Distribución**: firma, `release:android`, GitHub Releases + Obtainium. Play después, si se quiere. | Bajo |
| 7 | **iOS**, con el Mac de empresa: `cap add ios`, la Live Activity sobre el mismo puerto, pips con `mixWithOthers` + `duckOthers`, TestFlight interno para los amigos. | Alto |

La 1 vale la pena aunque el resto se descarte: deja el reloj sin saber cómo
se enseña el paso, que es como debería haber nacido. La 3 es la que puede
perder datos si se hace deprisa: se prueba con la base local o con una taza
que se retira después, y **antes de registrar nada real se mira el pie**.

## Contraindicaciones

Por orden de lo que más duele.

1. **Dos artefactos que se pueden desfasar.** La web se despliega en un minuto
   y el APK hay que reconstruirlo. Con la cola idempotente (ids UUIDv7, 409
   `repetida`) y las preferencias fusionadas por sello, que un móvil vaya con
   una versión vieja no duplica ni pisa nada; pero un cambio de contrato en la
   API tiene que seguir aceptando lo que manda el APK anterior. Es la misma
   regla que ya rige para la cola vieja y los respaldos.
2. **El origen del WebView es para siempre.** Cambiar esquema o hostname tras
   publicar es perder el cajón local y la cola sin aviso.
3. **La sesión falla en silencio.** Está dicho arriba; se repite porque es la
   única contraindicación que cuesta datos.
4. **El WebView no es un reloj.** Congelado en caché, con temporizadores a
   uno por segundo: todo lo que tenga que pasar con la pantalla bloqueada lo
   hace el servicio. Si en algún momento apetece «que JS mande», es el camino
   equivocado.
5. **La cápsula depende del usuario y del fabricante.** El OnePlus 15 la
   tiene, pero sin el interruptor por app no hay Live Alert (queda la
   notificación en la pantalla de bloqueo), los OnePlus anteriores solo si
   llevan OxygenOS 16, y los criterios de OnePlus para promocionar no están
   documentados.
6. **`specialUse` se revisa** si se publica en Play, y `mediaPlayback` es un
   argumento, no una categoría hecha para esto. Para un APK propio da igual.
7. **La clave de firma no tiene reset** fuera de Play: perderla es reinstalar
   en cada dispositivo. Copia fuera del ordenador.
8. **Los 12 testers.** Publicar en Play desde una cuenta personal nueva es
   reclutar a doce personas durante dos semanas. Obtainium no pide nada.
9. **Las licencias de los ejemplos**: dos de los cuatro repos que conviene
   leer son GPL-3.0. Se aprende la estructura; el Kotlin se escribe.

## Alternativas que descarto, y por qué

- **Electron.** Escritorio. Arriba.
- **Tauri 2.** Rust de por medio para el mismo Kotlin, APK cinco veces más
  grande, y sus bugs abiertos son este escenario.
- **TWA / PWABuilder.** Pone la web en Play en una tarde —y merece tenerlo en
  cuenta como «reserva del nombre» si algún día importa— pero es Chrome a
  pantalla completa: ni notificación viva ni foco de audio, y PWABuilder
  para iOS está archivado.
- **Reescribir en React Native o Flutter.** Solo compensaría si se quisiera
  una app nativa completa. Flutter tiene el paquete más completo para la isla
  (`flutter_activity_kit`) y un temporizador de café hecho así, pero se
  pierde toda la interfaz y el núcleo; en RN el núcleo se importaría y la
  interfaz no.
- **Kotlin Multiplatform.** No reutiliza nada del núcleo: sería mantener dos
  lógicas, justo lo que la regla «la app no reimplementa reglas del servidor»
  prohíbe.
- ~~**La app compañera.**~~ No la descarto del todo: es la única vía que deja
  la web **sin tocar** (ni sesión, ni build, ni versión) y la isla la pinta un
  Kotlin puro que recibe el plan por un WebSocket en `127.0.0.1` (Chrome no
  lo bloquea como contenido mixto, aunque el permiso de «acceso a la red
  local» que Chrome está desplegando en 2025-2026 puede acabar preguntando).
  A cambio son dos apps, un emparejamiento, un socket sin autenticación en el
  móvil, y la web tiene que descubrir si la compañera está y despertarla por
  `intent://` si no. Y para Play no valdría sola —una app que no hace nada
  sin la web cae en «funcionalidad mínima»—: habría que meterla dentro de un
  TWA, sin precedente documentado. Si la fase 3 se atragantara, es el plan B,
  y el módulo `android/isla/` de la fase 4 es el mismo código con otro
  transporte: por eso se escribe sin saber que Capacitor existe.
- **Home Assistant.** Se miró porque las dos capturas de documentación son de
  su app —sus notificaciones «Live Update» son exactamente esto, y con un HA
  en casa la isla se habría probado desde un webhook sin escribir nada
  nativo—. Eran solo un ejemplo de notificación viva, así que fuera. Se queda
  en la tabla por si alguien con HA lee esto: la barra no avanzaría entre
  envíos, los botones volverían a HA y el audio seguiría siendo el de la web.

## Lo que hay que decidir

Contestado el mismo día, 2026-09-25:

1. ~~¿Hay un iPhone y un Mac a mano?~~ **iPhone propio no; Mac de empresa
   sí**, para compilar. iOS es la fase 7 y la prueban amigos por TestFlight.
2. ~~¿Hay Home Assistant?~~ **No**: las capturas eran solo un ejemplo.
3. ~~¿Qué OnePlus?~~ **Un OnePlus 15** (OxygenOS 16) y algunos anteriores:
   la fase 5 se puede comprobar en el de casa.

Queda:

4. **¿Play de verdad, o basta el APK con Obtainium?** Decide si hay que
   declarar el servicio y reclutar testers.
5. **¿Botón «dejó de gotear» en la notificación?** Y **¿cuenta atrás al
   reanudar desde ella?** (quien toca la cápsula ya tiene el hervidor en la
   mano; lo razonable es reanudar en el acto).
6. **La sesión: vía A (`CapacitorHttp`, el Worker intacto) o vía B (CORS y
   cookie por origen).** A primero; se decide en la fase 3 con el móvil
   delante, y en las dos se mira el pie antes de registrar nada.

## Fuentes

Lo que sostiene cada afirmación de arriba, leído el 2026-09-25.

- Live Updates de Android 16: [guía](https://developer.android.com/develop/ui/views/notifications/live-update),
  [novedades](https://developer.android.com/about/versions/16/features/progress-centric-notifications),
  [sample oficial](https://github.com/android/platform-samples/blob/main/samples/user-interface/live-updates/src/main/java/com/example/platform/ui/live_updates/SnackbarNotificationManager.kt).
- Tipos de servicio en primer plano: [Android](https://developer.android.com/develop/background-work/services/fgs/service-types),
  [Play](https://support.google.com/googleplay/android-developer/answer/13392821),
  [manifiesto de Fossify Clock](https://raw.githubusercontent.com/FossifyOrg/Clock/main/app/src/main/AndroidManifest.xml).
- Foco de audio y ducking: [Android](https://developer.android.com/media/optimize/audio-focus).
  Chromium: [`media_content_type.cc`](https://chromium.googlesource.com/chromium/src/+/main/media/base/media_content_type.cc),
  [`AudioFocusDelegate.java`](https://chromium.googlesource.com/chromium/src/+/main/content/public/android/java/src/org/chromium/content/browser/AudioFocusDelegate.java),
  [aplazar el foco hasta ser audible](https://github.com/chromium/chromium/commit/2f389a545e01f038fd91a57ea2960480bde1f803),
  [el WebView y las cookies (`MakeAllInclusive`)](https://chromium.googlesource.com/chromium/src/+/main/android_webview/browser/cookie_manager.cc).
- WebKit y `audioSession`: [`DOMAudioSession.cpp`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/Modules/audiosession/DOMAudioSession.cpp),
  [`AudioSessionIOS.mm`](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/platform/audio/ios/AudioSessionIOS.mm).
- Capacitor: [config](https://capacitorjs.com/docs/config), [CapacitorHttp](https://capacitorjs.com/docs/apis/http),
  [`native-bridge.ts`](https://raw.githubusercontent.com/ionic-team/capacitor/main/core/native-bridge.ts),
  [plugins locales en Android](https://capacitorjs.com/docs/android/custom-code),
  [issue #6875 sobre `server.hostname`](https://github.com/ionic-team/capacitor/issues/6875),
  [8.0](https://capacitorjs.com/docs/updating/8-0), [8.5](https://ionic.io/blog/capacitor-8-5-released),
  [audiobookshelf-app](https://github.com/advplyr/audiobookshelf-app),
  [correlogo (foco con ducking)](https://github.com/mahmatias/correlogo/blob/main/android/app/src/main/java/com/correlogo/app/AudioFocusPlugin.kt).
- Ejemplos de la notificación: [timer-coffee](https://github.com/antonkarliner/timer-coffee/blob/main/android/app/src/main/kotlin/com/coffee/timer/BrewingLiveUpdateService.kt),
  [GymMane](https://github.com/InlitX/GymMane/blob/main/android/app/src/main/kotlin/com/gymmane/app/LiveNotifier.kt),
  [Hevy](https://www.hevyapp.com/features/live-activity/).
- Tauri: [#11609](https://github.com/tauri-apps/tauri/issues/11609), [#15671](https://github.com/tauri-apps/tauri/issues/15671),
  [#16130 (Xcode 27)](https://github.com/tauri-apps/tauri/issues/16130), [plugins móviles](https://v2.tauri.app/develop/plugins/develop-mobile/).
- TWA: [Chrome](https://developer.chrome.com/docs/android/trusted-web-activity),
  [PWABuilder iOS, archivado](https://github.com/pwa-builder/pwabuilder-ios/blob/main/README.md).
- OxygenOS 16 y las Live Alerts: [Android Authority](https://www.androidauthority.com/oxygenos-16-features-3607625/).
- Tiendas: [12 testers](https://support.google.com/googleplay/android-developer/answer/14151465),
  [API 36](https://support.google.com/googleplay/android-developer/answer/11926878),
  [verificación de desarrolladores](https://developer.android.com/developer-verification/guides/faq),
  [Obtainium](https://github.com/ImranR98/Obtainium/blob/main/README.md),
  [IzzyOnDroid](https://izzyondroid.org/docs/general/AppInclusionPolicy/),
  [Apple Developer](https://developer.apple.com/programs/enroll/),
  [guías de revisión](https://developer.apple.com/app-store/review/guidelines/),
  [4.3(b) y los «simple timers»](https://www.macrumors.com/2026/06/09/app-store-guidelines-low-quality-apps/),
  [OTA en Play](https://support.google.com/googleplay/android-developer/answer/9888379).
- iOS: [Live Activities](https://developer.apple.com/tutorials/data/documentation/activitykit/displaying-live-data-with-live-activities.json),
  [`Text(timerInterval:)`](https://developer.apple.com/tutorials/data/documentation/swiftui/text/init(timerinterval:pausetime:countsdown:showshours:).json),
  [categorías de audio](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/AudioSessionCategoriesandModes/AudioSessionCategoriesandModes.html),
  [Codemagic](https://codemagic.io/pricing/), plugins: [kisimedia](https://github.com/kisimediaDE/capacitor-live-activity),
  [ludufre](https://github.com/ludufre/capacitor-live-activities), [Capgo](https://github.com/Cap-go/capacitor-live-activities/).
- Home Assistant: [Live Activities y Live Updates](https://companion.home-assistant.io/docs/notifications/live-activities/),
  [PR #6438](https://github.com/home-assistant/android/pull/6438),
  [límites de envío](https://companion.home-assistant.io/docs/notifications/notification-details/).
- La web: [`showNotification`](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification),
  [puente de notificaciones de Chromium](https://raw.githubusercontent.com/chromium/chromium/main/chrome/android/java/src/org/chromium/chrome/browser/notifications/NotificationPlatformBridge.java),
  [Notification Triggers, abandonada](https://developer.chrome.com/docs/web-platform/notification-triggers),
  [Audio Session API](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API),
  [temporizadores en segundo plano](https://developer.chrome.com/blog/timer-throttling-in-chrome-88).
