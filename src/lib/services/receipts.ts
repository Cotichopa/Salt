import "server-only";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { db } from "@/lib/db";

// Tickets: fotos o facturas en PDF. Llegan por WhatsApp, Chop los lee (ai-parser.ts → parseReceipt)
// y el archivo queda guardado con el gasto para verlo en la web (/api/tickets/<id>).

export class ReceiptError extends Error {}

// 1568 px de lado es lo que Claude recomienda: más grande no lee mejor y cuesta más tokens.
// En JPEG calidad 80 un ticket queda en ~200 KB.
const MAX_SIDE = 1568;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ¿El archivo es de verdad un JPEG, PNG, WebP o HEIC? Se mira su contenido (los primeros bytes de cada
 * formato son fijos) porque el tipo que dice el archivo lo manda quien lo sube y puede ser mentira:
 * así un SVG con nombre .jpg nunca llega a sharp.
 */
function isAllowedImage(data: Buffer) {
  const ascii = (from: number, to: number) => data.subarray(from, to).toString("latin1");
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return true; // JPEG
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true; // PNG
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return true; // WebP
  // HEIC (fotos de iPhone): "ftyp" y una de sus marcas
  return ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(ascii(8, 12));
}

/** Achica la foto, la guarda y devuelve su id y el JPEG (para mandárselo a la IA) */
export async function saveReceipt(userId: string, image: Buffer) {
  if (!isAllowedImage(image)) throw new ReceiptError("No pude abrir la imagen");
  let jpeg: Buffer;
  try {
    jpeg = await sharp(image)
      .rotate() // respeta la orientación con que se sacó la foto
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new ReceiptError("No pude abrir la imagen");
  }
  const id = await store(userId, jpeg, "image/jpeg");
  return { id, jpeg };
}

/** Lo que lee la IA de un PDF: su texto, o la primera página como PDF si no tiene texto (escaneado) */
export type PdfForAi = { kind: "text"; text: string } | { kind: "pdf"; data: Buffer };

/**
 * Guarda una factura en PDF tal cual (completa, para verla en la web) y devuelve su id y lo que lee
 * la IA, siempre de la primera página: las facturas de ARCA repiten la misma página como ORIGINAL,
 * DUPLICADO y TRIPLICADO, y leerlas todas propondría el gasto tres veces.
 * - Con texto (lo normal en una factura electrónica): el texto, que es exacto y cuesta menos.
 * - Sin texto (un escaneo): un PDF con solo la primera página. Si además está cifrado, no se puede
 *   separar la página y se pide una foto.
 */
export async function savePdfReceipt(userId: string, pdf: Buffer) {
  const forAi = (await firstPageText(pdf)) ?? (await firstPagePdf(pdf));
  const id = await store(userId, pdf, "application/pdf");
  return { id, forAi };
}

// Menos que esto no es el texto de una factura (un escaneo puede traer algún texto suelto)
const MIN_TEXT = 40;

/**
 * El texto de la primera página, renglón por renglón (de arriba hacia abajo y de izquierda a
 * derecha), o null si casi no tiene. pdf.js abre también los PDF de ARCA, que vienen cifrados
 * "sin contraseña" (se abren libremente pero no dejan copiar). ReceiptError si no es un PDF o
 * pide contraseña para abrirlo.
 */
async function firstPageText(pdf: Buffer): Promise<PdfForAi | null> {
  let items: { str: string; x: number; y: number }[];
  try {
    const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: VerbosityLevel.ERRORS }).promise;
    const content = await (await doc.getPage(1)).getTextContent();
    items = content.items.flatMap((it) =>
      "str" in it && it.str.trim() ? [{ str: it.str.trim(), x: it.transform[4], y: Math.round(it.transform[5]) }] : [],
    );
    await doc.destroy();
  } catch {
    throw new ReceiptError("No pude abrir el PDF");
  }
  const rows = new Map<number, typeof items>();
  for (const it of items) rows.set(it.y, [...(rows.get(it.y) ?? []), it]);
  const text = [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // en un PDF la altura crece hacia arriba
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((it) => it.str).join("  "))
    .join("\n");
  return text.length >= MIN_TEXT ? { kind: "text", text: text.slice(0, 6000) } : null;
}

/** Un PDF con solo la primera página (para un escaneo) */
async function firstPagePdf(pdf: Buffer): Promise<PdfForAi> {
  try {
    const doc = await PDFDocument.load(pdf);
    const single = await PDFDocument.create();
    const [page] = await single.copyPages(doc, [0]);
    single.addPage(page);
    return { kind: "pdf", data: Buffer.from(await single.save()) };
  } catch {
    // Un escaneo cifrado: pdf-lib no lo puede copiar
    throw new ReceiptError("No pude leer el PDF");
  }
}

/** Guarda el archivo. Aprovecha para borrar los de más de un día con los que no se guardó ningún gasto (cancelado). */
async function store(userId: string, data: Buffer, mimeType: string) {
  await db.receipt.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - DAY_MS) }, expenses: { none: {} } } });
  const receipt = await db.receipt.create({ data: { userId, data: new Uint8Array(data), mimeType }, select: { id: true } });
  return receipt.id;
}

/** La foto, solo si es de la persona (para mostrarla en la web) */
export async function getReceipt(userId: string, id: string) {
  return db.receipt.findFirst({ where: { id, userId }, select: { data: true, mimeType: true } });
}
