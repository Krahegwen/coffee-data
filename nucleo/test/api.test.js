/**
 * La API entera contra el almacén en memoria. La suite vive en contrato.js:
 * es la misma que ejecuta la app contra IndexedDB, porque el contrato es que
 * los dos caminos se comporten igual.
 */
import { almacenEnMemoria } from "../src/almacen-memoria.js";
import { contratoDelAlmacen } from "./contrato.js";

contratoDelAlmacen("la API sobre el almacén en memoria", () => almacenEnMemoria());
