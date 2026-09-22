import "server-only";
import { db } from "@/lib/db";
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
    select: { id: true, name: true, emoji: true, keywords: true, userId: true },
  });
}

/** Igual que listCategories, pero con cuántos gastos tiene el usuario en cada una */
export async function listCategoriesWithUsage(userId: string) {
  const [categories, counts] = await Promise.all([
    listCategories(userId),
    db.expense.groupBy({ by: ["categoryId"], where: { userId }, _count: true }),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c._count]));
  return categories.map((c) => ({ ...c, expenseCount: byId.get(c.id) ?? 0 }));
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
