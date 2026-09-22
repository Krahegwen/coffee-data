/**
 * Cuánto café queda en la bolsa.
 *
 * Es una cuenta de dos sumandos y ninguno de los dos es exacto por sí solo: el
 * peso de la bolsa dice lo que traía, las dosis registradas dicen lo que se ha
 * ido **por aquí**, y entre las dos se cuela todo lo que no pasó por la app.
 * Con una bolsa estrenada dentro de la bitácora el hueco es pequeño; con una
 * anterior a ella es la mitad de la bolsa.
 *
 * Por eso hay un segundo punto de partida: el pesaje. `restante_g` es lo que
 * marcó la báscula y `restante_en` cuándo, y a partir de ahí solo se descuenta
 * lo registrado después. Un pesaje no corrige el pasado —no dice cuántas tazas
 * faltaban ni cuándo se tomaron—, lo deja atrás, que es lo que de verdad se
 * puede saber.
 *
 * Vive en el núcleo y no en la pantalla que lo enseña porque el número tiene
 * que salir igual en la lista de bolsas, en la ficha y en cualquier sitio que
 * venga después. Es lógica de la bitácora, no de una vista.
 */

/** Número o null: vacío es nada, como en el resto del núcleo. */
function num(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Los gramos que quedan, redondeados, o `null` si no hay de dónde restar
 * —una bolsa sin peso ni pesaje no tiene contador, y cero no es lo mismo que
 * no saberlo—.
 *
 * `extracciones` son todas; aquí se filtran las de esta bolsa. Las retiradas
 * no cuentan: se retiran porque no ocurrieron como se apuntó.
 *
 * El corte compara sellos como texto, que en `AAAA-MM-DD HH:MM:SS` ordena
 * igual que en el tiempo. Una fila sin sello se queda fuera del descuento: no
 * se sabe si estaba ya en la báscula, y el error prudente es el que no resta
 * dos veces la misma taza.
 */
export function restanteDe(cafe, extracciones = []) {
  if (!cafe) return null;

  const pesaje = num(cafe.restante_g);
  const peso = num(cafe.peso_g);
  const base = pesaje ?? (peso && peso > 0 ? peso : null);
  if (base === null) return null;

  const corte = pesaje === null ? null : String(cafe.restante_en ?? "");

  const usado = extracciones
    .filter((e) => e.cafe_id === cafe.id && !e.borrada_en)
    .filter((e) => corte === null || String(e.creado_en ?? "") > corte)
    .reduce((total, e) => total + (num(e.dosis_g) ?? 0), 0);

  return Math.max(0, Math.round(base - usado));
}
