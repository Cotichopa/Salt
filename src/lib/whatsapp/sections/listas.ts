import "server-only";
import { formatMoney } from "@/lib/format";
import { normalize } from "@/lib/text";
import { listBudgets } from "@/lib/services/budgets";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { listRecurring } from "@/lib/services/recurring";
import { BACK, label, showDeleteList, showQueryMenu, startAdd, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askDeleteCategory, askMoveAndDelete, showCategoriesList, startCategoryGuided } from "@/lib/whatsapp/sections/categorias";
import { askBudgetAmount, askRemoveBudget, showBudgetsList } from "@/lib/whatsapp/sections/presupuestos";
import type { ListRow } from "@/lib/whatsapp/outbox";
import { askDelete, showFixedList, startFixedGuided } from "@/lib/whatsapp/sections/fijos";
import {
  askDeleteSource,
  showSourcesList,
  showStatement,
  showWhatToPay,
  startSourceGuided,
} from "@/lib/whatsapp/sections/tarjetas";
import { clearSession, type Session } from "@/lib/whatsapp/session";

// El menú de botones: los 3 botones del menú principal (➕ Agregar · 📊 Consultar · 🗑️ Eliminar)
// abren cada uno una lista, y de ahí se elige qué (un gasto, un fijo, una tarjeta...).
// Todos estos botones funcionan en cualquier momento, sin depender de la conversación:
// - "go:<rama>:<opción>": una opción de las listas de abajo
// - "sel:<qué>:<id>": algo elegido de una lista (qué fijo borrar, qué tarjeta ver...)
// - "page:<qué>:<n>": la página n de una lista larga (WhatsApp muestra hasta 10 filas)
// Los títulos de las filas tienen hasta 24 caracteres (un emoji cuenta como 2).

type Branch = "add" | "query" | "delete";

const BRANCHES: Record<Branch, { body: string; rows: ListRow[] }> = {
  add: {
    body: "➕ ¿Qué querés agregar?",
    rows: [
      { id: "go:add:expense", title: "💸 Gasto" },
      { id: "go:add:fixed", title: "📌 Gasto fijo", description: "Se carga solo todos los meses" },
      { id: "go:add:source", title: "💳 Tarjeta o billetera" },
      { id: "go:add:category", title: "🏷️ Categoría" },
      { id: "go:add:budget", title: "🎯 Presupuesto", description: "Un tope mensual para una categoría" },
    ],
  },
  query: {
    body: "📊 ¿Qué querés consultar?",
    rows: [
      { id: "go:q:pay", title: "🧾 ¿Qué tengo que pagar?", description: "Resúmenes y fijos que faltan este mes" },
      { id: "go:q:expenses", title: "📊 Gastos", description: "Por período, categoría, tarjeta o medio" },
      { id: "go:q:statement", title: "💳 Resumen de tarjeta", description: "Cuánto te viene y cuándo vence" },
      { id: "go:q:fixed", title: "📌 Gastos fijos" },
      { id: "go:q:sources", title: "👛 Medios de pago", description: "Tus tarjetas y billeteras" },
      { id: "go:q:budgets", title: "🎯 Presupuestos", description: "Cuánto llevás de cada uno" },
      { id: "go:q:categories", title: "🏷️ Categorías", description: "Lo gastado en cada una este mes" },
    ],
  },
  delete: {
    body: "🗑️ ¿Qué querés eliminar?",
    rows: [
      { id: "go:del:expense", title: "💸 Gasto" },
      { id: "go:del:fixed", title: "📌 Gasto fijo" },
      { id: "go:del:source", title: "💳 Tarjeta o billetera" },
      { id: "go:del:category", title: "🏷️ Categoría" },
      { id: "go:del:budget", title: "🎯 Presupuesto" },
    ],
  },
};

// Lo que se puede escribir en vez de tocar el botón ("1", "agregar"...)
const BRANCH_WORDS: Record<string, Branch> = {
  "1": "add",
  agregar: "add",
  cargar: "add",
  "2": "query",
  consultar: "query",
  "3": "delete",
  eliminar: "delete",
  borrar: "delete",
};

