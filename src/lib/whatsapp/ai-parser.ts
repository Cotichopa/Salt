import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { todayISO, TIME_ZONE, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { normalize } from "@/lib/text";

// Interpreta mensajes escritos como los diría una persona ("ayer 3 lucas en el chino
// con débito") usando Claude Haiku. El modelo responde SIEMPRE con esta estructura
// (structured outputs): la API garantiza el formato, y nosotros igual validamos todo.

const MODEL = "claude-haiku-4-5";
const MAX_CHARS = 500; // mensajes más largos no los mandamos (no son un gasto)

// Este es el "molde" de la respuesta. Nada de lo que devuelva puede salirse de acá.
const aiSchema = z.object({
  entendido: z.boolean().describe("true si el mensaje describe uno o más gastos"),
  gastos: z.array(
    z.object({
      monto: z.number().describe("Monto en números. '3 lucas' = 3000, '15k' = 15000"),
      moneda: z.enum(["ARS", "USD"]).describe("ARS salvo que diga dólares, usd o u$s"),
      categoria: z.string().describe("Nombre EXACTO de una categoría de la lista dada"),
      medioDePago: z
        .enum(["CASH", "DEBIT", "CREDIT", "TRANSFER", "DESCONOCIDO"])
        .describe("DESCONOCIDO si el mensaje no lo aclara"),
      fecha: z.string().describe("Fecha del gasto en formato YYYY-MM-DD"),
      descripcion: z.string().describe("Detalle corto, o vacío si no hay"),
    }),
  ),
});

export type ParsedExpense = {
  amount: number;
  currency: CurrencyCode;
  categoryName: string;
  paymentMethod: PaymentMethodCode | null;
  date: string;
  description: string | null;
};

export function isAiEnabled() {
  return process.env.AI_PARSER_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `Sos Chop, el asistente de gastos de la app Salt. Tu tarea es extraer los gastos de mensajes de WhatsApp escritos en español rioplatense (Argentina).

Reglas:
- "luca"/"lucas" = miles (3 lucas = 3000). "k"/"mil" = miles (15k = 15000). "palo" = millón.
- Los puntos son separadores de miles y la coma es decimal: "15.000,50" = 15000.5.
- Un mensaje puede tener VARIOS gastos ("nafta 15000 y peaje 2500") = dos gastos.
- Elegí la categoría más parecida de la lista que te doy, usando su nombre exacto. Si ninguna encaja, usá "Otros".
- Fechas relativas: "hoy", "ayer", "anteayer", "el lunes" (el más reciente ya pasado). Si no dice nada, es hoy.
- La fecha nunca puede ser futura.
- medioDePago: efectivo=CASH, débito/tarjeta de débito=DEBIT, crédito/tarjeta/cuotas=CREDIT, transferencia/mercadopago/mp/cvu/alias=TRANSFER. Si no lo aclara, DESCONOCIDO.
- descripcion: un detalle corto si aporta algo (ej: "pizza con amigos"), sin repetir la categoría ni el monto.
- Si el mensaje NO describe un gasto (saludos, preguntas, consultas, pedidos de borrar), devolvé entendido=false y gastos vacío.`;

/**
 * Devuelve los gastos que entendió, [] si el mensaje no era un gasto,
 * o null si la IA no está disponible (sin crédito, sin internet, error).
 */
export async function parseWithAI(text: string, categories: string[]): Promise<ParsedExpense[] | null> {
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
          content: `Hoy es ${weekday} ${today}.
Categorías disponibles: ${categories.join(", ")}.

Mensaje: "${text}"`,
        },
      ],
    });

    // Costo de esta consulta, para poder seguir el gasto desde la terminal
    const { input_tokens: inTok, output_tokens: outTok } = response.usage;
    const cost = (inTok * 1) / 1e6 + (outTok * 5) / 1e6; // US$ 1 y US$ 5 por millón de tokens
    console.log(`[ai-parser] ${inTok}+${outTok} tokens · US$ ${cost.toFixed(5)}`);

    const parsed = response.parsed_output;
    if (!parsed?.entendido) return [];

    return parsed.gastos
      .map((g) => ({
        amount: g.monto,
        currency: g.moneda,
        categoryName: g.categoria,
        paymentMethod: g.medioDePago === "DESCONOCIDO" ? null : g.medioDePago,
        // Nunca confiamos en la fecha del modelo: si es futura o inválida, usamos hoy
        date: /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) && g.fecha <= today ? g.fecha : today,
        description: g.descripcion.trim().slice(0, 200) || null,
      }))
      .filter((g) => Number.isFinite(g.amount) && g.amount > 0 && g.amount < 1_000_000_000_000)
      .slice(0, 5); // como mucho 5 gastos por mensaje
  } catch (e) {
    // Sin crédito, sin internet o error de la API: el bot sigue andando con el menú
    console.error("[ai-parser]", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Busca la categoría que nombró la IA entre las del usuario (sin tildes ni mayúsculas) */
export function matchCategory<T extends { id: string; name: string }>(categories: T[], name: string) {
  const n = normalize(name);
  return categories.find((c) => normalize(c.name) === n) ?? categories.find((c) => normalize(c.name) === "otros") ?? null;
}
