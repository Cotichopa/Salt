import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseAmount, todayISO, TIME_ZONE, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";

// Interpreta lo que escribe la persona con Claude Haiku: primero QUÉ quiere hacer
// (cargar, consultar, eliminar, editar) y después los datos.
//
// Ahorro de tokens: NO usamos "structured outputs" (el formato que obliga al modelo a
// responder con un esquema), porque el esquema se manda en cada mensaje y pesaba ~1.700
// tokens, más que todas las instrucciones juntas. En su lugar, las instrucciones muestran
// la respuesta con 5 ejemplos de una línea, empezamos la respuesta con "{" para que conteste
// solo JSON, y la validamos acá con zod. Si viniera mal armada, se descarta (como un error de la API).

const MODEL = "claude-haiku-4-5";
export const MAX_CHARS = 500; // mensajes más largos no los mandamos

const method = z.enum(["CASH", "DEBIT", "CREDIT", "TRANSFER"]);
const expenseShape = z.object({
  monto: z.number(),
  usd: z.boolean().optional(),
  cat: z.string().optional(),
  medio: method.optional(),
  tarjeta: z.string().optional(),
  cuotas: z.number().optional(),
  fecha: z.string().optional(),
  desc: z.string().optional(),
});
const target = { ultimo: z.boolean().optional(), texto: z.string().optional(), monto: z.number().optional() };

const aiSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("cargar"), gastos: z.array(expenseShape) }),
  z.object({
    accion: z.literal("consultar"),
    periodo: z.enum(["hoy", "ayer", "semana", "mes", "mes_pasado", "todo"]).optional(),
    cat: z.string().optional(),
    tarjeta: z.string().optional(),
    medio: method.optional(),
  }),
  z.object({ accion: z.literal("eliminar"), ...target }),
  z.object({ accion: z.literal("editar"), ...target, cambios: expenseShape.partial().optional() }),
  z.object({ accion: z.literal("otro"), pregunta: z.string().optional() }),
  z.object({ accion: z.literal("seccion"), cual: z.enum(["fijo", "tarjeta", "presupuesto", "categoria"]) }),
]);

/** Otras partes de la app que Chop maneja con una segunda llamada chica (ver sections/) */
export type Section = "fijo" | "tarjeta" | "presupuesto" | "categoria";

/**
 * Atajo sin IA dentro de una sección (lo arma quick-parser.ts): "mis fijos" → listar,
 * "qué tengo que pagar" → pagar, "resumen visa" → resumen de esa tarjeta.
 */
export type SectionQuick = { action: "listar" | "pagar" | "resumen"; name?: string };

export type ParsedExpense = {
  amount: number;
  currency: CurrencyCode;
  categoryName: string;
  paymentMethod: PaymentMethodCode | null;
  sourceName: string | null;
  installments: number;
  date: string;
  description: string | null;
};

export type QueryPeriod = "hoy" | "ayer" | "semana" | "mes" | "mes_pasado" | "todo";
export type Target = { last: boolean; text: string; amount: number };

export type Parsed =
  | { intent: "cargar"; expenses: ParsedExpense[] }
  | {
      intent: "consultar";
      period: QueryPeriod;
      categoryName: string | null;
      sourceName: string | null;
      paymentMethod: PaymentMethodCode | null;
    }
  | { intent: "eliminar"; target: Target }
  | { intent: "editar"; target: Target; changes: Partial<ParsedExpense> }
  | { intent: "otro"; question: string }
  // De otra sección: con `quick` se resuelve sin IA; si no, la sección interpreta el mensaje
  | { intent: "seccion"; section: Section; quick?: SectionQuick };

