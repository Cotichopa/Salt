import "server-only";
import { z } from "zod";
import { formatMoney } from "@/lib/format";
import { normalize } from "@/lib/text";
import { CATEGORY_ICON_INFO as CATEGORY_ICONS, resolveCategoryIcon, type CategoryIconKey } from "@/lib/category-icon-data";
import {
  CategoryError,
  createCategory,
  deleteCategory,
  listCategories,
  listCategoriesWithUsage,
  updateCategory,
} from "@/lib/services/categories";
import { listRecurring } from "@/lib/services/recurring";
import { askModel, isAiEnabled, matchByName, MAX_CHARS } from "@/lib/whatsapp/ai-parser";
import { BACK, label, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askConfirm, askFollowup } from "@/lib/whatsapp/sections/confirm";
import { clearSession, setSession } from "@/lib/whatsapp/session";

// Categorías por Chop: ver la lista, crear, renombrar y borrar (con sus gastos: pasarlos a otra
// o borrarlos, como en la web). El ícono de una categoría nueva lo elige Chop por el nombre
// ("Mascotas" → 🐾) y se cambia en la web. Misma idea que fijos.ts: segunda llamada chica a la IA
// y confirmación antes de cambiar datos.

type Category = Awaited<ReturnType<typeof listCategories>>[number];

const categorySchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("ver") }),
  // El nombre puede faltar ("cambiale el nombre a supermercado"): se pregunta
  z.object({ accion: z.literal("crear"), nombre: z.string().optional() }),
  z.object({ accion: z.literal("renombrar"), cat: z.string(), nombre: z.string().optional() }),
  z.object({ accion: z.literal("borrar"), cat: z.string() }),
  z.object({ accion: z.literal("otro"), pregunta: z.string().optional() }),
]);
export type CategoryParsed = z.infer<typeof categorySchema>;

const SYSTEM = `Sos Chop, el asistente de la app de gastos Salt (Argentina). El mensaje es sobre CATEGORÍAS de gastos. Respondé SOLO un objeto JSON, sin texto alrededor, con una de estas formas:
{"accion":"ver"}
{"accion":"crear","nombre":"Mascotas"}
{"accion":"renombrar","cat":"Ropa","nombre":"Indumentaria"}
{"accion":"borrar","cat":"Ropa"}
{"accion":"otro","pregunta":"¿Qué categoría?"}

- cat: nombre EXACTO de la lista de categorías (la más parecida).
- nombre: el nombre nuevo, como lo escribe, con mayúscula inicial.`;

/** Interpreta un mensaje sobre categorías (segunda llamada). null si la IA no está o falló. */
export async function parseCategories(text: string, categories: string[]): Promise<CategoryParsed | null> {
  if (!isAiEnabled() || text.length > MAX_CHARS) return null;
  const content = [`Categorías: ${categories.join(", ")}.`, `\nMensaje: "${text}"`].join("\n");
  return askModel(SYSTEM, content, categorySchema, "ai-categorias");
}

const EXAMPLES = '_Podés decirme: "creá la categoría Mascotas", "renombrá Ropa a Indumentaria" o "borrá la categoría Ropa"._';

export async function handleCategories(ctx: Ctx, text: string): Promise<boolean> {
  const cats = await listCategories(ctx.userId);
  const p = await parseCategories(text, cats.map((c) => c.name));
  if (!p) return false;
  const t = normalize(text);
  if (p.accion === "ver") return showCategoriesList(ctx);
  if (p.accion === "otro") {
    if (p.pregunta) return askFollowup(ctx, "categoria", text, p.pregunta, `\n\n${EXAMPLES}${BACK}`);
    await ctx.out.text(`No entendí qué querés hacer con las categorías 🤔\n\n${EXAMPLES}${BACK}`);
    return true;
  }
  if (p.accion === "crear") return askCreateCategory(ctx, p.nombre ?? "", cats, text);

  // La categoría existente, solo si el mensaje la nombra (el modelo a veces adivina)
  const cat = matchByName(cats, p.cat);
  if (!cat || !t.includes(normalize(cat.name))) {
    await ctx.out.text(`No encontré la categoría "${p.cat}" 🤔${BACK}`);
    return true;
  }
  if (p.accion === "borrar") return askDeleteCategory(ctx, cat.id);
  return askRenameCategory(ctx, cat, p.nombre ?? "", cats, text);
}

