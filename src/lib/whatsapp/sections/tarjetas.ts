import "server-only";
import { z } from "zod";
import { formatMoney, paymentMethodLabels, todayISO } from "@/lib/format";
import { normalize } from "@/lib/text";
import {
  currentStatementMonth,
  getStatement,
  installmentPurchases,
  markStatementPaid,
  shiftMonth,
  StatementError,
  unmarkStatementPaid,
  type Statement,
} from "@/lib/services/card-statements";
import { listExpenses } from "@/lib/services/expenses";
import {
  createPaymentSource,
  deletePaymentSource,
  listPaymentSources,
  listWithUsage,
  PaymentSourceError,
  updatePaymentSource,
} from "@/lib/services/payment-sources";
import { listRecurring } from "@/lib/services/recurring";
import { askModel, isAiEnabled, matchByName, MAX_CHARS, saidDay, todayLine } from "@/lib/whatsapp/ai-parser";
import { BACK, shortDate, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askConfirm, askFollowup } from "@/lib/whatsapp/sections/confirm";
import { clearSession, setSession, type Draft } from "@/lib/whatsapp/session";

// Tarjetas y billeteras por Chop: el resumen de una tarjeta ("¿cuánto me viene en la Visa?"),
// marcarlo como pagado, los días de cierre y vencimiento, agregar una tarjeta o billetera, y
// "¿qué tengo que pagar?" (resúmenes y gastos fijos que faltan pagar este mes).
// Igual que fijos.ts: la IA principal solo detecta la sección y acá va una segunda llamada chica.

type Source = Awaited<ReturnType<typeof listPaymentSources>>[number];

// ---------- La IA de esta sección ----------

const cardSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("pagar") }),
  z.object({ accion: z.literal("resumen"), tarjeta: z.string() }),
  z.object({ accion: z.literal("pagado"), tarjeta: z.string() }),
  z.object({ accion: z.literal("fechas"), tarjeta: z.string(), cierre: z.number().optional(), vence: z.number().optional() }),
  z.object({
    accion: z.literal("crear"),
    nombre: z.string().optional(), // sin nombre: se pregunta
    tipo: z.enum(["tarjeta", "billetera"]).optional(),
    cierre: z.number().optional(),
    vence: z.number().optional(),
  }),
  z.object({ accion: z.literal("otro"), pregunta: z.string().optional() }),
]);
export type CardParsed = z.infer<typeof cardSchema>;

const SYSTEM = `Sos Chop, el asistente de la app de gastos Salt (Argentina). El mensaje es sobre TARJETAS o BILLETERAS. Respondé SOLO un objeto JSON, sin texto alrededor, con una de estas formas (omití las claves que no apliquen):
{"accion":"pagar"}
{"accion":"resumen","tarjeta":"Visa"}
{"accion":"pagado","tarjeta":"Visa"}
{"accion":"fechas","tarjeta":"Visa","cierre":25,"vence":7}
{"accion":"crear","nombre":"Galicia","tipo":"tarjeta","cierre":25,"vence":7}
{"accion":"otro","pregunta":"¿De qué tarjeta?"}

- pagar: qué tiene que pagar, qué le vence, qué debe este mes.
- resumen: cuánto le viene, cuánto tiene que pagar o cuándo vence UNA tarjeta.
- pagado: avisa que pagó el resumen de una tarjeta ("pagué la visa").
- fechas: los días del mes en que cierra y vence una tarjeta que ya está en la lista ("la visa cierra el 25"). Solo los días que dice.
- crear: agregar una tarjeta o billetera NUEVA, que no está en la lista (nombre corto, como lo escribe). tipo solo si lo dice.
- tarjeta: nombre EXACTO de la lista de tarjetas (la más parecida).`;

/** Interpreta un mensaje sobre tarjetas (segunda llamada). null si la IA no está o falló. */
export async function parseCards(text: string, sources: string[]): Promise<CardParsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;
  const content = [todayLine(), `Tarjetas y billeteras: ${sources.join(", ") || "(ninguna)"}.`, `\nMensaje: "${text}"`].join("\n");
  return askModel(SYSTEM, content, cardSchema, "ai-tarjetas");
}