export function isAiEnabled() {
  return process.env.AI_PARSER_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `Sos Chop, el asistente de gastos de la app Salt (Argentina). Interpretás un mensaje de WhatsApp en español rioplatense y respondés SOLO un objeto JSON, sin texto alrededor, con una de estas formas (omití las claves que no apliquen):
{"accion":"cargar","gastos":[{"monto":120000,"usd":true,"cat":"Ropa","medio":"CREDIT","tarjeta":"Visa","cuotas":6,"fecha":"2026-01-31","desc":"zapatillas"}]}
{"accion":"consultar","periodo":"hoy|ayer|semana|mes|mes_pasado|todo","cat":"Comida","tarjeta":"Visa","medio":"CASH"}
{"accion":"eliminar","ultimo":true}
{"accion":"editar","texto":"pizza","monto":18000,"cambios":{"monto":20000,"medio":"CASH"}}
{"accion":"otro","pregunta":"¿Querés cargar un gasto de $15.000? ¿En qué categoría?"}
{"accion":"seccion","cual":"tarjeta"}

ACCIONES
- cargar: uno o más gastos ("nafta 15000", "ayer 3 lucas en el chino", "chop cargame 5000 de nafta").
- consultar: pregunta por gastos o presupuestos ("cuánto gasté en comida", "qué gasté ayer", "cuánto llevo en la visa", "cómo vengo"). Sin período o si pregunta por presupuesto: "mes".
- eliminar / editar: un gasto ya cargado ("borrá el último", "eliminá la nafta", "el último eran 20000", "pasá la pizza a efectivo"). ultimo=true SOLO si dice "el último"; si no, texto = palabras que lo identifican y monto = el que tenía, si lo dice. En cambios, solo lo que cambia (mismas claves que un gasto).
- seccion: otra parte de la app. cual: "fijo" (gastos fijos mensuales: "netflix aumentó a 12000", "agregá un fijo de alquiler"), "tarjeta" (resumen, pago, vencimientos o días de una tarjeta, agregar tarjeta o billetera: "cuánto me viene en la visa", "pagué la visa"), "presupuesto" (poner o sacar el de una categoría: "poneme 200 mil en comida"), "categoria" (crear, renombrar o borrar una). "Cuánto gasté con la visa" y "cómo vengo con el presupuesto" son consultar.
- otro: saludos, gracias o mensajes confusos. Si parece un gasto incompleto, poné una pregunta corta; si no tiene que ver con gastos, omitila.

DATOS
- lucas/luca/k/mil = miles, palo = millón. Punto de miles y coma decimal: "15.000,50" = 15000.5.
- usd: true solo si dice dólares, usd o u$s.
- cat y tarjeta: nombre EXACTO de las listas. Si ninguna categoría encaja, "Otros" si está; si no, omitila.
- medio: efectivo=CASH, débito=DEBIT, crédito o cuotas=CREDIT, transferencia/mercadopago/mp/alias=TRANSFER. Omitilo si no lo aclara. Si nombra una billetera: TRANSFER; una tarjeta: DEBIT, salvo que diga crédito o cuotas.
- cuotas: solo con crédito. El monto es el TOTAL de la compra.
- fecha YYYY-MM-DD: "ayer", "anteayer", "el lunes" (el último que pasó). Nunca futura. Omitila si es hoy.
- desc: detalle corto si aporta ("pizza con amigos"), sin repetir categoría ni monto.

Si te paso "Gastos propuestos" y el mensaje los corrige ("con efectivo", "eran 8000", "fue ayer", "sacá el segundo"), respondé cargar con la lista COMPLETA corregida, manteniendo lo que no cambia.`;

export type Lists = { categories: string[]; sources: string[] };

/** "Hoy es lunes 2026-09-28.": el modelo lo necesita para las fechas relativas ("ayer", "el lunes") */
export function todayLine() {
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: TIME_ZONE }).format(new Date());
  return `Hoy es ${weekday} ${todayISO()}.`;
}

/** Las listas de la persona, para que el modelo use los nombres exactos */
export function listsLines(lists: Lists) {
  return [`Categorías: ${lists.categories.join(", ")}.`, `Tarjetas y billeteras: ${lists.sources.join(", ") || "(ninguna)"}.`];
}

