import "server-only";
import {
  dollarTypeLabels,
  formatMoney,
  paymentMethodLabels,
  parseAmount,
  todayISO,
  type DollarTypeCode,
  type PaymentMethodCode,
} from "@/lib/format";
import { normalize } from "@/lib/text";
import { listCategories } from "@/lib/services/categories";
import {
  createExpense,
  deleteExpense,
  ExpenseError,
  getExpense,
  listExpenses,
  mostUsedPaymentMethod,
  type ExpenseDTO,
  type ExpenseFilters,
} from "@/lib/services/expenses";
import {
  isAiEnabled,
  matchByName,
  parseMessage,
  type ParsedExpense,
  type QueryPeriod,
  type Target,
} from "@/lib/whatsapp/ai-parser";
import { listPaymentSources, kindForMethod } from "@/lib/services/payment-sources";
import { budgetAlertFor, budgetAlertText, listBudgets, type BudgetAlert } from "@/lib/services/budgets";
import { updateExpense } from "@/lib/services/expenses";
import type { ListRow, Outbox } from "@/lib/whatsapp/outbox";
import type { Source } from "@/generated/prisma/client";
import { clearSession, setSession, type Draft, type PendingExpense, type Session } from "@/lib/whatsapp/session";

// Menú paso a paso de Chop, armado como una "máquina de estados":
// cada paso de la conversación es un estado (ej: "add:amount" = esperando el monto),
// y cada respuesta del usuario lo lleva al estado siguiente.
//
//   main ─► add:category ─► add:amount ─► add:currency ─► add:method ─► add:description ─► add:confirm
//     ├───► query ─► (resumen)   └─► query:category ─► (resumen)
//     └───► delete:pick ─► delete:confirm
//
// Las respuestas pueden venir de un botón/lista (replyId, ej: "cur:USD") o escritas a mano
// (text, ej: "dolares"): aceptamos las dos formas en cada paso.

/**
 * Con quién habla Chop y por dónde.
 * - phone: identifica la conversación (para recordar en qué paso del menú está).
 *   En WhatsApp es el teléfono; en el chat de la web es "web:<id de usuario>".
 * - out: por dónde salen las respuestas (ver outbox.ts).
 * - source: con qué origen se guardan los gastos (WHATSAPP o WEB).
 */
export type Ctx = { userId: string; name: string; phone: string; out: Outbox; source: Source };
export type Input = { text?: string; replyId?: string };

export const BACK = "\n\nEscribí *menu* para volver al menú.";
const NAME = "Chop";
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const label = (c: { emoji: string | null; name: string }) => `${c.emoji ?? ""} ${c.name}`.trim();

/** Avisos de presupuesto para agregar al final de un mensaje (vacío si no hay) */
const alertLines = (alerts: BudgetAlert[]) =>
  alerts.map((a) => `\n\n${a.level === "exceeded" ? "🚨" : "⚠️"} ${budgetAlertText(a)}`).join("");

/**
 * Líneas de presupuesto para el resumen: solo si se consulta el mes en curso
 * (todo el mes o una categoría). Con una categoría, solo el de esa categoría.
 */
async function budgetLines(userId: string, filters: ExpenseFilters) {
  const onlyMonth = !filters.paymentMethod && !filters.paymentSourceId && !filters.currency;
  if (filters.month !== todayISO().slice(0, 7) || !onlyMonth) return [];
  const budgets = (await listBudgets(userId)).filter((b) => !filters.categoryId || b.categoryId === filters.categoryId);
  if (budgets.length === 0) return [];

  const line = (b: (typeof budgets)[number]) => {
    const mark = b.level === "exceeded" ? " 🚨" : b.level === "warning" ? " ⚠️" : "";
    const rest =
      b.remaining >= 0 ? `quedan ${formatMoney(b.remaining, "ARS")}` : `te pasaste ${formatMoney(-b.remaining, "ARS")}`;
    return `${formatMoney(b.spent, "ARS")} de ${formatMoney(b.amount, "ARS")} · ${rest}${mark}`;
  };
  if (filters.categoryId) return ["", `🎯 *Presupuesto:* ${line(budgets[0])}`];
  return ["", "🎯 *Presupuestos*", ...budgets.map((b) => `${label(b)}: ${line(b)}`)];
}

// Qué prefijos de botón espera cada estado (para detectar botones viejos de otra conversación)
const expected: Record<string, string[]> = {
  "add:category": ["cat:", "catpage:"],
  "add:currency": ["cur:"],
  "add:method": ["pm:", "src:"],
  "add:description": ["desc:"],
  "add:confirm": ["confirm:"],
  query: ["q:"],
  "query:category": ["cat:", "catpage:"],
  "query:source": ["src:"],
  "query:method": ["pm:"],
  "delete:pick": ["del:"],
  "delete:confirm": ["delconfirm:"],
  "ai:confirm": ["aiconfirm:"],
  "ai:edit": ["editconfirm:"],
  "ai:missing": ["cat:", "catpage:", "src:"],
  "ai:dollar": ["usd:"],
  "ai:method": ["pm:", "src:"],
};

// ---------- Menú principal ----------

/**
 * Menú principal: 3 botones (lo máximo de WhatsApp). Cada uno abre una lista con gastos, fijos,
 * tarjetas... (sections/listas.ts, que los atiende en cualquier momento).
 */
export async function showMainMenu(ctx: Ctx, intro?: string) {
  await setSession(ctx.phone, "main");
  await ctx.out.buttons(intro ?? `¿Qué hacemos, ${ctx.name}? Soy ${NAME}, decime:`, [
    { id: "menu:add", title: "➕ Agregar" },
    { id: "menu:query", title: "📊 Consultar" },
    { id: "menu:delete", title: "🗑️ Eliminar" },
  ]);
}

