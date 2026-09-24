/**
 * Los accesorios: el dripper y el molinillo con los que se hace cada taza.
 *
 * Hasta la migración 0014 eran dos columnas de texto en cada extracción: el
 * dripper, una lista cerrada de dos claves con su CHECK, y el molinillo, texto
 * libre que casi nadie tecleaba. Comprar un Origami pedía tocar el esquema, y
 * el motor sabía qué dripper tiene masa térmica porque lo decía una constante.
 * Ahora son filas de un catálogo propio —uuid de clave, slug de etiqueta,
 * como las bolsas y las recetas— y la masa térmica es un dato del dripper.
 *
 * Las extracciones siguen teniendo sus columnas `dripper` y `molinillo`, y
 * ahora guardan la id del accesorio. Los nombres no cambian a propósito: la
 * cola de salida de un móvil con la app vieja, un curl de siempre y un
 * respaldo de antes mandan `"dripper": "v60-02-plastico"`, y eso tiene que
 * seguir entrando. Por eso se resuelven por uuid, por slug **o por nombre**.
 */
import { esUuid } from "./ids.js";

/** Los tipos que guarda una extracción. Uno por columna. */
export const TIPOS_ACCESORIO = ["dripper", "molinillo"];

/** Solo lo que un humano puede teclear distinto de como se guardó. */
const plano = (texto) => String(texto ?? "").trim().toLowerCase();

/**
 * El accesorio al que se refiere `ref`, del tipo pedido, o null.
 *
 * Primero la id y el slug, que son únicos. Si no, el nombre sin distinguir
 * mayúsculas, y solo si hay **uno**: dos molinillos que se llamen igual no se
 * resuelven a ciegas. El nombre existe por lo que guardaban las filas viejas
 * —`"Comandante C40"`, tal cual—, que es también como se lo dice uno a curl.
 *
 * Un accesorio que ya no está en uso sigue resolviéndose: corregir una taza
 * de hace un año no puede exigir que aquel molinillo siga en casa.
 */
export function resolverAccesorio(accesorios, ref, tipo) {
  const buscado = String(ref ?? "").trim();
  if (!buscado) return null;
  const suyos = accesorios.filter((a) => a.tipo === tipo);
  // Id y slug son minúsculas por construcción: `V60-02-CERAMICA` es la misma.
  const minusculas = buscado.toLowerCase();
  const exacto = suyos.find((a) => a.id === minusculas || a.slug === minusculas);
  if (exacto) return exacto;
  const porNombre = suyos.filter((a) => plano(a.nombre) === plano(buscado));
  return porNombre.length === 1 ? porNombre[0] : null;
}

/** El orden oficial, el mismo de las extracciones: creado_en y la id detrás. */
const cronologico = (a, b) => {
  if (a.creado_en !== b.creado_en) return a.creado_en < b.creado_en ? -1 : 1;
  return a.id < b.id ? -1 : 1;
};

/**
 * El que se pone cuando nadie dice cuál y no hay madre de la que heredarlo:
 * la primera de una bolsa por curl, o una suelta.
 *
 * El último que usaste, si sigue en uso: el café es otro, pero el molinillo y
 * el dripper de casa son los mismos — el argumento con el que el formulario
 * arranca de tu última taza. Si no hay taza que lo diga, el primero que diste
 * de alta. Y si el catálogo no tiene ninguno de ese tipo, ninguno: la columna
 * admite el hueco, y es mejor que inventarse un aparato.
 */
export function accesorioPorDefecto(tipo, accesorios, extracciones = []) {
  const enUso = accesorios.filter((a) => a.tipo === tipo && a.en_uso);
  if (!enUso.length) return null;
  const vivas = extracciones.filter((e) => !e.borrada_en && e[tipo]).sort(cronologico);
  for (let i = vivas.length - 1; i >= 0; i -= 1) {
    const usado = enUso.find((a) => a.id === vivas[i][tipo]);
    if (usado) return usado;
  }
  return [...enUso].sort(cronologico)[0];
}

/**
 * Lo que guardaban las filas antes del catálogo, y en qué se convierte.
 *
 * Los dos drippers eran la lista cerrada del CHECK, y conservan esas claves
 * como slug: así la cola vieja y los respaldos de antes resuelven sin tocar
 * nada. El molinillo era texto libre y se convierte en un accesorio con ese
 * nombre; su slug sale del nombre, como el de cualquier alta.
 */
export const LEGADO = {
  "v60-02-plastico": { tipo: "dripper", nombre: "V60 02 plástico", masa_termica: false },
  "v60-02-ceramica": { tipo: "dripper", nombre: "V60 02 cerámica", masa_termica: true },
};

/**
 * Qué accesorios hay que crear para que unas filas viejas resuelvan, sin
 * repetir ninguno: `[{ cuerpo, slug }]`, donde `slug` es el que hay que
 * respetar —las claves de los drippers— o null si vale el derivado.
 *
 * El cuerpo lleva de `creado_en` el de la primera fila que lo usó, que es lo
 * que hace la 0014: desde cuándo está en casa, o lo más cerca que se sabe.
 *
 * Lo usan los dos sitios donde lo viejo llega sin catálogo: el cajón del modo
 * local al estrenar esta versión, y un respaldo de antes al restaurarlo. La
 * base de verdad lo hace en SQL, en la migración 0014, con la misma tabla.
 */
export function accesoriosDelLegado(filas, accesorios = []) {
  const porClave = new Map();
  for (const tipo of TIPOS_ACCESORIO) {
    for (const fila of filas) {
      const valor = String(fila?.[tipo] ?? "").trim();
      // Un uuid ya es de la era del catálogo: si no resuelve, falta la fila
      // y no hay nombre con el que rehacerla. Un accesorio llamado como una
      // id sería basura; mejor que lo cante quien resuelva.
      if (!valor || esUuid(valor.toLowerCase())) continue;
      if (resolverAccesorio(accesorios, valor, tipo)) continue;

      const clave = `${tipo}|${plano(valor)}`;
      const sello = fila.creado_en || null;
      const visto = porClave.get(clave);
      if (visto) {
        if (sello && (!visto.cuerpo.creado_en || sello < visto.cuerpo.creado_en)) {
          visto.cuerpo.creado_en = sello;
        }
        continue;
      }

      const conocido = LEGADO[valor];
      const nuevo = conocido && conocido.tipo === tipo
        ? { cuerpo: { ...conocido }, slug: valor }
        : { cuerpo: { tipo, nombre: valor, masa_termica: false }, slug: null };
      if (sello) nuevo.cuerpo.creado_en = sello;
      porClave.set(clave, nuevo);
    }
  }
  return [...porClave.values()];
}
