# Pendientes

Cosas vistas usando la app de verdad, para abordar más adelante. No es un
backlog de deseos: cada punto sale de una extracción registrada a mano y
lleva anotado lo que ya se sabe, para no volver a investigarlo desde cero.

Anotadas el 2026-08-07, sobre la versión 0.1.40.

## 1. Separar la ruta de «preparar» y la del cronómetro

Hoy `/crono` es dos pantallas en una: la de elegir café, receta, dosis y agua,
y la del reloj andando. Se decide con `enCrono` dentro del mismo estado, así
que el navegador no distingue una de otra: no hay URL que llevar a la del
reloj, y el botón de atrás no hace lo que uno espera. Molestaba poco cuando la
pantalla no recordaba nada; ahora que el estado sobrevive a salir y volver,
estorba de verdad.

Serían dos rutas —preparar y crono— con el estado compartido donde está, en
`useState('crono')`. Ojo al entrar directo a la del reloj sin haber pasado por
la de preparar: sin pasos escalados no hay guion que enseñar.

## 2. Cuándo se vacía el estado del cronómetro

Ahora el reloj se limpia al pasar del crono al final de la extracción. Debería
limpiarse **al guardar la extracción**, que es cuando esa taza termina de
verdad: si guardas y vuelves al crono, lo que queda ahí es de la taza anterior.

Y de paso, mirar lo mismo en toda la app: cada pantalla que guarda estado
—el borrador de extracción, el de bolsa, la selección del crono— tiene su
propia idea de cuándo dejar de ser verdad, y están decididas una a una. Hace
falta una regla dicha en voz alta, no cinco criterios que se parecen.

## 3. Confirmación al vaciar

El botón «Vaciar» del crono y de los formularios borra sin preguntar. En el
crono es peligroso: se lleva por delante una medición que no se puede repetir
—el café ya se ha colado—. Ponerle el modal de confirmar, como el de retirar
una extracción, al menos donde hay algo medido que perder.

Vale la pena distinguir: vaciar un formulario en blanco no necesita
confirmación; vaciar uno con un tiempo cronometrado dentro, sí.

## 4. ¿El defecto es uno o varios?

Hoy es uno: una columna con lista cerrada, y el motor está montado encima
—`PALANCAS` mapea defecto a palancas, y la primera es la que se aplica—.

La pregunta de verdad no es si la base puede guardar varios, que puede con una
migración. Es si tiene sentido: el protocolo entero se sostiene sobre mover
**una sola cosa** cada vez, y si la taza está amarga y astringente a la vez,
las palancas de las dos tiran de los clics en direcciones distintas. Puede que
lo correcto sea seguir eligiendo uno —el que más molesta— y que el resto viva
en las notas de cata, que para eso están. Decidir antes de tocar nada.

## 5. Las notas de cata parecen perderse al guardar

**No se pierden**: la extracción del 2026-08-07 tiene sus notas en la base. Lo
que pasa es que `enviar()` en `web/app/pages/nueva.vue` limpia el campo después
de guardar, a propósito —lo que no se repite entre extracciones se vacía—, y
como el aviso que sale encima habla de otra cosa (café pasado, bolsa abierta,
bajar clics), lo que se ve es la nota desaparecida y ningún acuse de recibo.

Es un fallo de la app diciendo lo que hizo, no de la base. Dos arreglos
posibles: que la tarjeta de guardado enseñe las notas que se guardaron, o que
el campo no se limpie hasta que empieces la siguiente. El primero parece mejor
—confirma en vez de esconder— y de paso arregla la sensación de que el aviso
se ha comido lo que escribiste.