async function showBranch(ctx: Ctx, branch: Branch) {
  await clearSession(ctx.phone);
  const { body, rows } = BRANCHES[branch];
  await ctx.out.list(body, "Ver opciones", rows, "Opciones");
  return true;
}

// ---------- Elegir de una lista ----------

type Picker = { body: string; empty: string; rows: ListRow[] };

/** Categorías para elegir (sin `except`), con el id de la fila armado por `id` */
async function categoryRows(ctx: Ctx, id: (catId: string) => string, except?: string) {
  return (await listCategories(ctx.userId)).filter((c) => c.id !== except).map((c) => ({ id: id(c.id), title: label(c) }));
}

/**
 * Las listas para elegir algo: qué tarjeta ver, qué fijo o qué tarjeta borrar... `arg` es lo que va
 * después del punto en "<qué>.<arg>" (ej: "movecat.<id>": a qué categoría pasar los gastos de <id>).
 */
const PICKERS: Record<string, (ctx: Ctx, arg?: string) => Promise<Picker>> = {
  statement: async (ctx) => ({
    body: "💳 ¿De qué tarjeta querés ver el resumen?",
    empty: "No tenés tarjetas cargadas.",
    rows: (await listPaymentSources(ctx.userId))
      .filter((s) => s.kind === "CARD")
      .map((s) => ({ id: `sel:statement:${s.id}`, title: s.name, description: s.closingDay ? undefined : "Sin días de cierre" })),
  }),
  delfixed: async (ctx) => ({
    body: "📌 ¿Qué gasto fijo querés eliminar?",
    empty: "No tenés gastos fijos.",
    rows: (await listRecurring(ctx.userId)).map((f) => ({
      id: `sel:delfixed:${f.id}`,
      title: f.description,
      description: `${formatMoney(f.amount, f.currency)} · día ${f.day}${f.active ? "" : " · pausado"}`,
    })),
  }),
  delsource: async (ctx) => ({
    body: "💳 ¿Qué tarjeta o billetera querés eliminar?",
    empty: "No tenés tarjetas ni billeteras.",
    rows: (await listPaymentSources(ctx.userId)).map((s) => ({
      id: `sel:delsource:${s.id}`,
      title: `${s.kind === "CARD" ? "💳" : "📲"} ${s.name}`,
    })),
  }),
  budgetcat: async (ctx) => ({
    body: "🎯 ¿Para qué categoría es el presupuesto?",
    empty: "No tenés categorías.",
    rows: await categoryRows(ctx, (id) => `sel:budgetcat:${id}`),
  }),
  delbudget: async (ctx) => ({
    body: "🎯 ¿Qué presupuesto querés sacar?",
    empty: "No tenés presupuestos.",
    rows: (await listBudgets(ctx.userId)).map((b) => ({
      id: `sel:delbudget:${b.categoryId}`,
      title: label(b),
      description: `${formatMoney(b.amount, "ARS")} por mes`,
    })),
  }),
  delcat: async (ctx) => ({
    body: "🏷️ ¿Qué categoría querés eliminar?",
    empty: "No tenés categorías.",
    rows: await categoryRows(ctx, (id) => `sel:delcat:${id}`),
  }),
  movecat: async (ctx, from) => ({
    body: "📦 ¿A qué categoría paso los gastos?",
    empty: "No tenés otra categoría a donde pasarlos.",
    rows: await categoryRows(ctx, (id) => `sel:movecat:${from}.${id}`, from),
  }),
};

const PAGE = 9; // 9 filas + "ver más" = 10, el máximo de WhatsApp

