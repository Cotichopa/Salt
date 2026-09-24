import "server-only";
import { db } from "@/lib/db";
import { monthRange, todayISO } from "@/lib/format";
import { normalize } from "@/lib/text";
import type { CategoryInput } from "@/lib/validators";

// Categorías: las base (userId null) son de todos y no se tocan desde la app;
// cada usuario puede crear, editar y borrar solo las suyas.

export class CategoryError extends Error {}

/** Categorías que puede usar un usuario: las base + las propias */
export function listCategories(userId: string) {
  return db.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, emoji: true, icon: true, keywords: true, userId: true },
  });
}

/** Una categoría que el usuario puede ver (base o propia), o null si no existe o es de otra cuenta */
export function getCategory(userId: string, id: string) {
  return db.category.findFirst({
    where: { id, OR: [{ userId: null }, { userId }] },
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

/** Lanza error si la categoría no es base ni del usuario */
export async function assertCategoryUsable(userId: string, categoryId: string) {
  const category = await db.category.findFirst({
    where: { id: categoryId, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!category) throw new CategoryError("Categoría inválida");
}

async function findOwn(userId: string, id: string) {
  const category = await db.category.findFirst({ where: { id, userId } });
  if (!category) throw new CategoryError("Categoría no encontrada");
  return category;
}

// No permitimos dos categorías con el mismo nombre (ignorando mayúsculas y tildes)
// entre las base y las propias: el bot no sabría cuál elegir.
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
 * Borra una categoría propia. Si tiene gastos, hay que indicar a qué categoría moverlos
 * (la base no deja borrar una categoría con gastos, para no dejar gastos "huérfanos").
 */
export async function deleteCategory(userId: string, id: string, moveTo?: string) {
  await findOwn(userId, id);
  const count = await db.expense.count({ where: { categoryId: id, userId } });

  if (count > 0) {
    if (!moveTo || moveTo === id) throw new CategoryError(`Tiene ${count} gastos: elegí a qué categoría moverlos`);
    await assertCategoryUsable(userId, moveTo);
  }
  // Transacción: las dos operaciones se hacen juntas o ninguna (si falla el borrado,
  // los gastos no quedan movidos a medias)
  await db.$transaction([
    db.expense.updateMany({ where: { categoryId: id, userId }, data: { categoryId: moveTo } }),
    db.category.delete({ where: { id } }),
  ]);
  return count;
}
