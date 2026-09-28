import "server-only";
import { z } from "zod";
import { dollarTypeLabels, formatMoney, paymentMethodLabels, todayISO } from "@/lib/format";
import { normalize } from "@/lib/text";
import { listCategories } from "@/lib/services/categories";
import { kindForMethod, listPaymentSources } from "@/lib/services/payment-sources";
import {
  createRecurring,
  dateInMonth,
  deleteRecurring,
  listRecurring,
  loadDueRecurring,
  RecurringError,
  setRecurringActive,
  updateRecurring,
  type LoadedRecurring,
  type RecurringDTO,
} from "@/lib/services/recurring";
import { askModel, isAiEnabled, listsLines, matchByName, MAX_CHARS, todayLine, type Lists } from "@/lib/whatsapp/ai-parser";
import {
  BACK,
  dollarRows,
  findCategoryByText,
  label,
  paymentRows,
  readDollar,
  readPayment,
  sendCategoryList,
  shortDate,
  sourceQuestion,
  type Ctx,
  type Input,
} from "@/lib/whatsapp/menu";
import { askConfirm } from "@/lib/whatsapp/sections/confirm";
import { clearSession, setSession, type Draft, type FixedDraft } from "@/lib/whatsapp/session";

// Gastos fijos por Chop: ver la lista, crear, cambiar el monto ("Netflix aumentó a 12.000"),
// pausar, reanudar y borrar. La IA principal solo detecta que el mensaje es "de fijos" y acá se
// hace una segunda llamada chica con estas instrucciones (así los mensajes de gastos, que son la
// mayoría, no pagan los tokens de esta sección). Todo lo que cambia datos pide confirmación.

const EXAMPLES =
  '_Podés decirme: "Netflix aumentó a 13.000", "pausá el gimnasio" o "agregá un fijo de alquiler 350 mil el día 5"._';

// ---------- La IA de esta sección ----------

const method = z.enum(["CASH", "DEBIT", "CREDIT", "TRANSFER"]);
const fixedSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("listar") }),
  z.object({
    accion: z.literal("crear"),
    desc: z.string(),
    monto: z.number(),
    usd: z.boolean().optional(),
    cat: z.string().optional(),
    medio: method.optional(),
    tarjeta: z.string().optional(),
    dia: z.number().optional(),
  }),
  z.object({ accion: z.literal("monto"), fijo: z.string(), monto: z.number(), usd: z.boolean().optional() }),
  z.object({ accion: z.literal("pausar"), fijo: z.string() }),
  z.object({ accion: z.literal("reanudar"), fijo: z.string() }),
  z.object({ accion: z.literal("borrar"), fijo: z.string() }),
  z.object({ accion: z.literal("otro"), pregunta: z.string().optional() }),
]);
export type FixedParsed = z.infer<typeof fixedSchema>;

const SYSTEM = `Sos Chop, el asistente de la app de gastos Salt (Argentina). El mensaje es sobre GASTOS FIJOS (gastos que se cargan solos todos los meses). Respondé SOLO un objeto JSON, sin texto alrededor, con una de estas formas (omití las claves que no apliquen):
{"accion":"listar"}
{"accion":"crear","desc":"Alquiler","monto":350000,"usd":true,"cat":"Hogar","medio":"TRANSFER","tarjeta":"Mercado Pago","dia":5}
{"accion":"monto","fijo":"Netflix","monto":12000}
{"accion":"pausar","fijo":"Gimnasio"}
{"accion":"reanudar","fijo":"Gimnasio"}
{"accion":"borrar","fijo":"Gimnasio"}
{"accion":"otro","pregunta":"¿Qué fijo querés cambiar?"}

- fijo: nombre EXACTO de la lista de fijos (el más parecido).
- crear: desc es un nombre corto ("Alquiler", "Netflix"). dia: el día del mes en que se paga (1 a 31), SOLO si lo dice; si no, omitilo (se lo preguntamos).
- monto: "aumentó a", "ahora sale", "pasó a" = cambio de monto, aunque el fijo no esté en la lista (nunca es crear). usd: true solo si dice dólares, usd o u$s.
- lucas/luca/k/mil = miles, palo = millón. Punto de miles y coma decimal.
- cat y tarjeta: nombre EXACTO de las listas. Si ninguna categoría encaja, "Otros" si está; si no, omitila.
- medio: efectivo=CASH, débito=DEBIT, crédito=CREDIT, transferencia/mercadopago/mp/alias=TRANSFER. Omitilo si no lo dice. Billetera: TRANSFER; tarjeta: DEBIT, salvo que diga crédito.
- otro: si no queda claro qué quiere hacer, una pregunta corta.`;

