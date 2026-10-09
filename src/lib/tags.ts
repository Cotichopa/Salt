import { normalize } from "@/lib/text";

// Etiquetas: se escriben como hashtags ("#bariloche", "#cumpleJuli"): una palabra con letras, números,
// "_" o "-", de hasta 30. Lo de acá no toca la base: lo usan el formulario (en el navegador), el
// buscador, Chop y el servicio (src/lib/services/tags.ts).

const TAG = /^[\p{L}\p{N}_-]{1,30}$/u;
// Un hashtag dentro de un texto: "#" pegado a la palabra ("café 3000 #bariloche")
const HASHTAG = /(^|\s)#([\p{L}\p{N}_-]+)/gu;

/** "#Bariloche" o "bariloche" → { name: "Bariloche", key: "bariloche" }; null si no es una etiqueta válida */
export function parseTag(raw: string) {
  const name = raw.trim().replace(/^#+/, "");
  if (!TAG.test(name)) return null;
  return { name, key: tagKey(name) };
}

/** Para comparar etiquetas: sin tildes y en minúsculas ("Bariloche" = "bariloche" = "BARILÓCHE") */
export function tagKey(name: string) {
  return normalize(name.replace(/^#+/, ""));
}

/** Las etiquetas de un texto, sin repetir: "café 3000 #bariloche #Bariloche #viaje" → ["bariloche", "viaje"] */
export function hashtags(text: string) {
  const seen = new Map<string, string>();
  for (const m of text.matchAll(HASHTAG)) {
    const tag = parseTag(m[2]);
    if (tag && !seen.has(tag.key)) seen.set(tag.key, tag.name);
  }
  return [...seen.values()];
}

/** El texto sin sus hashtags: "café 3000 #bariloche" → "café 3000" */
export function withoutHashtags(text: string) {
  return text.replace(HASHTAG, "$1").replace(/\s+/g, " ").trim();
}

/**
 * Lo que se escribió en el campo de etiquetas del formulario ("#bariloche viaje, cumple") → los nombres
 * válidos, sin repetir. Separadas por espacios o comas, con o sin "#".
 */
export function parseTagList(text: string) {
  const seen = new Map<string, string>();
  for (const part of text.split(/[\s,]+/)) {
    const tag = parseTag(part);
    if (tag && !seen.has(tag.key)) seen.set(tag.key, tag.name);
  }
  return [...seen.values()];
}