/**
 * Le pasa a Haiku unas instrucciones y un mensaje, y valida el JSON que responde con `schema`.
 * El mensaje puede ser texto o bloques (una foto + texto, ver parseReceipt).
 * La usan este archivo y las secciones (sections/). Devuelve null si la IA no está disponible,
 * falla o responde algo inválido: el bot sigue andando con el menú.
 */
export async function askModel<T extends z.ZodType>(
  system: string,
  content: string | Anthropic.ContentBlockParam[],
  schema: T,
  tag = "ai-parser",
): Promise<z.infer<T> | null> {
  try {
    const client = new Anthropic(); // toma ANTHROPIC_API_KEY del .env
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system,
      messages: [
        { role: "user", content },
        // Empezamos nosotros la respuesta: así el modelo sigue el JSON y no agrega texto
        { role: "assistant", content: "{" },
      ],
    });

    // Costo de esta consulta, para poder seguir el gasto desde la terminal
    const { input_tokens: inTok, output_tokens: outTok } = response.usage;
    console.log(`[${tag}] ${inTok}+${outTok} tokens · US$ ${((inTok * 1) / 1e6 + (outTok * 5) / 1e6).toFixed(5)}`);

    const block = response.content[0];
    if (response.stop_reason !== "end_turn" || block?.type !== "text") return null;
    // Un campo en null es lo mismo que no decirlo (a veces el modelo pone "dia": null en vez de omitirlo)
    const json = firstJsonObject(`{${block.text}`);
    const result = schema.safeParse(json && JSON.parse(json, (_key, value) => (value === null ? undefined : value)));
    if (!result.success) {
      console.error(`[${tag}] respuesta inválida:`, block.text.slice(0, 200));
      return null;
    }
    return result.data;
  } catch (e) {
    // Sin crédito, sin internet, error de la API o JSON roto
    console.error(`[${tag}]`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * El primer objeto JSON completo del texto (hasta su "}" de cierre). A veces el modelo escribe algo
 * más después del JSON, y eso haría fallar a JSON.parse. null si no hay un objeto completo.
 */
function firstJsonObject(text: string) {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++; // se saltea el carácter escapado (\" no cierra el texto)
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(0, i + 1);
  }
  return null;
}

/** Interpreta un mensaje. Devuelve null si la IA no está disponible o respondió algo inválido. */
export async function parseMessage(text: string, lists: Lists, proposed?: ParsedExpense[]): Promise<Parsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;
  const content = [
    todayLine(),
    ...listsLines(lists),
    proposed?.length ? `\nGastos propuestos:\n${JSON.stringify(proposed.map(toAiShape))}` : "",
    `\nMensaje: "${text}"`,
  ].join("\n");
  const result = await askModel(SYSTEM, content, aiSchema);
  if (!result) return null;
  const parsed = toParsed(result, todayISO());
  // Un gasto cuya tarjeta o billetera se nombró pero el modelo no la puso (a veces la pone como
  // descripción: "pagué con transferencia, Mercado Pago"): si el mensaje nombra una sola, es esa
  if (parsed.intent === "cargar" && parsed.expenses.length === 1 && !parsed.expenses[0].sourceName) {
    const t = normalize(text);
    const named = lists.sources.filter((s) => t.includes(normalize(s)));
    if (named.length === 1) {
      const e = parsed.expenses[0];
      e.sourceName = named[0];
      if (e.description && normalize(e.description) === normalize(named[0])) e.description = null;
    }
  }
  // "eliminá el gasto de la nafta" a veces viene como editar sin nada que cambiar: es eliminar
  if (parsed.intent === "editar" && Object.keys(parsed.changes).length === 0 && DELETE_WORDS.test(normalize(text))) {
    return { intent: "eliminar", target: parsed.target };
  }
  return parsed;
}