/** Interpreta un mensaje sobre fijos (segunda llamada). null si la IA no está o falló. */
export async function parseFixed(text: string, lists: Lists, fixed: string[]): Promise<FixedParsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;
  const content = [todayLine(), `Fijos: ${fixed.join(", ") || "(ninguno)"}.`, ...listsLines(lists), `\nMensaje: "${text}"`].join(
    "\n",
  );
  return askModel(SYSTEM, content, fixedSchema, "ai-fijos");
}

/** Mensaje de fijos escrito a mano → lo interpreta y actúa. false si la IA no respondió. */
export async function handleFixed(ctx: Ctx, text: string): Promise<boolean> {
  const [fixed, cats, sources] = await Promise.all([
    listRecurring(ctx.userId),
    listCategories(ctx.userId),
    listPaymentSources(ctx.userId),
  ]);
  const p = await parseFixed(
    text,
    { categories: cats.map((c) => c.name), sources: sources.map((s) => s.name) },
    fixed.map((f) => (f.active ? f.description : `${f.description} (pausado)`)),
  );
  if (!p) return false;

  // "aumentó a 12.000" es un cambio de monto aunque el modelo diga "crear" (pasa si ese fijo no existe)
  if (p.accion === "crear" && CHANGE_WORDS.test(normalize(text))) {
    return askAmountChange(ctx, findFixed(fixed, p.desc), p.monto, p.usd, p.desc);
  }
  if (p.accion === "listar") return showFixedList(ctx, fixed);
  if (p.accion === "otro") {
    await ctx.out.text(`${p.pregunta || "No entendí qué querés hacer con los fijos 🤔"}\n\n${EXAMPLES}${BACK}`);
    return true;
  }
  if (p.accion === "crear") return startCreate(ctx, text, p, cats, sources);

  const f = findFixed(fixed, p.fijo);
  if (!f) {
    const names = fixed.map((x) => x.description).join(", ");
    await ctx.out.text(
      `No encontré el fijo "${p.fijo}" 🤔${names ? `\nTus fijos: ${names}.` : "\nTodavía no tenés gastos fijos."}${BACK}`,
    );
    return true;
  }
  if (p.accion === "monto") return askAmountChange(ctx, f, p.monto, p.usd, p.fijo);
  if (p.accion === "pausar" || p.accion === "reanudar") return askPause(ctx, f, p.accion === "pausar");
  return askDelete(ctx, f);
}

/** El fijo del que habla: igual (sin tildes ni mayúsculas) o que lo contenga */
function findFixed(fixed: RecurringDTO[], name: string) {
  const n = normalize(name.replace(/\s*\(pausado\)$/i, ""));
  if (!n) return null;
  return (
    fixed.find((f) => normalize(f.description) === n) ??
    fixed.find((f) => normalize(f.description).includes(n) || n.includes(normalize(f.description))) ??
    null
  );
}

// ---------- Lista ----------

const monthLabel = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;

