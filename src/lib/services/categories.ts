import "server-only";
import { db } from "@/lib/db";
import { monthRange, todayISO } from "@/lib/format";
import { normalize } from "@/lib/text";
import type { CategoryInput } from "@/lib/validators";

// Categorías: cada cuenta tiene las suyas y puede crearlas, editarlas y borrarlas.
// Al crear una cuenta se le cargan las iniciales (DEFAULT_CATEGORIES), que desde ese
// momento son tan suyas como las que crea después: tocarlas no afecta a nadie más.

export class CategoryError extends Error {}

// icon: ícono de la web (ver src/components/category-icon.tsx) · emoji: el que usa Chop en WhatsApp
const DEFAULT_CATEGORIES = [
  { name: "Comida", icon: "utensils", emoji: "🍔", keywords: ["almuerzo", "cena", "desayuno", "delivery", "pizza", "rotiseria"] },
  { name: "Supermercado", icon: "cart", emoji: "🛒", keywords: ["super", "chino", "almacen", "verduleria", "carniceria"] },
  { name: "Salidas", icon: "beer", emoji: "🍻", keywords: ["salida", "bar", "boliche", "cine", "birra", "cumple"] },
  { name: "Nafta", icon: "fuel", emoji: "⛽", keywords: ["combustible", "gnc", "ypf", "shell", "axion"] },
  { name: "Transporte", icon: "taxi", emoji: "🚕", keywords: ["taxi", "uber", "cabify", "colectivo", "sube", "peaje", "estacionamiento"] },
  { name: "Servicios", icon: "lightbulb", emoji: "💡", keywords: ["luz", "gas", "agua", "internet", "celular", "expensas"] },
  { name: "Salud", icon: "pill", emoji: "💊", keywords: ["farmacia", "medico", "remedios", "prepaga", "dentista"] },
  { name: "Hogar", icon: "house", emoji: "🏠", keywords: ["alquiler", "ferreteria", "limpieza", "muebles"] },
  { name: "Ropa", icon: "shirt", emoji: "👕", keywords: ["zapatillas", "remera", "pantalon"] },
  { name: "Suscripciones", icon: "tv", emoji: "📺", keywords: ["netflix", "spotify", "disney", "youtube", "gimnasio"] },
  { name: "Otros", icon: "package", emoji: "📦", keywords: [] },
];

/** Carga las categorías iniciales a una cuenta que todavía no tiene ninguna */
export async function ensureDefaultCategories(userId: string) {
  const count = await db.category.count({ where: { userId } });
  if (count > 0) return;
  await db.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })) });
}

/** Categorías de un usuario */
export function listCategories(userId: string) {
  return db.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, emoji: true, icon: true, keywords: true, userId: true },
  });
}

/** Una categoría del usuario, o null si no existe o es de otra cuenta */
export function getCategory(userId: string, id: string) {
  return db.category.findFirst({
    where: { id, userId },
    select: { id: true, name: true, emoji: true, icon: true, keywords: true, userId: true },
  });
}

/**
 * Igual que listCategories, pero con cuántos gastos tiene el usuario en cada una,
 * cuánto lleva este mes (en pesos) y su presupuesto mensual si le puso uno
 */
export async function listCategoriesWithUsage(userId: string) {
  const { from, to } = monthRange(todayISO().slice(0, 7));
  const [categories, counts, month, budgets] = await Promise.all([
    listCategories(userId),
    db.expense.groupBy({ by: ["categoryId"], where: { userId }, _count: true }),
    db.expense.groupBy({
      by: ["categoryId"],
      where: { userId, currency: "ARS", date: { gte: from, lt: to } },
      _sum: { amount: true },
    }),
    db.budget.findMany({ where: { userId }, select: { categoryId: true, amount: true } }),
  ]);
  const budgetById = new Map(budgets.map((b) => [b.categoryId, b.amount.toNumber()]));
  const countById = new Map(counts.map((c) => [c.categoryId, c._count]));
  const monthById = new Map(month.map((c) => [c.categoryId, c._sum.amount?.toNumber() ?? 0]));
  return categories.map((c) => ({
    ...c,
    expenseCount: countById.get(c.id) ?? 0,
    monthTotal: monthById.get(c.id) ?? 0,
    budget: budgetById.get(c.id) ?? null,
  }));
}

/** Lanza error si la categoría no es del usuario */
export async function assertCategoryUsable(userId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!category) throw new CategoryError("Categoría inválida");
}

async function findOwn(userId: string, id: string) {
  const category = await db.category.findFirst({ where: { id, userId } });
  if (!category) throw new CategoryError("Categoría no encontrada");
  return category;
}

// No permitimos dos categorías con el mismo nombre (ignorando mayúsculas y tildes):
// el bot no sabría cuál elegir.
async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const existing = await listCategories(userId);
  const clash = existing.find((c) => c.id !== exceptId && normalize(c.name) === normalize(name));
  if (clash) throw new CategoryError(`Ya existe la categoría "${clash.name}"`);
}

export async function createCategory(userId: string, input: CategoryInput) {
  await assertNameFree(userId, input.name);
  return db.category.create({ data: { ...input, userId } });
}

export async function updateCategory(userId: string, id: string, input: CategoryInput) {
  await findOwn(userId, id);
  await assertNameFree(userId, input.name, id);
  return db.category.update({ where: { id }, data: input });
}

/**
 * Borra una categoría del usuario. Si tiene gastos, hay que decir qué hacer con ellos:
 * moverlos a otra categoría (`moveTo`) o borrarlos también (`deleteExpenses`).
 * La base no deja borrar una categoría con gastos, para no dejar gastos "huérfanos".
 */
export async function deleteCategory(
  userId: string,
  id: string,
  opts: { moveTo?: string; deleteExpenses?: boolean } = {},
) {
  await findOwn(userId, id);
  const count = await db.expense.count({ where: { categoryId: id, userId } });

  if (count > 0 && !opts.deleteExpenses) {
    if (!opts.moveTo || opts.moveTo === id) throw new CategoryError(`Tiene ${count} gastos: elegí a qué categoría moverlos`);
    await assertCategoryUsable(userId, opts.moveTo);
  }
  // Transacción: las dos operaciones se hacen juntas o ninguna (si falla el borrado,
  // los gastos no quedan movidos o borrados a medias)
  await db.$transaction([
    opts.deleteExpenses
      ? db.expense.deleteMany({ where: { categoryId: id, userId } })
      : db.expense.updateMany({ where: { categoryId: id, userId }, data: { categoryId: opts.moveTo } }),
    db.category.delete({ where: { id } }),
  ]);
  return count;
}