/** Mensaje de tarjetas escrito a mano → lo interpreta y actúa. false si la IA no respondió. */
export async function handleCards(ctx: Ctx, text: string): Promise<boolean> {
  const sources = await listPaymentSources(ctx.userId);
  const p = await parseCards(text, sources.map((s) => s.name));
  if (!p) return false;

  switch (p.accion) {
    case "pagar":
      return showWhatToPay(ctx);
    case "otro":
      if (p.pregunta) return askFollowup(ctx, "tarjeta", text, p.pregunta, `\n\n${EXAMPLES}${BACK}`);
      await ctx.out.text(`No entendí qué querés hacer con las tarjetas 🤔\n\n${EXAMPLES}${BACK}`);
      return true;
    case "crear": {
      // "la visa cierra el 25" a veces viene como crear: si ya la tenés y trae días, es un cambio de días
      const existing = findCard(sources, p.nombre ?? "");
      if (existing && (p.cierre || p.vence)) return askDates(ctx, text, existing, saidDay(text, p.cierre), saidDay(text, p.vence));
      return askCreate(ctx, text, p, sources);
    }
  }
  const card = findCard(sources, p.tarjeta);
  if (!card) {
    const names = sources.filter((s) => s.kind === "CARD").map((s) => s.name).join(", ");
    await ctx.out.text(`No encontré la tarjeta "${p.tarjeta}" 🤔${names ? `\nTus tarjetas: ${names}.` : ""}${BACK}`);
    return true;
  }
  if (p.accion === "resumen") return showStatement(ctx, card);
  if (p.accion === "pagado") return askMarkPaid(ctx, card);
  return askDates(ctx, text, card, saidDay(text, p.cierre), saidDay(text, p.vence));
}

const EXAMPLES =
  '_Podés decirme: "¿cuánto me viene en la Visa?", "pagué la Visa", "la Visa cierra el 25 y vence el 7" o "¿qué tengo que pagar?"._';

/** Solo tarjetas (las billeteras no tienen resumen) */
function findCard(sources: Source[], name: string | undefined) {
  return matchByName(
    sources.filter((s) => s.kind === "CARD"),
    name ?? null,
  );
}

/** Atajos sin IA (los arma quick-parser.ts) */
export async function handleCardsQuick(ctx: Ctx, action: "pagar" | "resumen", name?: string): Promise<boolean> {
  if (action === "pagar") return showWhatToPay(ctx);
  const card = findCard(await listPaymentSources(ctx.userId), name);
  return card ? showStatement(ctx, card) : false;
}

// ---------- Resumen de una tarjeta ----------

const STATUS: Record<Statement["status"], string> = {
  abierto: "🟢 abierto (todavía suma gastos)",
  "a pagar": "🟡 a pagar",
  vencido: "🔴 vencido, sin marcar como pagado",
  pagado: "✅ pagado",
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];

/** "$ 200.000 + USD 30 (≈ $ 45.000 al oficial)" */
function statementAmounts(s: Statement) {
  if (s.usd === 0) return formatMoney(s.ars, "ARS");
  const usd = `${formatMoney(s.usd, "USD")}${s.usdInPesos !== null ? ` (≈ ${formatMoney(s.usdInPesos, "ARS")} al oficial)` : ""}`;
  return s.ars > 0 ? `${formatMoney(s.ars, "ARS")} + ${usd}` : usd;
}

/**
 * Los resúmenes ya cerrados que falta pagar (a pagar o vencidos), del más nuevo al más viejo.
 * Mira los dos últimos (por si quedó uno vencido sin marcar como pagado).
 */