export async function showFixedList(ctx: Ctx, fixed?: RecurringDTO[]): Promise<boolean> {
  await clearSession(ctx.phone);
  const list = fixed ?? (await listRecurring(ctx.userId));
  if (list.length === 0) {
    await ctx.out.text(
      `📌 Todavía no tenés gastos fijos.\n\n_Creá uno diciéndome por ej. "agregá un fijo de alquiler 350 mil el día 5 por transferencia"._${BACK}`,
    );
    return true;
  }
  const lines = list.map((f) => {
    const how = [`💳 ${paymentMethodLabels[f.paymentMethod]}`, f.paymentSource?.name].filter(Boolean).join(" ");
    const when = f.active && f.nextDate ? `próximo ${shortDate(f.nextDate)}` : "⏸️ pausado";
    const next =
      f.nextAmount !== null && f.nextAmountFrom
        ? `\n   desde ${monthLabel(f.nextAmountFrom)}: ${formatMoney(f.nextAmount, f.currency)}`
        : "";
    return `${f.active ? "•" : "⏸️"} *${f.description}* · ${formatMoney(f.amount, f.currency)} · día ${f.day}\n   ${label(f.category)} · ${how} · ${when}${next}`;
  });
  await ctx.out.text(`📌 *Tus gastos fijos*\n\n${lines.join("\n")}\n\n${EXAMPLES}${BACK}`);
  return true;
}

/** Aviso de los fijos que se acaban de cargar solos (vacío si no hay) */
export function loadedFixedText(items: LoadedRecurring[]) {
  if (items.length === 0) return "";
  const title = items.length === 1 ? "📥 Se cargó solo 1 gasto fijo:" : `📥 Se cargaron solos ${items.length} gastos fijos:`;
  return [title, ...items.map((i) => `• ${i.description}: ${formatMoney(i.amount, i.currency)} (${shortDate(i.date)})`)].join("\n");
}

// ---------- Crear: pregunta lo que falte, en orden ----------

// Palabras que tienen que estar en el mensaje para creerle al modelo el medio de pago
const METHOD_HINTS: Record<"CASH" | "DEBIT" | "CREDIT" | "TRANSFER", string[]> = {
  CASH: ["efectivo", "cash"],
  DEBIT: ["debito"],
  CREDIT: ["credito", "cuotas"],
  TRANSFER: ["transfer", "mercado pago", "mercadopago", "mp", "alias", "cvu", "cbu"],
};

/**
 * El día solo vale si está en el mensaje ("el 5", "día 5", "el primero"): el modelo a veces
 * lo supone (el alquiler, el 1) y es mejor preguntarlo.
 */
function saidDay(text: string, day: number | undefined) {
  if (!day || !Number.isInteger(day) || day < 1 || day > 31) return undefined;
  const t = normalize(text);
  if (new RegExp(`(^|[^\\d.,])${day}([^\\d.,]|$)`).test(t)) return day;
  return day === 1 && /\b(primero|1ro|1°)\b/.test(t) ? 1 : undefined;
}

async function startCreate(
  ctx: Ctx,
  text: string,
  p: Extract<FixedParsed, { accion: "crear" }>,
  cats: Awaited<ReturnType<typeof listCategories>>,
  sources: Awaited<ReturnType<typeof listPaymentSources>>,
) {
  const description = p.desc.trim().slice(0, 60);
  if (!(p.monto > 0 && p.monto < 1e12) || description.length < 2) {
    await ctx.out.text(`Para crear un fijo necesito el nombre y el monto 🙏\n\n${EXAMPLES}${BACK}`);
    return true;
  }
  const cat = matchByName(cats, p.cat ?? null);
  // Medio y tarjeta, solo si están en el mensaje (el modelo a veces copia los del ejemplo).
  // La tarjeta o billetera solo vale si corresponde al medio (billetera → transferencia).
  const t = normalize(text);
  const named = matchByName(sources, p.tarjeta ?? null);
  const source = named && t.includes(normalize(named.name)) ? named : null;
  let paymentMethod = p.medio && (METHOD_HINTS[p.medio].some((w) => t.includes(w)) || source) ? p.medio : undefined;
  if (source?.kind === "WALLET") paymentMethod = "TRANSFER";
  else if (source?.kind === "CARD" && paymentMethod !== "CREDIT") paymentMethod = "DEBIT";
  const usable = source && paymentMethod && paymentMethod !== "CASH" ? source : null;

  return nextFixedStep(ctx, {
    description,
    amount: p.monto,
    currency: p.usd ? "USD" : "ARS",
    categoryId: cat?.id,
    categoryLabel: cat ? label(cat) : undefined,
    day: saidDay(text, p.dia),
    paymentMethod,
    sourceId: usable?.id ?? null,
    sourceName: usable?.name ?? null,
  });
}

