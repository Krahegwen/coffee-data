# Pendientes

Cosas vistas usando la app de verdad, para abordar más adelante. No es un
backlog de deseos: cada punto sale de una extracción registrada a mano y
lleva anotado lo que ya se sabe, para no volver a investigarlo desde cero.

Estuvo vacío desde el 2026-08-10 —las del 2026-08-07 sobre la 0.1.40 se
hicieron todas— y entre medias entraron el bloque de sonido, ajustes, temas y
flujo (2026-08-18) y dos tandas sueltas (2026-09-04 y 2026-09-14) sin dejar
nada aquí. Lo de abajo es del **2026-09-25**, sobre la 0.1.108, el día que la
pantalla de bloqueo paró la música. Lo grande de ese día no cabe aquí: es
`PLAN-app-nativa.md`.

## Del 2026-09-25

1. **El aviso de «esto te para la música», solo si hace falta.** Con el ajuste
   `pantalla_bloqueo` apagado de fábrica no hay nada que avisar, y su texto de
   ayuda ya lo dice al encenderlo. Si un día se quiere un aviso en el reloj
   antes de arrancar, lo que ya se sabe: **la web no puede saber si otra app
   está sonando** —no hay API; solo se entera a posteriori, cuando le quitan
   el audio, que es lo que ya usa `ceder`—, así que sería genérico, una vez,
   y con «no volver a avisar». En nativo sí se consulta
   (`AudioManager.isMusicActive()` en Android;
   `secondaryAudioShouldBeSilencedHint` en iOS), pero ahí el aviso sobra:
   los pips harían *ducking* y la música no se para.
2. **En el iPhone los pips paran la música aunque el ajuste esté apagado.**
   `useSonido` pone `audioSession.type = 'playback'` para que el interruptor
   de silencio no calle los pips, y en WebKit `playback` no se mezcla: corta
   la música al activarse. `transient` mezcla, pero el interruptor la calla.
   No hay tipo que haga las dos cosas, así que es una decisión: `transient` y
   un aviso de «quita el silencio para oír los pips», o `playback` como
   ahora. Falta un iPhone con el que probarlo, como todo lo de iOS.
3. **Probar en el OnePlus si con los sonidos apagados la tarjeta convive con
   la música.** Desde febrero de 2024 Chrome aplaza pedir el audio hasta que
   la pestaña suena de verdad; el silencio a −90 dB no llega y sería el primer
   pip el que se lo quita a la música. Si se confirma, el texto de ayuda del
   ajuste puede decirlo: con el sonido apagado, tarjeta y música a la vez.
   Ojo al probarlo: el detector de audibilidad muestrea a 15 Hz y un pip de
   80 ms puede pasarle desapercibido; probar también con el `go` de 300 ms.
5. **Ducking en la web, sin plugin, quizá.** En Chrome Android un `<audio>`
   de 5 s o menos pide el foco transitorio con *ducking*: si los pips fueran
   clips cortos por `<audio>` en vez de Web Audio, la música bajaría y
   volvería con cada uno sin app nativa. A cambio se pierde la precisión con
   la que Web Audio los coloca, y con el silencio encendido las dos peticiones
   se cruzan. Se prueba en el OnePlus en una tarde, antes de decidir cuánto
   vale la fase del sonido nativo del plan.

## Lo que salió de aquí

Del 2026-09-25, el punto 4 —**el wake lock que no se volvía a pedir tras un
bloqueo**—, hecho el 2026-09-26 como fase 0 del plan: el navegador lo suelta
al ocultar la página y avisa con `release`, que ahora se escucha, y se vuelve
a pedir al verse la página con el reloj andando; en pausa no se pide, que ahí
la pantalla puede apagarse. Lo que conviene recordar: un sentinel guardado en
una variable no dice si sigue vivo, y el `if (!despierta)` que protegía de
pedirlo dos veces acabó impidiendo pedirlo la segunda.

Del 2026-08-10, con lo que conviene recordar de cada una:

- **Partir `/crono` en dos rutas**, vaciar el reloj al guardar la extracción
  —la regla de cuándo caduca un borrador está escrita en `useCrono()`—,
  confirmar antes de tirar algo medido, el **defecto como lista ordenada** y
  enseñar las notas de cata en la tarjeta de guardado.
- **El goteo y el tiempo total, atados** (punto 5). La lección va más allá del
  campo: un dato mal medido no se queda quieto, se convierte en conclusión.
  Aquel goteo de 64 s sostuvo un diagnóstico entero —«el lecho se está cerrando
  cada día»— que era falso, porque los otros dos valores sí subían y el malo
  remataba la tendencia. Los avisos de coherencia no son cosmética. Lo que se
  hizo está en el README, bajo `drawdown_s`.
- **La exploración es un árbol** (punto 7). El motor emparejaba por vecindad
  —cada extracción contra la anterior del mismo café— y eso daba por supuesto
  que se explora en línea recta. Con la escalera de Gary (93 amargo, 91
  equilibrado, 88 astringente) lo razonable era volver al 91 y mover la
  molienda: contra la de ayer son dos cambios y el par se descarta, contra el 91
  es uno limpio. Ahora `desde_id` dice de qué extracción es variación cada una.
  En el README, bajo `desde_id`.

De esa última quedaron escritas dos reglas que valen para todo lo que venga:

- **Son dos cadenas distintas y no hay que confundirlas.** La madre
  (`desde_id`) dice contra qué se compara y **nunca sale de la bolsa**, porque
  el tueste es lo que hace la taza. El arranque dice de dónde se copian los
  números al abrir el formulario y **puede venir de donde sea**, porque solo
  rellena campos y no afirma nada. Cuando no coinciden, la extracción es una
  primera y no forma par.
- **Un selector nunca debe poder perder el valor que ya tiene.** Por eso el de
  la madre enseña las activas más la que ya esté puesta aunque esté retirada, y
  marcada como tal: si no, abrir una ficha cuya madre se retiró después la
  cambiaría sola al guardar. El del alta de extracción enseña solo lo vivo, y
  ahí está bien porque es una fila nueva y no hay valor previo que perder.