const DELETE_WORDS = /\b(borra|borrar|borralo|borrame|elimina|eliminar|eliminalo|eliminame|saca|sacar|sacalo|sacame)\b/;

const RECEIPT_SYSTEM = `Sos Chop, el asistente de gastos de la app Salt (Argentina). Te mando la foto de un ticket, factura o comprobante de pago. Respondé SOLO un objeto JSON, sin texto alrededor:
{"accion":"cargar","cuit":"30-12345678-9","gastos":[{"monto":45800.5,"cat":"Supermercado","medio":"DEBIT","tarjeta":"Visa","cuotas":3,"fecha":"2026-09-27","desc":"Carrefour"}]}
Si no es el comprobante de un gasto o no se lee el total: {"accion":"otro","pregunta":"<qué no se ve, en una frase corta>"}
- monto: el TOTAL final pagado (con descuentos e impuestos), no subtotales ni ítems. En los tickets argentinos "45.800,50" = 45800.5.
- usd: true solo si el total está en dólares (US$, USD).
- cat: nombre EXACTO de la lista, según el comercio o lo que se compró. Si ninguna encaja, "Otros" si está; si no, omitila.
- medio, tarjeta y cuotas: solo si el ticket lo dice. Efectivo=CASH, débito=DEBIT, crédito=CREDIT, transferencia/QR/Mercado Pago=TRANSFER. tarjeta: nombre EXACTO de la lista si coincide la marca.
- fecha YYYY-MM-DD de la compra, nunca futura. Omitila si no se ve.
- desc: el nombre del comercio, corto ("Carrefour", "YPF").
- cuit: el CUIT del comercio que emite el ticket (arriba, junto a su nombre), tal cual se lee. Nunca el del cliente. Omitilo si no se ve.
- Si hay un texto de la persona, manda sobre la foto ("fue con la visa", "es de nafta").`;

// Lo mismo que un mensaje, más el CUIT del comercio (va aparte de los gastos: es uno por ticket)
const receiptSchema = aiSchema.and(z.object({ cuit: z.string().optional() }));

/**
 * Lee la foto de un ticket (JPEG) y devuelve el gasto como si se hubiera escrito: "cargar" con lo
 * que se leyó, u "otro" con qué faltó si no es un ticket, y el CUIT tal cual se leyó (se valida en
 * merchants.ts). `caption` es el texto que vino con la foto. null si la IA no está disponible o
 * respondió algo inválido.
 */
export async function parseReceipt(
  jpeg: Buffer,
  caption: string | undefined,
  lists: Lists,
): Promise<{ parsed: Parsed; cuit: string | null } | null> {
  if (!isAiEnabled()) return null;
  const text = [todayLine(), ...listsLines(lists), caption ? `\nTexto de la persona: "${caption.slice(0, MAX_CHARS)}"` : ""].join("\n");
  const result = await askModel(
    RECEIPT_SYSTEM,
    [
      // La imagen va antes del texto (así lo recomienda la documentación de Claude)
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
      { type: "text", text },
    ],
    receiptSchema,
    "ai-ticket",
  );
  return result ? { parsed: toParsed(result, todayISO()), cuit: result.cuit ?? null } : null;
}

