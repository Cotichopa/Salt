// Banco de pruebas de Chop: le pasa una lista fija de mensajes y mide, para cada uno,
// si se resolvió sin IA, qué acción entendió (contra la esperada) y cuántos tokens gastó.
// Sirve para comparar antes y después de cada cambio. Se corre con:
//   npm run chop:bench -- <etiqueta>      (ej: npm run chop:bench -- etapa0)
// Cada corrida se guarda en scripts/.bench/ (fuera de git) y se compara con la anterior.
// OJO: llama a la API de Anthropic de verdad (cuesta centavos por corrida).
import "dotenv/config";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { listCategories } from "../src/lib/services/categories";
import { listPaymentSources } from "../src/lib/services/payment-sources";
import { isAiEnabled, parseMessage, type Parsed, type ParsedExpense } from "../src/lib/whatsapp/ai-parser";
import { parseWithoutAI } from "../src/lib/whatsapp/quick-parser";

// Acciones esperadas. Las de secciones nuevas (tarjeta, medio, fijo, presupuesto, categoria)
// Chop todavía no las sabe hacer: sirven para ver cómo mejora en las próximas etapas.
type Expected = Parsed["intent"] | "tarjeta" | "medio" | "fijo" | "presupuesto" | "categoria";

// El tercer dato (opcional) son gastos ya propuestos que el mensaje corrige ("con efectivo")
const NAFTA: ParsedExpense = {
  amount: 15000,
  currency: "ARS",
  categoryName: "Nafta",
  paymentMethod: null,
  sourceName: null,
  installments: 1,
  date: "2026-09-28",
  description: null,
};

const CASES: [string, Expected, ParsedExpense[]?][] = [
  // Cargar
  ["nafta 15000", "cargar"],
  ["super 12500 debito", "cargar"],
  ["ayer 5 lucas en el chino con la visa", "cargar"],
  ["zapatillas 120000 en 6 cuotas con la visa", "cargar"],
  ["pizza con amigos 18 lucas pague efectivo", "cargar"],
  ["gasté 25 dólares en spotify con la mastercard", "cargar"],
  ["café 3500 y medialunas 4200", "cargar"],
  ["el lunes le pagué 40 mil al plomero por transferencia", "cargar"],
  ["chop cargame 8 lucas de farmacia", "cargar"],
  ["uber 6.500,50 mercado pago", "cargar"],
  ["con efectivo y fue ayer", "cargar", [NAFTA]],
  // Consultar
  ["cuánto gasté este mes", "consultar"],
  ["cuánto gasté en comida este mes", "consultar"],
  ["qué gasté ayer", "consultar"],
  ["cuánto llevo en la visa", "consultar"],
  ["cómo vengo con el presupuesto de salidas", "consultar"],
  ["gastos del mes pasado", "consultar"],
  // Borrar y editar
  ["borrá el último", "eliminar"],
  ["eliminá el gasto de la nafta", "eliminar"],
  ["el último eran 20000", "editar"],
  ["pasá la pizza a efectivo", "editar"],
  // Secciones nuevas
  ["cuánto me viene en la visa", "tarjeta"],
  ["marcá como pagado el resumen de la visa", "tarjeta"],
  ["la visa cierra el 25 y vence el 7", "medio"],
  ["agregá la tarjeta galicia", "medio"],
  ["netflix aumentó a 12000", "fijo"],
  ["agregá un gasto fijo de alquiler 350 mil el día 5", "fijo"],
  ["pausá el fijo del gimnasio", "fijo"],
  ["poneme 200 mil de presupuesto en comida", "presupuesto"],
  ["sacá el presupuesto de salidas", "presupuesto"],
  ["creá la categoría mascotas", "categoria"],
  ["borrá la categoría ropa", "categoria"],
  // Otros
  ["gracias!", "otro"],
  ["qué onda", "otro"],
];

type Row = {
  text: string;
  expected: Expected;
  got: string;
  ok: boolean;
  detail: string;
  noAi: boolean;
  inTok: number;
  outTok: number;
  usd: number;
};

const DIR = "scripts/.bench";

