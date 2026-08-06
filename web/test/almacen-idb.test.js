/**
 * El adaptador de IndexedDB contra el mismo contrato que memoria y D1.
 *
 * fake-indexeddb es una devDependency solo de estos tests: IndexedDB no
 * existe en Node, y probar el adaptador en un navegador de verdad cada vez
 * sería no probarlo nunca. Cada test estrena fábrica y base: el aislamiento
 * lo da el constructor, no un borrado que se pueda olvidar.
 */
import { IDBFactory } from "fake-indexeddb";

import { contratoDelAlmacen } from "../../nucleo/test/contrato.js";
import { almacenIDB } from "../app/almacen/idb.js";

contratoDelAlmacen("la API sobre IndexedDB", () => almacenIDB(new IDBFactory(), "coffee-test"));
