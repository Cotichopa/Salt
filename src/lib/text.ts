/** Pasa a minúsculas y saca tildes: "Cafetería" → "cafeteria". Sirve para comparar palabras. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** "Ypf, SHELL,  gnc ,ypf" → ["ypf", "shell", "gnc"] */
export function parseKeywords(input: string) {
  const words = input
    .split(/[,\n]/)
    .map(normalize)
    .filter(Boolean);
  return [...new Set(words)];
}