function toParsed(p: z.infer<typeof aiSchema>, today: string): Parsed {
  switch (p.accion) {
    case "cargar": {
      const expenses = p.gastos.map((g) => toExpense(g, today)).filter((g) => g.amount > 0 && g.amount < 1e12);
      return expenses.length > 0 ? { intent: "cargar", expenses } : { intent: "otro", question: "" };
    }
    case "consultar":
      return {
        intent: "consultar",
        period: p.periodo ?? "mes",
        categoryName: p.cat || null,
        sourceName: p.tarjeta || null,
        paymentMethod: p.medio ?? null,
      };
    case "eliminar":
    case "editar": {
      const target: Target = { last: p.ultimo ?? false, text: p.texto ?? "", amount: p.monto ?? 0 };
      if (p.accion === "eliminar") return { intent: "eliminar", target };
      const c = p.cambios ?? {};
      return {
        intent: "editar",
        target,
        changes: {
          ...(c.monto && c.monto > 0 ? { amount: c.monto } : {}),
          ...(c.usd !== undefined ? { currency: c.usd ? "USD" : "ARS" } : {}),
          ...(c.cat ? { categoryName: c.cat } : {}),
          ...(c.medio ? { paymentMethod: c.medio } : {}),
          ...(c.tarjeta ? { sourceName: c.tarjeta } : {}),
          ...(c.desc ? { description: c.desc } : {}),
          ...(validDate(c.fecha, today) ? { date: c.fecha } : {}),
        },
      };
    }
    case "otro":
      return { intent: "otro", question: p.pregunta ?? "" };
    case "seccion":
      return { intent: "seccion", section: p.cual };
  }
}

// Nunca confiamos en la fecha del modelo: si es futura o inválida, no se usa
function validDate(date: string | undefined, today: string): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
}

function toExpense(g: z.infer<typeof expenseShape>, today: string): ParsedExpense {
  const cuotas = g.cuotas && Number.isFinite(g.cuotas) ? Math.max(1, Math.min(Math.round(g.cuotas), 36)) : 1;
  return {
    amount: g.monto,
    currency: g.usd ? "USD" : "ARS",
    categoryName: g.cat ?? "",
    paymentMethod: g.medio ?? null,
    sourceName: g.tarjeta || null,
    installments: cuotas,
    date: validDate(g.fecha, today) ? g.fecha : today,
    description: g.desc?.trim().slice(0, 200) || null,
  };
}

/** Un gasto propuesto, en el mismo formato corto que responde la IA (para las correcciones) */
function toAiShape(p: ParsedExpense) {
  return {
    monto: p.amount,
    ...(p.currency === "USD" ? { usd: true } : {}),
    ...(p.categoryName ? { cat: p.categoryName } : {}),
    ...(p.paymentMethod ? { medio: p.paymentMethod } : {}),
    ...(p.sourceName ? { tarjeta: p.sourceName } : {}),
    ...(p.installments > 1 ? { cuotas: p.installments } : {}),
    fecha: p.date,
    ...(p.description ? { desc: p.description } : {}),
  };
}

/**
 * Un día del mes que dio el modelo, solo si está en el mensaje ("el 5", "día 5", "el primero"): el modelo a veces
 * lo supone (el alquiler, el 1) y es mejor preguntarlo.
 */
export function saidDay(text: string, day: number | undefined) {
  if (!day || !Number.isInteger(day) || day < 1 || day > 31) return undefined;
  const t = normalize(text);
  if (new RegExp(`(^|[^\\d.,])${day}([^\\d.,]|$)`).test(t)) return day;
  return day === 1 && /\b(primero|1ro|1°)\b/.test(t) ? 1 : undefined;
}

/**
 * Un monto que dio el modelo, solo si sale de un número del mensaje: tal cual, o en miles o
 * millones ("200 mil", "200k", "2 palos"). Si no, el modelo lo inventó.
 */
export function saidAmount(text: string, amount: number | undefined) {
  if (!amount || !(amount > 0 && amount < 1e12)) return undefined;
  const numbers = (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => parseAmount(n)).filter((n): n is number => n !== null);
  return numbers.some((n) => n === amount || n * 1000 === amount || n * 1e6 === amount) ? amount : undefined;
}

/** Busca por nombre (sin tildes ni mayúsculas) entre las categorías o tarjetas del usuario */
export function matchByName<T extends { id: string; name: string }>(items: T[], name: string | null) {
  if (!name) return null;
  const n = normalize(name);
  return items.find((i) => normalize(i.name) === n) ?? items.find((i) => normalize(i.name).includes(n)) ?? null;
}
