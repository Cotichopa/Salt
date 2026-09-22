import "server-only";
import { formatMoney, paymentMethodLabels, parseAmount, todayISO, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";
import { listCategories } from "@/lib/services/categories";
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  mostUsedPaymentMethod,
  totalsByCurrency,
  type ExpenseDTO,
  type ExpenseFilters,
} from "@/lib/services/expenses";
import { isAiEnabled, matchCategory, parseWithAI, type ParsedExpense } from "@/lib/whatsapp/ai-parser";
import { sendButtons, sendList, sendText, type ListRow } from "@/lib/whatsapp/client";
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

export type Ctx = { userId: string; name: string; phone: string };
export type Input = { text?: string; replyId?: string };

const BACK = "\n\nEscribí *menu* para volver al menú.";
const NAME = "Chop";
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const label = (c: { emoji: string | null; name: string }) => `${c.emoji ?? ""} ${c.name}`.trim();

// Qué prefijos de botón espera cada estado (para detectar botones viejos de otra conversación)
const expected: Record<string, string[]> = {
  "add:category": ["cat:", "catpage:"],
  "add:currency": ["cur:"],
  "add:method": ["pm:"],
  "add:description": ["desc:"],
  "add:confirm": ["confirm:"],
  query: ["q:"],
  "query:category": ["cat:", "catpage:"],
  "delete:pick": ["del:"],
  "delete:confirm": ["delconfirm:"],
  "ai:confirm": ["aiconfirm:"],
};

// ---------- Menú principal ----------

export async function showMainMenu(ctx: Ctx, intro?: string) {
  await setSession(ctx.phone, "main");
  await sendButtons(ctx.phone, intro ?? `¿Qué hacemos, ${ctx.name}? Soy ${NAME}, decime:`, [
    { id: "menu:add", title: "➕ Cargar gasto" },
    { id: "menu:query", title: "📊 Consultar" },
    { id: "menu:delete", title: "🗑️ Eliminar" },
  ]);
}

