import { parseAmount, todayISO, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";
import type { Parsed, ParsedExpense, QueryPeriod } from "@/lib/whatsapp/ai-parser";

// Entiende sin IA los mensajes simples, así no gastan tokens:
// - cargas ("nafta 15000", "super 12500 debito", "ayer 5 lucas en el chino con la visa",
//   "10 lucas de nafta descripcion ypf ruta 2 pague efectivo")
// - consultas ("cuánto gasté este mes", "qué gasté ayer en comida", "cómo vengo con la visa")
// Es conservador a propósito:
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

/** Las palabras tal cual (para la descripción) y normalizadas (para reconocerlas) */
function splitWords(text: string) {
  const raw = text
    .replace(/[¡!¿?]/g, " ")
    .split(/\s+/)
    // Saca comas y puntos pegados al final ("nafta," / "15000.") sin romper "15.000,50"
    .map((w) => w.replace(/[.,;:]+$/, ""))
    .filter(Boolean);
  return { raw, words: raw.map(normalize) };
}

// "mis fijos": la lista de gastos fijos
const FIXED_LIST = ["fijos", "mis fijos", "los fijos", "ver fijos", "ver mis fijos", "gastos fijos", "mis gastos fijos", "ver gastos fijos", "que fijos tengo"];

/** "borrá el último", "eliminar el último gasto", "borrame el ultimo" */
export function isDeleteLast(text: string) {
  const joined = splitWords(text).words.join(" ");
  return /^(borra|borrar|borrame|elimina|eliminar|eliminame)( el)? ultimo( gasto)?$/.test(joined);
}

/** Lo que Chop puede entender sin IA: primero una carga, después una consulta. null si ninguna. */
export function parseWithoutAI(text: string, categories: Category[], sources: Source[]): Parsed | null {
  if (isDeleteLast(text)) return { intent: "eliminar", target: { last: true, text: "", amount: 0 } };
  if (FIXED_LIST.includes(splitWords(text).words.join(" "))) return { intent: "seccion", section: "fijo", list: true };
  const expense = parseQuick(text, categories, sources);
  if (expense) return { intent: "cargar", expenses: [expense] };
  return parseQuickQuery(text, categories, sources);
}

export function parseQuick(text: string, categories: Category[], sources: Source[]): ParsedExpense | null {
  const { raw, words } = splitWords(text);
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

// ---------- Consultas ----------

// Cómo empieza una consulta. Sin una de estas, no es consulta (y decide la IA).
const QUERY_STARTS = [
  "cuanto llevo gastado",
  "cuanto gaste",
  "cuanto gastamos",
  "cuanto llevo",
  "cuanto va",
  "que gaste",
  "que gastamos",
  "mis gastos",
  "gastos",
  "como vengo",
  "como venimos",
  "como voy",
];

// Períodos, de la frase más larga a la más corta ("el mes pasado" antes que "el mes")
const PERIODS: [string, QueryPeriod][] = [
  ["el mes pasado", "mes_pasado"],
  ["mes pasado", "mes_pasado"],
  ["esta semana", "semana"],
  ["la semana", "semana"],
  ["semana", "semana"],
  ["este mes", "mes"],
  ["el mes", "mes"],
  ["mes", "mes"],
  ["en total", "todo"],
  ["total", "todo"],
  ["hoy", "hoy"],
  ["ayer", "ayer"],
];

// Relleno propio de las consultas ("cómo vengo CON EL PRESUPUESTO de salidas")
const QUERY_FILLER = new Set(["presupuesto", "gastado", "y", "a", "al", "hasta", "ahora", "va", "este", "esta"]);

/** "cuánto gasté en comida este mes" → consulta de Comida del mes. null si no es una consulta clara. */
export function parseQuickQuery(text: string, categories: Category[], sources: Source[]): Parsed | null {
  const { words } = splitWords(text);
  if (words.length === 0 || words.length > 15) return null;

  const joined = words.join(" ");
  const start = QUERY_STARTS.find((q) => joined === q || joined.startsWith(`${q} `));
  if (!start) return null;

  const dict = buildDictionary(categories, sources);
  const found = { periods: new Set<QueryPeriod>(), categories: new Set<string>(), sources: [] as Source[], methods: new Set<PaymentMethodCode>() };

  for (let i = start.split(" ").length; i < words.length; ) {
    // Período (puede ser de varias palabras)
    const period = PERIODS.find(([phrase]) => words.slice(i, i + phrase.split(" ").length).join(" ") === phrase);
    if (period) {
      found.periods.add(period[1]);
      i += period[0].split(" ").length;
      continue;
    }
    if (QUERY_FILLER.has(words[i])) {
      i++;
      continue;
    }
    const hit = lookup(dict, words, i);
    // Palabra desconocida, un monto o una moneda ("en dólares"): mejor que decida la IA
    if (!hit || !["category", "source", "method", "skip"].includes(hit.meaning.type)) return null;
    const { meaning, used } = hit;
    if (meaning.type === "category") found.categories.add(meaning.name);
    else if (meaning.type === "source") found.sources.push(meaning.source);
    else if (meaning.type === "method") found.methods.add(meaning.method);
    i += used;
  }

  // Una sola cosa de cada tipo: "comida y salidas" o "hoy y ayer" los decide la IA
  if (found.periods.size > 1 || found.categories.size > 1 || found.sources.length > 1 || found.methods.size > 1) {
    return null;
  }
  return {
    intent: "consultar",
    period: [...found.periods][0] ?? "mes",
    categoryName: [...found.categories][0] ?? null,
    sourceName: found.sources[0]?.name ?? null,
    paymentMethod: [...found.methods][0] ?? null,
  };
}