/** Procesa una respuesta dentro del menú. Devuelve false si no había nada en curso que la entienda. */
export async function handleMenu(ctx: Ctx, input: Input, session: Session | null): Promise<boolean> {
  const id = input.replyId;
  const text = normalize(input.text ?? "");

  // Los botones del menú principal y "Deshacer" valen en cualquier momento
  if (id?.startsWith("menu:")) return routeMain(ctx, id.slice(5));
  if (id?.startsWith("undo:")) return undoSaved(ctx, id.slice(5).split("."));
  if (!session && !id) return false;

  if (id && (!session || !expected[session.state]?.some((p) => id.startsWith(p)))) {
    await showMainMenu(ctx, "Esa opción ya venció ⏳ Arranquemos de nuevo:");
    return true;
  }

  if (!session) return false;
  const d = session.data;
  switch (session.state) {
    case "main":
      // Las opciones escritas ("1", "agregar"...) las atiende sections/listas.ts: el resto sigue a la IA
      return false;
    case "add:category":
      return pickCategory(ctx, input, d, "add");
    case "add:amount":
      return receiveAmount(ctx, text, d);
    case "add:currency":
      return receiveCurrency(ctx, id, text, d);
    case "add:method":
      return receiveMethod(ctx, input, d);
    case "add:description":
      return receiveDescription(ctx, id, input.text ?? "", d);
    case "add:confirm":
      return confirmAdd(ctx, id, text, d);
    case "query":
      return receiveQuery(ctx, id, text);
    case "query:category":
      return pickCategory(ctx, input, d, "query");
    case "query:source":
      return receiveQuerySource(ctx, id, text);
    case "query:method":
      return receiveQueryMethod(ctx, id, text);
    case "delete:pick":
      return pickDelete(ctx, id);
    case "delete:confirm":
      return confirmDelete(ctx, id, text, d);
    case "ai:confirm":
      return confirmAI(ctx, id, text, input.text ?? "", d);
    case "ai:edit":
      return confirmEdit(ctx, id, text, d);
    case "ai:missing":
      return receiveMissing(ctx, input, d);
    case "ai:dollar":
      return receiveDollar(ctx, input, d);
    case "ai:method":
      return receivePayment(ctx, input, d);
  }
  return false;
}

async function routeMain(ctx: Ctx, option: string) {
  if (option === "add") await startAdd(ctx);
  else if (option === "query") await showQueryMenu(ctx);
  else if (option === "delete") await showDeleteList(ctx);
  else await showMainMenu(ctx, "Elegí una opción con los botones 👇");
  return true;
}

// ---------- Cargar gasto ----------

export async function startAdd(ctx: Ctx) {
  await setSession(ctx.phone, "add:category", { page: 0 });
  await sendCategoryList(ctx, 0, "🏷️ ¿En qué categoría? Elegila de la lista o escribí el nombre.");
}

const PAGE = 9; // 9 categorías + 1 fila de "ver más" = 10, el máximo de WhatsApp

export async function sendCategoryList(ctx: Ctx, page: number, body: string) {
  const cats = await listCategories(ctx.userId);
  const rows: ListRow[] = cats.map((c) => ({ id: `cat:${c.id}`, title: label(c) }));
  if (rows.length <= 10) return ctx.out.list(body, "Ver categorías", rows, "Categorías");

  const pages = Math.ceil(rows.length / PAGE);
  const current = page % pages;
  const pageRows = rows.slice(current * PAGE, current * PAGE + PAGE);
  const next = (current + 1) % pages;
  pageRows.push({ id: `catpage:${next}`, title: next === 0 ? "⬅️ Volver al principio" : "➡️ Ver más categorías" });
  return ctx.out.list(body, "Ver categorías", pageRows, `Categorías (${current + 1}/${pages})`);
}

/** Categoría escrita a mano: por nombre o por palabra clave, sin importar tildes ni mayúsculas */
export function findCategoryByText<T extends { name: string; keywords: string[] }>(cats: T[], text: string) {
  const t = normalize(text);
  return (
    cats.find((c) => normalize(c.name) === t) ??
    cats.find((c) => c.keywords.includes(t)) ??
    cats.find((c) => normalize(c.name).startsWith(t) && t.length >= 3)
  );
}

async function pickCategory(ctx: Ctx, input: Input, d: Draft, flow: "add" | "query") {
  const state = flow === "add" ? "add:category" : "query:category";
  const id = input.replyId;

  if (id?.startsWith("catpage:")) {
    const page = Number(id.slice(8)) || 0;
    await setSession(ctx.phone, state, { ...d, page });
    await sendCategoryList(ctx, page, "🏷️ Más categorías:");
    return true;
  }

  const cats = await listCategories(ctx.userId);
  let cat = id?.startsWith("cat:") ? cats.find((c) => c.id === id.slice(4)) : undefined;
  if (!cat && input.text) cat = findCategoryByText(cats, input.text);
  if (!cat) {
    await sendCategoryList(ctx, d.page ?? 0, "No tengo esa categoría 🤔 Elegila de la lista:");
    return true;
  }

  if (flow === "query") {
    await sendSummary(ctx, `de este mes en ${label(cat)}`, { month: todayISO().slice(0, 7), categoryId: cat.id });
    return true;
  }
  const next = { ...d, categoryId: cat.id, categoryLabel: label(cat) };
  await setSession(ctx.phone, "add:amount", next);
  await ctx.out.text(`💰 ¿Cuánto gastaste en ${next.categoryLabel}?\n(ej: 15000 o 15.000,50)`);
  return true;
}

async function receiveAmount(ctx: Ctx, text: string, d: Draft) {
  const amount = parseAmount(text);
  if (!amount || amount <= 0 || amount >= 1_000_000_000_000) {
    await ctx.out.text("Ese monto no lo agarro 🤔 Escribilo solo con números, por ejemplo: 15000 o 15.000,50");
    return true;
  }
  await setSession(ctx.phone, "add:currency", { ...d, amount });
  await ctx.out.buttons(`¿En qué moneda son los ${text}?`, [
    { id: "cur:ARS", title: "🇦🇷 Pesos" },
    { id: "cur:USD", title: "🇺🇸 Dólares" },
  ]);
  return true;
}

async function receiveCurrency(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const currency =
    id === "cur:ARS" || ["pesos", "peso", "ars", "$"].includes(text)
      ? "ARS"
      : id === "cur:USD" || ["dolares", "dolar", "usd", "u$s", "us$"].includes(text)
        ? "USD"
        : null;
  if (!currency) {
    await ctx.out.buttons("Elegí la moneda:", [
      { id: "cur:ARS", title: "🇦🇷 Pesos" },
      { id: "cur:USD", title: "🇺🇸 Dólares" },
    ]);
    return true;
  }
  await setSession(ctx.phone, "add:method", { ...d, currency });
  await sendMethodList(ctx, "💳 ¿Cómo pagaste?");
  return true;
}

async function sendMethodList(ctx: Ctx, body: string) {
  return ctx.out.list(body, "Medios de pago", await paymentRows(ctx.userId), "Medio de pago");
}