/** "mascotas" → "Mascotas"; null si es muy corto, muy largo o no está en el mensaje */
function cleanName(name: string, text?: string) {
  const typed = name.trim().replace(/^["'“]|["'”]$/g, "");
  if (typed.length < 2 || typed.length > 30) return null;
  if (text !== undefined && !text.includes(normalize(typed))) return null;
  return typed === typed.toLowerCase() ? typed.charAt(0).toUpperCase() + typed.slice(1) : typed;
}

/**
 * El ícono de una categoría nueva según su nombre, comparando palabra por palabra con las
 * etiquetas de los íconos (sin la "s" final: "Mascotas" → 🐾, "Regalos" → 🎁). Si no hay, 🏷️.
 */
function iconFor(name: string): CategoryIconKey {
  const words = (s: string) => normalize(s).split(/\s+/).map((w) => w.replace(/s$/, ""));
  const wanted = words(name);
  const entries = Object.entries(CATEGORY_ICONS) as [CategoryIconKey, { label: string }][];
  return entries.find(([, v]) => words(v.label).some((w) => wanted.includes(w)))?.[0] ?? "tag";
}

// ---------- Lista ----------

export async function showCategoriesList(ctx: Ctx): Promise<boolean> {
  await clearSession(ctx.phone);
  const cats = await listCategoriesWithUsage(ctx.userId);
  const lines = cats.map((c) => {
    const month = c.monthTotal > 0 ? `${formatMoney(c.monthTotal, "ARS")} este mes` : "sin gastos este mes";
    return `• ${label(c)} · ${month}${c.budget ? ` · 🎯 ${formatMoney(c.budget, "ARS")}` : ""}`;
  });
  await ctx.out.text(`🏷️ *Tus categorías*\n\n${lines.join("\n")}\n\n${EXAMPLES}${BACK}`);
  return true;
}

// ---------- Crear y renombrar ----------

/** `text`: el mensaje, si vino escrito (el nombre tiene que estar ahí); con los botones no hay */
function askCreateCategory(ctx: Ctx, rawName: string, cats: Category[], text?: string) {
  const name = cleanName(rawName, text === undefined ? undefined : normalize(text));
  if (!name) return askFollowup(ctx, "categoria", text ?? "", "🏷️ ¿Cómo se llama la categoría nueva?", BACK);
  const clash = cats.find((c) => normalize(c.name) === normalize(name));
  if (clash) return ctx.out.text(`Ya tenés la categoría ${label(clash)} 👌${BACK}`).then(() => true);
  const icon = iconFor(name);
  return askConfirm(ctx, {
    type: "category:create",
    data: { name, icon },
    body: `🏷️ ¿Creo la categoría ${CATEGORY_ICONS[icon].emoji} *${name}*?\n_El ícono y las palabras clave los podés cambiar en la web._`,
    options: [{ id: "yes", title: "✅ Crear", words: ["crear", "creala"] }],
  });
}

function askRenameCategory(ctx: Ctx, cat: Category, rawName: string, cats: Category[], text: string) {
  // Sin nombre nuevo (o el mismo de antes: el modelo lo repite cuando no lo dijeron), se pregunta
  const name = cleanName(rawName, normalize(text));
  if (!name || normalize(name) === normalize(cat.name)) {
    return askFollowup(ctx, "categoria", text, `🏷️ ¿Cómo querés que se llame ${label(cat)}?`, BACK);
  }
  const clash = cats.find((c) => c.id !== cat.id && normalize(c.name) === normalize(name));
  if (clash) return ctx.out.text(`Ya tenés la categoría ${label(clash)} 🤔${BACK}`).then(() => true);
  return askConfirm(ctx, {
    type: "category:rename",
    data: { id: cat.id, name },
    body: `🏷️ ¿Cambio el nombre de ${label(cat)} a *${name}*?\n_Sus gastos, fijos y presupuesto siguen igual._`,
    options: [{ id: "yes", title: "✅ Cambiar", words: ["cambiar", "cambialo"] }],
  });
}

// ---------- Borrar ----------

/** "su gasto" / "sus 3 gastos" */
const theirExpenses = (n: number) => (n === 1 ? "su gasto" : `sus ${n} gastos`);

export async function askDeleteCategory(ctx: Ctx, categoryId: string): Promise<boolean> {
  const [cats, fixed] = await Promise.all([listCategoriesWithUsage(ctx.userId), listRecurring(ctx.userId)]);
  const cat = cats.find((c) => c.id === categoryId);
  if (!cat) {
    await ctx.out.text(`Esa categoría ya no existe 🤔${BACK}`);
    return true;
  }
  const fixedCount = fixed.filter((f) => f.category.id === cat.id).length;
  const data = { id: cat.id, name: label(cat), count: cat.expenseCount, fixedCount };
  if (cat.expenseCount === 0) {
    // Sin gastos se borra con todo lo suyo (en la base, sus fijos y su presupuesto se borran con ella)
    const notes = [fixedCount > 0 ? `Se borran también sus ${fixedCount} gastos fijos.` : "", cat.budget ? "Y su presupuesto." : ""].filter(Boolean);
    return askConfirm(ctx, {
      type: "category:delete",
      data,
      body: `🗑️ ¿Borro la categoría ${label(cat)}?${notes.length > 0 ? `\n_${notes.join(" ")}_` : ""}`,
      options: [{ id: "yes", title: "🗑️ Sí, borrar", words: ["borrar", "borrala"] }],
    });
  }
  // Con gastos: primero qué hacer con ellos
  return askConfirm(ctx, {
    type: "category:choose",
    data,
    body: `🗑️ ${label(cat)} tiene ${cat.expenseCount === 1 ? "1 gasto" : `${cat.expenseCount} gastos`}${fixedCount > 0 ? ` y ${fixedCount} fijos` : ""}. ¿Qué hago con ${cat.expenseCount === 1 && !fixedCount ? "él" : "ellos"}?`,
    options: [
      { id: "move", title: "📦 Pasarlos a otra", words: ["pasar", "mover", "otra"] },
      { id: "delete", title: "🗑️ Borrarlos", words: ["borrarlos", "borrar"] },
    ],
  });
}

/** Después de elegir a qué categoría pasar los gastos (desde la lista de listas.ts) */
export async function askMoveAndDelete(ctx: Ctx, fromId: string, toId: string) {
  const cats = await listCategoriesWithUsage(ctx.userId);
  const from = cats.find((c) => c.id === fromId);
  const to = cats.find((c) => c.id === toId);
  if (!from || !to || from.id === to.id) {
    await ctx.out.text(`Esa categoría ya no existe 🤔${BACK}`);
    return true;
  }
  return askConfirm(ctx, {
    type: "category:delete",
    data: { id: from.id, name: label(from), count: from.expenseCount, moveTo: to.id, toName: label(to) },
    body: `🗑️ ¿Borro ${label(from)} y paso ${theirExpenses(from.expenseCount)} (y sus fijos, si tiene) a ${label(to)}?`,
    options: [{ id: "yes", title: "✅ Sí, hacelo", words: ["dale", "hacelo"] }],
  });
}

// ---------- Con los botones del menú ----------

/** "Agregar → Categoría": pregunta el nombre */
export async function startCategoryGuided(ctx: Ctx) {
  await setSession(ctx.phone, "category:new");
  await ctx.out.text("🏷️ ¿Cómo se llama la categoría nueva? (ej: Mascotas, Regalos, Gimnasio)");
  return true;
}

export async function receiveNewCategory(ctx: Ctx, input: Input) {
  const name = cleanName(input.text ?? "");
  if (!name) {
    await ctx.out.text("Decime un nombre de 2 a 30 letras 🙏 (o escribí *cancelar*)");
    return true;
  }
  return askCreateCategory(ctx, name, await listCategories(ctx.userId));
}

// ---------- Ejecutar lo confirmado ----------

/**
 * Hace la acción confirmada. `category:choose` no cambia nada: devuelve "move" para que
 * sections/index.ts muestre la lista de categorías destino.
 */
export async function runCategoryAction(ctx: Ctx, type: string, data: Record<string, unknown>, option: string) {
  const d = data as { id: string; name: string; count?: number; fixedCount?: number; moveTo?: string; toName?: string; icon?: CategoryIconKey };
  try {
    if (type === "category:create") {
      await createCategory(ctx.userId, { name: d.name, icon: d.icon!, emoji: CATEGORY_ICONS[d.icon!].emoji, keywords: [] });
      await ctx.out.text(`✅ Listo, creé la categoría ${CATEGORY_ICONS[d.icon!].emoji} *${d.name}*.${BACK}`);
    } else if (type === "category:rename") {
      const cat = (await listCategories(ctx.userId)).find((c) => c.id === d.id);
      if (!cat) return void (await ctx.out.text(`Esa categoría ya no existe 🤔${BACK}`));
      const icon = resolveCategoryIcon(cat.icon, cat.emoji);
      await updateCategory(ctx.userId, cat.id, { name: d.name, icon, emoji: cat.emoji ?? CATEGORY_ICONS[icon].emoji, keywords: cat.keywords });
      await ctx.out.text(`✅ Listo, ${label(cat)} ahora se llama *${d.name}*.${BACK}`);
    } else if (type === "category:choose") {
      if (option === "move") return "move";
      // Borrar los gastos no se puede deshacer: una confirmación más
      await askConfirm(ctx, {
        type: "category:delete",
        data: { ...d, deleteExpenses: true },
        body: `⚠️ ¿Seguro? Se borran ${d.name} y ${theirExpenses(d.count ?? 0)}${d.fixedCount ? ` y sus ${d.fixedCount} fijos` : ""}. *No se puede deshacer.*`,
        options: [{ id: "yes", title: "🗑️ Sí, borrar todo", words: ["borrar", "si borrar"] }],
      });
    } else if (type === "category:delete") {
      const deleteExpenses = (data as { deleteExpenses?: boolean }).deleteExpenses === true;
      await deleteCategory(ctx.userId, d.id, deleteExpenses ? { deleteExpenses } : { moveTo: d.moveTo });
      await ctx.out.text(
        d.moveTo
          ? `🗑️ Borré ${d.name} y pasé sus gastos a ${d.toName}.${BACK}`
          : `🗑️ Borré ${d.name}${deleteExpenses ? " con sus gastos" : ""}.${BACK}`,
      );
    }
  } catch (e) {
    if (!(e instanceof CategoryError)) throw e;
    await ctx.out.text(`No pude hacerlo: ${e.message}${BACK}`);
  }
}