async function main() {
  const label = process.argv[2] ?? "sin-etiqueta";
  if (!isAiEnabled()) throw new Error("La IA está apagada: revisá AI_PARSER_ENABLED y ANTHROPIC_API_KEY en el .env");

  // Las listas de una cuenta real (la del admin, o la que diga BENCH_EMAIL)
  const email = process.env.BENCH_EMAIL ?? process.env.ADMIN_EMAIL;
  const user = await db.user.findFirstOrThrow({ where: { email } });
  const [cats, sources] = await Promise.all([listCategories(user.id), listPaymentSources(user.id)]);
  const lists = { categories: cats.map((c) => c.name), sources: sources.map((s) => s.name) };

  // parseMessage anota el uso en la terminal ("[ai-parser] 812+95 tokens · ..."): lo atajamos
  let usage = { inTok: 0, outTok: 0 };
  const log = console.log;
  console.log = (...args: unknown[]) => {
    const m = typeof args[0] === "string" && args[0].match(/^\[ai-parser\] (\d+)\+(\d+) tokens/);
    if (m) usage = { inTok: Number(m[1]), outTok: Number(m[2]) };
    else log(...args);
  };

  const rows: Row[] = [];
  for (const [text, expected, proposed] of CASES) {
    usage = { inTok: 0, outTok: 0 };
    // Igual que bot.ts: primero sin IA, y si no alcanza, con IA (las correcciones van directo a la IA)
    const quick = proposed ? null : parseWithoutAI(text, cats, sources);
    const parsed: Parsed | null = quick ?? (await parseMessage(text, lists, proposed));
    const detail = describe(parsed);
    const got = parsed?.intent ?? "error";
    const usd = (usage.inTok * 1 + usage.outTok * 5) / 1e6; // Haiku 4.5: US$1 / US$5 por millón
    rows.push({ text, expected, got, ok: got === expected, detail, noAi: !!quick, ...usage, usd });
    log(
      `${got === expected ? "✅" : "❌"} ${quick ? "sin IA " : "con IA "} ${String(usage.inTok).padStart(5)}+${String(usage.outTok).padEnd(4)} ` +
        `${got.padEnd(10)} ${expected !== got ? `(esperaba ${expected}) ` : ""}"${text}"`,
    );
    if (detail) log(`                         → ${detail}`);
  }
  console.log = log;

  const summary = summarize(rows);
  console.log(`\n=== ${label} ===`);
  printSummary(summary);

  // Comparación con la corrida anterior
  mkdirSync(DIR, { recursive: true });
  const previous = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort().at(-1);
  if (previous) {
    const prev = JSON.parse(readFileSync(`${DIR}/${previous}`, "utf8"));
    console.log(`\n--- comparado con ${previous} ---`);
    const pct = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%` : "-");
    console.log(`tokens entrada por llamada: ${summary.avgIn.toFixed(0)} (${pct(summary.avgIn, prev.summary.avgIn)})`);
    console.log(`tokens salida por llamada:  ${summary.avgOut.toFixed(0)} (${pct(summary.avgOut, prev.summary.avgOut)})`);
    console.log(`US$ por mensaje:            ${summary.usdPerMessage.toFixed(5)} (${pct(summary.usdPerMessage, prev.summary.usdPerMessage)})`);
    console.log(`aciertos:                   ${summary.ok}/${rows.length} (antes ${prev.summary.ok}/${prev.rows.length})`);
  }
  const file = `${DIR}/${new Date().toISOString().replace(/[:.]/g, "-")}_${label}.json`;
  writeFileSync(file, JSON.stringify({ label, summary, rows }, null, 2));
  console.log(`\nGuardado en ${file}`);
}

/** Lo que entendió, en una línea (sin los campos vacíos), para revisarlo a ojo */
function describe(p: Parsed | null) {
  if (!p) return "";
  const { intent, ...rest } = p;
  void intent;
  return JSON.stringify(rest, (_k, v) => (v === null || v === "" ? undefined : v));
}

function summarize(rows: Row[]) {
  const ai = rows.filter((r) => !r.noAi && r.inTok > 0);
  const totalUsd = rows.reduce((s, r) => s + r.usd, 0);
  return {
    ok: rows.filter((r) => r.ok).length,
    noAi: rows.filter((r) => r.noAi).length,
    aiCalls: ai.length,
    minIn: Math.min(...ai.map((r) => r.inTok)),
    avgIn: ai.reduce((s, r) => s + r.inTok, 0) / (ai.length || 1),
    avgOut: ai.reduce((s, r) => s + r.outTok, 0) / (ai.length || 1),
    totalUsd,
    usdPerMessage: totalUsd / rows.length,
  };
}

function printSummary(s: ReturnType<typeof summarize>) {
  console.log(`aciertos: ${s.ok}/${CASES.length} · sin IA: ${s.noAi} · llamadas a la IA: ${s.aiCalls}`);
  console.log(`tokens por llamada: entrada ${s.avgIn.toFixed(0)} (piso fijo ≈ ${s.minIn}) · salida ${s.avgOut.toFixed(0)}`);
  console.log(
    `costo: US$ ${s.totalUsd.toFixed(4)} la corrida · US$ ${s.usdPerMessage.toFixed(5)} por mensaje ` +
      `(≈ US$ ${(s.usdPerMessage * 1000).toFixed(2)} cada 1000 mensajes)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