async function receiveMethod(ctx: Ctx, input: Input, d: Draft) {
  // Igual que "¿cómo pagaste?" del texto libre: un medio, una billetera o una tarjeta
  const answer = readPayment(input, await listPaymentSources(ctx.userId), "DEBIT");
  if (!answer) {
    await sendMethodList(ctx, "Elegí el medio de pago de la lista:");
    return true;
  }
  await setSession(ctx.phone, "add:description", {
    ...d,
    paymentMethod: answer.method,
    sourceId: answer.source?.id ?? null,
    sourceName: answer.source?.name ?? null,
  });
  await ctx.out.buttons("📝 ¿Querés agregar una descripción? Escribila, o tocá el botón.", [
    { id: "desc:none", title: "Sin descripción" },
  ]);
  return true;
}

async function receiveDescription(ctx: Ctx, id: string | undefined, rawText: string, d: Draft) {
  const description = id === "desc:none" ? null : rawText.trim().slice(0, 200) || null;
  const next = { ...d, description, date: todayISO() };
  await setSession(ctx.phone, "add:confirm", next);
  await ctx.out.buttons(`¿Guardo este gasto?\n\n${describeDraft(next)}`, [
    { id: "confirm:yes", title: "✅ Guardar" },
    { id: "confirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

function describeDraft(d: Draft) {
  const lines = [
    `${d.categoryLabel} · *${formatMoney(d.amount ?? 0, d.currency ?? "ARS")}*`,
    [`💳 ${paymentMethodLabels[d.paymentMethod ?? "CASH"]}`, d.sourceName, `📅 ${d.date === todayISO() ? "hoy" : shortDate(d.date ?? todayISO())}`]
      .filter(Boolean)
      .join(" · "),
  ];
  if (d.description) lines.push(`📝 ${d.description}`);
  return lines.join("\n");
}

async function confirmAdd(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const yes = id === "confirm:yes" || ["si", "guardar", "ok", "dale"].includes(text);
  const no = id === "confirm:no" || ["no", "cancelar"].includes(text);
  if (!yes && !no) {
    await ctx.out.buttons("¿Lo guardo?", [
      { id: "confirm:yes", title: "✅ Guardar" },
      { id: "confirm:no", title: "❌ Cancelar" },
    ]);
    return true;
  }
  if (no) {
    await clearSession(ctx.phone);
    await ctx.out.text(`Dale, no guardé nada 👌${BACK}`);
    return true;
  }
  // Igual que lo escrito a mano: si hace falta pregunta la tarjeta o el dólar, y guarda con Deshacer
  return finishPending(ctx, {
    pending: [
      {
        categoryId: d.categoryId!,
        categoryLabel: d.categoryLabel ?? "",
        amount: d.amount!,
        currency: d.currency ?? "ARS",
        paymentMethod: d.paymentMethod ?? "CASH",
        sourceId: d.sourceId ?? null,
        sourceName: d.sourceName ?? null,
        description: d.description ?? null,
        date: d.date ?? todayISO(),
      },
    ],
  });
}

// ---------- Consultar ----------

export async function showQueryMenu(ctx: Ctx) {
  await setSession(ctx.phone, "query");
  await ctx.out.list("📊 ¿Qué gastos querés ver?", "Ver opciones", [
    { id: "q:today", title: "Hoy" },
    { id: "q:week", title: "Esta semana", description: "Desde el lunes" },
    { id: "q:month", title: "Este mes" },
    { id: "q:lastmonth", title: "Mes pasado" },
    { id: "q:category", title: "Por categoría", description: "Este mes, en una categoría" },
    { id: "q:source", title: "Por tarjeta o billetera", description: "Este mes, con una tarjeta o billetera" },
    { id: "q:method", title: "Por medio de pago", description: "Este mes: efectivo, débito..." },
  ]);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

async function receiveQuery(ctx: Ctx, id: string | undefined, text: string) {
  const today = todayISO();
  const option =
    id?.slice(2) ?? { hoy: "today", semana: "week", mes: "month", categoria: "category", tarjeta: "source", medio: "method" }[text];

  if (option === "today") await sendSummary(ctx, "de hoy", { from: today, to: today });
  else if (option === "week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = domingo
    const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
    await sendSummary(ctx, "de esta semana", { from: monday, to: today });
  } else if (option === "month") await sendSummary(ctx, "de este mes", { month: today.slice(0, 7) });
  else if (option === "lastmonth") await sendSummary(ctx, "del mes pasado", { month: shiftMonth(today.slice(0, 7), -1) });
  else if (option === "category") {
    await setSession(ctx.phone, "query:category", { page: 0 });
    await sendCategoryList(ctx, 0, "🏷️ ¿Qué categoría querés ver?");
  } else if (option === "source") {
    const sources = await listPaymentSources(ctx.userId);
    await setSession(ctx.phone, "query:source");
    await ctx.out.list(
      "💳 ¿Qué tarjeta o billetera querés ver?",
      "Ver opciones",
      sources.slice(0, 10).map((s) => ({ id: `src:${s.id}`, title: `${s.kind === "CARD" ? "💳" : "📲"} ${s.name}` })),
      "Tarjetas y billeteras",
    );
  } else if (option === "method") {
    await setSession(ctx.phone, "query:method");
    await ctx.out.list(
      "💳 ¿Qué medio de pago querés ver?",
      "Ver opciones",
      (Object.keys(paymentMethodLabels) as PaymentMethodCode[]).map((m) => ({ id: `pm:${m}`, title: paymentMethodLabels[m] })),
      "Medios de pago",
    );
  } else await showQueryMenu(ctx);
  return true;
}

/** Gastos del mes con una tarjeta o billetera */
async function receiveQuerySource(ctx: Ctx, id: string | undefined, text: string) {
  const sources = await listPaymentSources(ctx.userId);
  const source = id?.startsWith("src:") ? sources.find((s) => s.id === id.slice(4)) : matchByName(sources, text);
  if (!source) return receiveQuery(ctx, "q:source", "");
  await sendSummary(ctx, `de este mes con ${source.name}`, { month: todayISO().slice(0, 7), paymentSourceId: source.id });
  return true;
}

/** Gastos del mes con un medio de pago */
async function receiveQueryMethod(ctx: Ctx, id: string | undefined, text: string) {
  const methods = Object.keys(paymentMethodLabels) as PaymentMethodCode[];
  const method = id?.startsWith("pm:")
    ? methods.find((m) => m === id.slice(3))
    : methods.find((m) => normalize(paymentMethodLabels[m]) === text);
  if (!method) return receiveQuery(ctx, "q:method", "");
  await sendSummary(ctx, `de este mes con ${paymentMethodLabels[method].toLowerCase()}`, {
    month: todayISO().slice(0, 7),
    paymentMethod: method,
  });
  return true;
}

async function sendSummary(ctx: Ctx, title: string, filters: ExpenseFilters) {
  await clearSession(ctx.phone);
  const [expenses, budgets] = await Promise.all([listExpenses(ctx.userId, filters), budgetLines(ctx.userId, filters)]);
  if (expenses.length === 0) {
    await ctx.out.text(`No tenés gastos ${title} 🙌${budgets.join("\n")}${BACK}`);
    return;
  }

  // Todo en pesos (cada gasto en USD guarda su valor en pesos del día). Solo los gastos
  // viejos en USD que nunca se convirtieron quedan aparte, en dólares.
  const inPesos = (e: ExpenseDTO) => (e.currency === "ARS" ? e.amount : e.amountArs);
  const totals = { ARS: 0, USD: 0 };
  for (const e of expenses) {
    const pesos = inPesos(e);
    if (pesos !== null) totals.ARS += pesos;
    else totals.USD += e.amount;
  }
  const totalText = [formatMoney(totals.ARS, "ARS"), totals.USD > 0 ? `${formatMoney(totals.USD, "USD")} sin convertir` : ""]
    .filter(Boolean)
    .join(" + ");

  // Suma por categoría, de mayor a menor
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const pesos = inPesos(e);
    const key = `${label(e.category)}|${pesos === null ? "USD" : "ARS"}`;
    byCat.set(key, (byCat.get(key) ?? 0) + (pesos ?? e.amount));
  }
  const catLines = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, total]) => {
      const [name, currency] = key.split("|");
      return `${name}: ${formatMoney(total, currency as "ARS" | "USD")}`;
    });

  const lastLines = expenses.slice(0, 5).map(expenseLine);

  await ctx.out.text([
      `📊 *Gastos ${title}*`,
      `Total: *${totalText}* (${expenses.length} ${expenses.length === 1 ? "gasto" : "gastos"})`,
      // Si hay una sola categoría, el desglose repetiría el total
      ...(catLines.length > 1 ? ["", "*Por categoría*", ...catLines] : []),
      ...budgets,
      "",
      "*Últimos*",
      ...lastLines,
    ].join("\n") + BACK,
  );
}

function expenseLine(e: ExpenseDTO) {
  const pesos = e.currency === "USD" && e.amountArs !== null ? ` (${formatMoney(e.amountArs, "ARS")})` : "";
  return `• ${shortDate(e.date)} ${label(e.category)} ${formatMoney(e.amount, e.currency)}${pesos}${e.description ? ` — ${e.description}` : ""}`;
}

// ---------- Eliminar ----------

export async function showDeleteList(ctx: Ctx) {
  const last = await listExpenses(ctx.userId, { to: todayISO() }, 10);
  if (last.length === 0) {
    await clearSession(ctx.phone);
    await ctx.out.text(`No tenés gastos para eliminar.${BACK}`);
    return;
  }
  await setSession(ctx.phone, "delete:pick");
  await ctx.out.list("🗑️ ¿Cuál querés eliminar? Estos son tus últimos gastos:",
    "Ver gastos",
    last.map((e) => ({
      id: `del:${e.id}`,
      title: `${e.category.emoji ?? ""} ${formatMoney(e.amount, e.currency)}`.trim(),
      description: [shortDate(e.date), e.category.name, e.description].filter(Boolean).join(" · "),
    })),
    "Últimos gastos",
  );
}

/** Atajo "borrar último": salta directo a la confirmación del gasto más reciente */
async function pickDelete(ctx: Ctx, id: string | undefined) {
  const expense = id?.startsWith("del:") ? await getExpense(ctx.userId, id.slice(4)) : null;
  if (!expense) {
    await showDeleteList(ctx);
    return true;
  }
  await askDeleteConfirm(ctx, expense);
  return true;
}

async function askDeleteConfirm(ctx: Ctx, e: ExpenseDTO) {
  await setSession(ctx.phone, "delete:confirm", { expenseId: e.id });
  await ctx.out.buttons(`¿Elimino este gasto?\n\n${expenseLine(e)}`, [
    { id: "delconfirm:yes", title: "🗑️ Sí, eliminar" },
    { id: "delconfirm:no", title: "Cancelar" },
  ]);
}

async function confirmDelete(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const yes = id === "delconfirm:yes" || ["si", "eliminar", "borrar"].includes(text);
  const no = id === "delconfirm:no" || ["no", "cancelar"].includes(text);
  if (!yes && !no) {
    await ctx.out.buttons("¿Lo elimino?", [
      { id: "delconfirm:yes", title: "🗑️ Sí, eliminar" },
      { id: "delconfirm:no", title: "Cancelar" },
    ]);
    return true;
  }
  await clearSession(ctx.phone);
  if (no || !d.expenseId) {
    await ctx.out.text(`Tranqui, no eliminé nada 👌${BACK}`);
    return true;
  }
  try {
    await deleteExpense(ctx.userId, d.expenseId);
    await ctx.out.text(`🗑️ Listo, lo eliminé.${BACK}`);
  } catch {
    await ctx.out.text(`Ese gasto ya no existe (¿lo borraste desde la web?).${BACK}`);
  }
  return true;
}

// ---------- Texto libre interpretado por la IA ----------

/**
 * Convierte lo que entendió la IA (o el pre-filtro) en gastos concretos, con la categoría y el
 * medio de pago del usuario. Un gasto solo se guarda directo; varios, se confirman.
 * Devuelve false si ninguno era válido.
 */
export async function proposeExpenses(ctx: Ctx, parsed: ParsedExpense[], heading?: string) {
  const [cats, sources, fallbackMethod] = await Promise.all([
    listCategories(ctx.userId),
    listPaymentSources(ctx.userId),
    mostUsedPaymentMethod(ctx.userId),
  ]);

  const pending: PendingExpense[] = [];
  for (const p of parsed) {
    // Si no hay una categoría que encaje, el gasto queda sin categoría y se la preguntamos
    const cat = matchByName(cats, p.categoryName);
    const method = p.paymentMethod ?? fallbackMethod;
    // La tarjeta solo vale si es del tipo que corresponde al medio de pago
    const source = matchByName(sources, p.sourceName);
    const usable = source && source.kind === kindForMethod(method) ? source : null;
    pending.push({
      categoryId: cat?.id ?? "",
      categoryLabel: cat ? label(cat) : NO_CATEGORY,
      amount: p.amount,
      currency: p.currency,
      paymentMethod: method,
      description: p.description,
      date: p.date,
      guessedMethod: p.paymentMethod === null,
      sourceId: usable?.id ?? null,
      sourceName: usable?.name ?? null,
      installments: method === "CREDIT" ? p.installments : 1,
    });
  }
  if (pending.length === 0) return false;
  return showProposal(ctx, pending, heading);
}

/**
 * Si alguno quedó sin categoría, primero pregunta cuál (sin categoría no se puede guardar).
 * Un solo gasto se guarda directo (con Deshacer); varios muestran Guardar todos / Cancelar.
 */
async function showProposal(ctx: Ctx, pending: PendingExpense[], heading?: string) {
  if (pending.some((p) => !p.categoryId)) return askMissing(ctx, { pending });
  if (pending.length === 1) return finishPending(ctx, { pending });

  await setSession(ctx.phone, "ai:confirm", { pending });
  const body = [
    heading ?? `Entendí ${pending.length} gastos 👇`,
    "",
    ...pending.map(describePending),
    "",
    pending.some((p) => p.guessedMethod) ? "_El medio de pago lo supuse: revisalo._" : "",
  ]
    .filter(Boolean)
    .join("\n");
  await ctx.out.buttons(body, [
    { id: "aiconfirm:yes", title: "✅ Guardar todos" },
    { id: "aiconfirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

const NO_CATEGORY = "❓ Sin categoría";

/**
 * Todo lo que no es efectivo lleva con qué: la tarjeta (débito o crédito; sin ella, una compra con
 * crédito no aparece en el resumen de la tarjeta) o la billetera (transferencia).
 */
const needsSource = (p: { paymentMethod?: PaymentMethodCode; sourceId?: string | null }) =>
  !!p.paymentMethod && p.paymentMethod !== "CASH" && !p.sourceId;

/** "¿Con qué tarjeta de crédito pagaste $ X?" / "¿Con qué billetera...?" (los fijos dicen "pagás") */
export function sourceQuestion(method: PaymentMethodCode, what: string, verb = "pagaste") {
  if (method === "TRANSFER") return `📲 ¿Con qué billetera ${verb} ${what}?`;
  if (method === "CREDIT") return `💳 ¿Con qué tarjeta de crédito ${verb} ${what}? Así aparece en su resumen.`;
  return `💳 ¿Con qué tarjeta de débito ${verb} ${what}?`;
}
/** En dólares sin crédito hay que saber a qué dólar se pagó (con crédito es siempre el oficial) */
const needsDollar = (p: PendingExpense) => p.currency === "USD" && p.paymentMethod !== "CREDIT" && !p.dollarType;

/**
 * Pregunta lo que falta: la categoría (de cualquiera que no la tenga) o la tarjeta
 * (de una compra con crédito, en `missing`).
 */
async function askMissing(ctx: Ctx, d: Draft): Promise<boolean> {
  const pending = d.pending ?? [];

  const uncategorized = pending.find((p) => !p.categoryId);
  if (uncategorized) {
    await setSession(ctx.phone, "ai:missing", d);
    const what = [formatMoney(uncategorized.amount, uncategorized.currency), uncategorized.description].filter(Boolean).join(" · ");
    await sendCategoryList(ctx, d.page ?? 0, `🏷️ ¿En qué categoría va *${what}*? Elegila de la lista o escribí el nombre.`);
    return true;
  }
  if (!d.missing?.length || pending.length === 0) return showPendingAgain(ctx, { ...d, missing: [] });

  const kind = kindForMethod(pending[0].paymentMethod);
  const sources = (await listPaymentSources(ctx.userId)).filter((s) => s.kind === kind);
  if (sources.length === 0) return showPendingAgain(ctx, { ...d, missing: [] });
  await setSession(ctx.phone, "ai:missing", d);
  await ctx.out.list(
    sourceQuestion(pending[0].paymentMethod, `*${formatMoney(pending[0].amount, pending[0].currency)}*`),
    kind === "CARD" ? "Ver tarjetas" : "Ver billeteras",
    sources.map((s) => ({ id: `src:${s.id}`, title: s.name })),
    kind === "CARD" ? "Tarjetas" : "Billeteras",
  );
  return true;
}

/** Recibe el dato que faltaba y sigue con el siguiente (o guarda) */
async function receiveMissing(ctx: Ctx, input: Input, d: Draft): Promise<boolean> {
  const pending = [...(d.pending ?? [])];
  const id = input.replyId;
  const rawText = input.text ?? "";

  const i = pending.findIndex((p) => !p.categoryId);
  if (i >= 0) {
    if (id?.startsWith("catpage:")) return askMissing(ctx, { ...d, page: Number(id.slice(8)) || 0 });
    const cats = await listCategories(ctx.userId);
    const cat = id?.startsWith("cat:") ? cats.find((c) => c.id === id.slice(4)) : findCategoryByText(cats, rawText);
    if (!cat) {
      await sendCategoryList(ctx, d.page ?? 0, "No tengo esa categoría 🤔 Elegila de la lista:");
      return true;
    }
    pending[i] = { ...pending[i], categoryId: cat.id, categoryLabel: label(cat) };
    return showProposal(ctx, pending);
  }

  if (!d.missing?.length || pending.length === 0) return false;
  // La tarjeta o billetera. Si contesta otro medio ("mercado pago", "efectivo"), se cambia el medio;
  // si contesta algo que no se entiende, se guarda sin tarjeta ni billetera.
  const answer = readPayment(input, await listPaymentSources(ctx.userId), pending[0].paymentMethod);
  if (answer) pending[0] = withPayment(pending[0], answer);
  return showPendingAgain(ctx, { ...d, pending, missing: [] });
}

/** Después de completar un dato: un gasto sigue hacia guardarse; varios vuelven a la confirmación */
async function showPendingAgain(ctx: Ctx, d: Draft): Promise<boolean> {
  const pending = d.pending ?? [];
  if (d.missing?.length || pending.some((p) => !p.categoryId)) return askMissing(ctx, d);
  if (pending.length === 1) return finishPending(ctx, d);

  await setSession(ctx.phone, "ai:confirm", { pending });
  await ctx.out.buttons(["Quedó así 👇", "", ...pending.map(describePending)].join("\n"), [
    { id: "aiconfirm:yes", title: "✅ Guardar todos" },
    { id: "aiconfirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

/**
 * Lo último antes de guardar. Con un solo gasto: el medio de pago si no lo dijo, y con qué
 * (tarjeta o billetera, una sola vez) si no es efectivo. Con cualquiera: a qué dólar se pagó cada gasto en USD sin
 * crédito. Cuando no falta nada, guarda. (Con varios gastos el medio se supone y se avisa.)
 */
async function finishPending(ctx: Ctx, d: Draft): Promise<boolean> {
  const pending = d.pending ?? [];
  if (pending.length === 1 && pending[0].guessedMethod) return askPayment(ctx, d);
  if (pending.length === 1 && !d.askedSource && needsSource(pending[0])) {
    return askMissing(ctx, { ...d, missing: ["source"], askedSource: true });
  }
  const i = pending.findIndex(needsDollar);
  if (i >= 0) return askDollar(ctx, d, i);
  return savePending(ctx, pending);
}

/** "¿Cómo pagaste?": los medios de pago, con las billeteras por nombre (Mercado Pago, MODO...) */
async function askPayment(ctx: Ctx, d: Draft) {
  const p = d.pending![0];
  await setSession(ctx.phone, "ai:method", d);
  await ctx.out.list(`💳 ¿Cómo pagaste *${formatMoney(p.amount, p.currency)}*?`, "Elegir medio", await paymentRows(ctx.userId), "Medio de pago");
  return true;
}

/**
 * Filas de "¿cómo pagaste?" (se leen con readPayment): efectivo, débito, crédito y las billeteras
 * por nombre. No hay "Transferencia" suelta: una transferencia siempre sale de una billetera.
 */
export async function paymentRows(userId: string): Promise<ListRow[]> {
  // WhatsApp muestra hasta 10 filas: 3 medios + hasta 7 billeteras
  const wallets = (await listPaymentSources(userId)).filter((s) => s.kind === "WALLET").slice(0, 7);
  return [
    { id: "pm:CASH", title: "💵 Efectivo" },
    { id: "pm:DEBIT", title: "💳 Débito" },
    { id: "pm:CREDIT", title: "💳 Crédito" },
    ...wallets.map((s) => ({ id: `src:${s.id}`, title: `📲 ${s.name}` })),
  ];
}

async function receivePayment(ctx: Ctx, input: Input, d: Draft): Promise<boolean> {
  const pending = [...(d.pending ?? [])];
  if (pending.length === 0) return false;
  // Una tarjeta nombrada sin decir crédito es débito, igual que al cargar ("con la visa")
  const answer = readPayment(input, await listPaymentSources(ctx.userId), "DEBIT");
  if (!answer) return askPayment(ctx, d);
  pending[0] = withPayment(pending[0], answer);
  return finishPending(ctx, { ...d, pending });
}

export type PaymentAnswer = { method: PaymentMethodCode; source: { id: string; name: string } | null };

const METHOD_WORDS: Record<string, PaymentMethodCode> = {
  efectivo: "CASH",
  debito: "DEBIT",
  credito: "CREDIT",
  transferencia: "TRANSFER",
};

/**
 * Entiende la respuesta a "¿cómo pagaste?" o "¿con qué tarjeta?": un botón, un medio
 * ("efectivo"), una billetera ("mercado pago" → transferencia) o una tarjeta ("la visa").
 * `cardDefault` es el medio si nombra una tarjeta sin decir débito o crédito. null si no se entiende.
 */
export function readPayment(
  input: Input,
  sources: { id: string; name: string; kind: string }[],
  cardDefault: PaymentMethodCode,
): PaymentAnswer | null {
  const id = input.replyId;
  const text = normalize(input.text ?? "");
  const source = id?.startsWith("src:")
    ? sources.find((s) => s.id === id.slice(4))
    : sources.find((s) => text.includes(normalize(s.name)));
  const byButton = id?.startsWith("pm:") ? (id.slice(3) as PaymentMethodCode) : undefined;
  const said = byButton ?? Object.entries(METHOD_WORDS).find(([w]) => text.split(/\s+/).includes(w))?.[1];

  if (source?.kind === "WALLET") return { method: "TRANSFER", source };
  if (source?.kind === "CARD") {
    const method = said === "DEBIT" || said === "CREDIT" ? said : cardDefault === "CREDIT" ? "CREDIT" : "DEBIT";
    return { method, source };
  }
  return said && said in paymentMethodLabels ? { method: said, source: null } : null;
}

function withPayment(p: PendingExpense, a: PaymentAnswer): PendingExpense {
  return {
    ...p,
    paymentMethod: a.method,
    guessedMethod: false,
    sourceId: a.source?.id ?? null,
    sourceName: a.source?.name ?? null,
    installments: a.method === "CREDIT" ? p.installments : 1,
  };
}

export const DOLLAR_TYPES = Object.keys(dollarTypeLabels) as DollarTypeCode[];

/** Filas de "¿a qué dólar?" (ids "usd:MEP"...; se leen con readDollar) */
export const dollarRows = (): ListRow[] => DOLLAR_TYPES.map((t) => ({ id: `usd:${t}`, title: `Dólar ${dollarTypeLabels[t]}` }));

/** El dólar elegido con el botón o escrito ("el blue", "mep") */
export function readDollar(input: Input): DollarTypeCode | undefined {
  if (input.replyId?.startsWith("usd:")) return DOLLAR_TYPES.find((t) => t === input.replyId!.slice(4));
  const words = normalize(input.text ?? "").split(/\s+/);
  return DOLLAR_TYPES.find((t) => words.includes(normalize(dollarTypeLabels[t])));
}

async function askDollar(ctx: Ctx, d: Draft, i: number) {
  const p = d.pending![i];
  await setSession(ctx.phone, "ai:dollar", d);
  await ctx.out.list(
    `💵 ¿A qué dólar pagaste *${formatMoney(p.amount, "USD")}*${p.description ? ` (${p.description})` : ""}? Con eso lo paso a pesos.`,
    "Elegir dólar",
    dollarRows(),
    "Dólar",
  );
  return true;
}

async function receiveDollar(ctx: Ctx, input: Input, d: Draft): Promise<boolean> {
  const pending = [...(d.pending ?? [])];
  const i = pending.findIndex(needsDollar);
  if (i < 0) return finishPending(ctx, d);

  const type = readDollar(input);
  if (!type) return askDollar(ctx, d, i);
  pending[i] = { ...pending[i], dollarType: type };
  return finishPending(ctx, { ...d, pending });
}

/** Guarda los gastos y responde con lo guardado y el botón Deshacer */
async function savePending(ctx: Ctx, pending: PendingExpense[]): Promise<boolean> {
  await clearSession(ctx.phone);
  const ids: string[] = [];
  const pesos: (number | null)[] = []; // lo que quedó en pesos cada gasto en USD
  const alerts: BudgetAlert[] = [];
  let created = 0;
  let error: string | null = null;
  for (const p of pending) {
    try {
      const expense = await createExpense(
        ctx.userId,
        {
          categoryId: p.categoryId,
          amount: p.amount,
          currency: p.currency,
          paymentMethod: p.paymentMethod,
          paymentSourceId: p.sourceId ?? undefined,
          installments: p.installments ?? 1,
          description: p.description,
          date: p.date,
          ...(p.dollarType ? { dollarType: p.dollarType } : {}),
        },
        ctx.source,
      );
      ids.push(expense.id);
      pesos.push(expense.amountArs);
      created += p.installments ?? 1;
      // Se chequea después de cada uno: si dos gastos juntos cruzan el límite, avisa el que lo cruzó
      const alert = await budgetAlertFor(ctx.userId, expense);
      if (alert) alerts.push(alert);
    } catch (e) {
      // Ej: la categoría se borró mientras tanto, o no hay cotización del dólar elegido
      if (!(e instanceof ExpenseError)) throw e;
      error = e.message;
      break;
    }
  }

  const saved = pending.slice(0, ids.length);
  const title =
    ids.length === 0
      ? "❌ No pude guardarlo"
      : created > saved.length
        ? `✅ Guardado en ${created} cuotas`
        : saved.length === 1
          ? "✅ Gasto guardado"
          : `✅ ${saved.length} gastos guardados`;
  const body = [
    title,
    "",
    ...saved.map((p, i) => {
      const inPesos = p.currency === "USD" && (p.installments ?? 1) === 1 ? pesos[i] : null;
      return describePending(p) + (inPesos !== null ? `\n🇦🇷 Son ${formatMoney(inPesos, "ARS")}` : "");
    }),
    error ? `\n⚠️ ${ids.length > 0 ? "El resto no lo pude guardar" : "Motivo"}: ${error}` : "",
    saved.some((p) => p.guessedMethod)
      ? `\n_El medio de pago lo supuse. Si no es, decime por ej. "${saved.length === 1 ? "el último" : `el de ${formatMoney(saved[0].amount, saved[0].currency)}`} era con efectivo"._`
      : "",
    saved.some((p) => p.currency === "USD" && p.paymentMethod === "CREDIT") ? "_Con crédito va al dólar oficial, como lo cobra el banco._" : "",
  ]
    .filter(Boolean)
    .join("\n");

  // El botón lleva los ids de lo guardado (entran hasta 3 en los 100 caracteres de un botón)
  const undoId = `undo:${ids.join(".")}`;
  if (ids.length > 0 && undoId.length <= 100) {
    await ctx.out.buttons(`${body}${alertLines(alerts)}${BACK}`, [{ id: undoId, title: "↩️ Deshacer" }]);
  } else {
    await ctx.out.text(`${body}${alertLines(alerts)}${BACK}`);
  }
  return true;
}

/** Botón Deshacer: borra lo que se acaba de guardar (con todas sus cuotas) */
async function undoSaved(ctx: Ctx, ids: string[]) {
  await clearSession(ctx.phone);
  let deleted = 0;
  for (const id of ids) {
    try {
      // deleteExpense solo borra gastos de esta persona
      deleted += await deleteExpense(ctx.userId, id, "purchase");
    } catch (e) {
      if (!(e instanceof ExpenseError)) throw e;
    }
  }
  await ctx.out.text(
    deleted > 0
      ? `↩️ Listo, lo deshice: ${deleted === 1 ? "borré el gasto" : `borré ${deleted} gastos`}.${BACK}`
      : `Ya no estaba 🤔 (¿lo borraste desde la web?)${BACK}`,
  );
  return true;
}

function describePending(p: PendingExpense) {
  const cuotas = (p.installments ?? 1) > 1;
  const when = p.date === todayISO() ? "hoy" : shortDate(p.date);
  const dollar =
    p.currency !== "USD" ? null : p.paymentMethod === "CREDIT" ? "💵 Oficial" : p.dollarType ? `💵 ${dollarTypeLabels[p.dollarType]}` : null;
  const lines = [
    `${p.categoryLabel} · *${formatMoney(p.amount, p.currency)}*`,
    [`💳 ${paymentMethodLabels[p.paymentMethod]}`, p.sourceName, dollar, `📅 ${when}`].filter(Boolean).join(" · "),
  ];
  if (cuotas) {
    lines.push(`🧾 ${p.installments} cuotas de ${formatMoney(p.amount / (p.installments ?? 1), p.currency)}`);
  }
  if (p.description) lines.push(`📝 ${p.description}`);
  return lines.join("\n");
}

async function confirmAI(ctx: Ctx, id: string | undefined, text: string, rawText: string, d: Draft) {
  const yes = id === "aiconfirm:yes" || ["si", "guardar", "ok", "dale", "sip", "obvio"].includes(text);
  const no = id === "aiconfirm:no" || ["no", "cancelar", "nada"].includes(text);
  const pending = d.pending ?? [];

  if (!yes && !no) {
    // No dijo ni sí ni no: puede ser una corrección ("con efectivo", "eran 8000", "fue ayer")
    if (rawText && pending.length > 0 && isAiEnabled()) {
      const [cats, sources] = await Promise.all([listCategories(ctx.userId), listPaymentSources(ctx.userId)]);
      const corrected = await parseMessage(
        rawText,
        { categories: cats.map((c) => c.name), sources: sources.map((s) => s.name) },
        pending.map((p) => ({
          amount: p.amount,
          currency: p.currency,
          categoryName: p.categoryLabel.replace(/^\S*\s/, ""), // sin el emoji
          paymentMethod: p.guessedMethod ? null : p.paymentMethod,
          sourceName: p.sourceName ?? null,
          installments: p.installments ?? 1,
          date: p.date,
          description: p.description,
        })),
      );
      if (corrected?.intent === "cargar" && (await proposeExpenses(ctx, corrected.expenses, "Corregido 👇"))) {
        return true;
      }
    }
    await ctx.out.buttons("¿Los guardo?", [
      { id: "aiconfirm:yes", title: "✅ Guardar todos" },
      { id: "aiconfirm:no", title: "❌ Cancelar" },
    ]);
    return true;
  }
  if (no || pending.length === 0) {
    await clearSession(ctx.phone);
    await ctx.out.text(`Dale, no guardé nada 👌${BACK}`);
    return true;
  }
  return finishPending(ctx, d);
}

// ---------- Consultar, eliminar y editar hablando ----------

/** "cuánto gasté en comida este mes" → arma los filtros y manda el resumen */
export async function handleQuery(
  ctx: Ctx,
  q: { period: QueryPeriod; categoryName: string | null; sourceName: string | null; paymentMethod: PaymentMethodCode | null },
) {
  const today = todayISO();
  const [cats, sources] = await Promise.all([listCategories(ctx.userId), listPaymentSources(ctx.userId)]);
  const category = matchByName(cats, q.categoryName);
  const source = matchByName(sources, q.sourceName);

  const periods: Record<QueryPeriod, { title: string; filters: ExpenseFilters }> = {
    hoy: { title: "de hoy", filters: { from: today, to: today } },
    ayer: (() => {
      const y = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      return { title: "de ayer", filters: { from: y, to: y } };
    })(),
    semana: (() => {
      const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
      const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      return { title: "de esta semana", filters: { from: monday, to: today } };
    })(),
    mes: { title: "de este mes", filters: { month: today.slice(0, 7) } },
    mes_pasado: { title: "del mes pasado", filters: { month: shiftMonth(today.slice(0, 7), -1) } },
    todo: { title: "en total", filters: {} },
  };

  const { title, filters } = periods[q.period];
  const extra = [category ? `en ${label(category)}` : "", source ? `con ${source.name}` : ""].filter(Boolean).join(" ");
  await sendSummary(ctx, `${title}${extra ? " " + extra : ""}`, {
    ...filters,
    ...(category ? { categoryId: category.id } : {}),
    ...(source ? { paymentSourceId: source.id } : {}),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
  });
  return true;
}

/** Busca el gasto del que habla la persona entre los últimos 30 */
async function findTarget(ctx: Ctx, target: Target) {
  // Sin cuotas futuras: "el último" es el último que ya pasó, no una cuota de marzo
  const recent = await listExpenses(ctx.userId, { to: todayISO() }, 30);
  if (recent.length === 0) return null;
  if (target.last || (!target.text && !target.amount)) return recent[0];

  const words = normalize(target.text).split(/\s+/).filter((w) => w.length >= 3);
  const scored = recent.map((e) => {
    const haystack = normalize(`${e.category.name} ${e.description ?? ""} ${e.paymentSource?.name ?? ""}`);
    let score = words.filter((w) => haystack.includes(w)).length;
    if (target.amount > 0 && Math.abs(e.amount - target.amount) < 0.01) score += 2;
    return { e, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best.score > 0 ? best.e : null;
}

export async function handleDelete(ctx: Ctx, target: Target) {
  const expense = await findTarget(ctx, target);
  if (!expense) {
    await ctx.out.text(`No encontré ese gasto entre los últimos 🤔${BACK}`);
    return true;
  }
  await askDeleteConfirm(ctx, expense);
  return true;
}

export async function handleEdit(ctx: Ctx, target: Target, changes: Partial<ParsedExpense>) {
  const expense = await findTarget(ctx, target);
  if (!expense) {
    await ctx.out.text(`No encontré ese gasto entre los últimos 🤔${BACK}`);
    return true;
  }

  const [cats, sources] = await Promise.all([listCategories(ctx.userId), listPaymentSources(ctx.userId)]);
  const category = changes.categoryName ? matchByName(cats, changes.categoryName) : null;
  const method = changes.paymentMethod ?? expense.paymentMethod;
  const source = changes.sourceName ? matchByName(sources, changes.sourceName) : null;
  const usableSource = source && source.kind === kindForMethod(method) ? source : null;
  // Si cambia el medio de pago y la tarjeta anterior ya no corresponde, se quita
  const keepsOldSource = expense.paymentSource && kindForMethod(method) === kindForMethod(expense.paymentMethod);

  const values = {
    categoryId: category?.id ?? expense.category.id,
    amount: changes.amount ?? expense.amount,
    currency: changes.currency ?? expense.currency,
    paymentMethod: method,
    paymentSourceId: usableSource?.id ?? (keepsOldSource ? expense.paymentSource!.id : undefined),
    description: changes.description ?? expense.description,
    date: changes.date ?? expense.date,
  };

  const describe = (v: typeof values, sourceName: string | null) =>
    [
      `${category ? label(category) : label(expense.category)} · *${formatMoney(v.amount, v.currency)}*`,
      [`💳 ${paymentMethodLabels[v.paymentMethod]}`, sourceName, `📅 ${shortDate(v.date)}`].filter(Boolean).join(" · "),
      v.description ? `📝 ${v.description}` : "",
    ]
      .filter(Boolean)
      .join("\n");

  const before = expenseLine(expense);
  const after = describe(values, usableSource?.name ?? (keepsOldSource ? expense.paymentSource!.name : null));

  await setSession(ctx.phone, "ai:edit", { edit: { expenseId: expense.id, before, after, values } });
  await ctx.out.buttons(`¿Cambio este gasto?\n\n*Antes*\n${before}\n\n*Después*\n${after}`, [
    { id: "editconfirm:yes", title: "✅ Cambiar" },
    { id: "editconfirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

async function confirmEdit(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const yes = id === "editconfirm:yes" || ["si", "dale", "ok", "cambiar"].includes(text);
  const no = id === "editconfirm:no" || ["no", "cancelar"].includes(text);
  if (!yes && !no) {
    await ctx.out.buttons("¿Lo cambio?", [
      { id: "editconfirm:yes", title: "✅ Cambiar" },
      { id: "editconfirm:no", title: "❌ Cancelar" },
    ]);
    return true;
  }
  const edit = d.edit;
  await clearSession(ctx.phone);
  if (no || !edit) {
    await ctx.out.text(`Listo, lo dejé como estaba 👌${BACK}`);
    return true;
  }
  try {
    await updateExpense(ctx.userId, edit.expenseId, edit.values);
    await ctx.out.text(`✅ Gasto actualizado\n\n${edit.after}${BACK}`);
  } catch {
    await ctx.out.text(`Ese gasto ya no existe 🤔${BACK}`);
  }
  return true;
}
