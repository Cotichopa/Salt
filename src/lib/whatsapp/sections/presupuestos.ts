import "server-only";
import { z } from "zod";
import { formatMoney, parseAmount } from "@/lib/format";
import { normalize } from "@/lib/text";
import { BudgetError, getBudget, listBudgets, removeBudget, setBudget } from "@/lib/services/budgets";
import { listCategories } from "@/lib/services/categories";
import { askModel, isAiEnabled, matchByName, MAX_CHARS, saidAmount } from "@/lib/whatsapp/ai-parser";
import { BACK, label, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askConfirm, askFollowup } from "@/lib/whatsapp/sections/confirm";
import { clearSession, setSession, type Draft } from "@/lib/whatsapp/session";

// Presupuestos por Chop: ver cómo vienen, poner o cambiar el de una categoría y sacarlo.
// Son mensuales y en pesos (ver services/budgets.ts). Misma idea que fijos.ts: la IA principal
// detecta la sección y acá va una segunda llamada chica; lo que cambia datos pide confirmación.

type Category = Awaited<ReturnType<typeof listCategories>>[number];

const budgetSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("ver") }),
  z.object({ accion: z.literal("poner"), cat: z.string(), monto: z.number().optional() }), // sin monto: se pregunta
  z.object({ accion: z.literal("sacar"), cat: z.string() }),
  z.object({ accion: z.literal("otro"), pregunta: z.string().optional() }),
]);
export type BudgetParsed = z.infer<typeof budgetSchema>;

const SYSTEM = `Sos Chop, el asistente de la app de gastos Salt (Argentina). El mensaje es sobre PRESUPUESTOS mensuales por categoría. Respondé SOLO un objeto JSON, sin texto alrededor, con una de estas formas:
{"accion":"ver"}
{"accion":"poner","cat":"Comida","monto":200000}
{"accion":"sacar","cat":"Salidas"}
{"accion":"otro","pregunta":"¿De qué categoría?"}

- poner: crear o cambiar el presupuesto ("poneme 200 mil en comida", "subí el de salidas a 80000").
- sacar: quitar el presupuesto de una categoría.
- cat: nombre EXACTO de la lista de categorías (la más parecida).
- lucas/luca/k/mil = miles, palo = millón. Punto de miles y coma decimal.`;

/** Interpreta un mensaje sobre presupuestos (segunda llamada). null si la IA no está o falló. */
export async function parseBudgets(text: string, categories: string[]): Promise<BudgetParsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;
  const content = [`Categorías: ${categories.join(", ")}.`, `\nMensaje: "${text}"`].join("\n");
  return askModel(SYSTEM, content, budgetSchema, "ai-presupuestos");
}

export async function handleBudgets(ctx: Ctx, text: string): Promise<boolean> {
  const cats = await listCategories(ctx.userId);
  const p = await parseBudgets(text, cats.map((c) => c.name));
  if (!p) return false;
  if (p.accion === "ver") return showBudgetsList(ctx);
  if (p.accion === "otro") {
    if (p.pregunta) return askFollowup(ctx, "presupuesto", text, p.pregunta, `\n\n${EXAMPLES}${BACK}`);
    await ctx.out.text(`No entendí qué querés hacer con los presupuestos 🤔\n\n${EXAMPLES}${BACK}`);
    return true;
  }
  const cat = mentionedCategory(cats, p.cat, text);
  if (!cat) {
    return askFollowup(ctx, "presupuesto", text, "🎯 ¿En qué categoría va el presupuesto?", BACK);
  }
  if (p.accion === "sacar") return askRemoveBudget(ctx, cat.id);
  const amount = saidAmount(text, p.monto);
  if (!amount) {
    return askFollowup(ctx, "presupuesto", text, `🎯 ¿De cuánto es el presupuesto mensual de ${label(cat)}?`, BACK);
  }
  return askSetBudget(ctx, cat, amount);
}

const EXAMPLES = '_Podés decirme: "poneme 200 mil de presupuesto en comida", "sacá el presupuesto de salidas" o "mis presupuestos"._';

/** La categoría, solo si el mensaje la nombra (por nombre o palabra clave): el modelo a veces adivina */
function mentionedCategory(cats: Category[], name: string, text: string) {
  const cat = matchByName(cats, name);
  if (!cat) return null;
  const t = normalize(text);
  return t.includes(normalize(cat.name)) || cat.keywords.some((k) => t.includes(k)) ? cat : null;
}

// ---------- Lista ----------