// Qué falta, en el orden en que se pregunta
const needsSource = (f: FixedDraft) => !!f.paymentMethod && f.paymentMethod !== "CASH" && !f.sourceId && !f.askedSource;
const needsDollar = (f: FixedDraft) => f.currency === "USD" && f.paymentMethod !== "CREDIT" && !f.dollarType;

async function nextFixedStep(ctx: Ctx, f: FixedDraft): Promise<boolean> {
  const d: Draft = { fixed: f };
  if (!f.categoryId) {
    await setSession(ctx.phone, "fixed:new", d);
    await sendCategoryList(ctx, 0, `🏷️ ¿En qué categoría va *${f.description}*? Elegila o escribí el nombre.`);
    return true;
  }
  if (!f.day) {
    await setSession(ctx.phone, "fixed:new", d);
    await ctx.out.text(`📅 ¿Qué día del mes se paga *${f.description}*? (del 1 al 31)`);
    return true;
  }
  if (!f.paymentMethod) {
    await setSession(ctx.phone, "fixed:new", d);
    await ctx.out.list(`💳 ¿Cómo pagás *${f.description}* todos los meses?`, "Elegir medio", await paymentRows(ctx.userId), "Medio de pago");
    return true;
  }
  if (needsSource(f)) {
    // Tarjeta (débito o crédito) o billetera (transferencia)
    const kind = kindForMethod(f.paymentMethod!);
    const options = (await listPaymentSources(ctx.userId)).filter((s) => s.kind === kind);
    if (options.length > 0) {
      await setSession(ctx.phone, "fixed:new", d);
      await ctx.out.list(
        sourceQuestion(f.paymentMethod!, `*${f.description}*`, "pagás"),
        kind === "CARD" ? "Ver tarjetas" : "Ver billeteras",
        options.map((s) => ({ id: `src:${s.id}`, title: s.name })),
        kind === "CARD" ? "Tarjetas" : "Billeteras",
      );
      return true;
    }
    f.askedSource = true;
  }
  if (needsDollar(f)) {
    await setSession(ctx.phone, "fixed:new", d);
    await ctx.out.list(`💵 ¿A qué dólar pagás *${f.description}*? Con eso lo paso a pesos cada mes.`, "Elegir dólar", dollarRows(), "Dólar");
    return true;
  }
  return confirmCreate(ctx, f);
}

/** La respuesta a la pregunta que estaba pendiente (la primera que falta) */
export async function receiveFixed(ctx: Ctx, input: Input, d: Draft): Promise<boolean> {
  if (!d.fixed) return false;
  const f: FixedDraft = { ...d.fixed };
  const id = input.replyId;
  const text = input.text ?? "";

  if (!f.categoryId) {
    if (id?.startsWith("catpage:")) {
      await sendCategoryList(ctx, Number(id.slice(8)) || 0, `🏷️ ¿En qué categoría va *${f.description}*?`);
      return true;
    }
    const cats = await listCategories(ctx.userId);
    const cat = id?.startsWith("cat:") ? cats.find((c) => c.id === id.slice(4)) : findCategoryByText(cats, text);
    if (!cat) {
      await sendCategoryList(ctx, 0, "No tengo esa categoría 🤔 Elegila de la lista:");
      return true;
    }
    f.categoryId = cat.id;
    f.categoryLabel = label(cat);
  } else if (!f.day) {
    const day = Number(normalize(text).replace(/^(el )?(dia )?/, ""));
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      await ctx.out.text("Decime un día del 1 al 31 🙏 (o escribí *cancelar*)");
      return true;
    }
    f.day = day;
  } else if (!f.paymentMethod) {
    const a = readPayment(input, await listPaymentSources(ctx.userId), "DEBIT");
    if (a) {
      f.paymentMethod = a.method;
      f.sourceId = a.source?.id ?? null;
      f.sourceName = a.source?.name ?? null;
    }
  } else if (needsSource(f)) {
    // Si contesta otro medio ("mercado pago"), se cambia; si no se entiende, queda sin tarjeta
    f.askedSource = true;
    const a = readPayment(input, await listPaymentSources(ctx.userId), f.paymentMethod!);
    if (a) {
      f.paymentMethod = a.method;
      f.sourceId = a.source?.id ?? null;
      f.sourceName = a.source?.name ?? null;
    }
  } else if (needsDollar(f)) {
    f.dollarType = readDollar(input);
  }
  return nextFixedStep(ctx, f);
}

