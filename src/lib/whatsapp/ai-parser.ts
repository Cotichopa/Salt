import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { todayISO, TIME_ZONE, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";

// Interpreta lo que escribe la persona con Claude Haiku: primero QUÉ quiere hacer
// (cargar, consultar, eliminar, editar) y después los datos. El modelo responde
// siempre con esta estructura (structured outputs), y nosotros validamos todo igual.

const MODEL = "claude-haiku-4-5";
const MAX_CHARS = 500; // mensajes más largos no los mandamos

const expenseShape = z.object({
  monto: z.number().describe("Monto en números. '3 lucas' = 3000, '15k' = 15000. 0 si no lo dice"),
  moneda: z.enum(["ARS", "USD", ""]).describe("ARS salvo que diga dólares, usd o u$s. Vacío si no aplica"),
  categoria: z.string().describe("Nombre EXACTO de una categoría de la lista dada, o vacío"),
  medioDePago: z
    .enum(["CASH", "DEBIT", "CREDIT", "TRANSFER", "DESCONOCIDO", ""])
    .describe("DESCONOCIDO si el mensaje no lo aclara. Vacío si no aplica"),
  tarjeta: z.string().describe("Nombre EXACTO de una tarjeta o billetera de la lista dada, o vacío"),
  cuotas: z.number().describe("Cantidad de cuotas (1 si no menciona). Solo con tarjeta de crédito"),
  fecha: z.string().describe("Fecha del gasto en formato YYYY-MM-DD"),
  descripcion: z.string().describe("Detalle corto, o vacío si no hay"),
});

const aiSchema = z.object({
  intencion: z
    .enum(["cargar", "consultar", "eliminar", "editar", "otro"])
    .describe("Qué quiere hacer la persona con este mensaje"),
  gastos: z.array(expenseShape).describe("Solo para intencion=cargar (puede haber varios en un mensaje)"),
  consulta: z
    .object({
      periodo: z.enum(["hoy", "ayer", "semana", "mes", "mes_pasado", "todo", ""]).describe("Vacío si no es una consulta"),
      categoria: z.string().describe("Categoría EXACTA de la lista si acota por categoría, o vacío"),
      tarjeta: z.string().describe("Tarjeta o billetera EXACTA de la lista si acota por ella, o vacío"),
      medioDePago: z.enum(["CASH", "DEBIT", "CREDIT", "TRANSFER", "DESCONOCIDO", ""]),
    })
    .describe("Solo para intencion=consultar"),
  objetivo: z
    .object({
      ultimo: z.boolean().describe("true si se refiere al último gasto cargado"),
      texto: z.string().describe("Palabras que identifican el gasto: categoría, descripción o comercio"),
      monto: z.number().describe("Monto del gasto buscado, 0 si no lo dice"),
    })
    .describe("Para intencion=eliminar o editar: cómo reconocer de qué gasto habla"),
  cambios: expenseShape.describe("Solo para intencion=editar: los valores nuevos (vacío/0 lo que no cambia)"),
  repregunta: z
    .string()
    .describe("Solo para intencion=otro: una pregunta corta y concreta para entender qué quiso decir"),
});

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
  | { intent: "otro"; question: string };

export function isAiEnabled() {
  return process.env.AI_PARSER_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `Sos Chop, el asistente de gastos de la app Salt. Interpretás mensajes de WhatsApp en español rioplatense (Argentina) y decidís qué quiere hacer la persona.

INTENCIONES:
- "cargar": describe uno o más gastos ("nafta 15000", "ayer 3 lucas en el chino", "zapatillas 120000 en 6 cuotas con la visa").
- "consultar": pregunta por gastos ya cargados o por sus presupuestos ("cuánto gasté en comida este mes", "qué gasté ayer", "cuánto llevo en la visa", "cómo venimos", "cuánto me queda del presupuesto de salidas"). Los presupuestos son mensuales: si pregunta por presupuesto, periodo="mes".
- "eliminar": pide borrar un gasto ("borrá el último", "eliminá el gasto de la nafta").
- "editar": pide cambiar un gasto ya cargado ("el último eran 20000", "pasalo a efectivo", "cambiá la nafta a 18000").
- "otro": saludos, agradecimientos, mensajes confusos o cualquier cosa que no encaje arriba. Escribí en "repregunta" una pregunta corta para aclarar (ej: "¿Querés cargar un gasto de $15.000? ¿En qué categoría?"). Si el mensaje no tiene nada que ver con gastos, dejá "repregunta" vacío.

DATOS:
- "luca"/"lucas" = miles (3 lucas = 3000). "k"/"mil" = miles. "palo" = millón.
- Los puntos son separadores de miles y la coma es decimal: "15.000,50" = 15000.5.
- Categoría y tarjeta: usá SIEMPRE un nombre exacto de las listas que te paso. Para cargar, si ninguna categoría encaja usá "Otros"; la tarjeta puede quedar vacía.
- medioDePago: efectivo=CASH, débito=DEBIT, crédito/tarjeta/cuotas=CREDIT, transferencia/mercadopago/mp/cvu/alias=TRANSFER. DESCONOCIDO si no lo aclara.
- Si nombra una tarjeta o billetera, completá "tarjeta" y deducí el medio (billetera ⇒ TRANSFER; tarjeta ⇒ DEBIT salvo que diga crédito o cuotas).
- Cuotas: "en 6 cuotas" ⇒ cuotas=6 y medioDePago=CREDIT. El monto es el TOTAL de la compra.
- Fechas relativas: "hoy", "ayer", "anteayer", "el lunes" (el más reciente ya pasado). Nunca futuras. Si no dice nada, hoy.
- descripcion: un detalle corto si aporta (ej: "pizza con amigos"), sin repetir categoría ni monto.
- Ignorá que te llamen por tu nombre ("chop cargame 5000 de nafta" es cargar).

CORRECCIONES: si te paso "Gastos propuestos" y el mensaje los corrige ("con efectivo", "eran 8000", "fue ayer", "sacá el segundo"), usá intencion="cargar" y devolvé la lista COMPLETA corregida, manteniendo lo que no se corrigió.

Completá solo los campos de la intención que corresponde; el resto dejalo vacío ("") o en 0.`;

type Lists = { categories: string[]; sources: string[] };

/** Interpreta un mensaje. Devuelve null si la IA no está disponible. */
export async function parseMessage(text: string, lists: Lists, proposed?: ParsedExpense[]): Promise<Parsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;

  const today = todayISO();
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "long", timeZone: TIME_ZONE }).format(new Date());

  try {
    const client = new Anthropic(); // toma ANTHROPIC_API_KEY del .env
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(aiSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Hoy es ${weekday} ${today}.`,
            `Categorías: ${lists.categories.join(", ")}.`,
            `Tarjetas y billeteras: ${lists.sources.join(", ") || "(ninguna)"}.`,
            proposed?.length
              ? `\nGastos propuestos (corregilos según el mensaje):\n${JSON.stringify(proposed.map(toAiShape))}`
              : "",
            `\nMensaje: "${text}"`,
          ].join("\n"),
        },
      ],
    });

    // Costo de esta consulta, para poder seguir el gasto desde la terminal
    const { input_tokens: inTok, output_tokens: outTok } = response.usage;
    console.log(`[ai-parser] ${inTok}+${outTok} tokens · US$ ${((inTok * 1) / 1e6 + (outTok * 5) / 1e6).toFixed(5)}`);

    const p = response.parsed_output;
    if (!p) return null;

    if (p.intencion === "cargar") {
      const expenses = p.gastos.map((g) => toExpense(g, today)).filter((g) => g.amount > 0 && g.amount < 1e12);
      return expenses.length > 0 ? { intent: "cargar", expenses } : { intent: "otro", question: "" };
    }
    if (p.intencion === "consultar") {
      return {
        intent: "consultar",
        period: p.consulta.periodo || "mes",
        categoryName: p.consulta.categoria || null,
        sourceName: p.consulta.tarjeta || null,
        paymentMethod:
          p.consulta.medioDePago === "DESCONOCIDO" || !p.consulta.medioDePago ? null : p.consulta.medioDePago,
      };
    }
    if (p.intencion === "eliminar" || p.intencion === "editar") {
      const target: Target = { last: p.objetivo.ultimo, text: p.objetivo.texto, amount: p.objetivo.monto };
      if (p.intencion === "eliminar") return { intent: "eliminar", target };
      const c = p.cambios;
      return {
        intent: "editar",
        target,
        changes: {
          ...(c.monto > 0 ? { amount: c.monto } : {}),
          ...(c.categoria ? { categoryName: c.categoria } : {}),
          ...(c.medioDePago && c.medioDePago !== "DESCONOCIDO" ? { paymentMethod: c.medioDePago } : {}),
          ...(c.tarjeta ? { sourceName: c.tarjeta } : {}),
          ...(c.descripcion ? { description: c.descripcion } : {}),
          ...(/^\d{4}-\d{2}-\d{2}$/.test(c.fecha) && c.fecha <= today ? { date: c.fecha } : {}),
        },
      };
    }
    return { intent: "otro", question: p.repregunta };
  } catch (e) {
    // Sin crédito, sin internet o error de la API: el bot sigue andando con el menú
    console.error("[ai-parser]", e instanceof Error ? e.message : e);
    return null;
  }
}

function toExpense(g: z.infer<typeof expenseShape>, today: string): ParsedExpense {
  const cuotas = Number.isFinite(g.cuotas) ? Math.max(1, Math.min(Math.round(g.cuotas), 36)) : 1;
  return {
    amount: g.monto,
    currency: g.moneda || "ARS",
    categoryName: g.categoria,
    paymentMethod: g.medioDePago === "DESCONOCIDO" || !g.medioDePago ? null : g.medioDePago,
    sourceName: g.tarjeta || null,
    installments: cuotas,
    // Nunca confiamos en la fecha del modelo: si es futura o inválida, usamos hoy
    date: /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) && g.fecha <= today ? g.fecha : today,
    description: g.descripcion.trim().slice(0, 200) || null,
  };
}

function toAiShape(p: ParsedExpense) {
  return {
    monto: p.amount,
    moneda: p.currency,
    categoria: p.categoryName,
    medioDePago: p.paymentMethod ?? "DESCONOCIDO",
    tarjeta: p.sourceName ?? "",
    cuotas: p.installments,
    fecha: p.date,
    descripcion: p.description ?? "",
  };
}

/** Busca por nombre (sin tildes ni mayúsculas) entre las categorías o tarjetas del usuario */
export function matchByName<T extends { id: string; name: string }>(items: T[], name: string | null) {
  if (!name) return null;
  const n = normalize(name);
  return items.find((i) => normalize(i.name) === n) ?? items.find((i) => normalize(i.name).includes(n)) ?? null;
}

/** Categoría por nombre, con "Otros" como red de contención */
export function matchCategory<T extends { id: string; name: string }>(categories: T[], name: string) {
  return matchByName(categories, name) ?? categories.find((c) => normalize(c.name) === "otros") ?? null;
}
