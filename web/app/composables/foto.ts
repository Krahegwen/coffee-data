/**
 * Encoge la foto en el navegador, antes de subirla.
 *
 * El móvil dispara a 12 MP y en la ficha la foto se ve a unos 400 px de
 * ancho: subir el original son megas por bolsa que el teléfono se vuelve a
 * bajar enteros cada vez que abres la lista, para pintar 64 píxeles.
 *
 * Se sube el más pequeño de los dos ficheros, así una foto que ya venía
 * ligera no se recomprime para nada.
 */

/** Lado más largo, en píxeles. Da de sobra para verla a pantalla completa. */
export const LADO_MAX = 1600

const CALIDAD = 0.85

function aBlob(lienzo: HTMLCanvasElement, tipo: string): Promise<Blob | null> {
  return new Promise((listo) => lienzo.toBlob(listo, tipo, CALIDAD))
}

export async function encogerFoto(fichero: File): Promise<File> {
  if (!fichero.type.startsWith('image/')) return fichero

  let imagen: ImageBitmap
  try {
    // `from-image` o las fotos verticales del móvil suben tumbadas: la
    // orientación vive en el EXIF y el lienzo la perdería.
    imagen = await createImageBitmap(fichero, { imageOrientation: 'from-image' })
  } catch {
    return fichero // un formato que este navegador no sabe decodificar
  }

  const escala = Math.min(1, LADO_MAX / Math.max(imagen.width, imagen.height))
  const ancho = Math.round(imagen.width * escala)
  const alto = Math.round(imagen.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const pincel = lienzo.getContext('2d')
  if (!pincel) return fichero
  pincel.drawImage(imagen, 0, 0, ancho, alto)
  imagen.close()

  let blob = await aBlob(lienzo, 'image/webp')
  // Un navegador sin webp devuelve PNG sin avisar, y un PNG de una foto pesa
  // más que el original. Con jpeg no pasa, y el servidor acepta los dos.
  if (!blob || blob.type !== 'image/webp') blob = await aBlob(lienzo, 'image/jpeg')
  if (!blob) return fichero

  // Si ya cabía y pesaba menos, se sube tal cual: recomprimir solo perdería
  // calidad a cambio de nada.
  if (escala === 1 && fichero.size <= blob.size) return fichero

  const nombre = fichero.name.replace(/\.[^.]+$/, '')
  const extension = blob.type === 'image/webp' ? '.webp' : '.jpg'
  return new File([blob], nombre + extension, { type: blob.type })
}

/** «4,2 MB», «380 kB». Para decirle al usuario cuánto se ahorró. */
export function pesoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
