// Achicar fotos en el navegador antes de subirlas (chat de Chop y formulario de gasto)

const PHOTO_SIDE = 1568; // lado más largo de la foto que se manda: más grande la IA no lee mejor

/**
 * Achica la foto en el navegador (JPEG, 1568 px de lado como máximo) para que suba rápido aunque
 * sea con datos: una foto del celular pesa 3 a 8 MB y así queda en ~300 KB. Si el navegador no la
 * puede abrir (por ejemplo HEIC en Chrome), va como está y el servidor ve si la puede leer.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}