function describeFixed(f: FixedDraft) {
  const how = [`💳 ${paymentMethodLabels[f.paymentMethod!]}`, f.sourceName].filter(Boolean).join(" ");
  const dollar =
    f.currency !== "USD" ? "" : f.paymentMethod === "CREDIT" ? " · 💵 Oficial" : f.dollarType ? ` · 💵 ${dollarTypeLabels[f.dollarType]}` : "";
  return `*${f.description}* · ${formatMoney(f.amount, f.currency)} · día ${f.day}\n${f.categoryLabel} · ${how}${dollar}`;
}

function confirmCreate(ctx: Ctx, f: FixedDraft) {
  const today = todayISO();
  const date = dateInMonth(today.slice(0, 7), f.day!);
  // Misma regla que la web: si el día de este mes ya pasó (o es hoy), arranca el mes que viene
  const passed = date <= today;
  return askConfirm(ctx, {
    type: "fixed:create",
    data: f,
    body: [
      "📌 ¿Creo este gasto fijo?",
      "",
      describeFixed(f),
      "",
      passed
        ? `El día ${f.day} de este mes ya pasó: ¿arranca el mes que viene, o cargo también el de este mes?`
        : `Se carga solo el ${shortDate(date)} y después todos los meses.`,
    ].join("\n"),
    options: passed
      ? [
          { id: "yes", title: "✅ Crear", words: ["crear", "que viene", "proximo"] },
          { id: "load", title: "✅ Crear y cargar", words: ["cargar", "este mes", "tambien"] },
        ]
      : [{ id: "yes", title: "✅ Crear", words: ["crear"] }],
  });
}

// ---------- Monto, pausa y borrar ----------

const CHANGE_WORDS = /\b(aumento|aumentaron|subio|subieron|bajo|ahora sale|ahora es|paso a|pasa a)\b/;

async function askAmountChange(ctx: Ctx, f: RecurringDTO | null, amount: number, usd: boolean | undefined, name: string) {
  if (!f) {
    const names = (await listRecurring(ctx.userId)).map((x) => x.description).join(", ");
    await ctx.out.text(
      `No tengo un gasto fijo "${name}" 🤔${names ? `\nTus fijos: ${names}.` : ""}\n\n_Si querés crearlo: "agregá un fijo de ${name} ${formatMoney(amount, usd ? "USD" : "ARS")} el día 5"._${BACK}`,
    );
    return true;
  }
  const currency = usd === undefined ? f.currency : usd ? "USD" : "ARS";
  if (!(amount > 0 && amount < 1e12)) return ctx.out.text(`Ese monto no lo agarro 🤔${BACK}`).then(() => true);
  if (amount === f.amount && currency === f.currency) {
    return ctx.out.text(`*${f.description}* ya está en ${formatMoney(amount, currency)} 👌${BACK}`).then(() => true);
  }
  return askConfirm(ctx, {
    type: "fixed:amount",
    data: { id: f.id, amount, currency },
    body: [
      `✏️ *${f.description}*: ${formatMoney(f.amount, f.currency)} → *${formatMoney(amount, currency)}*`,
      "",
      "¿Desde cuándo?",
      f.loadedThisMonth
        ? '_El de este mes ya se cargó: "desde este mes" también lo corrige._'
        : "_El de este mes todavía no se cargó._",
    ].join("\n"),
    options: [
      { id: "this", title: "Desde este mes", words: ["este mes", "este", "ya", "ahora"] },
      { id: "next", title: "Desde el próximo", words: ["proximo", "que viene", "siguiente"] },
    ],
  });
}