export async function showBudgetsList(ctx: Ctx): Promise<boolean> {
  await clearSession(ctx.phone);
  const budgets = await listBudgets(ctx.userId);
  if (budgets.length === 0) {
    await ctx.out.text(`🎯 No tenés presupuestos.\n\n${EXAMPLES}${BACK}`);
    return true;
  }
  const lines = budgets.map((b) => {
    const mark = b.level === "exceeded" ? " 🚨" : b.level === "warning" ? " ⚠️" : "";
    const rest = b.remaining >= 0 ? `quedan ${formatMoney(b.remaining, "ARS")}` : `te pasaste ${formatMoney(-b.remaining, "ARS")}`;
    return `• ${label(b)}: ${formatMoney(b.spent, "ARS")} de ${formatMoney(b.amount, "ARS")} · ${rest}${mark}`;
  });
  await ctx.out.text(`🎯 *Tus presupuestos de este mes*\n\n${lines.join("\n")}\n\n${EXAMPLES}${BACK}`);
  return true;
}

// ---------- Poner, cambiar y sacar ----------

async function askSetBudget(ctx: Ctx, cat: Category, amount: number) {
  const current = await getBudget(ctx.userId, cat.id);
  if (current?.amount === amount) {
    await ctx.out.text(`El presupuesto de ${label(cat)} ya es ${formatMoney(amount, "ARS")} 👌${BACK}`);
    return true;
  }
  const spent = current ? `\nEste mes llevás ${formatMoney(current.spent, "ARS")}.` : "";
  return askConfirm(ctx, {
    type: "budget:set",
    data: { categoryId: cat.id, name: label(cat), amount },
    body: current
      ? `🎯 ¿Cambio el presupuesto de ${label(cat)}?\n\n${formatMoney(current.amount, "ARS")} → *${formatMoney(amount, "ARS")}* por mes${spent}`
      : `🎯 ¿Pongo un presupuesto de *${formatMoney(amount, "ARS")}* por mes en ${label(cat)}?\n_Te aviso cuando llegues al 80 % y al 100 %._`,
    options: [{ id: "yes", title: current ? "✅ Cambiar" : "✅ Poner", words: ["poner", "cambiar", "ponelo"] }],
  });
}

export async function askRemoveBudget(ctx: Ctx, categoryId: string) {
  const current = await getBudget(ctx.userId, categoryId);
  if (!current) {
    await ctx.out.text(`Esa categoría no tiene presupuesto 👌${BACK}`);
    return true;
  }
  return askConfirm(ctx, {
    type: "budget:remove",
    data: { categoryId, name: label(current) },
    body: `🎯 ¿Saco el presupuesto de ${label(current)} (${formatMoney(current.amount, "ARS")} por mes)?`,
    options: [{ id: "yes", title: "🗑️ Sacar", words: ["sacar", "sacalo", "borrar"] }],
  });
}

export async function runBudgetAction(ctx: Ctx, type: string, data: Record<string, unknown>) {
  const { categoryId, name, amount } = data as { categoryId: string; name: string; amount?: number };
  try {
    if (type === "budget:set") {
      await setBudget(ctx.userId, categoryId, amount!);
      await ctx.out.text(`✅ Listo: ${name} tiene un presupuesto de ${formatMoney(amount!, "ARS")} por mes.${BACK}`);
    } else if (type === "budget:remove") {
      await removeBudget(ctx.userId, categoryId);
      await ctx.out.text(`🗑️ Saqué el presupuesto de ${name}.${BACK}`);
    }
  } catch (e) {
    if (!(e instanceof BudgetError)) throw e;
    await ctx.out.text(`No pude hacerlo: ${e.message}${BACK}`);
  }
}

// ---------- Con los botones del menú: elegir categoría → monto ----------

/** Después de elegir la categoría en "Agregar → Presupuesto": pregunta el monto */
export async function askBudgetAmount(ctx: Ctx, categoryId: string) {
  const cat = (await listCategories(ctx.userId)).find((c) => c.id === categoryId);
  if (!cat) {
    await ctx.out.text(`Esa categoría ya no existe 🤔${BACK}`);
    return true;
  }
  const current = await getBudget(ctx.userId, cat.id);
  await setSession(ctx.phone, "budget:new", { budgetCategoryId: cat.id });
  await ctx.out.text(
    `🎯 ¿De cuánto es el presupuesto mensual de ${label(cat)}?${current ? ` (hoy es ${formatMoney(current.amount, "ARS")})` : ""}\n(ej: 200000 o 200.000)`,
  );
  return true;
}

export async function receiveBudgetAmount(ctx: Ctx, input: Input, d: Draft) {
  const cat = (await listCategories(ctx.userId)).find((c) => c.id === d.budgetCategoryId);
  if (!cat) return false;
  const text = normalize(input.text ?? "");
  // "200000", "200.000", "200 mil", "200k"
  const n = parseAmount(text.replace(/\s*(mil|k|lucas?)$/, "").replace(/[^\d.,]/g, ""));
  const amount = n && /(mil|k|lucas?)$/.test(text) ? n * 1000 : n;
  if (!amount || amount <= 0 || amount >= 1e12) {
    await ctx.out.text("Ese monto no lo agarro 🤔 Escribilo con números, por ej. 200000 (o escribí *cancelar*)");
    return true;
  }
  return askSetBudget(ctx, cat, amount);
}
