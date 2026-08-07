# Pendientes

Cosas vistas usando la app de verdad, para abordar más adelante. No es un
backlog de deseos: cada punto sale de una extracción registrada a mano y
lleva anotado lo que ya se sabe, para no volver a investigarlo desde cero.

Anotadas el 2026-08-07, sobre la versión 0.1.40.

(La fila mala que motivó el punto 5 ya está corregida: la extracción del
2026-08-07 tiene su goteo en 42 s y la corrección explicada en sus notas.)

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

## 5. El goteo y el tiempo total están atados, y nadie lo comprueba

Los dos **terminan en el mismo instante** —el fin del goteo—; lo que cambia es
desde dónde se miden: el total desde el primer vertido, el goteo desde el final
del último. O sea:

    tiempo_total = fin_del_último_vertido + drawdown_s

Y el fin del último vertido no hay que adivinarlo: sale de la receta que la
propia extracción referencia. Corregir uno a mano y dejar el otro quieto rompe
la fila, porque no son dos medidas independientes sino la misma marca vista
desde dos orígenes.

Pasó de verdad el 2026-08-07: el crono siguió corriendo al tirar el filtro, se
corrigió el tiempo total a 3:32 y el goteo se quedó en 64 s. Con la receta base
—último vertido de 145 a 170 s— esos 64 implican que 90 g cayeron en tres
segundos. El valor coherente eran ~42 s. Las otras dos extracciones cuadran al
segundo (217 − 47 = 170; 205 − 30 = 175), así que la comprobación funciona.

Dos arreglos, y hacen falta los dos:

- **Validar en el núcleo**, con la misma división que ya usa `extraido_g`: dura
  la que es imposible —`drawdown_s` nunca puede llegar a `tiempo_total`— y
  aviso la que solo es sospechosa, que el vertido dure mucho menos o mucho más
  de lo que dice la receta. Blanda porque el vertido real varía y porque se
  puede mandar un `reparto` propio; el aviso avisa, no bloquea.
- **Atarlos al editar**: en el alta y en la corrección, cambiar el tiempo total
  debería mover el goteo el mismo delta, que es lo que hace el reloj cuando los
  calcula él. Hoy esa atadura solo existe dentro del cronómetro y se pierde en
  cuanto tocas el campo a mano.

Y una lección que va más allá del campo: un dato mal medido no se queda quieto,
se convierte en conclusión. Ese 64 sostuvo un diagnóstico entero —«el lecho se
está cerrando cada día»— que era falso, porque los otros dos valores sí subían
y el malo remataba la tendencia. Los avisos de coherencia no son cosmética.

## 6. Las notas de cata parecen perderse al guardar

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

## 7. Volver a una rama anterior: la base de comparación no siempre es la de ayer

El motor empareja **extracciones consecutivas**: `pares()` recorre el histórico
de cada café y compara cada una con la inmediatamente anterior. Eso da por
supuesto que la exploración es una línea, y no lo es.

Pasó el 2026-08-07 con Gary. La escalera de temperatura fue 94 (amargor, 7),
91 (equilibrado, 7) y 88 (astringente, 5): el 88 es un muro y el 91 es el
techo. Lo siguiente razonable es **volver al 91 y mover otra cosa** —la
molienda—. Contra la extracción de ayer eso son dos cambios y el par se
descarta; contra la del 6 de agosto es uno solo y limpio. La comparación buena
existe, pero el motor no puede verla porque solo mira hacia atrás un paso.

La exploración es un **árbol**: cada extracción es una variación *de otra*, casi
siempre la última, y a veces de una anterior a la que se vuelve tras un
callejón sin salida.

El arreglo es una columna: `desde_id` en `extracciones`, nulable, apuntando a
la extracción de la que ésta es variación.

- `pares()` deja de emparejar por vecindad y empareja **padre e hija**. Sale
  más simple de lo que es hoy, no más complicado.
- Por defecto, el padre es la última de ese café: el caso normal no cambia de
  comportamiento ni pide nada al usuario.
- La migración puede rellenar las filas viejas con «la anterior del mismo
  café», que reproduce exactamente lo que el motor hace ahora. Cambio de
  esquema sin cambio de lecturas.
- El formulario ya tiene la forma: hoy `arranque` decide de dónde salen los
  valores. Pasaría a ser «de qué extracción partes», con la última puesta por
  defecto y un selector para volver a otra — el mismo patrón que «Partir de
  otra bolsa», que ya existe en el alta de bolsas.
- `variable_cambiada` se vuelve derivable del todo: hoy se compone contra «la
  anterior» y por eso hay que explicar a mano los casos raros.
- Las sueltas tienen el padre siempre a nulo, que es lo que ya se decidió: sin
  bolsa no hay serie.

### Decidido

**Son dos cadenas distintas y no hay que confundirlas.** El padre (`desde_id`)
dice contra qué se compara: **nunca sale de la bolsa**, porque el tueste es lo
que hace la taza. El arranque dice de dónde se copian los números al abrir el
formulario: **puede venir de donde sea**, porque solo rellena campos y no
afirma nada. Cuando las dos no coinciden, la extracción es una primera y no
forma par — que es exactamente lo que ya pasa hoy al estrenar bolsa.

**El arranque necesita un escalón más, y hoy falta.** La cadena es: la última
de esta bolsa → la última de la bolsa anterior de la misma familia → la última
de cualquier bolsa. Ese tercer escalón no existe: estrenar un café que no
continúa a ninguno deja el formulario en los valores de fábrica (92 °C, 28
clics), y lo razonable es partir de tu última taza sea del café que sea. El
café es otro, pero el molinillo, el hervidor y la mano son los mismos — el
mismo argumento que ya se aceptó para las sueltas, que hoy sí lo tienen y las
bolsas nuevas no.

**Retirar una madre no rompe nada, pero hay que decidir qué pasa con el par.**
Con borrado lógico la fila se queda, así que `desde_id` nunca cuelga de un
hueco. Lo que sí desaparece es la comparación: el histórico que recibe el motor
va filtrado por `borrada_en`, así que la madre retirada no está y la hija se
queda sin base. **Y debe ser así**: retirar significa «esto fue un error de
registro», y un delta medido contra un error no vale nada. La hija pasa a
contar como primera. Conviene que sea una decisión escrita y no un efecto
secundario del filtro, porque una implementación ingenua lo haría en silencio.

Dos remates que salen de ahí: al retirar, avisar si esa extracción es madre de
otras —como el 409 que ya protege a las recetas en uso, pero blando, que esto
se puede deshacer—; y restaurarla devuelve el par sola, sin nada que arreglar.

**El selector de «de qué extracción partes» enseña las activas más la que ya
esté puesta, aunque esté retirada** y marcada como tal. Si no, al abrir una
ficha cuya madre se retiró después, el desplegable no podría representar su
propio valor y lo cambiaría solo al guardar. La regla general, que vale para
todos los desplegables de la app: **un selector nunca debe poder perder el
valor que ya tiene**. El de bolsa de la ficha ya lo cumple —lista todas, no
solo las abiertas—; el del alta enseña solo abiertas, y ahí está bien porque
es una fila nueva y no hay valor previo que perder.