/** Procesa una respuesta dentro del menú. Devuelve false si no había nada en curso que la entienda. */
export async function handleMenu(ctx: Ctx, input: Input, session: Session | null): Promise<boolean> {
  const id = input.replyId;
  const text = normalize(input.text ?? "");

  // Los botones del menú principal valen en cualquier momento
  if (id?.startsWith("menu:")) return routeMain(ctx, id.slice(5));
  if (!session && !id) return false;

  if (id && (!session || !expected[session.state]?.some((p) => id.startsWith(p)))) {
    await showMainMenu(ctx, "Esa opción ya venció ⏳ Arranquemos de nuevo:");
    return true;
  }

  if (!session) return false;
  const d = session.data;
  switch (session.state) {
    case "main":
      return routeMain(ctx, { "1": "add", cargar: "add", "2": "query", consultar: "query", "3": "delete", eliminar: "delete" }[text] ?? "");
    case "add:category":
      return pickCategory(ctx, input, d, "add");
    case "add:amount":
      return receiveAmount(ctx, text, d);
    case "add:currency":
      return receiveCurrency(ctx, id, text, d);
    case "add:method":
      return receiveMethod(ctx, id, text, d);
    case "add:description":
      return receiveDescription(ctx, id, input.text ?? "", d);
    case "add:confirm":
      return confirmAdd(ctx, id, text, d);
    case "query":
      return receiveQuery(ctx, id, text);
    case "query:category":
      return pickCategory(ctx, input, d, "query");
    case "delete:pick":
      return pickDelete(ctx, id);
    case "delete:confirm":
      return confirmDelete(ctx, id, text, d);
    case "ai:confirm":
      return confirmAI(ctx, id, text, input.text ?? "", d);
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

async function startAdd(ctx: Ctx) {
  await setSession(ctx.phone, "add:category", { page: 0 });
  await sendCategoryList(ctx, 0, "🏷️ ¿En qué categoría? Elegila de la lista o escribí el nombre.");
}

const PAGE = 9; // 9 categorías + 1 fila de "ver más" = 10, el máximo de WhatsApp

async function sendCategoryList(ctx: Ctx, page: number, body: string) {
  const cats = await listCategories(ctx.userId);
  const rows: ListRow[] = cats.map((c) => ({ id: `cat:${c.id}`, title: label(c) }));
  if (rows.length <= 10) return sendList(ctx.phone, body, "Ver categorías", rows, "Categorías");

  const pages = Math.ceil(rows.length / PAGE);
  const current = page % pages;
  const pageRows = rows.slice(current * PAGE, current * PAGE + PAGE);
  const next = (current + 1) % pages;
  pageRows.push({ id: `catpage:${next}`, title: next === 0 ? "⬅️ Volver al principio" : "➡️ Ver más categorías" });
  return sendList(ctx.phone, body, "Ver categorías", pageRows, `Categorías (${current + 1}/${pages})`);
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
  if (!cat && input.text) {
    // Escrita a mano: buscamos por nombre o por palabra clave, sin importar tildes ni mayúsculas
    const t = normalize(input.text);
    cat =
      cats.find((c) => normalize(c.name) === t) ??
      cats.find((c) => c.keywords.includes(t)) ??
      cats.find((c) => normalize(c.name).startsWith(t) && t.length >= 3);
  }
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
  await sendText(ctx.phone, `💰 ¿Cuánto gastaste en ${next.categoryLabel}?\n(ej: 15000 o 15.000,50)`);
  return true;
}

async function receiveAmount(ctx: Ctx, text: string, d: Draft) {
  const amount = parseAmount(text);
  if (!amount || amount <= 0 || amount >= 1_000_000_000_000) {
    await sendText(ctx.phone, "Ese monto no lo agarro 🤔 Escribilo solo con números, por ejemplo: 15000 o 15.000,50");
    return true;
  }
  await setSession(ctx.phone, "add:currency", { ...d, amount });
  await sendButtons(ctx.phone, `¿En qué moneda son los ${text}?`, [
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
    await sendButtons(ctx.phone, "Elegí la moneda:", [
      { id: "cur:ARS", title: "🇦🇷 Pesos" },
      { id: "cur:USD", title: "🇺🇸 Dólares" },
    ]);
    return true;
  }
  await setSession(ctx.phone, "add:method", { ...d, currency });
  await sendMethodList(ctx, "💳 ¿Cómo pagaste?");
  return true;
}

function sendMethodList(ctx: Ctx, body: string) {
  const rows = (Object.keys(paymentMethodLabels) as PaymentMethodCode[]).map((m) => ({
    id: `pm:${m}`,
    title: paymentMethodLabels[m],
  }));
  return sendList(ctx.phone, body, "Medios de pago", rows, "Medio de pago");
}

async function receiveMethod(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const byText = (Object.keys(paymentMethodLabels) as PaymentMethodCode[]).find(
    (m) => normalize(paymentMethodLabels[m]) === text || (text.length >= 4 && normalize(paymentMethodLabels[m]).startsWith(text)),
  );
  const method = (id?.startsWith("pm:") ? (id.slice(3) as PaymentMethodCode) : byText) ?? null;
  if (!method || !(method in paymentMethodLabels)) {
    await sendMethodList(ctx, "Elegí el medio de pago de la lista:");
    return true;
  }
  await setSession(ctx.phone, "add:description", { ...d, paymentMethod: method });
  await sendButtons(ctx.phone, "📝 ¿Querés agregar una descripción? Escribila, o tocá el botón.", [
    { id: "desc:none", title: "Sin descripción" },
  ]);
  return true;
}

async function receiveDescription(ctx: Ctx, id: string | undefined, rawText: string, d: Draft) {
  const description = id === "desc:none" ? null : rawText.trim().slice(0, 200) || null;
  const next = { ...d, description, date: todayISO() };
  await setSession(ctx.phone, "add:confirm", next);
  await sendButtons(ctx.phone, `¿Guardo este gasto?\n\n${describeDraft(next)}`, [
    { id: "confirm:yes", title: "✅ Guardar" },
    { id: "confirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

function describeDraft(d: Draft) {
  const lines = [
    `${d.categoryLabel} · *${formatMoney(d.amount ?? 0, d.currency ?? "ARS")}*`,
    `💳 ${paymentMethodLabels[d.paymentMethod ?? "CASH"]} · 📅 ${d.date === todayISO() ? "hoy" : shortDate(d.date ?? todayISO())}`,
  ];
  if (d.description) lines.push(`📝 ${d.description}`);
  return lines.join("\n");
}

async function confirmAdd(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const yes = id === "confirm:yes" || ["si", "guardar", "ok", "dale"].includes(text);
  const no = id === "confirm:no" || ["no", "cancelar"].includes(text);
  if (!yes && !no) {
    await sendButtons(ctx.phone, "¿Lo guardo?", [
      { id: "confirm:yes", title: "✅ Guardar" },
      { id: "confirm:no", title: "❌ Cancelar" },
    ]);
    return true;
  }
  await clearSession(ctx.phone);
  if (no) {
    await sendText(ctx.phone, `Dale, no guardé nada 👌${BACK}`);
    return true;
  }
  await createExpense(
    ctx.userId,
    {
      categoryId: d.categoryId!,
      amount: d.amount!,
      currency: d.currency ?? "ARS",
      paymentMethod: d.paymentMethod ?? "CASH",
      description: d.description ?? null,
      date: d.date ?? todayISO(),
    },
    "WHATSAPP",
  );
  await sendText(ctx.phone, `✅ Gasto guardado\n\n${describeDraft(d)}${BACK}`);
  return true;
}

// ---------- Consultar ----------

async function showQueryMenu(ctx: Ctx) {
  await setSession(ctx.phone, "query");
  await sendList(ctx.phone, "📊 ¿Qué querés ver?", "Ver opciones", [
    { id: "q:today", title: "Hoy" },
    { id: "q:week", title: "Esta semana", description: "Desde el lunes" },
    { id: "q:month", title: "Este mes" },
    { id: "q:lastmonth", title: "Mes pasado" },
    { id: "q:category", title: "Por categoría", description: "Este mes, en una categoría" },
  ]);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

async function receiveQuery(ctx: Ctx, id: string | undefined, text: string) {
  const today = todayISO();
  const option = id?.slice(2) ?? { hoy: "today", semana: "week", mes: "month", categoria: "category" }[text];

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
  } else await showQueryMenu(ctx);
  return true;
}

async function sendSummary(ctx: Ctx, title: string, filters: ExpenseFilters) {
  await clearSession(ctx.phone);
  const expenses = await listExpenses(ctx.userId, filters);
  if (expenses.length === 0) {
    await sendText(ctx.phone, `No tenés gastos ${title} 🙌${BACK}`);
    return;
  }

  const totals = totalsByCurrency(expenses);
  const totalText = (["ARS", "USD"] as const)
    .filter((c) => totals[c] > 0)
    .map((c) => formatMoney(totals[c], c))
    .join(" + ");

  // Suma por categoría (separando monedas), de mayor a menor
  const byCat = new Map<string, number>();
  for (const e of expenses) {
    const key = `${label(e.category)}|${e.currency}`;
    byCat.set(key, (byCat.get(key) ?? 0) + e.amount);
  }
  const catLines = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, total]) => {
      const [name, currency] = key.split("|");
      return `${name}: ${formatMoney(total, currency as "ARS" | "USD")}`;
    });

  const lastLines = expenses.slice(0, 5).map(expenseLine);

  await sendText(
    ctx.phone,
    [
      `📊 *Gastos ${title}*`,
      `Total: *${totalText}* (${expenses.length} ${expenses.length === 1 ? "gasto" : "gastos"})`,
      // Si hay una sola categoría, el desglose repetiría el total
      ...(catLines.length > 1 ? ["", "*Por categoría*", ...catLines] : []),
      "",
      "*Últimos*",
      ...lastLines,
    ].join("\n") + BACK,
  );
}

function expenseLine(e: ExpenseDTO) {
  return `• ${shortDate(e.date)} ${label(e.category)} ${formatMoney(e.amount, e.currency)}${e.description ? ` — ${e.description}` : ""}`;
}

// ---------- Eliminar ----------

async function showDeleteList(ctx: Ctx) {
  const last = await listExpenses(ctx.userId, {}, 10);
  if (last.length === 0) {
    await clearSession(ctx.phone);
    await sendText(ctx.phone, `No tenés gastos para eliminar.${BACK}`);
    return;
  }
  await setSession(ctx.phone, "delete:pick");
  await sendList(
    ctx.phone,
    "🗑️ ¿Cuál querés eliminar? Estos son tus últimos gastos:",
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
export async function startDeleteLast(ctx: Ctx) {
  const [last] = await listExpenses(ctx.userId, {}, 1);
  if (!last) {
    await sendText(ctx.phone, `No tenés gastos para eliminar.${BACK}`);
    return;
  }
  await askDeleteConfirm(ctx, last);
}

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
  await sendButtons(ctx.phone, `¿Elimino este gasto?\n\n${expenseLine(e)}`, [
    { id: "delconfirm:yes", title: "🗑️ Sí, eliminar" },
    { id: "delconfirm:no", title: "Cancelar" },
  ]);
}

async function confirmDelete(ctx: Ctx, id: string | undefined, text: string, d: Draft) {
  const yes = id === "delconfirm:yes" || ["si", "eliminar", "borrar"].includes(text);
  const no = id === "delconfirm:no" || ["no", "cancelar"].includes(text);
  if (!yes && !no) {
    await sendButtons(ctx.phone, "¿Lo elimino?", [
      { id: "delconfirm:yes", title: "🗑️ Sí, eliminar" },
      { id: "delconfirm:no", title: "Cancelar" },
    ]);
    return true;
  }
  await clearSession(ctx.phone);
  if (no || !d.expenseId) {
    await sendText(ctx.phone, `Tranqui, no eliminé nada 👌${BACK}`);
    return true;
  }
  try {
    await deleteExpense(ctx.userId, d.expenseId);
    await sendText(ctx.phone, `🗑️ Listo, lo eliminé.${BACK}`);
  } catch {
    await sendText(ctx.phone, `Ese gasto ya no existe (¿lo borraste desde la web?).${BACK}`);
  }
  return true;
}

// ---------- Texto libre interpretado por la IA ----------

/**
 * Convierte lo que entendió la IA en gastos concretos (categoría y medio de pago del
 * usuario) y los deja pendientes de confirmación. Devuelve false si ninguno era válido.
 */
export async function proposeExpenses(ctx: Ctx, parsed: ParsedExpense[], heading?: string) {
  const cats = await listCategories(ctx.userId);
  const fallbackMethod = await mostUsedPaymentMethod(ctx.userId);

  const pending: PendingExpense[] = [];
  for (const p of parsed) {
    const cat = matchCategory(cats, p.categoryName);
    if (!cat) continue;
    pending.push({
      categoryId: cat.id,
      categoryLabel: label(cat),
      amount: p.amount,
      currency: p.currency,
      paymentMethod: p.paymentMethod ?? fallbackMethod,
      description: p.description,
      date: p.date,
      guessedMethod: p.paymentMethod === null,
    });
  }
  if (pending.length === 0) return false;

  await setSession(ctx.phone, "ai:confirm", { pending });
  const body = [
    heading ?? (pending.length === 1 ? "Entendí esto 👇" : `Entendí ${pending.length} gastos 👇`),
    "",
    ...pending.map(describePending),
    "",
    pending.some((p) => p.guessedMethod) ? "_El medio de pago lo supuse: revisalo._" : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendButtons(ctx.phone, body, [
    { id: "aiconfirm:yes", title: pending.length === 1 ? "✅ Guardar" : "✅ Guardar todos" },
    { id: "aiconfirm:no", title: "❌ Cancelar" },
  ]);
  return true;
}

function describePending(p: PendingExpense) {
  const when = p.date === todayISO() ? "hoy" : shortDate(p.date);
  const desc = p.description ? ` — ${p.description}` : "";
  return `${p.categoryLabel} · *${formatMoney(p.amount, p.currency)}* · ${paymentMethodLabels[p.paymentMethod]} · ${when}${desc}`;
}

async function confirmAI(ctx: Ctx, id: string | undefined, text: string, rawText: string, d: Draft) {
  const yes = id === "aiconfirm:yes" || ["si", "guardar", "ok", "dale", "sip", "obvio"].includes(text);
  const no = id === "aiconfirm:no" || ["no", "cancelar", "nada"].includes(text);
  const pending = d.pending ?? [];

  if (!yes && !no) {
    // No dijo ni sí ni no: puede ser una corrección ("con efectivo", "eran 8000", "fue ayer")
    if (rawText && pending.length > 0 && isAiEnabled()) {
      const cats = await listCategories(ctx.userId);
      const corrected = await parseWithAI(
        rawText,
        cats.map((c) => c.name),
        pending.map((p) => ({
          amount: p.amount,
          currency: p.currency,
          categoryName: p.categoryLabel.replace(/^\S*\s/, ""), // sin el emoji
          paymentMethod: p.guessedMethod ? null : p.paymentMethod,
          date: p.date,
          description: p.description,
        })),
      );
      if (corrected?.length && (await proposeExpenses(ctx, corrected, "Corregido 👇"))) return true;
    }
    await sendButtons(ctx.phone, "¿Los guardo?", [
      { id: "aiconfirm:yes", title: "✅ Guardar" },
      { id: "aiconfirm:no", title: "❌ Cancelar" },
    ]);
    return true;
  }
  await clearSession(ctx.phone);
  if (no || pending.length === 0) {
    await sendText(ctx.phone, `Dale, no guardé nada 👌${BACK}`);
    return true;
  }
  for (const p of pending) {
    await createExpense(
      ctx.userId,
      {
        categoryId: p.categoryId,
        amount: p.amount,
        currency: p.currency,
        paymentMethod: p.paymentMethod,
        description: p.description,
        date: p.date,
      },
      "WHATSAPP",
    );
  }
  const title = pending.length === 1 ? "✅ Gasto guardado" : `✅ ${pending.length} gastos guardados`;
  await sendText(ctx.phone, `${title}\n\n${pending.map(describePending).join("\n")}${BACK}`);
  return true;
}