async function unpaidStatements(userId: string, cardId: string): Promise<Statement[]> {
  const open = await currentStatementMonth(userId, cardId);
  if (!open) return [];
  const unpaid: Statement[] = [];
  for (const month of [shiftMonth(open, -1), shiftMonth(open, -2)]) {
    const s = await getStatement(userId, cardId, month);
    if (s?.configured && (s.status === "a pagar" || s.status === "vencido") && s.expenses.length > 0) unpaid.push(s);
  }
  return unpaid;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Botones para marcar pagado cada resumen pendiente (valen en cualquier momento, como Deshacer) */
const payButtons = (card: Source, unpaid: Statement[]) =>
  unpaid.map((s) => ({
    id: `pay:${card.id}:${s.month}`,
    title: unpaid.length === 1 ? "✅ Marcar pagado" : `✅ Pagado ${monthName(s.month)}`,
  }));

export async function showStatement(ctx: Ctx, card: Source): Promise<boolean> {
  // El que hay que pagar ahora (el último cerrado sin pagar) o, si no hay, el que está abierto
  const unpaid = card.closingDay ? await unpaidStatements(ctx.userId, card.id) : [];
  const open = card.closingDay && unpaid.length === 0 ? await currentStatementMonth(ctx.userId, card.id) : null;
  const opened = open ? await getStatement(ctx.userId, card.id, open) : null;
  const s = unpaid[0] ?? (opened?.configured ? opened : null);
  if (!s) {
    // Sin días configurados no hay resumen: lo gastado con crédito este mes
    const expenses = await listExpenses(ctx.userId, { month: todayISO().slice(0, 7), paymentSourceId: card.id, paymentMethod: "CREDIT" });
    const total = expenses.reduce((sum, e) => sum + (e.amountArs ?? 0), 0);
    await ctx.out.text(
      [
        `💳 *${card.name}*`,
        expenses.length > 0 ? `Este mes gastaste *${formatMoney(total, "ARS")}* con crédito (${expenses.length} gastos).` : "Este mes no tiene gastos con crédito.",
        "",
        `_Para ver el resumen, decime en qué día cierra y vence: "la ${card.name} cierra el 25 y vence el 7"._`,
      ].join("\n") + BACK,
    );
    return true;
  }

  const { purchases } = await installmentPurchases(ctx.userId, card.id, s.from, s.closing);
  const cuotas = purchases.slice(0, 5).map((p) => {
    const left = p.leftCount > 0 ? ` · quedan ${formatMoney(p.leftAmount, p.currency)}` : " · última";
    return `• ${p.description ?? p.category.name} ${p.installment}/${p.installments}${left}`;
  });
  const older = unpaid.slice(1).map((o) => `⚠️ El resumen de ${monthName(o.month)} (venció el ${shortDate(o.due)}) también figura sin pagar.`);
  const body = [
    `💳 *${card.name}* — resumen de ${monthName(s.month)}`,
    STATUS[s.status],
    `Cierra ${shortDate(s.closing)} · vence ${shortDate(s.due)}`,
    "",
    s.payment
      ? `Pagaste *${formatMoney(s.payment.totalArs, "ARS")}*${s.payment.totalUsd > 0 ? ` + ${formatMoney(s.payment.totalUsd, "USD")}` : ""} el ${shortDate(s.payment.paidOn)}`
      : `Total: *${formatMoney(s.total, "ARS")}*${s.usd > 0 ? `\n${statementAmounts(s)}` : ""}${s.rate?.estimated ? " _(estimado)_" : ""}`,
    `${s.expenses.length} ${s.expenses.length === 1 ? "gasto" : "gastos"}`,
    ...(cuotas.length > 0 ? ["", "*Cuotas*", ...cuotas] : []),
    ...(older.length > 0 ? ["", ...older] : []),
  ].join("\n");

  if (unpaid.length > 0) await ctx.out.buttons(body + BACK, payButtons(card, unpaid));
  else await ctx.out.text(body + BACK);
  return true;
}

// ---------- Marcar pagado ----------

export async function askMarkPaid(ctx: Ctx, card: Source, month?: string): Promise<boolean> {
  if (!card.closingDay) {
    await ctx.out.text(
      `La *${card.name}* no tiene días de cierre y vencimiento, así que no tiene resumen 🤔\n_Decime por ej. "la ${card.name} cierra el 25 y vence el 7"._${BACK}`,
    );
    return true;
  }
  let s: Statement | null = null;
  if (month) {
    const found = await getStatement(ctx.userId, card.id, month);
    s = found?.configured ? found : null;
  } else {
    const unpaid = await unpaidStatements(ctx.userId, card.id);
    if (unpaid.length > 1) {
      // Dos pendientes: que elija cuál pagó
      await ctx.out.buttons(
        `La *${card.name}* tiene ${unpaid.length} resúmenes sin marcar como pagados. ¿Cuál pagaste?`,
        unpaid.map((u) => ({ id: `pay:${card.id}:${u.month}`, title: `${capitalize(monthName(u.month))} (${shortDate(u.due)})` })),
      );
      return true;
    }
    if (unpaid.length === 1) s = unpaid[0];
    else {
      // Ninguno pendiente: ¿ya está pagado, o todavía no cerró?
      const open = await currentStatementMonth(ctx.userId, card.id);
      const last = open ? await getStatement(ctx.userId, card.id, shiftMonth(open, -1)) : null;
      const current = open ? await getStatement(ctx.userId, card.id, open) : null;
      s = last?.configured && last.status === "pagado" ? last : current?.configured ? current : null;
    }
  }
  if (!s) {
    await ctx.out.text(`No encontré ese resumen 🤔${BACK}`);
    return true;
  }
  if (s.status === "pagado") {
    await ctx.out.text(`El resumen de ${monthName(s.month)} de la *${card.name}* ya está pagado 👌${BACK}`);
    return true;
  }
  if (s.status === "abierto") {
    await ctx.out.text(`El resumen de la *${card.name}* todavía no cerró (cierra el ${shortDate(s.closing)}) 🤔${BACK}`);
    return true;
  }
  if (s.usd > 0 && s.usdInPesos === null) {
    await ctx.out.text(`No conseguí la cotización del dólar para ese resumen 😕 Marcalo desde la web.${BACK}`);
    return true;
  }
  const head = `✅ ¿Marco como pagado el resumen de ${monthName(s.month)} de la *${card.name}* (vence ${shortDate(s.due)})?`;
  const data = { cardId: card.id, cardName: card.name, month: s.month };
  if (s.usd === 0) {
    return askConfirm(ctx, {
      type: "card:paid",
      data,
      body: `${head}\n\nTotal: *${formatMoney(s.ars, "ARS")}*`,
      options: [{ id: "ars", title: "✅ Marcar pagado", words: ["pagado", "marcar"] }],
    });
  }
  return askConfirm(ctx, {
    type: "card:paid",
    data,
    body: [
      head,
      "",
      statementAmounts(s),
      "",
      `¿Los ${formatMoney(s.usd, "USD")} los pagaste en pesos (total *${formatMoney(s.total, "ARS")}*) o en dólares?`,
    ].join("\n"),
    options: [
      { id: "ars", title: "En pesos", words: ["pesos"] },
      { id: "usd", title: "En dólares", words: ["dolares", "dolar", "usd"] },
    ],
  });
}

async function markPaid(ctx: Ctx, data: Record<string, unknown>, option: string) {
  const { cardId, cardName, month } = data as { cardId: string; cardName: string; month: string };
  const s = await getStatement(ctx.userId, cardId, month);
  if (!s?.configured) return ctx.out.text(`Esa tarjeta ya no existe 🤔${BACK}`);
  const inPesos = option !== "usd";
  // Como en la web: pagado hoy, con el total estimado (los dólares al oficial si se pagaron en pesos)
  const totalArs = inPesos ? s.total : s.ars;
  await markStatementPaid(ctx.userId, cardId, month, {
    paidOn: todayISO(),
    usdPaidIn: inPesos ? "ARS" : "USD",
    rate: inPesos ? s.rate?.sell : undefined,
    totalArs,
  });
  const paid = [formatMoney(totalArs, "ARS"), !inPesos && s.usd > 0 ? formatMoney(s.usd, "USD") : ""].filter(Boolean).join(" + ");
  await ctx.out.buttons(
    `✅ Marqué pagado el resumen de ${monthName(month)} de la *${cardName}*: ${paid}.\n_Si el banco cobró otro número, corregilo en la web._${BACK}`,
    [{ id: `unpay:${cardId}:${month}`, title: "↩️ Deshacer" }],
  );
}

/** Botón Deshacer del "pagado" */
export async function undoPaid(ctx: Ctx, cardId: string, month: string) {
  try {
    await unmarkStatementPaid(ctx.userId, cardId, month);
    await ctx.out.text(`↩️ Listo, el resumen de ${monthName(month)} volvió a quedar sin pagar.${BACK}`);
  } catch (e) {
    if (!(e instanceof StatementError)) throw e;
    await ctx.out.text(`Esa tarjeta ya no existe 🤔${BACK}`);
  }
  return true;
}

/** Botón "Marcar pagado" del resumen (vale en cualquier momento) */
export async function markPaidButton(ctx: Ctx, cardId: string, month: string) {
  const card = (await listPaymentSources(ctx.userId)).find((s) => s.id === cardId && s.kind === "CARD");
  if (!card) {
    await ctx.out.text(`Esa tarjeta ya no existe 🤔${BACK}`);
    return true;
  }
  return askMarkPaid(ctx, card, month);
}

// ---------- Días de cierre y vencimiento ----------

function askDates(ctx: Ctx, text: string, card: Source, closing?: number, due?: number) {
  // Si dice uno solo, el otro queda como estaba (si ya tenía)
  const closingDay = closing ?? card.closingDay ?? undefined;
  const dueDay = due ?? card.dueDay ?? undefined;
  if (!closingDay || !dueDay) {
    return askFollowup(ctx, "tarjeta", text, `📅 ¿Qué día cierra y qué día vence la *${card.name}*? (ej: 25 y 7)`, BACK);
  }
  if (closingDay === card.closingDay && dueDay === card.dueDay) {
    return ctx.out.text(`La *${card.name}* ya cierra el ${closingDay} y vence el ${dueDay} 👌${BACK}`).then(() => true);
  }
  const before = card.closingDay ? `cierre ${card.closingDay} · vence ${card.dueDay}` : "sin días";
  return askConfirm(ctx, {
    type: "card:dates",
    data: { cardId: card.id, closingDay, dueDay },
    body: `📅 ¿Cambio los días de la *${card.name}*?\n\nAntes: ${before}\nAhora: *cierre ${closingDay} · vence ${dueDay}*`,
    options: [{ id: "yes", title: "✅ Cambiar", words: ["cambiar", "cambialo"] }],
  });
}

async function saveDates(ctx: Ctx, data: Record<string, unknown>) {
  const { cardId, closingDay, dueDay } = data as { cardId: string; closingDay: number; dueDay: number };
  const card = (await listPaymentSources(ctx.userId)).find((s) => s.id === cardId);
  if (!card) return ctx.out.text(`Esa tarjeta ya no existe 🤔${BACK}`);
  await updatePaymentSource(ctx.userId, cardId, { name: card.name, kind: "CARD", closingDay, dueDay });
  await ctx.out.text(`✅ Listo: la *${card.name}* cierra el ${closingDay} y vence el ${dueDay}. Ya podés preguntarme "¿cuánto me viene en la ${card.name}?".${BACK}`);
}

// ---------- Agregar una tarjeta o billetera ----------

function askCreate(ctx: Ctx, text: string, p: Extract<CardParsed, { accion: "crear" }>, sources: Source[]) {
  const typed = (p.nombre ?? "").trim().replace(/^(la|el|una?)\s+/i, "").slice(0, 30);
  // "brubank" → "Brubank" (si lo escribió todo en minúscula)
  const name = typed === typed.toLowerCase() ? capitalize(typed) : typed;
  const t = normalize(text);
  if (name.length < 2 || !t.includes(normalize(name))) {
    return askFollowup(ctx, "tarjeta", text, "➕ ¿Cómo se llama la tarjeta o billetera que querés agregar?", BACK);
  }
  const clash = sources.find((s) => normalize(s.name) === normalize(name));
  if (clash) return ctx.out.text(`Ya tenés *${clash.name}* 👌${BACK}`).then(() => true);

  // El tipo, solo si lo dice ("tarjeta" / "billetera"); si no, se elige con los botones
  const kind = t.includes("billetera") ? "WALLET" : t.includes("tarjeta") ? "CARD" : null;
  const closingDay = saidDay(text, p.cierre);
  const dueDay = saidDay(text, p.vence);
  return confirmCreate(ctx, name, kind, kind === "CARD" && closingDay && dueDay ? { closingDay, dueDay } : {});
}

type Days = { closingDay?: number; dueDay?: number };

/** "¿Agrego la tarjeta X?" (sin tipo: se elige con los botones Tarjeta / Billetera) */
function confirmCreate(ctx: Ctx, name: string, kind: "CARD" | "WALLET" | null, days: Days) {
  const data = { name, ...days };
  if (!kind) {
    return askConfirm(ctx, {
      type: "card:create",
      data,
      body: `➕ ¿Agrego *${name}*? ¿Es una tarjeta o una billetera virtual?`,
      options: [
        { id: "CARD", title: "💳 Tarjeta", words: ["tarjeta"] },
        { id: "WALLET", title: "📲 Billetera", words: ["billetera"] },
      ],
    });
  }
  return askConfirm(ctx, {
    type: "card:create",
    data,
    body: `➕ ¿Agrego la ${kind === "CARD" ? "tarjeta" : "billetera"} *${name}*?${days.closingDay ? `\nCierra el ${days.closingDay} y vence el ${days.dueDay}.` : ""}`,
    options: [{ id: kind, title: "✅ Agregar", words: ["agregar", "agregala"] }],
  });
}

// ---------- Agregar con los botones del menú ----------

/** "Agregar → Tarjeta o billetera": qué es, cómo se llama y (si es tarjeta) sus días */
export async function startSourceGuided(ctx: Ctx) {
  await setSession(ctx.phone, "card:new", { newSource: {} });
  await ctx.out.buttons("➕ ¿Qué querés agregar?", [
    { id: "ck:CARD", title: "💳 Tarjeta" },
    { id: "ck:WALLET", title: "📲 Billetera" },
  ]);
  return true;
}

const NO_DAYS = [{ id: "ck:nodays", title: "Sin días por ahora" }];

export async function receiveNewSource(ctx: Ctx, input: Input, d: Draft): Promise<boolean> {
  const n = { ...(d.newSource ?? {}) };
  const id = input.replyId;
  const text = input.text ?? "";
  const t = normalize(text);

  if (!n.kind) {
    n.kind = id === "ck:CARD" || t.includes("tarjeta") ? "CARD" : id === "ck:WALLET" || t.includes("billetera") ? "WALLET" : undefined;
    if (!n.kind) return startSourceGuided(ctx);
    await setSession(ctx.phone, "card:new", { newSource: n });
    await ctx.out.text(
      n.kind === "CARD" ? "💳 ¿Cómo se llama la tarjeta? (ej: Galicia, Visa Santander)" : "📲 ¿Cómo se llama la billetera? (ej: Brubank, Personal Pay)",
    );
    return true;
  }

  if (!n.name) {
    const typed = text.trim().slice(0, 30);
    if (typed.length < 2) {
      await ctx.out.text("Decime un nombre de al menos 2 letras 🙏 (o escribí *cancelar*)");
      return true;
    }
    const name = typed === typed.toLowerCase() ? capitalize(typed) : typed;
    const clash = (await listPaymentSources(ctx.userId)).find((s) => normalize(s.name) === normalize(name));
    if (clash) {
      await clearSession(ctx.phone);
      await ctx.out.text(`Ya tenés *${clash.name}* 👌${BACK}`);
      return true;
    }
    if (n.kind === "WALLET") return confirmCreate(ctx, name, "WALLET", {});
    await setSession(ctx.phone, "card:new", { newSource: { ...n, name } });
    await ctx.out.buttons(
      `📅 ¿Qué día cierra y qué día vence la *${name}*? Escribí por ej. *25 y 7*.\n_Sirve para armar su resumen._`,
      NO_DAYS,
    );
    return true;
  }

  // Los días de la tarjeta: "25 y 7", "cierra 25 vence 7"... o sin días
  if (id === "ck:nodays") return confirmCreate(ctx, n.name, "CARD", {});
  const days = (text.match(/\d{1,2}/g) ?? []).map(Number);
  if (days.length !== 2 || days.some((x) => x < 1 || x > 31)) {
    await ctx.out.buttons("Escribí los dos días, primero el cierre y después el vencimiento: por ej. *25 y 7*.", NO_DAYS);
    return true;
  }
  return confirmCreate(ctx, n.name, "CARD", { closingDay: days[0], dueDay: days[1] });
}

// ---------- Lista y borrar ----------

/** Todas las tarjetas y billeteras, con sus días y cuántos gastos tienen */
export async function showSourcesList(ctx: Ctx): Promise<boolean> {
  await clearSession(ctx.phone);
  const list = await listWithUsage(ctx.userId);
  if (list.length === 0) {
    await ctx.out.text(`No tenés tarjetas ni billeteras.\n_Agregá una diciéndome por ej. "agregá la tarjeta Galicia"._${BACK}`);
    return true;
  }
  const count = (n: number) => `${n} ${n === 1 ? "gasto" : "gastos"}`;
  const lines = list.map((s) =>
    s.kind === "CARD"
      ? `• 💳 *${s.name}* · ${s.closingDay ? `cierra ${s.closingDay} · vence ${s.dueDay}` : "sin días"} · ${count(s.expenseCount)}`
      : `• 📲 *${s.name}* · ${count(s.expenseCount)}`,
  );
  await ctx.out.text(
    `👛 *Tus tarjetas y billeteras*\n\n${lines.join("\n")}\n\n_Podés decirme: "resumen visa", "la Visa cierra el 25 y vence el 7" o "agregá la billetera Brubank"._${BACK}`,
  );
  return true;
}

export async function askDeleteSource(ctx: Ctx, sourceId: string): Promise<boolean> {
  const [sources, fixed] = await Promise.all([listWithUsage(ctx.userId), listRecurring(ctx.userId)]);
  const s = sources.find((x) => x.id === sourceId);
  if (!s) {
    await ctx.out.text(`Esa tarjeta o billetera ya no existe 🤔${BACK}`);
    return true;
  }
  const what = s.kind === "CARD" ? "tarjeta" : "billetera";
  const fixedCount = fixed.filter((f) => f.paymentSource?.id === s.id).length;
  // Qué pasa con lo que la usa (como en la web): gastos y fijos quedan sin ella; los resúmenes se pierden
  const notes = [
    s.expenseCount > 0 ? `Sus ${s.expenseCount} gastos quedan, pero sin ${what}.` : "",
    fixedCount > 0 ? `${fixedCount === 1 ? "1 gasto fijo queda" : `${fixedCount} gastos fijos quedan`} sin ${what}.` : "",
    s.kind === "CARD" && s.closingDay ? "Si marcaste resúmenes como pagados, esas marcas se pierden." : "",
  ].filter(Boolean);
  return askConfirm(ctx, {
    type: "card:delete",
    data: { id: s.id, name: s.name, what },
    body: `🗑️ ¿Borro la ${what} *${s.name}*?${notes.length > 0 ? `\n_${notes.join(" ")}_` : ""}`,
    options: [{ id: "yes", title: "🗑️ Sí, borrar", words: ["borrar", "borrala"] }],
  });
}

async function create(ctx: Ctx, data: Record<string, unknown>, option: string) {
  const { name, closingDay, dueDay } = data as { name: string; closingDay?: number; dueDay?: number };
  const kind = option === "WALLET" ? "WALLET" : "CARD";
  const withDays = kind === "CARD" && closingDay && dueDay;
  await createPaymentSource(ctx.userId, {
    name,
    kind,
    closingDay: withDays ? closingDay : null,
    dueDay: withDays ? dueDay : null,
  });
  const tip =
    kind === "CARD" && !withDays ? `\n_Para ver su resumen, decime en qué día cierra y vence: "la ${name} cierra el 25 y vence el 7"._` : "";
  await ctx.out.text(`✅ Listo, agregué la ${kind === "CARD" ? "tarjeta" : "billetera"} *${name}*.${tip}${BACK}`);
}

// ---------- ¿Qué tengo que pagar? ----------

/**
 * Lo que falta pagar este mes: los resúmenes que vencen este mes (o ya vencieron) sin marcar como
 * pagados, lo gastado con crédito en tarjetas sin días configurados, y los gastos fijos que todavía
 * no se cargaron este mes (los que van con crédito no, porque ya vienen en el resumen).
 */
export async function showWhatToPay(ctx: Ctx): Promise<boolean> {
  const today = todayISO();
  const month = today.slice(0, 7);
  const [sources, fixed] = await Promise.all([listPaymentSources(ctx.userId), listRecurring(ctx.userId)]);
  let ars = 0;
  let usd = 0;

  const cardLines: string[] = [];
  for (const card of sources.filter((s) => s.kind === "CARD")) {
    if (card.closingDay && card.dueDay) {
      const open = await currentStatementMonth(ctx.userId, card.id);
      for (const m of open ? [shiftMonth(open, -2), shiftMonth(open, -1), open] : []) {
        const s = await getStatement(ctx.userId, card.id, m);
        if (!s?.configured || s.status === "pagado" || s.expenses.length === 0) continue;
        if (s.status !== "vencido" && !s.due.startsWith(month)) continue;
        ars += s.total;
        if (s.usd > 0 && s.usdInPesos === null) usd += s.usd; // sin cotización: los dólares aparte
        const note = s.status === "vencido" ? " · 🔴 vencido" : s.status === "abierto" ? ` · cierra ${shortDate(s.closing)}` : "";
        cardLines.push(`• *${card.name}* — vence ${shortDate(s.due)}: *${formatMoney(s.total, "ARS")}*${note}`);
      }
    } else {
      const expenses = await listExpenses(ctx.userId, { month, paymentSourceId: card.id, paymentMethod: "CREDIT" });
      const total = expenses.reduce((sum, e) => sum + (e.amountArs ?? 0), 0);
      if (total > 0) {
        ars += total;
        cardLines.push(`• *${card.name}*: ${formatMoney(total, "ARS")} gastados este mes _(sin fecha de vencimiento)_`);
      }
    }
  }

  const fixedLines = fixed
    .filter((f) => f.active && f.paymentMethod !== "CREDIT" && !f.loadedThisMonth && f.nextDate?.startsWith(month))
    .map((f) => {
      if (f.currency === "USD") usd += f.amount;
      else ars += f.amount;
      const how = [paymentMethodLabels[f.paymentMethod], f.paymentSource?.name].filter(Boolean).join(" ");
      return `• *${f.description}* — ${shortDate(f.nextDate!)}: ${formatMoney(f.amount, f.currency)} · ${how}`;
    });

  if (cardLines.length === 0 && fixedLines.length === 0) {
    await ctx.out.text(`🙌 No tenés nada pendiente de pagar este mes.${BACK}`);
    return true;
  }
  const total = [formatMoney(ars, "ARS"), usd > 0 ? formatMoney(usd, "USD") : ""].filter(Boolean).join(" + ");
  await ctx.out.text(
    [
      "🧾 *Lo que te falta pagar este mes*",
      ...(cardLines.length > 0 ? ["", "💳 *Tarjetas*", ...cardLines] : []),
      ...(fixedLines.length > 0 ? ["", "📌 *Gastos fijos*", ...fixedLines] : []),
      "",
      `Total: *${total}*`,
      ...(cardLines.length > 0 ? ['_Cuando pagues un resumen, decime por ej. "pagué la Visa"._'] : []),
    ].join("\n") + BACK,
  );
  return true;
}

// ---------- Ejecutar lo confirmado ----------

export async function runCardAction(ctx: Ctx, type: string, data: Record<string, unknown>, option: string) {
  try {
    if (type === "card:paid") await markPaid(ctx, data, option);
    else if (type === "card:dates") await saveDates(ctx, data);
    else if (type === "card:create") await create(ctx, data, option);
    else if (type === "card:delete") {
      const { id, name, what } = data as { id: string; name: string; what: string };
      await deletePaymentSource(ctx.userId, id);
      await ctx.out.text(`🗑️ Borré la ${what} *${name}*.${BACK}`);
    }
  } catch (e) {
    if (!(e instanceof StatementError || e instanceof PaymentSourceError)) throw e;
    await ctx.out.text(`No pude hacerlo: ${e.message}${BACK}`);
  }
}
