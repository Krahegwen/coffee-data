import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { esUuid, uuidv7 } from "../src/ids.js";

describe("uuidv7", () => {
  it("tiene el formato canónico, con la versión y la variante puestas", () => {
    const id = uuidv7();
    assert.ok(esUuid(id), id);
    assert.equal(id[14], "7");
    assert.ok(["8", "9", "a", "b"].includes(id[19]), id);
  });

  it("ordenar por texto es ordenar por tiempo", () => {
    const antes = uuidv7(1_000_000_000_000);
    const despues = uuidv7(1_000_000_000_001);
    assert.ok(antes < despues);
  });

  it("dos del mismo milisegundo no chocan y quedan en orden", () => {
    const a = uuidv7(1_000_000_000_000);
    const b = uuidv7(1_000_000_000_000);
    assert.notEqual(a, b);
    assert.equal(a.slice(0, 13), b.slice(0, 13));
    // La secuencia hace de desempate: quien nació después ordena después.
    assert.ok(a < b);
  });

  it("esUuid distingue las nuestras de un slug o un número", () => {
    assert.equal(esUuid(uuidv7()), true);
    assert.equal(esUuid("gary_2"), false);
    assert.equal(esUuid("7"), false);
    assert.equal(esUuid(null), false);
    // Las v4 de randomUUID también pasan: son uuids y no molestan.
    assert.equal(esUuid(crypto.randomUUID()), true);
  });
});