async function askPause(ctx: Ctx, f: RecurringDTO, pause: boolean) {
  if (f.active !== pause) {
    await ctx.out.text(`*${f.description}* ya está ${pause ? "pausado" : "activo"} 👌${BACK}`);
    return true;
  }
  return askConfirm(ctx, {
    type: pause ? "fixed:pause" : "fixed:resume",
    data: { id: f.id },
    body: pause
      ? `⏸️ ¿Pauso *${f.description}*? No se carga hasta que lo reanudes.`
      : `▶️ ¿Reanudo *${f.description}*? Los meses que estuvo pausado no se cargan.`,
    options: [{ id: "yes", title: pause ? "⏸️ Pausar" : "▶️ Reanudar", words: [pause ? "pausar" : "reanudar"] }],
  });
}

function askDelete(ctx: Ctx, f: RecurringDTO) {
  return askConfirm(ctx, {
    type: "fixed:delete",
    data: { id: f.id },
    body: `🗑️ ¿Borro el gasto fijo *${f.description}*?\n_Los gastos que ya cargó quedan como están._`,
    options: [{ id: "yes", title: "🗑️ Sí, borrar", words: ["borrar", "borralo"] }],
  });
}

// ---------- Ejecutar lo confirmado ----------

/** Hace la acción confirmada (la llama sections/index.ts) */
export async function runFixedAction(ctx: Ctx, type: string, data: Record<string, unknown>, option: string) {
  try {
    if (type === "fixed:create") {
      const f = data as FixedDraft;
      await createRecurring(ctx.userId, {
        description: f.description,
        amount: f.amount,
        currency: f.currency,
        dollarType: f.dollarType,
        paymentMethod: f.paymentMethod!,
        paymentSourceId: f.sourceId ?? undefined,
        categoryId: f.categoryId!,
        day: f.day!,
        loadThisMonth: option === "load",
        from: "this",
      });
      // Si ya le toca (hoy, o "cargar este mes"), se carga ahora mismo
      const loaded = await loadDueRecurring(ctx.userId);
      const notice = loadedFixedText(loaded);
      await ctx.out.text(
        `✅ Listo: *${f.description}* se carga solo el día ${f.day} de cada mes.${notice ? `\n\n${notice}` : ""}${BACK}`,
      );
      return;
    }

    const f = (await listRecurring(ctx.userId)).find((x) => x.id === data.id);
    if (!f) {
      await ctx.out.text(`Ese gasto fijo ya no existe 🤔${BACK}`);
      return;
    }
    if (type === "fixed:amount") {
      const amount = data.amount as number;
      const currency = data.currency as "ARS" | "USD";
      await updateRecurring(
        ctx.userId,
        f.id,
        {
          description: f.description,
          amount,
          currency,
          dollarType: f.dollarType ?? undefined,
          paymentMethod: f.paymentMethod,
          paymentSourceId: f.paymentSource?.id,
          categoryId: f.category.id,
          day: f.day,
          loadThisMonth: false,
          from: option === "next" ? "next" : "this",
        },
        option === "next" ? "next" : "this",
      );
      await ctx.out.text(
        `✅ *${f.description}* pasa a ${formatMoney(amount, currency)} ${option === "next" ? "desde el mes que viene" : "desde este mes"}.${BACK}`,
      );
    } else if (type === "fixed:pause" || type === "fixed:resume") {
      await setRecurringActive(ctx.userId, f.id, type === "fixed:resume");
      const next = type === "fixed:resume" ? (await listRecurring(ctx.userId)).find((x) => x.id === f.id)?.nextDate : null;
      await ctx.out.text(
        type === "fixed:pause"
          ? `⏸️ Pausé *${f.description}*: no se carga hasta que lo reanudes.${BACK}`
          : `▶️ Reanudé *${f.description}*${next ? `: el próximo se carga el ${shortDate(next)}` : ""}.${BACK}`,
      );
    } else if (type === "fixed:delete") {
      await deleteRecurring(ctx.userId, f.id);
      await ctx.out.text(`🗑️ Borré el fijo *${f.description}*. Los gastos que ya cargó quedan.${BACK}`);
    }
  } catch (e) {
    if (!(e instanceof RecurringError)) throw e;
    await ctx.out.text(`No pude hacerlo: ${e.message}${BACK}`);
  }
}