export async function sendPicker(ctx: Ctx, what: string, page = 0) {
  const [kind, arg] = what.split(".");
  const picker = PICKERS[kind];
  if (!picker) return false;
  await clearSession(ctx.phone);
  const { body, empty, rows } = await picker(ctx, arg);
  if (rows.length === 0) {
    await ctx.out.text(`${empty}${BACK}`);
    return true;
  }
  if (rows.length <= 10) {
    await ctx.out.list(body, "Ver opciones", rows, "Elegí una");
    return true;
  }
  const pages = Math.ceil(rows.length / PAGE);
  const current = page % pages;
  const next = (current + 1) % pages;
  await ctx.out.list(
    body,
    "Ver opciones",
    [
      ...rows.slice(current * PAGE, current * PAGE + PAGE),
      { id: `page:${what}:${next}`, title: next === 0 ? "⬅️ Volver al principio" : "➡️ Ver más" },
    ],
    `Elegí una (${current + 1}/${pages})`,
  );
  return true;
}

async function select(ctx: Ctx, what: string, id: string) {
  if (what === "statement") {
    const card = (await listPaymentSources(ctx.userId)).find((s) => s.id === id && s.kind === "CARD");
    if (card) return showStatement(ctx, card);
  } else if (what === "delfixed") {
    const f = (await listRecurring(ctx.userId)).find((x) => x.id === id);
    if (f) return askDelete(ctx, f);
  } else if (what === "delsource") {
    return askDeleteSource(ctx, id);
  } else if (what === "budgetcat") {
    return askBudgetAmount(ctx, id);
  } else if (what === "delbudget") {
    return askRemoveBudget(ctx, id);
  } else if (what === "delcat") {
    return askDeleteCategory(ctx, id);
  } else if (what === "movecat") {
    const [from, to] = id.split(".");
    return askMoveAndDelete(ctx, from, to);
  }
  await ctx.out.text(`Eso ya no existe 🤔${BACK}`);
  return true;
}

// ---------- Opciones de las listas ----------

async function go(ctx: Ctx, option: string) {
  switch (option) {
    case "add:expense":
      await startAdd(ctx);
      return true;
    case "add:fixed":
      return startFixedGuided(ctx);
    case "add:source":
      return startSourceGuided(ctx);
    case "add:category":
      return startCategoryGuided(ctx);
    case "add:budget":
      return sendPicker(ctx, "budgetcat");
    case "q:pay":
      return showWhatToPay(ctx);
    case "q:expenses":
      await showQueryMenu(ctx);
      return true;
    case "q:statement":
      return sendPicker(ctx, "statement");
    case "q:fixed":
      return showFixedList(ctx);
    case "q:sources":
      return showSourcesList(ctx);
    case "q:budgets":
      return showBudgetsList(ctx);
    case "q:categories":
      return showCategoriesList(ctx);
    case "del:expense":
      await showDeleteList(ctx);
      return true;
    case "del:fixed":
      return sendPicker(ctx, "delfixed");
    case "del:source":
      return sendPicker(ctx, "delsource");
    case "del:category":
      return sendPicker(ctx, "delcat");
    case "del:budget":
      return sendPicker(ctx, "delbudget");
  }
  return false;
}

/**
 * Los botones del menú y de sus listas (valen en cualquier momento). También "agregar",
 * "consultar" o "eliminar" escritos (sin otra pregunta pendiente), y "1/2/3" contestando el menú.
 */
export async function handleMenuButtons(ctx: Ctx, input: Input, session: Session | null): Promise<boolean> {
  const id = input.replyId;
  if (id === "menu:add") return showBranch(ctx, "add");
  if (id === "menu:query") return showBranch(ctx, "query");
  if (id === "menu:delete") return showBranch(ctx, "delete");
  if (id?.startsWith("go:")) return go(ctx, id.slice(3));
  if (id?.startsWith("page:")) {
    const [, what, page] = id.split(":");
    return sendPicker(ctx, what, Number(page) || 0);
  }
  if (id?.startsWith("sel:")) {
    const [, what, target] = id.split(":");
    return select(ctx, what, target);
  }
  if (input.text) {
    const text = normalize(input.text).replace(/[!¡?¿.]/g, "");
    const branch = BRANCH_WORDS[text];
    // Solo si no hay otra pregunta pendiente ("agregar" puede ser la descripción de un gasto),
    // y "1/2/3" solo contestando el menú principal
    const free = !session || session.state === "main";
    if (branch && free && (session?.state === "main" || !/^\d$/.test(text))) return showBranch(ctx, branch);
  }
  return false;
}
