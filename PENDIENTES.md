# Pendientes

Cosas vistas usando la app de verdad, para abordar más adelante. No es un
backlog de deseos: cada punto sale de una extracción registrada a mano y
lleva anotado lo que ya se sabe, para no volver a investigarlo desde cero.

**Ahora mismo no hay ninguno.** Las anotadas el 2026-08-07 sobre la versión
0.1.40 están todas hechas, y el sitio queda abierto para la siguiente.

## Lo que salió de aquí

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
  que se explora en línea recta. Con la escalera de Gary (94 amargo, 91
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
