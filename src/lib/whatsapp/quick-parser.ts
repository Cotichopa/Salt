import { parseAmount, todayISO, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";
import type { ParsedExpense } from "@/lib/whatsapp/ai-parser";

// Entiende sin IA los mensajes simples de carga ("nafta 15000", "super 12500 debito",
// "ayer 5 lucas en el chino con la visa", "10 lucas de nafta descripcion ypf ruta 2 pague efectivo"),
// así no gastan tokens. Es conservador a propósito:
// si queda CUALQUIER palabra que no reconoce ("borrá", "pizza con amigos", "6 cuotas"),
// devuelve null y el mensaje sigue a la IA como siempre.

type Category = { name: string; keywords: string[] };
type Source = { name: string; kind: "CARD" | "WALLET" };

type Meaning =
  | { type: "category"; name: string }
  | { type: "source"; source: Source }
  | { type: "method"; method: PaymentMethodCode }
  | { type: "currency"; currency: CurrencyCode }
  | { type: "date"; daysAgo: number }
  | { type: "skip" }
  | { type: "ambiguous" }; // la misma palabra significa dos cosas: mejor que decida la IA

// Palabras de relleno que no cambian el sentido ("gasté 5000 EN el super CON la visa")
const FILLER = ["en", "de", "del", "el", "la", "los", "las", "con", "por", "un", "una", "mi", "gaste", "pague", "fue"];

const METHODS: Record<string, PaymentMethodCode> = {
  efectivo: "CASH",
  debito: "DEBIT",
  "tarjeta de debito": "DEBIT",
  credito: "CREDIT",
  "tarjeta de credito": "CREDIT",
  transferencia: "TRANSFER",
};

const CURRENCIES: Record<string, CurrencyCode> = {
  pesos: "ARS",
  ars: "ARS",
  dolares: "USD",
  dolar: "USD",
  usd: "USD",
  "u$s": "USD",
  "us$": "USD",
};

const DATES: Record<string, number> = { hoy: 0, ayer: 1 };

const THOUSANDS = new Set(["luca", "lucas", "mil"]);

// "descripcion ..." toma las palabras que siguen, hasta una palabra de pago clara ("pague",
// un medio o una tarjeta) o el final. No corta en "con", para no romper "cena con amigos".
const DESCRIPTION = new Set(["descripcion", "desc", "detalle"]);
const PAID = "pague";

/** Diccionario frase → significado, armado con las categorías y tarjetas de la persona */
function buildDictionary(categories: Category[], sources: Source[]) {
  const dict = new Map<string, Meaning>();
  const add = (phrase: string, meaning: Meaning) => {
    const key = normalize(phrase);
    if (!key) return;
    const prev = dict.get(key);
    // Si ya significaba otra cosa (ej: una categoría que se llama igual que una tarjeta), es ambigua
    dict.set(key, prev && JSON.stringify(prev) !== JSON.stringify(meaning) ? { type: "ambiguous" } : meaning);
  };
  for (const w of FILLER) add(w, { type: "skip" });
  for (const [w, method] of Object.entries(METHODS)) add(w, { type: "method", method });
  for (const [w, currency] of Object.entries(CURRENCIES)) add(w, { type: "currency", currency });
  for (const [w, daysAgo] of Object.entries(DATES)) add(w, { type: "date", daysAgo });
  for (const c of categories) {
    add(c.name, { type: "category", name: c.name });
    for (const k of c.keywords) add(k, { type: "category", name: c.name });
  }
  for (const s of sources) add(s.name, { type: "source", source: s });
  return dict;
}

/** Monto escrito en una o dos palabras: "15000", "15.000,50", "$15000", "15k", "5 lucas", "20 mil" */
function readAmount(words: string[], i: number): { amount: number; used: number } | null {
  const word = words[i].replace(/^\$/, "");
  const k = /^(\d+(?:[.,]\d+)?)k$/.exec(word);
  if (k) {
    const n = parseAmount(k[1]);
    return n ? { amount: n * 1000, used: 1 } : null;
  }
  const n = parseAmount(word);
  if (n === null) return null;
  if (words[i + 1] && THOUSANDS.has(words[i + 1])) return { amount: n * 1000, used: 2 };
  return { amount: n, used: 1 };
}

function daysAgoISO(days: number) {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** La frase conocida más larga que empieza en words[i] (hasta 3 palabras: "tarjeta de credito", "naranja x") */
function lookup(dict: Map<string, Meaning>, words: string[], i: number) {
  for (let len = Math.min(3, words.length - i); len >= 1; len--) {
    const meaning = dict.get(words.slice(i, i + len).join(" "));
    if (meaning) return { meaning, used: len };
  }
  return null;
}

export function parseQuick(text: string, categories: Category[], sources: Source[]): ParsedExpense | null {
  // Las palabras tal cual (para la descripción) y normalizadas (para reconocerlas)
  const raw = text
    .replace(/[¡!¿?]/g, " ")
    .split(/\s+/)
    // Saca comas y puntos pegados al final ("nafta," / "15000.") sin romper "15.000,50"
    .map((w) => w.replace(/[.,;:]+$/, ""))
    .filter(Boolean);
  const words = raw.map(normalize);
  if (words.length === 0 || words.length > 20) return null;

  const dict = buildDictionary(categories, sources);
  let description: string | null = null;
  const found = {
    amounts: [] as number[],
    categories: new Set<string>(),
    sources: [] as Source[],
    methods: new Set<PaymentMethodCode>(),
    currencies: new Set<CurrencyCode>(),
    dates: new Set<number>(),
  };

  for (let i = 0; i < words.length; ) {
    const amount = readAmount(words, i);
    if (amount) {
      found.amounts.push(amount.amount);
      i += amount.used;
      continue;
    }
    if (DESCRIPTION.has(words[i])) {
      if (description !== null) return null; // dos descripciones: mejor que decida la IA
      let end = i + 1;
      while (end < words.length && words[end] !== PAID && !DESCRIPTION.has(words[end])) {
        const m = lookup(dict, words, end)?.meaning;
        if (m?.type === "method" || m?.type === "source") break;
        end++;
      }
      // Sin el relleno del final ("descripcion ypf con efectivo" → "ypf")
      let last = end;
      while (last > i + 1 && dict.get(words[last - 1])?.type === "skip") last--;
      description = raw.slice(i + 1, last).join(" ").slice(0, 200);
      if (!description) return null;
      i = end;
      continue;
    }
    const hit = lookup(dict, words, i);
    if (!hit || hit.meaning.type === "ambiguous") return null; // palabra desconocida: que decida la IA
    const { meaning, used } = hit;
    if (meaning.type === "category") found.categories.add(meaning.name);
    else if (meaning.type === "source") found.sources.push(meaning.source);
    else if (meaning.type === "method") found.methods.add(meaning.method);
    else if (meaning.type === "currency") found.currencies.add(meaning.currency);
    else if (meaning.type === "date") found.dates.add(meaning.daysAgo);
    i += used;
  }

  // Tiene que ser UN gasto claro: un monto, una categoría y nada contradictorio
  if (found.amounts.length !== 1 || found.categories.size !== 1) return null;
  if (found.sources.length > 1 || found.methods.size > 1 || found.currencies.size > 1 || found.dates.size > 1) {
    return null;
  }
  const amount = found.amounts[0];
  if (amount <= 0 || amount >= 1e12) return null;

  // Medio de pago: el que dijo, o el que se deduce de la tarjeta/billetera
  const source = found.sources[0];
  let method: PaymentMethodCode | null = [...found.methods][0] ?? null;
  if (source?.kind === "WALLET") {
    if (method && method !== "TRANSFER") return null;
    method = "TRANSFER";
  } else if (source?.kind === "CARD") {
    if (method && method !== "DEBIT" && method !== "CREDIT") return null;
    method ??= "DEBIT";
  }

  return {
    amount,
    currency: [...found.currencies][0] ?? "ARS",
    categoryName: [...found.categories][0],
    paymentMethod: method,
    sourceName: source?.name ?? null,
    installments: 1,
    date: daysAgoISO([...found.dates][0] ?? 0),
    description,
  };
}
