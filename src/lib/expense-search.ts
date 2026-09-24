import { currencyLabels, parseAmount, paymentMethodLabels } from "@/lib/format";
import { normalize } from "@/lib/text";

// Buscador de gastos. Se usa en el servidor (pantalla de Gastos) y en el navegador
// (lista de cada categoría), así los dos buscan igual. Cada palabra que escribís tiene
// que coincidir con algo del gasto (si escribís "super visa", tienen que estar las dos):
//   · texto → descripción, categoría, medio de pago, tarjeta o moneda. Sin importar tildes
//     y aceptando un error de tipeo ("carefour" encuentra "Carrefour")
//   · monto → "15000", "15.000" o "$15.000,50" encuentra ese monto exacto
//   · fecha → "24/09" o "24/09/2025" (ese día), "septiembre" o "septiembre 2025" (ese mes)

type Searchable = {
  amount: number;
  currency: keyof typeof currencyLabels;
  paymentMethod: keyof typeof paymentMethodLabels;
  description: string | null;
  date: string; // "YYYY-MM-DD"
  category: { name: string };
  paymentSource: { name: string } | null;
};

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const monthNumber = (word: string) => {
  const i = MONTHS.indexOf(word === "setiembre" ? "septiembre" : word);
  return i === -1 ? null : String(i + 1).padStart(2, "0");
};

/** Cuántas letras hay que cambiar para pasar de una palabra a otra (distancia de Levenshtein) */
function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3; // ya sabemos que es lejos
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * ¿La palabra buscada aparece en alguna de las palabras del gasto?
 * Vale si está contenida ("carre" → "carrefour") o si es la palabra entera con algún error
 * de tipeo: 1 letra de diferencia desde 4 letras, 2 desde 7 ("carefour" → "carrefour").
 */
function textMatches(term: string, words: string[]) {
  const tolerance = term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0;
  return words.some((w) => w.includes(term) || (tolerance > 0 && editDistance(term, w) <= tolerance));
}

type Condition = (e: Searchable, words: string[]) => boolean;

/** Convierte lo que escribió la persona en una lista de condiciones (todas se tienen que cumplir) */
export function parseSearch(query: string): Condition[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const conditions: Condition[] = [];

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];

    // Fecha: "24/09" o "24/09/2025"
    const date = term.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
    if (date) {
      const [, d, m, y] = date;
      const suffix = `-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      const year = y ? (y.length === 2 ? `20${y}` : y) : null;
      conditions.push((e) => e.date.endsWith(suffix) && (!year || e.date.startsWith(year)));
      continue;
    }

    // Mes: "septiembre", con año opcional a continuación ("septiembre 2025")
    const month = monthNumber(term);
    if (month) {
      const next = terms[i + 1];
      const year = next && /^20\d{2}$/.test(next) ? next : null;
      if (year) i++; // el año ya lo usamos
      conditions.push((e) => e.date.slice(5, 7) === month && (!year || e.date.startsWith(year)));
      continue;
    }

    // Monto: cualquier número ("15000", "15.000", "$15.000,50")
    const amount = /\d/.test(term) ? parseAmount(term) : null;
    if (amount !== null) {
      conditions.push((e) => Math.abs(e.amount - amount) < 0.005);
      continue;
    }

    conditions.push((_, words) => textMatches(term, words));
  }
  return conditions;
}

/** Las palabras de un gasto contra las que se busca texto */
function wordsOf(e: Searchable) {
  const text = [
    e.description,
    e.category.name,
    paymentMethodLabels[e.paymentMethod],
    e.paymentSource?.name,
    currencyLabels[e.currency],
    e.currency,
  ]
    .filter(Boolean)
    .join(" ");
  return normalize(text).split(/[^a-z0-9ñ]+/).filter(Boolean);
}

/** Filtra una lista de gastos con lo que escribió la persona */
export function searchExpenses<T extends Searchable>(expenses: T[], query: string): T[] {
  const conditions = parseSearch(query);
  if (conditions.length === 0) return expenses;
  return expenses.filter((e) => {
    const words = wordsOf(e);
    return conditions.every((match) => match(e, words));
  });
}
